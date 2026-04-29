# TODO — Roadmap to v1.0.0

**Last updated:** 2026-04-29
**Current version:** v0.10.0

## v1.0 Backlog

### Medium priority
- [ ] 🧪 [Tests] Add `bin/cli.js` to coverage instrumentation (`vitest.config.ts` include) — Priority: M
- [ ] 📖 [Docs] `docs/MIGRATION.md` — v0.x → v1.0 breaking changes guide (start with `validate` exit-code change from `6483e5d`) — Priority: M
- [ ] 🌳 [Scripts] **Monorepo per-package CHANGELOG path scoping** — add opt-in `GIT_CHANGELOG_PATH` env var support to `scripts/populate-unreleased-changelog.ts`. When set, append ` -- ${path}` to the `git log` command (currently lines 224-226 in v0.9.0/v0.10.0 — verify line numbers on HEAD) so monorepo consumers can scope per-package CHANGELOG to commits touching their subdir. Read via existing `deps.getEnv()` DI pattern (mirrors `CHANGELOG_FILE`/`GITHUB_REPOSITORY`/`GIT_REMOTE` injection). Add unit test in `tests/unit/populate-unreleased-changelog.test.ts` mocking `getEnv('GIT_CHANGELOG_PATH')` and asserting the path appears in the `execSync` git log invocation. **Origin:** discovered via `node-liblzma#25` dogfooding — `packages/tar-xz/CHANGELOG.md` v6.1.0 captured node-liblzma C++/wasm commits (#111 wasm, #112 native), ~30 Dependabot lockfile refreshes, and repo-wide CI tweaks because `git log` runs without path filter regardless of consumer cwd. Path filter eliminates ~80% of cross-package pollution. Body-fragment parser issue (separate gap : multi-line commit bodies leak as `### Changed` entries) is out of scope — track separately if user requests. — Priority: M

### Low priority
- [ ] 📖 [Docs] `docs/adr/` — record architectural decisions (peer dep, strict `extends`, DI pattern) — Priority: L

### Bugs found in v0.10.0 release dogfooding
- [ ] 🐛 [Constants] Default `GIT_COMMIT_MESSAGE` is `release: bump v${version}` — not Conventional Commits compliant (`release` is not a recognized type). Change to `chore(release): v${version}` to play well with strict commit-msg hooks. — Priority: M

### Pre-release
- [ ] 🚀 [Release] v1.0.0-beta.1 → rc.1 → stable cycle once backlog above is clear — Priority: M (gated)

## Recently Done
- [x] ✅ [Release] **v0.10.0 shipped** — bundles all the items below (`c921579` tag `v0.10.0`)
- [x] ✅ [Scripts] Typed error hierarchy (`ScriptError`/`ValidationError`/`GitError`/`ChangelogError`) + `runScript()` wrapper, applied to all 8 main scripts. **Breaking:** `validate` now exits 2 on precondition failure (was 1) (`6483e5d`)
- [x] ✅ [Tests] E2E suite with real git temp repos — populate / validate / retry-publish-preflight (`467cca0`)
- [x] ✅ [Security] `SECURITY.md` policy + `audit.yml` workflow (`--prod` gate + advisory full-tree) + README badge (`7c9b16f`)
- [x] ✅ [Deps] Dev tooling bump (TS 6, vitest 4, biome 2.4) + peer release-it `^20` (`d24df9a`)
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
