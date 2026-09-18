#!/usr/bin/env python3
"""Build a small catalog of lyric cards verified against the audio preview itself.

The verifier never assumes where a provider preview starts in the full song.
Instead it downloads the exact Apple Music/iTunes 30-second preview, transcribes
that audio with Whisper, and only keeps an LRCLIB line when the transcribed audio
strongly matches that lyric. The stored timestamps are LOCAL TO THE PREVIEW.
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from faster_whisper import WhisperModel
from rapidfuzz.fuzz import ratio, partial_ratio

ARTISTS: dict[str, list[str]] = {
    "YOASOBI": ["YOASOBI"],
    "藤井 風": ["藤井 風", "Fujii Kaze", "藤井風"],
    "米津玄師": ["米津玄師", "Kenshi Yonezu"],
    "Aimer": ["Aimer"],
    "あいみょん": ["あいみょん", "Aimyon"],
    "Official髭男dism": ["Official髭男dism", "Official HIGE DANdism", "Official Hige Dandism"],
}

NOISY_VERSION = re.compile(
    r"\b(live|remix|instrumental|karaoke|cover|tribute|sped up|slowed)\b"
    r"|ライブ|カラオケ|インスト",
    re.I,
)


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = value.replace("髙", "高")
    return re.sub(r"[\s・･._\-—–:|/\\()\[\]{}【】「」『』\"'’‘“”!！?？,，。]+", "", value)


def kata_to_hira(value: str) -> str:
    out = []
    for ch in value:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        else:
            out.append(ch)
    return "".join(out)


def lyric_norm(value: str) -> str:
    return kata_to_hira(norm(value))


def valid_line(value: str) -> bool:
    n = lyric_norm(value)
    return 4 <= len(n) <= 50 and bool(re.search(r"[ぁ-ゖ一-龯]", n))


def artist_matches(actual: str, aliases: list[str]) -> bool:
    a = norm(actual)
    return any(a == norm(alias) or a in norm(alias) or norm(alias) in a for alias in aliases)


def clean_track(value: str) -> str:
    value = re.sub(r"\s*\([^)]*(?:live|remix|instrumental|version|ver\.?)[^)]*\)\s*$", "", value, flags=re.I)
    value = re.sub(r"\s*[-–—]\s*(?:single|album)\s*version\s*$", "", value, flags=re.I)
    return value.strip()


def title_matches(actual: str, expected: str) -> bool:
    a = norm(clean_track(actual))
    e = norm(clean_track(expected))
    return bool(a and e and (a == e or (len(e) >= 6 and (a.startswith(e) or e.startswith(a)))))


def parse_synced(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    result = []
    for line in raw.splitlines():
        m = re.match(r"^\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$", line)
        if not m:
            continue
        text = m.group(4).strip()
        if not valid_line(text):
            continue
        result.append({"text": text})
    return result


def lrclib_tracks(artist: str) -> list[dict[str, Any]]:
    response = requests.get(
        "https://lrclib.net/api/search",
        params={"q": artist},
        headers={
            "Accept": "application/json",
            "Lrclib-Client": "Kotoba Lab verified-preview-builder",
        },
        timeout=15,
    )
    response.raise_for_status()
    aliases = ARTISTS[artist]
    rows = []
    for row in response.json():
        if row.get("instrumental") or not row.get("syncedLyrics"):
            continue
        if not artist_matches(str(row.get("artistName", "")), aliases):
            continue
        if NOISY_VERSION.search(str(row.get("trackName", "")) + " " + str(row.get("albumName", ""))):
            continue
        if not parse_synced(row.get("syncedLyrics")):
            continue
        rows.append(row)
    # Stable order; short-ish studio tracks first tends to reduce duplicate/live noise.
    rows.sort(key=lambda row: (abs(float(row.get("duration") or 240) - 240), int(row.get("id") or 0)))
    return rows


def apple_track(artist: str, track: dict[str, Any]) -> dict[str, Any] | None:
    aliases = ARTISTS[artist]
    terms = [
        f"{track.get('artistName', artist)} {track.get('trackName', '')}",
        f"{artist} {track.get('trackName', '')}",
    ]
    candidates: list[dict[str, Any]] = []
    for term in terms:
        data = requests.get(
            "https://itunes.apple.com/search",
            params={
                "term": term,
                "country": "JP",
                "media": "music",
                "entity": "song",
                "limit": 40,
            },
            timeout=15,
        ).json()
        candidates.extend(data.get("results") or [])

    expected_duration = float(track.get("duration") or 0)
    expected_album = norm(str(track.get("albumName") or ""))
    verified = []
    for row in candidates:
        if not row.get("previewUrl"):
            continue
        if not artist_matches(str(row.get("artistName", "")), aliases):
            continue
        if not title_matches(str(row.get("trackName", "")), str(track.get("trackName", ""))):
            continue
        noisy = str(row.get("trackName", "")) + " " + str(row.get("collectionName", ""))
        if NOISY_VERSION.search(noisy):
            continue
        actual_duration = float(row.get("trackTimeMillis") or 0) / 1000
        if expected_duration and actual_duration and abs(actual_duration - expected_duration) > 4.0:
            continue
        album = norm(str(row.get("collectionName") or ""))
        album_bonus = 1 if expected_album and album and (expected_album in album or album in expected_album) else 0
        verified.append((album_bonus, -abs(actual_duration - expected_duration) if expected_duration else 0, row))

    if not verified:
        return None
    verified.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return verified[0][2]


def transcribe_preview(model: WhisperModel, url: str) -> list[dict[str, Any]]:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    suffix = ".m4a" if "m4a" in url else ".mp3"
    path = Path(tempfile.mkdtemp()) / ("preview" + suffix)
    path.write_bytes(response.content)

    segments, _ = model.transcribe(
        str(path),
        language="ja",
        beam_size=5,
        vad_filter=False,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    out = []
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        out.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": text,
        })
    return out


def best_audio_match(lines: list[dict[str, Any]], segments: list[dict[str, Any]]) -> dict[str, Any] | None:
    windows = []
    for i in range(len(segments)):
        for width in (1, 2, 3):
            subset = segments[i:i + width]
            if not subset:
                continue
            windows.append({
                "start": subset[0]["start"],
                "end": subset[-1]["end"],
                "text": "".join(seg["text"] for seg in subset),
            })

    best: dict[str, Any] | None = None
    for line in lines:
        target = lyric_norm(line["text"])
        if len(target) < 4:
            continue
        for window in windows:
            heard = lyric_norm(window["text"])
            if not heard:
                continue
            score = max(ratio(target, heard), partial_ratio(target, heard))
            common = 0
            for length in range(min(len(target), len(heard), 12), 2, -1):
                if any(target[j:j+length] in heard for j in range(0, len(target) - length + 1)):
                    common = length
                    break

            candidate = {
                "line": line["text"],
                "start": max(0.0, float(window["start"])),
                "end": min(30.0, float(window["end"])),
                "transcript": window["text"],
                "score": float(score),
                "common": common,
            }
            if best is None or (candidate["score"], candidate["common"]) > (best["score"], best["common"]):
                best = candidate

    if not best:
        return None
    # High threshold: reject rather than ship an unrelated lyric/audio pairing.
    if best["score"] < 76 or best["common"] < 4:
        return None
    if best["end"] - best["start"] > 12:
        return None
    return best


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--per-artist", type=int, default=3)
    parser.add_argument("--model", default="small")
    args = parser.parse_args()

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    entries: list[dict[str, Any]] = []

    for artist in ARTISTS:
        accepted = 0
        seen_apple_ids: set[int] = set()
        print(f"ARTIST {artist}")
        for track in lrclib_tracks(artist)[:18]:
            if accepted >= args.per_artist:
                break
            apple = apple_track(artist, track)
            if not apple:
                continue
            apple_id = int(apple.get("trackId") or 0)
            if not apple_id or apple_id in seen_apple_ids:
                continue
            seen_apple_ids.add(apple_id)

            try:
                segments = transcribe_preview(model, apple["previewUrl"])
            except Exception as exc:
                print("  preview failed", track.get("trackName"), exc)
                continue
            match = best_audio_match(parse_synced(track.get("syncedLyrics")), segments)
            if not match:
                print("  reject", track.get("trackName"), "no strong lyric/audio match")
                continue

            entry = {
                "id": f"apple:{apple_id}:{round(match['start'], 2)}",
                "artistName": str(track.get("artistName") or artist),
                "artistAliases": ARTISTS[artist],
                "trackName": str(track.get("trackName") or apple.get("trackName") or ""),
                "albumName": str(track.get("albumName") or apple.get("collectionName") or ""),
                "lrclibTrackId": int(track.get("id") or 0),
                "appleTrackId": apple_id,
                "storefront": "JP",
                "trackDurationSeconds": round(float(apple.get("trackTimeMillis") or 0) / 1000, 3),
                "lineJa": match["line"],
                "previewLineStartSeconds": round(match["start"], 2),
                "previewLineEndSeconds": round(match["end"], 2),
                "verificationScore": round(match["score"], 1),
                "verificationCommonChars": int(match["common"]),
            }
            entries.append(entry)
            accepted += 1
            print(
                "  VERIFIED",
                entry["trackName"],
                repr(entry["lineJa"]),
                f"{entry['previewLineStartSeconds']}-{entry['previewLineEndSeconds']}s",
                "score", entry["verificationScore"],
            )

    output = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "verifier": f"faster-whisper/{args.model}",
        "storefront": "JP",
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    counts = {
        artist: sum(
            1 for entry in entries
            if any(norm(alias) in {norm(a) for a in entry["artistAliases"]} for alias in ARTISTS[artist])
        )
        for artist in ARTISTS
    }
    print("COUNTS", json.dumps(counts, ensure_ascii=False))
    print("TOTAL_VERIFIED", len(entries))
    if len(entries) < 6:
        raise SystemExit("Need at least 6 verified cards before publishing")


if __name__ == "__main__":
    main()
