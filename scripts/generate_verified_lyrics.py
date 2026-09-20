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
from difflib import SequenceMatcher
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

ARTIST_TRACK_HINTS: dict[str, list[str]] = {
    "Official髭男dism": ["Pretender", "I LOVE...", "Subtitle", "宿命", "ミックスナッツ"],
}

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
    "Vaundy": ["Vaundy", "バウンディ"],
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
    headers = {
        "Accept": "application/json",
        "Lrclib-Client": "Kotoba Lab verified-preview-builder",
    }
    data: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    # Artist-only search can be sparse for stylized names such as
    # Official髭男dism. Seed exact popular track lookups first, then broaden.
    for title in ARTIST_TRACK_HINTS.get(artist, []):
        try:
            hinted = request_json(
                "https://lrclib.net/api/search",
                params={"artist_name": artist, "track_name": title},
                headers=headers,
            )
            for row in hinted:
                row_id = int(row.get("id") or 0)
                if row_id and row_id not in seen_ids:
                    seen_ids.add(row_id)
                    data.append(row)
        except Exception as exc:
            print("  LRCLIB hinted search failed", repr(title), exc)

    broad = request_json(
        "https://lrclib.net/api/search",
        params={"q": artist},
        headers=headers,
    )
    for row in broad:
        row_id = int(row.get("id") or 0)
        if row_id and row_id not in seen_ids:
            seen_ids.add(row_id)
            data.append(row)

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
        if not text:
            continue
        words: list[dict[str, Any]] = []
        for word in segment.words or []:
            word_text = str(word.word or "").strip()
            if not word_text:
                continue
            words.append({
                "text": word_text,
                "start": float(word.start),
                "end": float(word.end),
            })
        out.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": text,
            "words": words,
        })
    return out


def lyric_display_units(value: str) -> list[str]:
    """Split a lyric into karaoke-sized display units while preserving punctuation."""
    units: list[str] = []
    prefix = ""
    for char in value:
        if lyric_norm(char):
            units.append(prefix + char)
            prefix = ""
        elif units:
            units[-1] += char
        else:
            prefix += char
    if prefix:
        if units:
            units[-1] += prefix
        else:
            units.append(prefix)
    return [unit for unit in units if unit]


def _heard_character_timeline(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Expand Whisper word anchors into a normalized character timeline."""
    timeline: list[dict[str, Any]] = []
    for word in words:
        text = lyric_norm(str(word.get("text") or ""))
        if not text:
            continue
        try:
            start = float(word.get("start"))
            end = float(word.get("end"))
        except (TypeError, ValueError):
            continue
        if not (end > start):
            continue
        duration = max(0.04, end - start)
        for index, char in enumerate(text):
            char_start = start + duration * index / len(text)
            char_end = start + duration * (index + 1) / len(text)
            timeline.append({
                "char": char,
                "start": char_start,
                "end": max(char_start + 0.025, char_end),
            })
    return timeline


def align_karaoke_timings(
    line: str,
    words: list[dict[str, Any]],
    window_start: float,
    window_end: float,
) -> dict[str, Any]:
    """Align exact lyric characters to Whisper timing anchors.

    This is intentionally conservative: if too little of the displayed lyric
    can be anchored to the ASR transcript, no fake per-character timings are
    emitted and the client falls back to line-level highlighting.
    """
    units = lyric_display_units(line)
    target = "".join(lyric_norm(unit) for unit in units)
    heard = _heard_character_timeline(words)
    heard_text = "".join(item["char"] for item in heard)

    if not units or not target or not heard_text:
        return {
            "words": [],
            "coverage": 0.0,
            "start": max(0.0, window_start),
            "end": min(30.0, window_end),
        }

    matcher = SequenceMatcher(None, target, heard_text, autojunk=False)
    matched: dict[int, dict[str, Any]] = {}
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            target_index = block.a + offset
            heard_index = block.b + offset
            if heard_index < len(heard):
                matched[target_index] = heard[heard_index]

    matched_count = len(matched)
    coverage = matched_count / max(1, len(target))
    if matched_count < min(4, len(target)) or coverage < 0.58:
        return {
            "words": [],
            "coverage": coverage,
            "start": max(0.0, window_start),
            "end": min(30.0, window_end),
        }

    direct_durations = [
        max(0.025, value["end"] - value["start"])
        for value in matched.values()
    ]
    direct_durations.sort()
    median_duration = direct_durations[len(direct_durations) // 2] if direct_durations else 0.12
    median_duration = min(0.42, max(0.055, median_duration))

    char_times: list[dict[str, float] | None] = [None] * len(target)
    for index, value in matched.items():
        char_times[index] = {
            "start": float(value["start"]),
            "end": float(value["end"]),
        }

    known = sorted(matched)
    first = known[0]
    first_start = float(char_times[first]["start"])  # type: ignore[index]
    for index in range(first - 1, -1, -1):
        end = first_start - median_duration * (first - 1 - index)
        start = end - median_duration
        char_times[index] = {"start": start, "end": end}

    last = known[-1]
    last_end = float(char_times[last]["end"])  # type: ignore[index]
    for index in range(last + 1, len(target)):
        start = last_end + median_duration * (index - last - 1)
        char_times[index] = {"start": start, "end": start + median_duration}

    for left, right in zip(known, known[1:]):
        if right <= left + 1:
            continue
        left_end = float(char_times[left]["end"])  # type: ignore[index]
        right_start = float(char_times[right]["start"])  # type: ignore[index]
        gap_count = right - left - 1
        available = right_start - left_end
        if available >= gap_count * 0.025:
            step = available / gap_count
            for offset in range(1, gap_count + 1):
                start = left_end + step * (offset - 1)
                char_times[left + offset] = {
                    "start": start,
                    "end": min(right_start, max(start + 0.025, left_end + step * offset)),
                }
        else:
            span_start = float(char_times[left]["start"])  # type: ignore[index]
            span_end = float(char_times[right]["end"])  # type: ignore[index]
            step = max(0.025, (span_end - span_start) / (right - left + 1))
            for offset in range(1, gap_count + 1):
                start = span_start + step * offset
                char_times[left + offset] = {
                    "start": start,
                    "end": start + step,
                }

    # Map normalized target character ranges back to original display units.
    result: list[dict[str, Any]] = []
    target_cursor = 0
    for unit in units:
        normalized_unit = lyric_norm(unit)
        length = max(1, len(normalized_unit))
        slice_times = [
            value for value in char_times[target_cursor:target_cursor + length]
            if value is not None
        ]
        target_cursor += length
        if not slice_times:
            continue
        unit_start = max(0.0, float(slice_times[0]["start"]))
        unit_end = min(30.0, float(slice_times[-1]["end"]))
        if unit_end <= unit_start:
            continue
        result.append({
            "text": unit,
            "startSeconds": round(unit_start, 3),
            "endSeconds": round(unit_end, 3),
        })

    if not result or "".join(item["text"] for item in result) != line:
        return {
            "words": [],
            "coverage": coverage,
            "start": max(0.0, window_start),
            "end": min(30.0, window_end),
        }

    aligned_start = max(0.0, result[0]["startSeconds"] - 0.02)
    aligned_end = min(30.0, result[-1]["endSeconds"] + 0.02)
    return {
        "words": result,
        "coverage": coverage,
        "start": aligned_start,
        "end": max(aligned_start + 0.2, aligned_end),
    }

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
                "words": [
                    word
                    for seg in subset
                    for word in (seg.get("words") or [])
                ],
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
            full_score = ratio(target, heard)
            partial_score = partial_ratio(target, heard)
            common = common_substring_len(target, heard)
            coverage = min(1.0, len(heard) / max(1, len(target)))
            exact_inclusion = target in heard

            # A preview card must contain essentially the whole displayed line.
            # partial_ratio alone is unsafe: a four-character fragment can score
            # 100 against a much longer lyric. Require either exact inclusion or
            # strong full-line similarity with substantial transcript coverage.
            strong = exact_inclusion or (
                coverage >= 0.78
                and full_score >= 82
                and partial_score >= 86
                and common >= max(4, min(8, len(target) // 3))
            )
            if not strong:
                continue

            score = max(full_score, partial_score)
            alignment = align_karaoke_timings(
                str(line["text"]),
                list(window.get("words") or []),
                max(0.0, float(window["start"])),
                min(30.0, float(window["end"])),
            )
            candidate = {
                "line": str(line["text"]),
                "start": alignment["start"],
                "end": alignment["end"],
                "transcript": str(window["text"]),
                "score": float(score),
                "fullScore": float(full_score),
                "coverage": float(coverage),
                "exactInclusion": bool(exact_inclusion),
                "common": int(common),
                "wordTimings": alignment["words"],
                "karaokeAlignmentCoverage": float(alignment["coverage"]),
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
                    "verificationFullScore": round(match["fullScore"], 1),
                    "verificationCoverage": round(match["coverage"], 3),
                    "verificationExactInclusion": bool(match["exactInclusion"]),
                    "verificationCommonChars": int(match["common"]),
                    "verifiedTranscript": match["transcript"],
                    "words": match["wordTimings"],
                    "karaokeAlignmentCoverage": round(match["karaokeAlignmentCoverage"], 3),
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
