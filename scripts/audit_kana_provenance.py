#!/usr/bin/env python3
"""Validate per-kana pronunciation provenance.

For every canonical kana:
- gojuon/dakuten/handakuten must resolve to the curated public-domain native
  recording whose filename explicitly denotes that kana;
- yoon must resolve to a deterministic Google TTS asset generated from explicit
  Japanese yomigana SSML, never from unconstrained text inference.
"""

from __future__ import annotations
import argparse, hashlib, json, re, unicodedata
from pathlib import Path

SEED_RE=re.compile(r"\['([^']+)','([^']+)','([^']+)','[^']+','(gojuon|dakuten|handakuten|yoon)'\]")
SPECIAL={
    "あ":"Ja-A.oga","い":"Japanese I.ogg","う":"Japanese U.ogg","え":"Ja-E.oga","お":"Japanese O.ogg",
    "か":"Ja-Ka.oga","そ":"Ja-So.oga","ん":"Japanese N.ogg",
    "ち":"Japanese ti.ogg","ふ":"Japanese hu.ogg",
    "じ":"Japanese zi.ogg","ぢ":"Japanese di.ogg","づ":"Japanese du.ogg",
}

MIRROR_REPO="ramified/ramified.github.io"
MIRROR_COMMIT="8a959d7a2a0f61283a76e6db4f9cc0222295ea66"
MIRROR_IDS={
    "ち":"chi",
    "ふ":"fu",
    "じ":"ji",
    "ぢ":"dji",
    "づ":"dzu",
}

def norm(s:str)->str:
    return unicodedata.normalize("NFC",s.strip())

def expected_human_filename(hira:str,romaji:str)->str:
    return SPECIAL.get(hira,f"Japanese {romaji}.ogg")

def mirror_id(hira:str,romaji:str)->str:
    return MIRROR_IDS.get(hira,romaji)

def expected_human_asset(hira:str,romaji:str,filename:str)->str:
    identity=(
        f"commons-pd-mirror\0{MIRROR_REPO}\0{MIRROR_COMMIT}\0"
        f"{mirror_id(hira,romaji)}.mp3\0{filename}"
    )
    return hashlib.sha256(identity.encode()).hexdigest()[:24]+".mp3"

def expected_tts_asset(hira:str,voice:str,rate:float)->str:
    spoken=(
        '<speak><break time="80ms"/>'
        f'<phoneme alphabet="yomigana" ph="{hira}">{hira}</phoneme>'
        '<break time="120ms"/></speak>'
    )
    identity=f"{voice}\0kana\0{rate:.3f}\0{spoken}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24]+".mp3"

def main()->None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--kana-source",type=Path,required=True)
    ap.add_argument("--audio-dir",type=Path,required=True)
    args=ap.parse_args()
    rows=SEED_RE.findall(args.kana_source.read_text(encoding="utf-8"))
    manifest=json.loads((args.audio_dir/"manifest.json").read_text(encoding="utf-8"))
    profile=manifest["profiles"]["kana"]
    human=manifest.get("kanaHumanAudio",{})
    items=human.get("items",{})
    voice=manifest.get("voices",{}).get("kana")
    rate=float(manifest.get("rates",{}).get("kana",0))
    failures=[]
    human_count=0
    yoon_count=0

    for hira,kata,romaji,group in rows:
        hira=norm(hira); kata=norm(kata)
        if profile.get(hira)!=profile.get(kata):
            failures.append(f"{hira}/{kata}: aliases do not share one audio asset")
            continue
        actual=Path(profile.get(hira,"")).name
        if group!="yoon":
            human_count+=1
            meta=items.get(hira)
            expected=expected_human_filename(hira,romaji)
            if not meta:
                failures.append(f"{hira}: missing human provenance")
            elif meta.get("filename")!=expected or meta.get("license")!="Public domain":
                failures.append(f"{hira}: wrong human provenance {meta!r}, expected {expected}")
            if meta:
                if meta.get("mirrorRepo")!=MIRROR_REPO:
                    failures.append(f"{hira}: wrong mirror repo {meta.get('mirrorRepo')!r}")
                if meta.get("mirrorCommit")!=MIRROR_COMMIT:
                    failures.append(f"{hira}: wrong mirror commit {meta.get('mirrorCommit')!r}")
            # Human asset identity is tied to the exact audited mirror commit
            # and original Wikimedia filename.
            expected_asset=expected_human_asset(hira,romaji,expected)
            if actual!=expected_asset:
                failures.append(f"{hira}: {actual} != expected human asset {expected_asset}")
        else:
            yoon_count+=1
            expected_asset=expected_tts_asset(hira,voice,rate)
            if actual!=expected_asset:
                failures.append(f"{hira}: {actual} != explicit-yomigana TTS asset {expected_asset}")

        path=args.audio_dir/actual
        if not path.exists():
            failures.append(f"{hira}: missing resolved file {actual}")

    if human_count!=71:
        failures.append(f"human canonical count {human_count}, expected 71")
    if yoon_count!=33:
        failures.append(f"yoon canonical count {yoon_count}, expected 33")
    if len(profile)!=208:
        failures.append(f"alias count {len(profile)}, expected 208")

    print("HUMAN_CANONICAL",human_count)
    print("EXPLICIT_YOMIGANA_CANONICAL",yoon_count)
    print("ALIASES",len(profile))
    print("PROVENANCE_FAILURES",len(failures))
    if failures:
        for failure in failures:
            print(" -",failure)
        raise SystemExit(1)
    print("KANA_PROVENANCE_AUDIT_OK")

if __name__=="__main__":
    main()
