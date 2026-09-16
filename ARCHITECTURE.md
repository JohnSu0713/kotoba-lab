# Kotoba Lab architecture

## Goal

Keep the daily UX extremely small while making the internals easy to extend. New content or learning methods should normally be added by registration, not by rewriting the study engine.

## Dependency direction

```text
UI / Features
     ↓
Core contracts + Domain models
     ↑
Infrastructure adapters
```

Feature modules may depend on stable contracts. Core contracts do not import UI or concrete storage.

## Main extension points

### `ContentPack`
A versioned bundle of learning material. Current packs include kana and the demo N5 vocabulary set. Future packs can add N4–N1, grammar, workplace Japanese, or user-imported content.

### `StudyMode`
Transforms a content item into one question type and grades the answer. Kana currently uses recognition, recall, listening, and script-pair modes. Vocabulary has flashcard, meaning choice, reading choice, and audio meaning.

### `Scheduler`
Owns review timing only. The UI and feature modules do not know the scheduling algorithm. `AdaptiveScheduler` is the v0.x implementation; an audited FSRS adapter can replace it without changing content or views.

### `AppRepository`
Owns persisted learning state. `IndexedDbRepository` is local-first. A future synchronized repository can compose IndexedDB with a remote adapter without changing feature code.

### Appearance
`AppearanceController` is deliberately separate from learning data. It stores a tiny local preference (`system | light | dark`) and resolves system changes at runtime. This prevents IndexedDB latency from causing a light/dark flash on launch.

## Session model

Review state is currently keyed by:

```text
<study-mode-id>::<content-item-id>
```

This means recognition, listening, and active recall can mature independently. A learner can visually recognize `あ` while still being weak at recalling or hearing it.

## Content integrity

Production vocabulary packs should include provenance and editorial metadata instead of treating a JLPT label as authoritative. Planned fields include frequency rank, source, editorial status, and JLPT-level confidence.

## UI principles

- Mobile-first responsive layout; desktop gets wider composition, not a different app.
- CSS design tokens define all colors/surfaces and power light/dark themes.
- Bottom navigation is intentionally small: Today, Kana, Stats, Settings.
- Content modules can grow without adding permanent top-level navigation.
- Respect safe areas and `prefers-reduced-motion`.

## Planned evolution

1. Exact FSRS implementation + deterministic tests.
2. Audited N5 vocabulary pack, then N4–N1 as independent content packs.
3. Mixed-session orchestration across multiple study modes.
4. Kana handwriting/stroke-order mode.
5. Optional remote sync adapter.
6. AI explanation as an on-demand auxiliary action, never the primary navigation.
