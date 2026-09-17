#!/usr/bin/env python3
"""Build compact Kotoba Lab JLPT vocabulary packs from open source data.

Primary dictionary source:
- Tomoshi Open Data (JMdict-derived Japanese forms/POS + Traditional Chinese glosses)
- Jonathan Waller lineage for community JLPT level estimates

Optional example enrichment:
- japanese-language-data common-word dataset, whose JMdict editor-selected examples
  are sourced from Tatoeba
- Tatoeba Japanese→Mandarin links for a Traditional Chinese example translation
  when one is available. English remains a fallback.

The JLPT levels are community estimates, not official Japan Foundation word lists.
"""

from __future__ import annotations

import argparse
import bz2
import json
import sqlite3
from pathlib import Path
from typing import Any

LEVELS = ("N5", "N4", "N3", "N2", "N1")
LEVEL_BASE = {"N5": 20_000, "N4": 40_000, "N3": 60_000, "N2": 80_000, "N1": 100_000}
SOURCE_VERSION = "2026-09-02"


def priority_score(form: dict[str, Any]) -> tuple[int, str]:
    priority = form.get("priority") or []
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
    return sorted(compatible or kana, key=priority_score)[0]["text"]


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
    if not values:
        for sense in entry.get("senses", []):
            for gloss in sense.get("glosses", []):
                if gloss.get("lang") not in {"zho", "chi"}:
                    continue
                text = str(gloss.get("text") or "").strip()
                if text and text not in values:
                    values.append(text)
    return values[:6]


def entry_metadata(entry: dict[str, Any]) -> tuple[list[str], list[str]]:
    pos: list[str] = []
    fields: list[str] = []
    for sense in entry.get("senses", []):
        for value in sense.get("pos", []):
            text = str(value).strip()
            if text and text not in pos:
                pos.append(text)
        for value in sense.get("field", []):
            text = str(value).strip()
            if text and text not in fields:
                fields.append(text)
    return pos[:8], fields[:5]


def open_text(path: Path):
    return bz2.open(path, "rt", encoding="utf-8") if path.suffix == ".bz2" else path.open("r", encoding="utf-8")


def load_mandarin_examples(sentences_path: Path | None, links_path: Path | None) -> tuple[dict[str, str], dict[str, list[str]]]:
    if not sentences_path or not links_path or not sentences_path.exists() or not links_path.exists():
        return {}, {}
    cmn: dict[str, str] = {}
    with open_text(sentences_path) as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t", 2)
            if len(parts) == 3:
                cmn[parts[0]] = parts[2]
    links: dict[str, list[str]] = {}
    with open_text(links_path) as handle:
        for line in handle:
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                links.setdefault(parts[0], []).append(parts[1])
    return cmn, links


def to_traditional(value: str) -> str:
    try:
        from opencc import OpenCC  # type: ignore
        converter = OpenCC("s2twp")
        return converter.convert(value)
    except Exception:
        return value


def load_curated_examples(words_path: Path | None, cmn_sentences: Path | None, cmn_links: Path | None) -> dict[str, list[dict[str, str]]]:
    if not words_path or not words_path.exists():
        return {}
    chinese, links = load_mandarin_examples(cmn_sentences, cmn_links)
    payload = json.loads(words_path.read_text(encoding="utf-8"))
    words = payload.get("words", []) if isinstance(payload, dict) else []
    result: dict[str, list[dict[str, str]]] = {}
    for word in words:
        entry_id = str(word.get("id") or "")
        if not entry_id:
            continue
        seen: set[str] = set()
        examples: list[dict[str, str]] = []
        for sense in word.get("sense", []):
            for example in sense.get("examples", []):
                ja = str(example.get("japanese") or "").strip()
                if not ja or ja in seen:
                    continue
                seen.add(ja)
                sentence_id = str(example.get("sentence_id") or "")
                numeric_id = sentence_id.removeprefix("tatoeba-")
                record: dict[str, str] = {"ja": ja, "source": "tatoeba"}
                if numeric_id:
                    record["sourceId"] = numeric_id
                    for translated_id in links.get(numeric_id, []):
                        if translated_id in chinese:
                            record["zhTw"] = to_traditional(chinese[translated_id])
                            break
                english = str(example.get("english") or "").strip()
                if english:
                    record["en"] = english
                examples.append(record)
                if len(examples) >= 2:
                    break
            if len(examples) >= 2:
                break
        if examples:
            result[entry_id] = examples
    return result


def build(
    db_path: Path,
    output_dir: Path,
    examples_path: Path | None = None,
    cmn_sentences: Path | None = None,
    cmn_links: Path | None = None,
) -> None:
    curated_examples = load_curated_examples(examples_path, cmn_sentences, cmn_links)
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
        pos, fields = entry_metadata(entry)
        rank = row["frequency_rank"]
        entry_id = str(row["entry_id"])
        tags = ["jlpt", "community-estimate", f"source:{row['source']}"]
        if row["is_common"]:
            tags.append("common")
        by_level[level].append({
            "entryId": entry_id,
            "expression": expression,
            "reading": reading,
            "meaningsZhTw": meanings,
            "jlpt": level,
            "tags": tags,
            "partsOfSpeech": pos,
            "fields": fields,
            "common": bool(row["is_common"]),
            "examples": curated_examples.get(entry_id, []),
            "frequencyRank": int(rank) if rank is not None else None,
        })

    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, Any] = {
        "schemaVersion": 2,
        "sourceVersion": SOURCE_VERSION,
        "source": "Tomoshi Open Data / JMdict (EDRDG) / Jonathan Waller JLPT estimates",
        "exampleSource": "JMdict editor-selected Tatoeba examples via japanese-language-data; Mandarin translations via Tatoeba when available",
        "license": "Mixed: CC BY-SA 4.0 (dictionary layer) + Tatoeba CC BY 2.0 FR (example sentences)",
        "jlptNotice": "N5-N1 vocabulary labels are community estimates; the JLPT does not publish an official vocabulary list.",
        "levels": {},
    }

    for level in LEVELS:
        records = by_level[level]
        records.sort(key=lambda item: (item["frequencyRank"] is None, item["frequencyRank"] or 10**9, item["entryId"]))
        items = []
        for index, record in enumerate(records):
            items.append({
                "id": f"vocab:tomoshi:{record['entryId']}",
                "kind": "vocabulary",
                "expression": record["expression"],
                "reading": record["reading"],
                "meaningsZhTw": record["meaningsZhTw"],
                "jlpt": level,
                "tags": record["tags"],
                "partsOfSpeech": record["partsOfSpeech"],
                "fields": record["fields"],
                "common": record["common"],
                "examples": record["examples"],
                "order": LEVEL_BASE[level] + index,
                "frequencyRank": record["frequencyRank"],
                "sourceEntryId": record["entryId"],
                "jlptConfidence": "community-estimate",
            })

        slug = level.lower()
        pack = {
            "id": f"jlpt-{slug}-zh-tw-tomoshi-{SOURCE_VERSION}",
            "title": f"JLPT {level} 繁中詞彙",
            "description": f"{len(items):,} 個 {level} 詞彙；含詞性與可用的篩選例句。JLPT 分級為社群估計。",
            "version": SOURCE_VERSION,
            "sourceLabel": "Tomoshi Open Data; JMdict © EDRDG; JLPT estimates from Jonathan Waller lineage; examples from Tatoeba via japanese-language-data",
            "licenseLabel": "Mixed open data licenses — see THIRD_PARTY_NOTICES.md",
            "items": items,
        }
        path = output_dir / f"{slug}.json"
        path.write_text(json.dumps(pack, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        example_count = sum(1 for item in items if item["examples"])
        manifest["levels"][level] = {"path": f"./data/vocab/{slug}.json", "count": len(items), "withExamples": example_count}
        print(f"{level}: {len(items):,} items, {example_count:,} with examples -> {path} ({path.stat().st_size / 1024:.1f} KiB)")

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"total: {sum(value['count'] for value in manifest['levels'].values()):,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("public/data/vocab"))
    parser.add_argument("--examples", type=Path)
    parser.add_argument("--cmn-sentences", type=Path)
    parser.add_argument("--cmn-links", type=Path)
    args = parser.parse_args()
    build(args.db, args.output, args.examples, args.cmn_sentences, args.cmn_links)
