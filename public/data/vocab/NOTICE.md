# Vocabulary data attribution

Kotoba Lab's JLPT vocabulary packs use a dictionary layer derived from the **Tomoshi Dictionary Open Data Layer**, release **2026-09-02**, and an optional example-sentence layer sourced from Tatoeba.

The reused data includes:

- **JMdict** entries, forms, readings, parts of speech, and related metadata — © Electronic Dictionary Research and Development Group (EDRDG), used under **CC BY-SA 4.0**.
- **Tomoshi Traditional Chinese glosses** (`zh_defs_zhtw`) — derived from JMdict and published by Tomoshi / Y1Z under **CC BY-SA 4.0**.
- **JLPT level estimates** (`vocab_jlpt`) — derived from Jonathan Waller's JLPT Resources lineage. These N5–N1 labels are community estimates; the current JLPT does not publish an official exhaustive vocabulary list.
- **Example sentences** — JMdict editor-selected examples sourced from **Tatoeba** and linked through the `japanese-language-data` aggregation. Tatoeba textual exports are distributed under **CC BY 2.0 FR**, with some individual source material additionally available under more permissive terms.
- **Mandarin example translations** — linked through Tatoeba sentence relations and converted to Traditional Chinese/Taiwan-oriented text for display when available. Otherwise the linked English translation may be retained as a fallback.

Kotoba Lab transforms the upstream data into compact per-level JSON packs, selects a preferred expression/reading for study cards, limits displayed Traditional Chinese glosses for readability, preserves part-of-speech/common/frequency metadata, and stores Tatoeba sentence IDs when available for example provenance.

Upstream sources:

- Tomoshi Open Data: https://github.com/tomoshi-app/tomoshi-dict-data
- EDRDG / JMdict: https://www.edrdg.org/
- EDRDG license: https://www.edrdg.org/edrdg/licence.html
- Jonathan Waller JLPT resources: https://www.tanos.co.uk/jlpt/
- Tatoeba: https://tatoeba.org/
- Tatoeba downloads: https://tatoeba.org/en/downloads
- japanese-language-data: https://github.com/jkindrix/japanese-language-data

Because the generated packs now combine multiple open-data layers, do not treat this directory as single-license data. See the repository root [`THIRD_PARTY_NOTICES.md`](../../../THIRD_PARTY_NOTICES.md) for the applicable attribution and license notes.
