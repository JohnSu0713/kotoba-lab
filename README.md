# Kotoba Lab

A calm, local-first Japanese learning PWA for Traditional Chinese learners.

## Product principles

- **Pure daily loop:** due reviews → a small amount of new content → done.
- **Multiple memory paths:** visual recognition, active recall, listening, script transfer, vocabulary flashcards.
- **Traditional Chinese first:** UI and learning explanations target zh-Hant learners.
- **Local-first:** no account or backend required for v0.x.
- **Modular:** content packs, study modes, scheduler, storage, and UI are replaceable modules.
- **Responsive & accessible:** designed for iPhone first, scales to tablet/desktop, supports light/dark/system appearance.

## Included in v0.2

- Hiragana + katakana: gojuon, dakuten, handakuten, yoon.
- Kana recognition, active recall, listening choice, and hiragana↔katakana transfer.
- Small demo N5 vocabulary pack with four study modes.
- Local IndexedDB progress, JSON backup/import.
- Adaptive SRS behind a `Scheduler` interface (FSRS adapter is planned).
- Installable PWA + offline cache.
- Appearance: system / light / dark, with a flash-free initial theme.
- Responsive mobile/desktop shell and dedicated kana reference view.

## Run locally

```bash
npm install
npm run build
npm run serve
```

Open `http://localhost:4173`.

If TypeScript is already installed globally, `tsc -p tsconfig.json` is enough to compile.

## Repository layout

```text
src/
  app/                 composition root
  core/
    contracts/         stable interfaces
    registry/          content + study-mode registries
    scheduler/         scheduling implementation
    storage/           persistence adapters
  domain/              durable model types
  features/
    kana/               kana content + study modes
    vocabulary/         vocabulary content + study modes
    study/              generic session engine
    backup/             backup feature
  ui/
    components/         presentational primitives/icons
    theme/              appearance controller
    views/              route-level views
    shell.ts            app navigation shell
public/
  index.html
  styles.css
  manifest.webmanifest
  sw.js
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for extension contracts.
