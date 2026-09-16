# Vocabulary content packs

The current app registers content in TypeScript, but production-sized vocabulary should be generated from versioned JSON packs.

Recommended shape:

```json
{
  "schemaVersion": 1,
  "pack": {
    "id": "jlpt-n5-zh-tw-v1",
    "title": "JLPT N5 Traditional Chinese",
    "version": "1.0.0",
    "sourceLabel": "Describe methodology/source",
    "licenseLabel": "State the license explicitly"
  },
  "items": [
    {
      "id": "vocab:n5:example",
      "kind": "vocabulary",
      "expression": "食べる",
      "reading": "たべる",
      "meaningsZhTw": ["吃"],
      "jlpt": "N5",
      "tags": ["core"],
      "frequencyRank": 1234,
      "jlptConfidence": "high",
      "examples": [{ "ja": "朝ご飯を食べます。", "zhTw": "吃早餐。" }]
    }
  ]
}
```

Before importing a large third-party corpus, verify the license. Word forms themselves are facts, but translations, example sentences, selection, and editorial arrangement can carry copyright or licensing restrictions.
