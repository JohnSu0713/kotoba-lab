#!/usr/bin/env python3
import json, re, requests, sys
from pathlib import Path

SEED_RE=re.compile(r"\['([^']+)','([^']+)','([^']+)','[^']+','(?:gojuon|dakuten|handakuten|yoon)'\]")
source=Path("src/features/kana/data.ts").read_text(encoding="utf-8")
rows=SEED_RE.findall(source)
if len(rows)!=104:
    raise SystemExit(f"expected 104 rows, got {len(rows)}")

session=requests.Session()
session.headers["User-Agent"]="Kotoba-Lab/1.0 (kana audio audit)"
found=[]
missing=[]
for hira,kata,romaji in rows:
    candidates=[
        f"File:Japanese {romaji}.ogg",
        f"File:Japanese_{romaji}.ogg",
        f"File:Ja-{romaji}.ogg",
        f"File:Ja {romaji}.ogg",
    ]
    hit=None
    for title in candidates:
        data=session.get("https://commons.wikimedia.org/w/api.php",params={
            "action":"query","format":"json","titles":title,
            "prop":"imageinfo","iiprop":"url|extmetadata",
            "iiurlwidth":"0",
        },timeout=15).json()
        page=next(iter(data.get("query",{}).get("pages",{}).values()),{})
        if "missing" in page:
            continue
        info=(page.get("imageinfo") or [{}])[0]
        if info.get("url"):
            hit={"kana":hira,"romaji":romaji,"title":title,"url":info["url"],
                 "license":(info.get("extmetadata",{}).get("LicenseShortName",{}) or {}).get("value")}
            break
    if hit: found.append(hit)
    else: missing.append({"kana":hira,"romaji":romaji})

print("FOUND",len(found))
print("MISSING",len(missing))
print(json.dumps(missing,ensure_ascii=False))
Path("/tmp/commons-kana.json").write_text(json.dumps({"found":found,"missing":missing},ensure_ascii=False,indent=2),encoding="utf-8")
if len(found)<80:
    sys.exit(1)
