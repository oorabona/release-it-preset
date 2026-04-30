# TODO — Roadmap to v1.0.0

**Last updated:** 2026-04-30
**Current version:** v0.11.0

## v1.0 Backlog

_All medium and low priority items shipped in v0.11.0. Only the stability cycle remains._

### Pre-release
- [ ] 🚀 [Release] v1.0.0-beta.1 → rc.1 → stable cycle — declare API freeze (configs, env vars, CLI flags, exit codes); no new features expected, just commitment to semver — Priority: M (gated)

### Out-of-scope follow-ups (track if user requests)
- [ ] 💡 [Scripts] Multi-line commit body parser — multi-line commit bodies currently leak as `### Changed` entries instead of being treated as commit metadata. Surfaced during the `GIT_CHANGELOG_PATH` work but explicitly out of scope for v0.11.0.

## Recently Done
- [x] ✅ [Scripts] Per-package release baseline detection in monorepos — `GIT_CHANGELOG_SINCE` env var + auto-detection of `chore(<pkg>): release v*` commits as `since` baseline (`d117cad`, closes #21)
- [x] ✅ [Release] **v0.11.0 shipped** — `GIT_CHANGELOG_PATH` env var + OIDC trusted publishing + smart dist-tag + MIGRATION.md + ADRs (`0b4f857` tag `v0.11.0`)
- [x] ✅ [CI] npm OIDC trusted publishing + unified publish workflow (no more `NPM_TOKEN` secret) + smart dist-tag + idempotent publish (`560eaba`/`8324918`/`ad40152`/`10d8ce5`)
- [x] ✅ [Docs] `docs/MIGRATION.md` (v0.x → v1.0 upgrade guide) + `docs/adr/` (4 initial ADRs) (`7841605`)
- [x] ✅ [Tests] `bin/cli.js` instrumented in vitest coverage report (`4a13219`)
- [x] ✅ [Release] **v0.10.1 shipped** — patch fixing default release commit messages (`16467a3` tag `v0.10.1`)
- [x] ✅ [Constants] Default release commit messages now Conventional Commits compliant (`chore(release):` / `chore(hotfix):`); changelog filters updated in tandem (`affe211`)
- [x] ✅ [Release] **v0.10.0 shipped** — bundles the items below (`c921579` tag `v0.10.0`)
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
