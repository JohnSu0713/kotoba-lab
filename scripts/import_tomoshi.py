#!/usr/bin/env python3
"""Build compact Kotoba Lab JLPT vocabulary packs from Tomoshi Open Data.

Input: decompressed Tomoshi SQLite database.
Output: public/data/vocab/{n5,n4,n3,n2,n1}.json + manifest.json

The JLPT levels are community estimates (Jonathan Waller lineage), not official
Japan Foundation vocabulary lists. Japanese forms/readings come from JMdict;
Traditional Chinese glosses come from Tomoshi's zh_defs_zhtw layer.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any

LEVELS = ("N5", "N4", "N3", "N2", "N1")
LEVEL_BASE = {"N5": 20_000, "N4": 40_000, "N3": 60_000, "N2": 80_000, "N1": 100_000}
SOURCE_VERSION = "2026-09-02"


def priority_score(form: dict[str, Any]) -> tuple[int, str]:
    priority = form.get("priority") or []
    # JMdict priority codes: ichi1/news1/spec1/gai1 and nfXX are stronger hints.
    score = 0
    for marker in priority:
        if marker in {"ichi1", "news1", "spec1", "gai1"}:
            score += 100
        elif marker in {"ichi2", "news2", "spec2", "gai2"}:
            score += 50
        elif isinstance(marker, str) and marker.startswith("nf"):
            try:
                score += max(0, 50 - int(marker[2:]))
            except ValueError:
                score += 1
    return (-score, str(form.get("text") or ""))


def choose_expression(entry: dict[str, Any]) -> str:
    kanji = [item for item in entry.get("kanji", []) if item.get("text")]
    kana = [item for item in entry.get("kana", []) if item.get("text")]
    if kanji:
        return sorted(kanji, key=priority_score)[0]["text"]
    if kana:
        return sorted(kana, key=priority_score)[0]["text"]
    return ""


def choose_reading(entry: dict[str, Any], expression: str) -> str:
    kana = [item for item in entry.get("kana", []) if item.get("text")]
    if not kana:
        return expression
    compatible = []
    for item in kana:
        restricted = item.get("restricted_to") or []
        if not restricted or expression in restricted:
            compatible.append(item)
    candidates = compatible or kana
    return sorted(candidates, key=priority_score)[0]["text"]


def zh_tw_meanings(raw: str | None, entry: dict[str, Any]) -> list[str]:
    values: list[str] = []
    if raw:
        try:
            payload = json.loads(raw)
            senses = payload.get("senses") or {}
            for key in sorted(senses, key=lambda value: int(value) if str(value).isdigit() else 10_000):
                for gloss in (senses.get(key) or {}).get("glosses", []):
                    text = str(gloss.get("text") or "").strip()
                    if text and text not in values:
                        values.append(text)
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    # Defensive fallback: Tomoshi's entry payload also carries Chinese glosses.
    if not values:
        for sense in entry.get("senses", []):
            for gloss in sense.get("glosses", []):
                if gloss.get("lang") not in {"zho", "chi"}:
                    continue
                text = str(gloss.get("text") or "").strip()
                if text and text not in values:
                    values.append(text)

    # Keep cards concise. The source entry id is retained so future dictionary
    # detail views can recover the full sense set from an upstream refresh.
    return values[:6]


def build(db_path: Path, output_dir: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    query = """
      SELECT v.entry_id, v.level, v.source, e.is_common, e.data AS entry_data,
             z.data AS zh_tw_data, f.rank AS frequency_rank
      FROM vocab_jlpt AS v
      JOIN entries AS e ON e.id = v.entry_id
      LEFT JOIN zh_defs_zhtw AS z ON z.entry_id = v.entry_id AND z.locale = 'zh-TW'
      LEFT JOIN freq_rank AS f ON f.entry_id = v.entry_id
      WHERE v.level IN ('N5', 'N4', 'N3', 'N2', 'N1')
    """
    rows = conn.execute(query).fetchall()
    by_level: dict[str, list[dict[str, Any]]] = {level: [] for level in LEVELS}

    for row in rows:
        level = str(row["level"])
        if level not in by_level:
            continue
        entry = json.loads(row["entry_data"])
        expression = choose_expression(entry)
        reading = choose_reading(entry, expression)
        meanings = zh_tw_meanings(row["zh_tw_data"], entry)
        if not expression or not reading or not meanings:
            continue
        rank = row["frequency_rank"]
        tags = ["jlpt", "community-estimate", f"source:{row['source']}"]
        if row["is_common"]:
            tags.append("common")
        by_level[level].append(
            {
                "entryId": str(row["entry_id"]),
                "expression": expression,
                "reading": reading,
                "meaningsZhTw": meanings,
                "jlpt": level,
                "tags": tags,
                "frequencyRank": int(rank) if rank is not None else None,
            }
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "schemaVersion": 1,
        "sourceVersion": SOURCE_VERSION,
        "source": "Tomoshi Open Data / JMdict (EDRDG) / Jonathan Waller JLPT estimates",
        "license": "CC BY-SA 4.0",
        "jlptNotice": "N5-N1 vocabulary labels are community estimates; the JLPT does not publish an official vocabulary list.",
        "levels": {},
    }

    for level in LEVELS:
        records = by_level[level]
        records.sort(key=lambda item: (item["frequencyRank"] is None, item["frequencyRank"] or 10**9, item["entryId"]))
        items = []
        for index, record in enumerate(records):
            items.append(
                {
                    "id": f"vocab:tomoshi:{record['entryId']}",
                    "kind": "vocabulary",
                    "expression": record["expression"],
                    "reading": record["reading"],
                    "meaningsZhTw": record["meaningsZhTw"],
                    "jlpt": level,
                    "tags": record["tags"],
                    "examples": [],
                    "order": LEVEL_BASE[level] + index,
                    "frequencyRank": record["frequencyRank"],
                    "sourceEntryId": record["entryId"],
                    "jlptConfidence": "community-estimate",
                }
            )

        slug = level.lower()
        pack = {
            "id": f"jlpt-{slug}-zh-tw-tomoshi-{SOURCE_VERSION}",
            "title": f"JLPT {level} 繁中詞彙",
            "description": f"{len(items):,} 個 {level} 詞彙；依 JMdict priority 衍生頻率優先排序。JLPT 分級為社群估計。",
            "version": SOURCE_VERSION,
            "sourceLabel": "Tomoshi Open Data; JMdict © EDRDG; JLPT level estimates from Jonathan Waller lineage",
            "licenseLabel": "CC BY-SA 4.0 — attribution and ShareAlike required",
            "items": items,
        }
        path = output_dir / f"{slug}.json"
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        manifest["levels"][level] = {"path": f"./data/vocab/{slug}.json", "count": len(items)}
        print(f"{level}: {len(items):,} items -> {path} ({path.stat().st_size / 1024:.1f} KiB)")

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"total: {sum(value['count'] for value in manifest['levels'].values()):,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/data/vocab"))
    args = parser.parse_args()
    build(args.db, args.output)
