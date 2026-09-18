#!/usr/bin/env python3
"""Import public-domain native-speaker kana recordings from Wikimedia Commons.

Hakatanoshio117117 released this coherent hiragana recording set into the public
domain. We use it for all non-yoon kana (71 canonical morae), trim leading/trailing
silence, normalize loudness, and map both hiragana and katakana aliases to the
same mastered MP3. Yoon remains generated through explicit yomigana SSML.

Source category:
https://commons.wikimedia.org/wiki/Category:Audio_files_of_hiragana_(set_by_Hakatanoshio117117)
"""

from __future__ import annotations
import argparse, hashlib, json, re, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

SEED_RE=re.compile(r"\['([^']+)','([^']+)','([^']+)','[^']+','(gojuon|dakuten|handakuten|yoon)'\]")

SPECIAL={
    "あ":"Ja-A.oga","い":"Japanese I.ogg","う":"Japanese U.ogg","え":"Ja-E.oga","お":"Japanese O.ogg",
    "か":"Ja-Ka.oga","そ":"Ja-So.oga","ん":"Japanese N.ogg",
    "ち":"Japanese ti.ogg","ふ":"Japanese hu.ogg",
    "じ":"Japanese zi.ogg","ぢ":"Japanese di.ogg","づ":"Japanese du.ogg",
}

def commons_url(filename:str)->str:
    digest=hashlib.md5(filename.replace(" ","_").encode("utf-8")).hexdigest()
    # MediaWiki storage hashes the canonical DB key with underscores.
    encoded=urllib.parse.quote(filename.replace(" ","_"))
    return f"https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/{encoded}"

def source_filename(hira:str,romaji:str)->str:
    return SPECIAL.get(hira,f"Japanese {romaji}.ogg")

def master(src:Path,dst:Path)->None:
    # Trim broad silence, retain a small 70ms pad, normalize peak safely, and
    # encode as mono 44.1kHz MP3. The original human pronunciation is untouched.
    subprocess.run([
        "ffmpeg","-y","-v","error","-i",str(src),
        "-af",
        "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-45dB:"
        "stop_periods=1:stop_duration=0.08:stop_threshold=-45dB,"
        "apad=pad_dur=0.07,alimiter=limit=0.89",
        "-ac","1","-ar","44100","-codec:a","libmp3lame","-q:a","3",str(dst)
    ],check=True)

def main()->None:
    ap=argparse.ArgumentParser()
    ap.add_argument("--kana-source",type=Path,required=True)
    ap.add_argument("--audio-dir",type=Path,required=True)
    args=ap.parse_args()
    rows=SEED_RE.findall(args.kana_source.read_text(encoding="utf-8"))
    manifest_path=args.audio_dir/"manifest.json"
    manifest=json.loads(manifest_path.read_text(encoding="utf-8"))
    imported=0
    sources={}
    args.audio_dir.mkdir(parents=True,exist_ok=True)
    for hira,kata,romaji,group in rows:
        if group=="yoon":
            continue
        filename=source_filename(hira,romaji)
        url=commons_url(filename)
        identity=f"commons-pd\0{filename}\0trim-v1"
        out_name=hashlib.sha256(identity.encode()).hexdigest()[:24]+".mp3"
        out=args.audio_dir/out_name
        if not out.exists():
            with tempfile.TemporaryDirectory() as td:
                raw=Path(td)/filename.replace(" ","_")
                request=urllib.request.Request(
                    url,
                    headers={
                        "User-Agent":"Kotoba-Lab/1.0 (educational kana importer; contact via GitHub JohnSu0713/kotoba-lab)",
                        "Accept":"audio/ogg,application/ogg;q=0.9,*/*;q=0.1",
                    },
                )
                last_error=None
                for attempt in range(6):
                    try:
                        if imported:
                            time.sleep(2.2)
                        with urllib.request.urlopen(request,timeout=30) as response:
                            raw.write_bytes(response.read())
                        last_error=None
                        break
                    except urllib.error.HTTPError as exc:
                        last_error=exc
                        if exc.code!=429 or attempt==5:
                            break
                        retry_after=exc.headers.get("Retry-After")
                        wait=float(retry_after) if retry_after and retry_after.isdigit() else min(8*(attempt+1),40)
                        print(f"{hira}: Wikimedia rate limit; retrying in {wait:.0f}s")
                        time.sleep(wait)
                    except Exception as exc:
                        last_error=exc
                        if attempt==5:
                            break
                        time.sleep(min(3*(attempt+1),15))
                if last_error is not None:
                    raise RuntimeError(f"{hira}: failed {filename} {url}: {last_error}") from last_error
                master(raw,out)
        asset=f"./audio/ja/{out_name}"
        manifest["profiles"]["kana"][hira]=asset
        manifest["profiles"]["kana"][kata]=asset
        sources[hira]={"filename":filename,"url":url,"license":"Public domain","author":"Hakatanoshio117117"}
        imported+=1
    manifest["kanaHumanAudio"]={
        "count":imported,
        "source":"Wikimedia Commons",
        "license":"Public domain",
        "author":"Hakatanoshio117117",
        "items":sources,
    }
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")

    referenced={
        Path(url).name
        for profile in manifest.get("profiles",{}).values()
        for url in profile.values()
    }
    removed=0
    for path in args.audio_dir.glob("*.mp3"):
        if path.name not in referenced:
            path.unlink()
            removed+=1

    print("HUMAN_KANA_IMPORTED",imported)
    print("ORPHAN_AUDIO_REMOVED",removed)
    if imported!=71:
        raise SystemExit(f"expected 71 human kana, imported {imported}")

if __name__=="__main__":
    main()
