# Vocabulary data attribution

Kotoba Lab's JLPT vocabulary packs are derived from the **Tomoshi Dictionary Open Data Layer**, release **2026-09-02**.

The reused data includes:

- **JMdict** entries, forms, readings, and related metadata — © Electronic Dictionary Research and Development Group (EDRDG), used under **CC BY-SA 4.0**.
- **Tomoshi Traditional Chinese glosses** (`zh_defs_zhtw`) — derived from JMdict and published by Tomoshi / Y1Z under **CC BY-SA 4.0**.
- **JLPT level estimates** (`vocab_jlpt`) — derived from Jonathan Waller's JLPT Resources lineage. These N5–N1 labels are community estimates; the current JLPT does not publish an official exhaustive vocabulary list.

Kotoba Lab transforms the upstream SQLite data into compact per-level JSON packs, selects a preferred expression/reading for study cards, limits displayed Traditional Chinese glosses for readability, and orders entries using the upstream JMdict-priority-derived frequency rank when available.

Upstream sources:

- Tomoshi Open Data: https://github.com/tomoshi-app/tomoshi-dict-data
- EDRDG / JMdict: https://www.edrdg.org/
- EDRDG license: https://www.edrdg.org/edrdg/licence.html
- Jonathan Waller JLPT resources: https://www.tanos.co.uk/jlpt/

The derived vocabulary packs in this directory are distributed under **CC BY-SA 4.0**. Attribution and ShareAlike requirements apply.
