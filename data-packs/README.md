# Vocabulary content packs

Kotoba Lab keeps production vocabulary outside the TypeScript bundle as versioned JSON packs under `public/data/vocab/`.

## Current production corpus

The current JLPT N5→N1 corpus is generated from **Tomoshi Open Data 2026-09-02** with `scripts/import_tomoshi.py`.

- Japanese entries, forms, readings, and priority metadata: **JMdict / EDRDG**
- Traditional Chinese gloss layer: **Tomoshi `zh_defs_zhtw`**
- JLPT N5–N1 level metadata: **Jonathan Waller lineage**, as distributed in Tomoshi's `vocab_jlpt` table
- License for the reused dictionary/gloss data: **CC BY-SA 4.0**
- JLPT note: the current JLPT does **not** publish an official exhaustive N5–N1 vocabulary list. These labels are community estimates and are represented as such in the app.

Generated counts for the 2026-09-02 snapshot:

| Level | Words |
|---|---:|
| N5 | 692 |
| N4 | 646 |
| N3 | 1,648 |
| N2 | 1,737 |
| N1 | 3,054 |
| **Total** | **7,777** |

The importer prefers common/high-priority JMdict forms, keeps a compatible kana reading, extracts concise Traditional Chinese glosses, retains the upstream entry id, and sorts each level by Tomoshi's JMdict-priority-derived frequency rank when available.

## Runtime shape

```json
{
  "id": "jlpt-n5-zh-tw-tomoshi-2026-09-02",
  "title": "JLPT N5 繁中詞彙",
  "version": "2026-09-02",
  "sourceLabel": "Tomoshi Open Data; JMdict © EDRDG; JLPT level estimates from Jonathan Waller lineage",
  "licenseLabel": "CC BY-SA 4.0 — attribution and ShareAlike required",
  "items": [
    {
      "id": "vocab:tomoshi:1358280",
      "kind": "vocabulary",
      "expression": "食べる",
      "reading": "たべる",
      "meaningsZhTw": ["吃"],
      "jlpt": "N5",
      "tags": ["jlpt", "community-estimate", "source:waller", "common"],
      "examples": [],
      "order": 20000,
      "frequencyRank": 123,
      "sourceEntryId": "1358280",
      "jlptConfidence": "community-estimate"
    }
  ]
}
```

Example sentences are intentionally not bulk-imported yet. They should come from a separately reviewed and clearly licensed pipeline rather than being attached blindly to dictionary entries.

See `public/data/vocab/NOTICE.md` for attribution details.
