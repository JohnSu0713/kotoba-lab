#!/usr/bin/env python3
"""Audit every kana alias and every unique generated MP3.

This is intentionally strict: the manifest must be derivable from the exact kana
source + voice + rate, every referenced file must decode, have audible energy,
and have a plausible duration. Hiragana/katakana pairs may share one canonical
audio file; different canonical readings may not.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

KANA_SEED_RE = re.compile(
    r"\['([^']+)','([^']+)','[^']+','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]"
)


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text.strip())


def expected_asset_name(voice: str, rate: float, spoken_text: str) -> str:
    identity = f"{voice}\0kana\0{rate:.3f}\0{spoken_text}"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    return f"{digest}.mp3"


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        text=True,
    ).strip()
    return float(out)


def probe_mean_volume(path: Path) -> float:
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    match = re.search(r"mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB", proc.stderr)
    if not match:
        raise RuntimeError(f"Could not measure volume for {path.name}")
    return float(match.group(1))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kana-source", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads((args.audio_dir / "manifest.json").read_text(encoding="utf-8"))
    voice = manifest.get("voice")
    rate = float(manifest.get("rates", {}).get("kana", 0))
    profile = manifest.get("profiles", {}).get("kana", {})
    if not voice or rate <= 0:
        raise SystemExit("Manifest is missing voice/rates.kana")

    rows = KANA_SEED_RE.findall(args.kana_source.read_text(encoding="utf-8"))
    if not rows:
        raise SystemExit("No kana seeds found")

    expected_aliases: dict[str, str] = {}
    canonical_to_file: dict[str, str] = {}

    for hira, kata in rows:
        canonical = normalize(hira)
        spoken = canonical + "。"
        filename = expected_asset_name(voice, rate, spoken)
        for key in (normalize(hira), normalize(kata)):
            expected_aliases[key] = filename
        previous = canonical_to_file.setdefault(canonical, filename)
        if previous != filename:
            raise SystemExit(f"Non-deterministic filename for {canonical}")

    failures: list[str] = []
    if len(expected_aliases) != 208:
        failures.append(f"expected 208 kana aliases, got {len(expected_aliases)}")
    if len(profile) != 208:
        failures.append(f"manifest contains {len(profile)} kana aliases, expected 208")

    for key, filename in expected_aliases.items():
        actual_url = profile.get(key)
        actual_name = Path(actual_url or "").name
        if actual_name != filename:
            failures.append(f"{key}: manifest {actual_name!r} != expected {filename!r}")

    files_to_check = sorted(set(expected_aliases.values()))
    rows_out: list[tuple[str, int, float, float]] = []
    for filename in files_to_check:
        path = args.audio_dir / filename
        if not path.exists():
            failures.append(f"{filename}: missing")
            continue
        size = path.stat().st_size
        if size < 1200:
            failures.append(f"{filename}: suspiciously small ({size} bytes)")
            continue
        try:
            duration = probe_duration(path)
            mean_volume = probe_mean_volume(path)
        except Exception as exc:
            failures.append(f"{filename}: decode/probe failed: {exc}")
            continue
        if not 0.20 <= duration <= 4.50:
            failures.append(f"{filename}: duration {duration:.3f}s outside 0.20–4.50s")
        if mean_volume < -45:
            failures.append(f"{filename}: too quiet ({mean_volume:.1f} dB)")
        rows_out.append((filename, size, duration, mean_volume))

    # Different canonical kana must not accidentally point to the same generated file.
    reverse: dict[str, list[str]] = {}
    for canonical, filename in canonical_to_file.items():
        reverse.setdefault(filename, []).append(canonical)
    collisions = {name: values for name, values in reverse.items() if len(values) > 1}
    if collisions:
        failures.append(f"canonical audio collisions: {collisions}")

    print(f"ALIASES={len(expected_aliases)}")
    print(f"UNIQUE_AUDIO={len(files_to_check)}")
    print(f"PROBED={len(rows_out)}")
    if rows_out:
        durations = [row[2] for row in rows_out]
        volumes = [row[3] for row in rows_out]
        print(f"DURATION_RANGE={min(durations):.3f}..{max(durations):.3f}s")
        print(f"MEAN_VOLUME_RANGE={min(volumes):.1f}..{max(volumes):.1f}dB")

    if failures:
        print("FAILURES:")
        for failure in failures:
            print(" -", failure)
        raise SystemExit(1)

    print("KANA_AUDIO_AUDIT_OK")


if __name__ == "__main__":
    main()
