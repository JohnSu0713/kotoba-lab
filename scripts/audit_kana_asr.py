#!/usr/bin/env python3
"""ASR-audit every unique kana pronunciation.

Each generated kana clip is repeated with short silences, then transcribed by a
separate local Whisper model with a hiragana-oriented prompt. This is independent
from Google TTS and catches silent, clipped, or wrong-mora assets.

A small set of phonetic equivalences is accepted for modern Japanese:
を≈お, ぢ≈じ, づ≈ず (and combinations derived from them).
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
import unicodedata
from pathlib import Path

from faster_whisper import WhisperModel
from pydub import AudioSegment

KANA_SEED_RE = re.compile(
    r"\['([^']+)','([^']+)','[^']+','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]"
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.strip())
    out: list[str] = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            out.append(chr(code - 0x60))
        elif ch in "ゔ":
            out.append(ch)
        elif "ぁ" <= ch <= "ゖ" or ch == "ー":
            out.append(ch)
    return "".join(out)


def accepted_forms(kana: str) -> set[str]:
    forms = {kana}
    substitutions = {
        "を": "お",
        "ぢ": "じ",
        "づ": "ず",
        "ぢゃ": "じゃ",
        "ぢゅ": "じゅ",
        "ぢょ": "じょ",
    }
    if kana in substitutions:
        forms.add(substitutions[kana])
    return forms


def prepare_clip(path: Path) -> Path:
    source = AudioSegment.from_file(path)
    silence = AudioSegment.silent(duration=220)
    combined = AudioSegment.silent(duration=180)
    for _ in range(5):
        combined += source + silence
    output = Path(tempfile.mkdtemp()) / "audit.wav"
    combined.export(output, format="wav")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kana-source", type=Path, required=True)
    parser.add_argument("--audio-dir", type=Path, required=True)
    parser.add_argument("--model", default="small")
    args = parser.parse_args()

    manifest = json.loads((args.audio_dir / "manifest.json").read_text(encoding="utf-8"))
    profile = manifest["profiles"]["kana"]
    rows = KANA_SEED_RE.findall(args.kana_source.read_text(encoding="utf-8"))

    canonical = []
    seen = set()
    for hira, _ in rows:
        if hira not in seen:
            seen.add(hira)
            canonical.append(hira)

    if len(canonical) != 104:
        raise SystemExit(f"Expected 104 unique kana, found {len(canonical)}")

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    failures: list[str] = []
    results: list[dict[str, str]] = []

    for index, kana in enumerate(canonical, 1):
        url = profile.get(kana)
        if not url:
            failures.append(f"{kana}: missing manifest entry")
            continue
        path = args.audio_dir / Path(url).name
        if not path.exists():
            failures.append(f"{kana}: missing {path.name}")
            continue

        prepared = prepare_clip(path)
        segments, info = model.transcribe(
            str(prepared),
            language="ja",
            beam_size=5,
            vad_filter=False,
            condition_on_previous_text=False,
            initial_prompt="これは日本語の仮名一文字の発音です。聞こえた音をひらがなでそのまま書いてください。",
        )
        raw = "".join(segment.text for segment in segments)
        heard = normalize(raw)
        forms = accepted_forms(kana)
        ok = any(form in heard for form in forms)

        results.append({"kana": kana, "heard": heard, "raw": raw.strip(), "ok": str(ok)})
        print(f"{index:03d}/104 {kana} -> {raw.strip()!r} [{heard!r}] {'OK' if ok else 'FAIL'}")
        if not ok:
            failures.append(f"{kana}: ASR heard {raw.strip()!r} ({heard!r})")

    print("KANA_ASR_CHECKED", len(results))
    print("KANA_ASR_FAILURES", len(failures))
    if failures:
        print("FAILURES:")
        for failure in failures:
            print(" -", failure)
        raise SystemExit(1)

    print("KANA_ASR_AUDIT_OK")


if __name__ == "__main__":
    main()
