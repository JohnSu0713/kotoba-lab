#!/usr/bin/env python3
"""Generate deterministic Japanese learning audio with Google Cloud Chirp 3 HD.

The browser never receives a Google credential. This script is intended to run in
GitHub Actions (or locally with Application Default Credentials), writes MP3 files
to a separate audio-assets branch, and emits a small runtime lookup manifest.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import tempfile
import threading
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

LEVELS = ("N5", "N4", "N3", "N2", "N1")
DEFAULT_VOICE = "ja-JP-Chirp3-HD-Zephyr"
DEFAULT_KANA_RATE = 0.80
DEFAULT_WORD_RATE = 0.92
# Chirp 3 HD currently has a dedicated 200 requests/min/project quota. Keep a
# conservative margin so parallel workers never burst through the minute bucket.
DEFAULT_MIN_REQUEST_INTERVAL = 0.38
MANIFEST_SCHEMA = 1
KANA_SEED_RE = re.compile(
    r"\['([^']+)','([^']+)','[^']+','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]"
)


@dataclass(frozen=True)
class Target:
    profile: str
    key: str
    spoken_text: str
    rate: float


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text.strip())


def asset_name(target: Target, voice: str) -> str:
    identity = f"{voice}\0{target.profile}\0{target.rate:.3f}\0{target.spoken_text}"
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]
    return f"{digest}.mp3"


def load_kana_targets(source: Path, rate: float) -> list[Target]:
    text = source.read_text(encoding="utf-8")
    rows = KANA_SEED_RE.findall(text)
    if not rows:
        raise RuntimeError(f"No kana seeds found in {source}")

    targets: list[Target] = []
    for hira, kata in rows:
        canonical = normalize(hira)
        # A sentence boundary prevents Chirp from clipping isolated morae such as
        # い / き / し / ち. The manifest key remains the raw kana.
        spoken = canonical + "。"
        targets.append(Target("kana", normalize(hira), spoken, rate))
        targets.append(Target("kana", normalize(kata), spoken, rate))
    return targets


def load_vocab_targets(source_dir: Path, levels: Iterable[str], rate: float) -> list[Target]:
    targets: list[Target] = []
    for level in levels:
        path = source_dir / f"{level.lower()}.json"
        pack = json.loads(path.read_text(encoding="utf-8"))
        for item in pack.get("items", []):
            reading = normalize(str(item.get("reading", "")))
            if reading:
                targets.append(Target("default", reading, reading, rate))
    return targets


def dedupe_targets(targets: Iterable[Target]) -> list[Target]:
    seen: set[tuple[str, str]] = set()
    result: list[Target] = []
    for target in targets:
        identity = (target.profile, target.key)
        if identity in seen:
            continue
        seen.add(identity)
        result.append(target)
    return result


def empty_manifest() -> dict:
    return {
        "schemaVersion": MANIFEST_SCHEMA,
        "generatedAt": None,
        "voice": None,
        "profiles": {"kana": {}, "default": {}},
    }


def load_manifest(path: Path) -> dict:
    if not path.exists():
        return empty_manifest()
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        if value.get("schemaVersion") != MANIFEST_SCHEMA:
            return empty_manifest()
        value.setdefault("profiles", {}).setdefault("kana", {})
        value.setdefault("profiles", {}).setdefault("default", {})
        return value
    except (OSError, json.JSONDecodeError):
        return empty_manifest()


_thread_local = threading.local()
_rate_lock = threading.Lock()
_next_request_at = 0.0
_min_request_interval = DEFAULT_MIN_REQUEST_INTERVAL


def wait_for_quota_slot() -> None:
    """Serialize request starts while still allowing response work in parallel."""
    global _next_request_at
    with _rate_lock:
        now = time.monotonic()
        start_at = max(now, _next_request_at)
        _next_request_at = start_at + _min_request_interval
        delay = start_at - now
    if delay > 0:
        time.sleep(delay)


def synthesize_one(target: Target, output: Path, voice: str, attempts: int = 7) -> None:
    from google.cloud import texttospeech  # type: ignore

    local = _thread_local
    client = getattr(local, "client", None)
    if client is None:
        client = texttospeech.TextToSpeechClient()
        local.client = client

    request = {
        "input": texttospeech.SynthesisInput(text=target.spoken_text),
        "voice": texttospeech.VoiceSelectionParams(language_code="ja-JP", name=voice),
        "audio_config": texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=target.rate,
        ),
    }

    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            wait_for_quota_slot()
            response = client.synthesize_speech(request=request)
            output.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=output.parent, delete=False) as temp:
                temp.write(response.audio_content)
                temp_path = Path(temp.name)
            temp_path.replace(output)
            return
        except Exception as error:
            last_error = error
            if attempt + 1 < attempts:
                # Quota errors need time for the rolling minute bucket to recover;
                # transient transport failures usually recover much sooner.
                message = str(error)
                if "429" in message or "Resource has been exhausted" in message:
                    time.sleep(min(15 * (attempt + 1), 75))
                else:
                    time.sleep(min(2**attempt, 12))
    raise RuntimeError(f"Failed to synthesize {target.spoken_text!r}: {last_error}")


def main() -> None:
    global _min_request_interval

    parser = argparse.ArgumentParser()
    parser.add_argument("--vocab-dir", type=Path, default=Path("public/data/vocab"))
    parser.add_argument("--kana-source", type=Path, default=Path("src/features/kana/data.ts"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scope", default="all", choices=("all", "kana", *LEVELS))
    parser.add_argument("--voice", default=os.environ.get("GCP_TTS_VOICE", DEFAULT_VOICE))
    parser.add_argument("--kana-rate", type=float, default=float(os.environ.get("KOTOBA_KANA_RATE", DEFAULT_KANA_RATE)))
    parser.add_argument("--word-rate", type=float, default=float(os.environ.get("KOTOBA_WORD_RATE", DEFAULT_WORD_RATE)))
    parser.add_argument(
        "--min-request-interval",
        type=float,
        default=float(os.environ.get("KOTOBA_TTS_MIN_REQUEST_INTERVAL", DEFAULT_MIN_REQUEST_INTERVAL)),
        help="Minimum seconds between Chirp request starts across all workers.",
    )
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not 0.25 <= args.kana_rate <= 2.0 or not 0.25 <= args.word_rate <= 2.0:
        raise SystemExit("Chirp speaking rates must be between 0.25 and 2.0")
    if args.min_request_interval < 0.30:
        raise SystemExit("Use --min-request-interval >= 0.30 to respect the Chirp 3 RPM quota")
    _min_request_interval = args.min_request_interval

    selected_levels = LEVELS if args.scope == "all" else ((args.scope,) if args.scope in LEVELS else ())
    targets: list[Target] = []
    if args.scope in ("all", "kana"):
        targets.extend(load_kana_targets(args.kana_source, args.kana_rate))
    if selected_levels:
        targets.extend(load_vocab_targets(args.vocab_dir, selected_levels, args.word_rate))
    targets = dedupe_targets(targets)

    args.output.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output / "manifest.json"
    manifest = load_manifest(manifest_path)
    manifest["schemaVersion"] = MANIFEST_SCHEMA
    manifest["voice"] = args.voice
    manifest["rates"] = {"kana": args.kana_rate, "default": args.word_rate}

    if args.scope == "all":
        manifest["profiles"] = {"kana": {}, "default": {}}
    elif args.scope == "kana":
        manifest["profiles"]["kana"] = {}

    synth_by_path: dict[Path, Target] = {}
    for target in targets:
        filename = asset_name(target, args.voice)
        path = args.output / filename
        manifest["profiles"][target.profile][target.key] = f"./audio/ja/{filename}"
        synth_by_path.setdefault(path, target)

    pending = [
        (path, target)
        for path, target in synth_by_path.items()
        if args.force or not path.exists()
    ]

    requests_per_minute = 60 / args.min_request_interval
    print(
        f"Voice={args.voice}; scope={args.scope}; aliases={len(targets):,}; "
        f"unique assets={len(synth_by_path):,}; pending={len(pending):,}; "
        f"max start rate≈{requests_per_minute:.1f}/min"
    )
    if args.dry_run:
        return

    if pending:
        completed = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
            futures = {
                executor.submit(synthesize_one, target, path, args.voice): (path, target)
                for path, target in pending
            }
            for future in concurrent.futures.as_completed(futures):
                future.result()
                completed += 1
                if completed % 100 == 0 or completed == len(pending):
                    print(f"Generated {completed:,}/{len(pending):,} new audio assets")

    manifest["generatedAt"] = datetime.now(timezone.utc).isoformat()
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    if args.scope == "all":
        referenced = {
            Path(url).name
            for profile in manifest["profiles"].values()
            for url in profile.values()
        }
        for path in args.output.glob("*.mp3"):
            if path.name not in referenced:
                path.unlink()


if __name__ == "__main__":
    main()
