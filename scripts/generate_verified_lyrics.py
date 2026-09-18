#!/usr/bin/env python3
"""Build lyric cards verified against the preview audio itself.

Pipeline:
  LRCLIB synced lyrics -> exact Apple catalog match -> download the exact
  30-second preview -> Whisper transcription -> strict lyric/audio matching.

Only cards whose displayed Japanese line is actually heard in that preview are
written to the catalog. Stored line timestamps are LOCAL TO THE PREVIEW.
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from faster_whisper import WhisperModel
from rapidfuzz.fuzz import partial_ratio, ratio

ARTISTS: dict[str, list[str]] = {
    "YOASOBI": ["YOASOBI"],
    "藤井 風": ["藤井 風", "Fujii Kaze", "藤井風"],
    "米津玄師": ["米津玄師", "Kenshi Yonezu"],
    "Aimer": ["Aimer"],
    "あいみょん": ["あいみょん", "Aimyon"],
    "Official髭男dism": [
        "Official髭男dism",
        "Official HIGE DANdism",
        "Official Hige Dandism",
    ],
}

NOISY_VERSION = re.compile(
    r"\b(live|remix|instrumental|karaoke|cover|tribute|sped up|slowed|acoustic)\b"
    r"|ライブ|カラオケ|インスト|弾き語り",
    re.I,
)


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower().replace("髙", "高")
    return re.sub(r"[\s・･._\-—–:|/\\()\[\]{}【】「」『』\"'’‘“”!！?？,，。]+", "", value)


def kata_to_hira(value: str) -> str:
    out = []
    for ch in value:
        code = ord(ch)
        out.append(chr(code - 0x60) if 0x30A1 <= code <= 0x30F6 else ch)
    return "".join(out)


def lyric_norm(value: str) -> str:
    return kata_to_hira(norm(value))


def valid_line(value: str) -> bool:
    n = lyric_norm(value)
    return 4 <= len(n) <= 60 and bool(re.search(r"[ぁ-ゖ一-龯]", n))


def request_json(url: str, *, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
    last: Exception | None = None
    for attempt in range(5):
        try:
            response = requests.get(url, params=params, headers=headers, timeout=18)
            if response.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"{response.status_code} from {url}")
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            last = exc
            if attempt == 4:
                break
            time.sleep(min(1.5 * (2 ** attempt), 8))
    raise RuntimeError(f"request failed after retries: {url}: {last}")


def request_bytes(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(4):
        try:
            response = requests.get(url, timeout=30)
            if response.status_code in (429, 500, 502, 503, 504):
                raise requests.HTTPError(f"{response.status_code} from preview")
            response.raise_for_status()
            if len(response.content) < 20_000:
                raise RuntimeError(f"preview unexpectedly small: {len(response.content)} bytes")
            return response.content
        except Exception as exc:
            last = exc
            if attempt == 3:
                break
            time.sleep(min(2 * (2 ** attempt), 8))
    raise RuntimeError(f"preview download failed: {last}")


def artist_matches(actual: str, aliases: list[str]) -> bool:
    a = norm(actual)
    return any(a == norm(alias) or a in norm(alias) or norm(alias) in a for alias in aliases)


def clean_track(value: str) -> str:
    value = re.sub(
        r"\s*\([^)]*(?:live|remix|instrumental|version|ver\.?|acoustic)[^)]*\)\s*$",
        "",
        value,
        flags=re.I,
    )
    value = re.sub(r"\s*[-–—]\s*(?:single|album)\s*version\s*$", "", value, flags=re.I)
    return value.strip()


def title_matches(actual: str, expected: str) -> bool:
    a = norm(clean_track(actual))
    e = norm(clean_track(expected))
    return bool(
        a
        and e
        and (
            a == e
            or (len(e) >= 6 and (a.startswith(e) or e.startswith(a)))
        )
    )


def parse_synced(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    rows: list[dict[str, Any]] = []
    for source in raw.splitlines():
        match = re.match(r"^\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$", source)
        if not match:
            continue
        text = match.group(4).strip()
        if valid_line(text):
            rows.append({"text": text})
    return rows


def lrclib_tracks(artist: str) -> list[dict[str, Any]]:
    data = request_json(
        "https://lrclib.net/api/search",
        params={"q": artist},
        headers={
            "Accept": "application/json",
            "Lrclib-Client": "Kotoba Lab verified-preview-builder",
        },
    )
    aliases = ARTISTS[artist]
    rows = []
    for row in data:
        if row.get("instrumental") or not row.get("syncedLyrics"):
            continue
        if not artist_matches(str(row.get("artistName", "")), aliases):
            continue
        noisy = str(row.get("trackName", "")) + " " + str(row.get("albumName", ""))
        if NOISY_VERSION.search(noisy):
            continue
        if not parse_synced(row.get("syncedLyrics")):
            continue
        rows.append(row)

    rows.sort(
        key=lambda row: (
            abs(float(row.get("duration") or 240) - 240),
            int(row.get("id") or 0),
        )
    )
    return rows


def apple_track(artist: str, track: dict[str, Any]) -> dict[str, Any] | None:
    aliases = ARTISTS[artist]
    terms = [
        f"{track.get('artistName', artist)} {track.get('trackName', '')}",
        f"{artist} {track.get('trackName', '')}",
    ]
    candidates: list[dict[str, Any]] = []
    for term in terms:
        try:
            data = request_json(
                "https://itunes.apple.com/search",
                params={
                    "term": term,
                    "country": "JP",
                    "media": "music",
                    "entity": "song",
                    "limit": 40,
                },
            )
            candidates.extend(data.get("results") or [])
        except Exception as exc:
            print("  apple search retry exhausted", repr(term), exc)

    expected_duration = float(track.get("duration") or 0)
    expected_album = norm(str(track.get("albumName") or ""))
    verified: list[tuple[int, float, dict[str, Any]]] = []

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

        actual_album = norm(str(row.get("collectionName") or ""))
        album_bonus = int(
            bool(expected_album and actual_album and (
                expected_album in actual_album or actual_album in expected_album
            ))
        )
        duration_delta = abs(actual_duration - expected_duration) if expected_duration else 0
        verified.append((album_bonus, -duration_delta, row))

    if not verified:
        return None
    verified.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return verified[0][2]


def transcribe_preview(model: WhisperModel, url: str) -> list[dict[str, Any]]:
    content = request_bytes(url)
    suffix = ".m4a" if "m4a" in url else ".mp3"
    path = Path(tempfile.mkdtemp()) / ("preview" + suffix)
    path.write_bytes(content)

    segments, _ = model.transcribe(
        str(path),
        language="ja",
        beam_size=5,
        vad_filter=False,
        word_timestamps=True,
        condition_on_previous_text=False,
    )
    out: list[dict[str, Any]] = []
    for segment in segments:
        text = segment.text.strip()
        if text:
            out.append({
                "start": float(segment.start),
                "end": float(segment.end),
                "text": text,
            })
    return out


def common_substring_len(a: str, b: str) -> int:
    maximum = min(len(a), len(b), 16)
    for length in range(maximum, 2, -1):
        for start in range(0, len(a) - length + 1):
            if a[start:start + length] in b:
                return length
    return 0


def audio_matches(
    lines: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    *,
    limit: int = 3,
) -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []
    for index in range(len(segments)):
        for width in (1, 2, 3):
            subset = segments[index:index + width]
            if not subset:
                continue
            start = float(subset[0]["start"])
            end = float(subset[-1]["end"])
            if end - start > 12:
                continue
            windows.append({
                "start": start,
                "end": end,
                "text": "".join(str(seg["text"]) for seg in subset),
            })

    candidates: list[dict[str, Any]] = []
    for line in lines:
        target = lyric_norm(str(line["text"]))
        if len(target) < 4:
            continue
        best_for_line: dict[str, Any] | None = None
        for window in windows:
            heard = lyric_norm(str(window["text"]))
            if not heard:
                continue
            score = max(ratio(target, heard), partial_ratio(target, heard))
            common = common_substring_len(target, heard)
            strong = (
                score >= 90 and common >= 4
            ) or (
                score >= 82 and common >= 6
            ) or (
                score >= 76 and common >= 8
            )
            if not strong:
                continue
            candidate = {
                "line": str(line["text"]),
                "start": max(0.0, float(window["start"])),
                "end": min(30.0, float(window["end"])),
                "transcript": str(window["text"]),
                "score": float(score),
                "common": int(common),
            }
            if best_for_line is None or (
                candidate["score"],
                candidate["common"],
                -(candidate["end"] - candidate["start"]),
            ) > (
                best_for_line["score"],
                best_for_line["common"],
                -(best_for_line["end"] - best_for_line["start"]),
            ):
                best_for_line = candidate
        if best_for_line:
            candidates.append(best_for_line)

    candidates.sort(
        key=lambda item: (
            item["score"],
            item["common"],
            -(item["end"] - item["start"]),
        ),
        reverse=True,
    )

    chosen: list[dict[str, Any]] = []
    seen_lines: set[str] = set()
    for candidate in candidates:
        key = lyric_norm(candidate["line"])
        if key in seen_lines:
            continue
        # Avoid near-duplicate windows from adjacent lines.
        if any(
            abs(candidate["start"] - previous["start"]) < 0.75
            and abs(candidate["end"] - previous["end"]) < 0.75
            for previous in chosen
        ):
            continue
        seen_lines.add(key)
        chosen.append(candidate)
        if len(chosen) >= limit:
            break
    return chosen


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--per-artist", type=int, default=6)
    parser.add_argument("--model", default="small")
    args = parser.parse_args()

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    entries: list[dict[str, Any]] = []

    for artist in ARTISTS:
        accepted = 0
        seen_apple_ids: set[int] = set()
        print(f"ARTIST {artist}")

        try:
            tracks = lrclib_tracks(artist)
        except Exception as exc:
            print("  LRCLIB unavailable after retries:", exc)
            continue

        for track in tracks[:30]:
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
                segments = transcribe_preview(model, str(apple["previewUrl"]))
            except Exception as exc:
                print("  preview failed", track.get("trackName"), exc)
                continue

            matches = audio_matches(
                parse_synced(track.get("syncedLyrics")),
                segments,
                limit=min(3, args.per_artist - accepted),
            )
            if not matches:
                print("  reject", track.get("trackName"), "no strong lyric/audio match")
                continue

            for match in matches:
                entry = {
                    "id": f"apple:{apple_id}:{round(match['start'], 2)}:{norm(match['line'])[:12]}",
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
                    "verifiedTranscript": match["transcript"],
                }
                entries.append(entry)
                accepted += 1
                print(
                    "  VERIFIED",
                    entry["trackName"],
                    repr(entry["lineJa"]),
                    f"{entry['previewLineStartSeconds']}-{entry['previewLineEndSeconds']}s",
                    "score", entry["verificationScore"],
                    "heard", repr(entry["verifiedTranscript"]),
                )
                if accepted >= args.per_artist:
                    break

    output = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "verifier": f"faster-whisper/{args.model}",
        "storefront": "JP",
        "entries": entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    counts: dict[str, int] = {}
    for artist, aliases in ARTISTS.items():
        normalized_aliases = {norm(alias) for alias in aliases}
        counts[artist] = sum(
            1
            for entry in entries
            if any(norm(alias) in normalized_aliases for alias in entry["artistAliases"])
        )

    print("COUNTS", json.dumps(counts, ensure_ascii=False))
    print("TOTAL_VERIFIED", len(entries))
    if len(entries) < 12:
        raise SystemExit("Need at least 12 verified cards before publishing")
    if sum(1 for count in counts.values() if count >= 2) < 4:
        raise SystemExit("Need verified coverage for at least four supported artists")


if __name__ == "__main__":
    main()
