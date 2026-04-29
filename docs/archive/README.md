# `docs/archive/` — Frozen snapshots

This directory holds **frozen snapshots** of working documents (typically `TODO.md`) taken when those documents are compacted.

The current, live versions always live at the repository root or under `docs/`. Anything in `docs/archive/` is **historical context only** — do not treat it as a source of truth for current project state.

## What lives here

| File pattern | Source | Trigger |
|--------------|--------|---------|
| `TODO-YYYY-QN.md` | `TODO.md` | When the live TODO grows past ~40 lines and gets compacted, the verbose original is archived here. |

## Policy

- **Naming:** `<doc-name>-YYYY-QN.md` (e.g. `TODO-2025-Q4.md`). Use the calendar quarter in which the snapshot was taken.
- **Header:** every archive starts with a banner explaining when it was archived, why, and pointing back to the live document.
- **Status table:** the banner should include a per-item resolution table (`Done` / `Partial` / `Deferred` / `Moved`) so the snapshot stays useful for audit.
- **Read-only:** files here are never edited after archival. If something needs revision, edit the live document instead.
- **Frequency:** archive on demand, not on a fixed schedule. A good trigger is "the live TODO has drifted enough that it can't be honestly maintained at < 40 lines without losing context".

## Why keep snapshots in-tree

`git log --follow -p TODO.md` already preserves the history. Keeping a curated snapshot in-tree is additive: a single readable file with an explicit resolution table is faster to consult than reconstructing intent from a year of diffs. The cost is one Markdown file per major compaction — acceptable for the auditability it brings.

If this directory ever grows beyond a handful of files, prune the oldest entries to GitHub Releases attachments and keep only the most recent one or two snapshots in the repo.
