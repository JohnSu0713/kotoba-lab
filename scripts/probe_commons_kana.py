#!/usr/bin/env python3
import json, re, requests, sys, urllib.parse
from pathlib import Path

SEED_RE=re.compile(r"\['([^']+)','([^']+)','([^']+)','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]")
source=Path("src/features/kana/data.ts").read_text(encoding="utf-8")
rows=SEED_RE.findall(source)
if len(rows)!=104:
    raise SystemExit(f"expected 104 rows, got {len(rows)}")

session=requests.Session()
session.headers.update({
    "User-Agent":"Kotoba-Lab/1.0 kana-audio-audit (educational project)",
    "Accept":"audio/ogg,audio/*;q=0.9,*/*;q=0.1",
})
found=[]
missing=[]
for hira,kata,romaji in rows:
    candidates=[
        f"Japanese {romaji}.ogg",
        f"Japanese_{romaji}.ogg",
        f"Ja-{romaji}.ogg",
        f"Ja {romaji}.ogg",
    ]
    hit=None
    for filename in candidates:
        url="https://commons.wikimedia.org/wiki/Special:Redirect/file/"+urllib.parse.quote(filename)
        try:
            response=session.get(url,timeout=20,allow_redirects=True,stream=True)
            ctype=response.headers.get("content-type","").lower()
            if response.status_code==200 and ("audio" in ctype or response.url.lower().endswith(".ogg")):
                hit={"kana":hira,"romaji":romaji,"filename":filename,"url":response.url,"contentType":ctype}
                response.close()
                break
            response.close()
        except requests.RequestException:
            continue
    if hit: found.append(hit)
    else: missing.append({"kana":hira,"romaji":romaji})

print("FOUND",len(found))
print("MISSING",len(missing))
print("FOUND_ITEMS",json.dumps(found,ensure_ascii=False))
print("MISSING_ITEMS",json.dumps(missing,ensure_ascii=False))
Path("/tmp/commons-kana.json").write_text(
    json.dumps({"found":found,"missing":missing},ensure_ascii=False,indent=2),
    encoding="utf-8",
)
if len(found)<40:
    sys.exit(1)
