#!/usr/bin/env python3
"""Closed-set acoustic verification for every kana pronunciation.

This verifier compares the production voice against the same 104 explicit
yomigana phonemes synthesized by one or more independent Japanese reference
voices. It never sees the production manifest's intended file mapping while
building reference features; each production clip is classified among all
candidate kana by acoustic DTW.

The check is designed for isolated morae, where open-ended ASR models often
hallucinate words. Modern Japanese mergers are treated as equivalent:
を≈お, ぢ≈じ, づ≈ず (including the corresponding yoon forms).
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import librosa
import numpy as np

KANA_SEED_RE = re.compile(
    r"\['([^']+)','([^']+)','[^']+','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]"
)

EQUIVALENTS = {
    "を": {"を", "お"},
    "お": {"お", "を"},
    "ぢ": {"ぢ", "じ"},
    "じ": {"じ", "ぢ"},
    "づ": {"づ", "ず"},
    "ず": {"ず", "づ"},
    "ぢゃ": {"ぢゃ", "じゃ"},
    "じゃ": {"じゃ", "ぢゃ"},
    "ぢゅ": {"ぢゅ", "じゅ"},
    "じゅ": {"じゅ", "ぢゅ"},
    "ぢょ": {"ぢょ", "じょ"},
    "じょ": {"じょ", "ぢょ"},
}


def normalize(text: str) -> str:
    return unicodedata.normalize("NFC", text.strip())


def canonical_kana(source: Path) -> list[str]:
    rows = KANA_SEED_RE.findall(source.read_text(encoding="utf-8"))
    result: list[str] = []
    seen: set[str] = set()
    for hira, _ in rows:
        key = normalize(hira)
        if key not in seen:
            seen.add(key)
            result.append(key)
    if len(result) != 104:
        raise SystemExit(f"Expected 104 canonical kana, found {len(result)}")
    return result


def load_manifest(directory: Path) -> dict:
    return json.loads((directory / "manifest.json").read_text(encoding="utf-8"))


def audio_path(directory: Path, manifest: dict, kana: str) -> Path:
    url = manifest["profiles"]["kana"].get(kana)
    if not url:
        raise RuntimeError(f"{kana}: missing manifest entry in {directory}")
    path = directory / Path(url).name
    if not path.exists():
        raise RuntimeError(f"{kana}: missing audio file {path}")
    return path


def features(path: Path) -> np.ndarray:
    audio, _ = librosa.load(path, sr=16000, mono=True)
    audio, _ = librosa.effects.trim(audio, top_db=32)
    if len(audio) < 1200:
        raise RuntimeError(f"{path.name}: too little voiced audio")

    # Normalize amplitude only; preserve the spectral envelope that identifies
    # the vowel/consonant. MFCCs exclude coefficient 0 (mostly energy).
    peak = float(np.max(np.abs(audio)))
    if peak > 0:
        audio = audio / peak
    mfcc = librosa.feature.mfcc(
        y=audio,
        sr=16000,
        n_mfcc=20,
        n_fft=512,
        hop_length=128,
        n_mels=64,
        fmin=60,
        fmax=7600,
    )[1:20]
    delta = librosa.feature.delta(mfcc, width=5, mode="nearest")
    return np.vstack([mfcc, 0.45 * delta]).astype(np.float32)


def dtw_distance(left: np.ndarray, right: np.ndarray) -> float:
    # Cosine frame cost is substantially less speaker-dependent than raw L2.
    # Delta rows can be exactly zero on a steady isolated vowel; add a tiny
    # floor so scipy's cosine distance never divides by a zero frame norm.
    left = np.nan_to_num(left, nan=0.0, posinf=0.0, neginf=0.0) + 1e-6
    right = np.nan_to_num(right, nan=0.0, posinf=0.0, neginf=0.0) + 1e-6
    matrix, path = librosa.sequence.dtw(X=left, Y=right, metric="cosine")
    return float(matrix[-1, -1] / max(1, len(path)))


def accepted_for(kana: str) -> set[str]:
    return EQUIVALENTS.get(kana, {kana})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--kana-source", type=Path, required=True)
    parser.add_argument("--production", type=Path, required=True)
    parser.add_argument("--reference", type=Path, action="append", required=True)
    parser.add_argument("--max-rank", type=int, default=3)
    args = parser.parse_args()

    kana = canonical_kana(args.kana_source)
    prod_manifest = load_manifest(args.production)
    ref_manifests = [(directory, load_manifest(directory)) for directory in args.reference]

    prod_features = {
        key: features(audio_path(args.production, prod_manifest, key))
        for key in kana
    }
    ref_features = [
        (
            directory,
            {
                key: features(audio_path(directory, manifest, key))
                for key in kana
            },
        )
        for directory, manifest in ref_manifests
    ]

    failures: list[str] = []
    rank_rows: list[int] = []

    for index, key in enumerate(kana, 1):
        accepted = accepted_for(key)
        per_reference: list[tuple[str, int, list[tuple[str, float]]]] = []

        for directory, refs in ref_features:
            scored = sorted(
                (
                    (candidate, dtw_distance(prod_features[key], candidate_features))
                    for candidate, candidate_features in refs.items()
                ),
                key=lambda item: item[1],
            )
            rank = next(
                (position for position, (candidate, _) in enumerate(scored, 1)
                 if candidate in accepted),
                len(scored) + 1,
            )
            per_reference.append((directory.name, rank, scored[:5]))
            rank_rows.append(rank)

        # Require every independent reference voice to put the intended phoneme
        # within a tight top-k neighborhood. This is stricter than majority vote.
        ok = all(rank <= args.max_rank for _, rank, _ in per_reference)
        detail = " | ".join(
            f"{name}:rank={rank},top="
            + ",".join(f"{candidate}:{distance:.3f}" for candidate, distance in top)
            for name, rank, top in per_reference
        )
        print(f"{index:03d}/104 {key} {'OK' if ok else 'FAIL'} {detail}")
        if not ok:
            failures.append(f"{key}: {detail}")

    print("KANA_REFERENCE_CHECKED", len(kana))
    print("KANA_REFERENCE_FAILURES", len(failures))
    if rank_rows:
        print("MAX_EXPECTED_RANK", max(rank_rows))
        print("MEAN_EXPECTED_RANK", round(float(np.mean(rank_rows)), 3))

    if failures:
        print("FAILURES:")
        for failure in failures:
            print(" -", failure)
        raise SystemExit(1)

    print("KANA_REFERENCE_AUDIT_OK")


if __name__ == "__main__":
    main()
