# TODO — Roadmap to v1.0.0

**Last updated:** 2026-04-29
**Current version:** v0.9.0

## v1.0 Backlog

### High priority
- [ ] 🔐 [Security] `SECURITY.md` (disclosure policy, supported versions) + automated `pnpm audit` job in CI — Priority: H
- [ ] 🧪 [Tests] E2E with real git temp repos for ≥3 critical workflows (populate → validate → release, hotfix, retry-publish) — Priority: H

### Medium priority
- [ ] 🔧 [Scripts] Phase 3.3 — `BaseScript` class + typed errors (`ValidationError`, `GitError`, `ChangelogError`) — Priority: M
- [ ] 🧪 [Tests] Add `bin/cli.js` to coverage instrumentation (`vitest.config.ts` include) — Priority: M
- [ ] 📖 [Docs] `docs/MIGRATION.md` — v0.x → v1.0 breaking changes guide — Priority: M

### Low priority
- [ ] 📖 [Docs] `docs/adr/` — record architectural decisions (peer dep, strict `extends`, DI pattern) — Priority: L

### Pre-release
- [ ] 🚀 [Release] v1.0.0-beta.1 → rc.1 → stable cycle once backlog above is clear — Priority: M (gated)

## Recently Done
- [x] ✅ [Scripts] Phase 3.1 — split `scripts/lib/` into focused modules (`git-utils`, `commit-parser`, `semver-utils`, `string-utils`)
- [x] ✅ [Scripts] Phase 3.2 — Dependency Injection via `GitDeps` / `PopulateChangelogDeps` interfaces
- [x] ✅ [Tests] CLI extends validation in `tests/integration/cli-modes.test.ts` (array + monorepo patterns)
- [x] ✅ [Docs] Monorepo workflow guide — `examples/monorepo-workflow.md` (`cf93c1c`)
- [x] ✅ [CLI] Passthrough mode + custom config support (`4520e18`)
- [x] ✅ [CLI] Config path validation with monorepo + security hardening (`647dc6d`)
- [x] ✅ [CLI] Strict `extends` field enforcement (`c3cb04f`)

## References
- Pre-v1.0 archive: [`docs/archive/TODO-2025-Q4.md`](docs/archive/TODO-2025-Q4.md) — full historical roadmap with effort estimates and design rationale.
- Deferred ideas (post-v1): [`BACKLOG_STUDY.md`](BACKLOG_STUDY.md) — plugin system, custom commit type mappings, telemetry, alt changelog formats, etc.
