# Changelog

## 0.10.0 — 2026-09-19

Integrated on top of `892099e`: retained the expanded verified lyric pool, durable lyric favorites, reduced-motion/focus styles, and the 80-entry runtime audio cache bound from the intervening releases. The earlier studio branch was not deployed over those changes.

### Learning
- Replaced the oversized home hero with a daily practice surface: goal, recent activity, level selector, daily word, and direct practice actions.
- Added the searchable word notebook with level filters, persistent favorites, examples, pronunciation, and single-word / saved-collection practice.
- Added 12 original grammar explanations and questions, four original reading passages, and six everyday speaking scenarios (19 phrases). Reading hints and translations can be hidden; speech can be slowed down.
- Added weak-card practice using existing lapse history and full distractor pools, plus a session recap.
- Added activity-based streaks, daily totals, and a 12-week history. Speaking completion is explicitly self-reported.

### Reliability and access
- Enforced daily new-card quotas across scheduled sessions, rather than restarting the quota for every session.
- Prevented concurrent submissions from saving or advancing more than one answer.
- Migrated IndexedDB to version 2 without replacing existing reviews; saved each review and its activity event in one transaction.
- Extended schema-1 JSON backups with optional activity and notebook data, preserved legacy imports, and validated before any destructive transaction.
- Fixed service-worker registration when asynchronous initialization finishes after the load event. Cache cleanup is scoped to Kotoba caches; first install and an active study session do not trigger a forced reload.
- Added keyboard shortcuts, correct focus after answers, active navigation labels, form labels, a skip link, reduced-motion support, and readable light/dark styles.
- Preserved original kana, lyric playback, speech fallback, and adaptive scheduler capabilities.

### Validation
- TypeScript production build and seven focused logic/backup/content tests passed.
- Chromium interaction regression passed: word search and persistence, flashcard grading, grammar checks, reading hints, speaking practice, goals, backup round-trip, invalid-import protection, keyboard continuation, offline reload, and legacy database migration.
- Checked nine primary mobile routes at 390px without horizontal overflow; visually inspected desktop/mobile/light/dark screenshots.

### Known boundaries for subsequent iterations
- Activity history begins with this version; review counters from earlier versions remain intact.
- Studio content is introductory and project-authored, not a complete JLPT syllabus. Reopening a one-question check permits another practice attempt.
- No automatic pronunciation evaluation, exact FSRS, or account sync is claimed.
- JSON learning backups exclude the existing separate lyric store and appearance settings; this is disclosed in Settings.
- Device speech quality and third-party music availability vary. This release does not change those providers or credentials.
- Good next improvements: learner-controlled redo of only the last session's misses; restore a partially completed session; broader original reading materials; further accessibility review of the pre-existing lyric controls. Check current main and open PRs before starting.
