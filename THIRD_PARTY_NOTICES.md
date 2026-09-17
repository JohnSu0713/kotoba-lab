# Third-party data notices

Kotoba Lab includes generated vocabulary packs built from open data. The generated files live under `public/data/vocab/` and preserve source/version information in `manifest.json`.

## JMdict / EDRDG

Japanese dictionary forms, readings, senses, and part-of-speech metadata are derived from **JMdict**, maintained by the Electronic Dictionary Research and Development Group (EDRDG).

- Source: https://www.edrdg.org/
- Licence: CC BY-SA 4.0
- Licence statement: https://www.edrdg.org/edrdg/licence.html

The app restructures and selects fields from the upstream dictionary data for study-card use.

## Tomoshi Open Data

Traditional Chinese definitions and the packaged JMdict-derived dictionary layer are sourced through **Tomoshi Dictionary — Open Data Layer**, by Y1Z.

- Source: https://github.com/tomoshi-app/tomoshi-dict-data
- Pinned source release: `v2026-09-02`
- Most reused tables: CC BY-SA 4.0

Kotoba Lab modifies this data by selecting JLPT-tagged entries, choosing one study form/reading, ordering entries for study, and emitting compact JSON packs.

## JLPT level estimates

N5–N1 vocabulary labels are community estimates from the Jonathan Waller / Tanos lineage exposed by the Tomoshi `vocab_jlpt` table. They are **not an official JLPT vocabulary list**. The modern JLPT does not publish a complete official N1–N5 vocabulary syllabus.

## Example sentences — Tatoeba

Where present, example sentences are JMdict-editor-linked examples sourced from **Tatoeba**. Mandarin translations are matched through Tatoeba sentence links and converted to Traditional Chinese for display when available; otherwise the linked English translation may be shown.

- Source: https://tatoeba.org/
- Textual data licence: CC BY 2.0 FR (with some sentences additionally/publicly available under other permissive terms)
- Downloads: https://tatoeba.org/en/downloads

Each generated example keeps its Tatoeba sentence ID when available so its provenance remains inspectable.

## japanese-language-data

The build pipeline uses the open `jkindrix/japanese-language-data` aggregation as a reproducible bridge to JMdict editor-selected Tatoeba example links.

- Source: https://github.com/jkindrix/japanese-language-data

Kotoba Lab treats the underlying JMdict and Tatoeba licences/attribution as authoritative for the content it reuses.

## Build-only tooling

`opencc-python-reimplemented` may be installed in the data-generation workflow to convert linked Mandarin translations to Traditional Chinese/Taiwan-oriented text. It is a build-time tool and is not bundled into the browser application.
