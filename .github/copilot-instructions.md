# Copilot Project Instructions

These instructions orient AI coding agents contributing to `@oorabona/release-it-preset` (release-it presets + TypeScript utility scripts). Focus on environment‑driven configurability, Keep a Changelog + conventional commits alignment, and a lightweight compile‑on‑publish model.

## Core Model
- Deliver **configuration + helper scripts**, not an application. Consumers either call the provided CLI `release-it-preset <config|utility>` or `extends` the exported configs.
- All behavior is **environment variable first** – never hardcode repo names, branches, tokens, paths. Every new knob must expose an env var with sensible fallback.
- Package is pure ESM (`"type": "module"`). TS sources compile to `dist/scripts/*.js` via `pnpm build` (run automatically in `prepublishOnly`). CLI utility commands prefer compiled JS, falling back to `tsx` only if `dist` is missing (local dev convenience).

## Key Surfaces
- CLI wrapper: `bin/cli.js` maps release configs (`default|hotfix|changelog-only|manual-changelog|no-changelog|republish|retry-publish`) and utility commands (`init|update|validate|check`). Keep this file dependency‑light (Node core only). Adding a new config or utility requires updating both mapping objects and README/CLAUDE docs.
- Configs: `config/*.js` each export a plain object; differences are in: increment strategy, git operations toggled, hooks invoking TS scripts, and selective enabling of `github` / `npm`. Preserve: env lookups, provenance args `['--provenance','--access', <access>]` order, and safety warnings for dangerous flows (republish).
- Scripts (TypeScript → compiled JS): idempotent helpers for git log parsing, changelog mutation, validations, safety preflight. They must:
  - Read target files dynamically (respect `CHANGELOG_FILE`)
  - Parse conventional commits (see mapping in `populate-unreleased-changelog.ts` -> Added/Fixed/Changed; ignore ci/release/hotfix)
  - Exit with non‑zero codes on validation failure (CI friendliness)
  - Avoid assumptions about first tag (handle zero-tag repos gracefully)

## Release Philosophy
1. Local developer runs: changelog population (`update`), validation, then release config (usually `default`).
2. Tag push triggers GitHub Action `publish.yml` which ONLY publishes to npm with provenance (no GitHub release creation there). Separation: local = git+GitHub release; CI = npm publish.
3. Exceptional flows:
   - `hotfix` forces patch & auto-populates changelog pre-bump
   - `retry-publish` re-attempts npm/GitHub for existing tag (no git changes)
   - `republish` intentionally moves an existing tag (add / keep WARN banners & preflight)

## When Editing / Adding
- New env var? Update: README (env table section), `CLAUDE.md` (Env list), and maybe `check-config.ts` variable listing.
- New release config? Mirror existing style: minimal object, env lookups, optional `hooks` invoking existing scripts, export default.
- New script? Follow the Dependency Injection pattern: export a `*Deps` interface, a pure function that takes deps, and a guarded CLI entry (`if (import.meta.url === \`file://${process.argv[1]}\`) { ... }`) wiring the real `node:fs`/`node:child_process` deps. See `docs/testing.md` for the canonical shape. Use clear console icons (✅ / ❌ / ℹ️ / ⚠️) and `process.exit(1)` on validation failure.
- Changelog mutation logic must retain Keep a Changelog header structure and preserve unrelated historical entries.
- Keep CLI help text synchronized with actual command lists.

## Implementation Constraints
- No runtime dependencies. Avoid adding parsing libs—regex + Node APIs only. `release-it` is a peer dependency (consumers install it).
- Maintain Node >= 18 compatibility; avoid experimental APIs.
- Do not introduce circular imports; configs stay flat.
- Preserve export map structure in `package.json` when adding files (add new explicit export if exposing new config).

## Common Pitfalls (Avoid)
- Calling TS source paths (`scripts/*.ts`) inside release-it hooks (always use `node …/dist/scripts/*.js`).
- Forgetting to adjust both CLI mapping and README after adding a command/config.
- Changing commit type to section mapping without updating documentation.
- Writing scripts that assume GitHub (must still run in generic git repo; links optional).
- Mutating git state inside scripts that are intended read-only (e.g., validation/check scripts).

## Testing & Verification Shortcuts
- Dry-run a config: `pnpm release-it-preset default --dry-run` (verifies object shape).
- Validate changelog parser: craft multi-prefix commits; run `pnpm release-it-preset update`; inspect `[Unreleased]`.
- Confirm build artifacts: run `pnpm build` before testing hooks outside local dev.
- Preflight dangerous flows: `release-it-preset republish --dry-run`; ensure WARN banners print.

## Adding Safety Features
- Any destructive or exceptional action must print a ⚠️ banner before execution and ideally confirm (or rely on separate workflow confirmation input).
- Exit early with explicit message if preconditions not met (missing tag, empty `[Unreleased]`, auth failure).

## Style & Messaging
- Consistent emoji/iconography already in scripts—reuse existing set (✅, ❌, ℹ️, ⚠️, 🚀, 🛠️, 🔍, 🔁).
- Keep console output concise, action oriented, first line states intent.

## Quick Reference (File Roles)
- `bin/cli.js` – command router / spawn wrapper
- `config/*` – release-it presets (pure data)
- `scripts/*.ts` – source (not published)
- `dist/scripts/*.js` – published runtime scripts
- `dist/scripts/populate-unreleased-changelog.js` – commit → changelog section generator
- `dist/scripts/extract-changelog.js` – single version notes for releases
- `dist/scripts/validate-release.js` – CI/pass-fail gate
- `dist/scripts/check-config.js` – diagnostic inventory
- `dist/scripts/init-project.js` – bootstrap consumer repo
- `dist/scripts/republish-changelog.js` – move unreleased → version (republish) and refresh reference link definitions without duplicates
- `dist/scripts/check-pr-status.js` – evaluate PR hygiene (changelog updates, skip markers, conventional commits)
- `dist/scripts/retry-publish.js` – preflight for retry scenario

## If Unsure
Prefer mirroring an existing pattern (diff smallest similar file) and surface uncertainties in PR description so maintainers can confirm.

---
Questions or unclear conventions? Ask to refine these instructions before implementing large changes.
