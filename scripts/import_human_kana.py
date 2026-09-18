#!/usr/bin/env python3
"""Vendor and import public-domain native-speaker kana recordings.

Hakatanoshio117117 released this coherent hiragana recording set into the
public domain on Wikimedia Commons. Network acquisition is intentionally
separated from normal builds:

* --download-only vendors a deterministic shard of the 71 non-yoon recordings.
* normal mode imports only from --vendor-dir, so CI / production never depends
  on Wikimedia availability or rate limits.

Yoon remains generated through explicit Google yomigana SSML.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SEED_RE = re.compile(
    r"\['([^']+)','([^']+)','([^']+)','[^']+','(gojuon|dakuten|handakuten|yoon)'\]"
)

SPECIAL = {
    "あ": "Ja-A.oga",
    "い": "Japanese I.ogg",
    "う": "Japanese U.ogg",
    "え": "Ja-E.oga",
    "お": "Japanese O.ogg",
    "か": "Ja-Ka.oga",
    "そ": "Ja-So.oga",
    "ん": "Japanese N.ogg",
    "ち": "Japanese ti.ogg",
    "ふ": "Japanese hu.ogg",
    "じ": "Japanese zi.ogg",
    "ぢ": "Japanese di.ogg",
    "づ": "Japanese du.ogg",
}


def commons_url(filename: str) -> str:
    canonical = filename.replace(" ", "_")
    digest = hashlib.md5(canonical.encode("utf-8")).hexdigest()
    encoded = urllib.parse.quote(canonical)
    return (
        "https://upload.wikimedia.org/wikipedia/commons/"
        f"{digest[0]}/{digest[:2]}/{encoded}"
    )


def source_filename(hira: str, romaji: str) -> str:
    return SPECIAL.get(hira, f"Japanese {romaji}.ogg")


def asset_name(filename: str) -> str:
    identity = f"commons-pd\0{filename}\0trim-v1"
    return hashlib.sha256(identity.encode()).hexdigest()[:24] + ".mp3"


def master(src: Path, dst: Path) -> None:
    # Keep the native pronunciation untouched; only trim broad silence, retain a
    # short pad for mobile playback, and limit peak level safely.
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-v",
            "error",
            "-i",
            str(src),
            "-af",
            (
                "silenceremove="
                "start_periods=1:start_duration=0.03:start_threshold=-45dB:"
                "stop_periods=1:stop_duration=0.08:stop_threshold=-45dB,"
                "apad=pad_dur=0.07,alimiter=limit=0.89"
            ),
            "-ac",
            "1",
            "-ar",
            "44100",
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "3",
            str(dst),
        ],
        check=True,
    )


def download_one(hira: str, romaji: str, output: Path) -> None:
    filename = source_filename(hira, romaji)
    url = commons_url(filename)
    destination = output / asset_name(filename)
    if destination.exists() and destination.stat().st_size > 500:
        print(f"{hira}: cached {destination.name}")
        return

    output.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Kotoba-Lab/1.0 educational kana vendor "
                "(github.com/JohnSu0713/kotoba-lab)"
            ),
            "Accept": "audio/ogg,application/ogg;q=0.9,*/*;q=0.1",
        },
    )

    with tempfile.TemporaryDirectory() as td:
        raw = Path(td) / filename.replace(" ", "_")
        last_error: Exception | None = None
        for attempt in range(5):
            try:
                with urllib.request.urlopen(request, timeout=35) as response:
                    raw.write_bytes(response.read())
                last_error = None
                break
            except urllib.error.HTTPError as exc:
                last_error = exc
                if exc.code != 429 or attempt == 4:
                    break
                retry_after = exc.headers.get("Retry-After")
                # Each shard makes <10 requests from its own hosted runner. A
                # short retry is enough for transient edge throttling; never
                # sleep for Wikimedia's 10-minute global backoff in CI.
                wait = (
                    min(float(retry_after), 25)
                    if retry_after and retry_after.isdigit()
                    else min(4 * (attempt + 1), 20)
                )
                print(f"{hira}: 429; retrying in {wait:.0f}s")
                time.sleep(wait)
            except Exception as exc:
                last_error = exc
                if attempt == 4:
                    break
                time.sleep(min(3 * (attempt + 1), 15))
        if last_error is not None:
            raise RuntimeError(
                f"{hira}: failed {filename} {url}: {last_error}"
            ) from last_error

        if raw.stat().st_size < 1000:
            raise RuntimeError(f"{hira}: downloaded source is suspiciously small")
        master(raw, destination)
        print(f"{hira}: vendored {destination.name}")


def rows_from_source(path: Path) -> list[tuple[str, str, str, str]]:
    return SEED_RE.findall(path.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kana-source", type=Path, required=True)
    ap.add_argument("--audio-dir", type=Path)
    ap.add_argument(
        "--vendor-dir",
        type=Path,
        default=Path("vendor/kana-human"),
    )
    ap.add_argument("--download-only", action="store_true")
    ap.add_argument("--shard-index", type=int, default=0)
    ap.add_argument("--shard-count", type=int, default=1)
    args = ap.parse_args()

    rows = rows_from_source(args.kana_source)
    human_rows = [
        (hira, kata, romaji, group)
        for hira, kata, romaji, group in rows
        if group != "yoon"
    ]
    if len(human_rows) != 71:
        raise SystemExit(f"expected 71 human kana, found {len(human_rows)}")

    if args.download_only:
        if not 0 <= args.shard_index < args.shard_count:
            raise SystemExit("invalid shard index/count")
        selected = [
            row
            for index, row in enumerate(human_rows)
            if index % args.shard_count == args.shard_index
        ]
        print(
            f"SHARD={args.shard_index}/{args.shard_count}; "
            f"KANA={len(selected)}"
        )
        for hira, _, romaji, _ in selected:
            download_one(hira, romaji, args.vendor_dir)
            time.sleep(0.8)
        print("VENDORED", len(selected))
        return

    if args.audio_dir is None:
        raise SystemExit("--audio-dir is required unless --download-only is used")

    manifest_path = args.audio_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sources: dict[str, dict[str, str]] = {}
    args.audio_dir.mkdir(parents=True, exist_ok=True)

    imported = 0
    missing: list[str] = []
    for hira, kata, romaji, _ in human_rows:
        filename = source_filename(hira, romaji)
        name = asset_name(filename)
        source = args.vendor_dir / name
        if not source.exists():
            missing.append(f"{hira}:{name}")
            continue
        destination = args.audio_dir / name
        shutil.copy2(source, destination)

        asset = f"./audio/ja/{name}"
        manifest["profiles"]["kana"][hira] = asset
        manifest["profiles"]["kana"][kata] = asset
        sources[hira] = {
            "filename": filename,
            "url": commons_url(filename),
            "license": "Public domain",
            "author": "Hakatanoshio117117",
        }
        imported += 1

    if missing:
        raise SystemExit(
            "Missing vendored human kana assets: " + ", ".join(missing)
        )

    manifest["kanaHumanAudio"] = {
        "count": imported,
        "source": "Wikimedia Commons",
        "license": "Public domain",
        "author": "Hakatanoshio117117",
        "items": sources,
    }
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    referenced = {
        Path(url).name
        for profile in manifest.get("profiles", {}).values()
        for url in profile.values()
    }
    removed = 0
    for path in args.audio_dir.glob("*.mp3"):
        if path.name not in referenced:
            path.unlink()
            removed += 1

    print("HUMAN_KANA_IMPORTED", imported)
    print("ORPHAN_AUDIO_REMOVED", removed)
    if imported != 71:
        raise SystemExit(f"expected 71 human kana, imported {imported}")


if __name__ == "__main__":
    main()
