# `docs/archive/` — Frozen snapshots (legacy)

This directory holds **frozen snapshots** of historical working documents from the pre-v1.0 era when `TODO.md` was tracked publicly.

The current live working file is `TODO.local.md` (private, gitignored, per the global `*.local.md` convention). Anything in `docs/archive/` is **historical context only** — do not treat it as a source of truth for current project state.

## Status: closed for new entries

As of 2026-05-05, this directory is **closed for new archives**. The migration of `TODO.md` → `TODO.local.md` (private working memory) means future TODO compactions stay in local memory, not in `docs/archive/`. Archiving private working memory to a public directory would leak context that was never meant to be published.

The existing archived snapshots are preserved as-is for the project's historical audit trail. They captured a state of affairs that was already public at the time.

## What lives here (legacy)

| File pattern | Source | Trigger |
|--------------|--------|---------|
| `TODO-YYYY-QN.md` | (legacy, public) `TODO.md` | When the live TODO grew past ~40 lines and got compacted. |

## Forward policy

- **Public roadmap surface**: [`ROADMAP.md`](../../ROADMAP.md) at repo root — strategic framing, priorities, explicit non-goals.
- **Public actionable surface**: GitHub Issues (`gh issue list`).
- **Private working memory**: `TODO.local.md` (gitignored). Compactions stay private — write to the auto-memory directory if a snapshot is ever useful.

If a future structural shift makes some old `TODO.local.md` content publishable, lift it into a new ADR (`docs/adr/`) or into `ROADMAP.md`, but do not re-open this archive for private content.
