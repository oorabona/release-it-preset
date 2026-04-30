# TODO — Roadmap to v1.0.0

**Last updated:** 2026-05-01
**Current version:** v1.0.0-rc.0 (npm `rc`); v0.15.0 (npm `latest`)

## v1.0 Backlog (tracked as GitHub issues)

All open work has been moved to GitHub issues for public visibility:

- [x] ✅ [#23](https://github.com/oorabona/release-it-preset/issues/23) Multi-line body parser — shipped v0.13.0 (PR #27 / `9ff76aa`)
- [x] ✅ Smart dist-tag pre-release — shipped v0.13.1 (PR #28 / `025a5f9`, opus AMBER + codex M findings folded)
- [x] ✅ Workflows OIDC parity — shipped v0.14.0 (PR #29 / `2b86ae8`, ci/hotfix/republish migrated, NPM_TOKEN secret obsolete)
- [ ] 🚀 [#24](https://github.com/oorabona/release-it-preset/issues/24) v1.0.0 stability cycle (tracking checklist) — Priority: M (gated, drives beta.1 → rc.1 → stable)
- [x] ✅ [#25](https://github.com/oorabona/release-it-preset/issues/25) `release-it-preset doctor` command — shipped v0.15.0 (PR #33)
- [x] ✅ [#26](https://github.com/oorabona/release-it-preset/issues/26) Configurable commit-type → section mapping + 4 review-loop refinements (folded into #26) — shipped v0.15.0 (PR #33)
- [x] ✅ [#31](https://github.com/oorabona/release-it-preset/issues/31) ci.yml malformed shell display step — shipped via chore PR #32 (jq unification)
- [x] ✅ Dependabot alerts cleared — pnpm up -L + vite ^7.3.2 pin (devDeps only, no runtime impact, PR #32)
- [ ] 🔧 [#30](https://github.com/oorabona/release-it-preset/issues/30) Extract smart dist-tag to composite action (DRY) — Priority: L (defer until 3rd caller, post-v1.0)
- [ ] 🤔 [#34](https://github.com/oorabona/release-it-preset/issues/34) BREAKING CHANGE footer dual-emit design decision — Priority: L (option A/B/C, defer to v1.1+)

Sequencing rationale + memory pointer: see `project_state_v1_plan.md` in the local memory directory.

## Recently Done
- [x] ✅ [Release] **v0.12.0 shipped** — `GIT_CHANGELOG_SINCE` + per-package baseline detection + GHA majors bumps + E2E env-leak fix (`e12b3fb` tag `v0.12.0`)
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
