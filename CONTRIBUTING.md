# Contributing to `@oorabona/release-it-preset`

Thanks for your interest. This project values small, focused PRs with clear test coverage and Conventional Commits hygiene.

## Quick start

```bash
git clone https://github.com/oorabona/release-it-preset
cd release-it-preset
pnpm install
pnpm test          # 435 tests should pass
pnpm exec tsc --noEmit
pnpm build
```

Requirements: Node ≥ 20, pnpm ≥ 10. The project is ESM-only.

## Development setup

Source lives in TypeScript (`scripts/*.ts`) and is compiled to `dist/scripts/` via `pnpm build`. The CLI (`bin/cli.js`) is plain JS with no build step. Configuration files in `config/` are also plain JS modules.

The compiled `dist/` is committed via `prepublishOnly`; you do not need to commit it manually.

## Branching & commit conventions

- Branch prefixes: `feat/`, `fix/`, `refactor/`, `docs/`, `chore/`. Use kebab-case for the rest of the name (e.g., `fix/multi-line-body-parser`).
- Commits **must** follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). The format is enforced by a commit-msg hook.
- Commit titles ≤ 80 characters. Body wraps ~72 characters.
- Reference issues with `Closes #N` / `Refs #N` in the commit body or PR description.

Examples:

```text
feat(doctor): add diagnostic command (#25)
fix(changelog): stop footer lines leaking into CHANGELOG (issue #23)
refactor(workflows): migrate ci/hotfix/republish to npm OIDC trusted publishing
chore: clarify changelog comments and test labels
```

## Pre-PR checklist

Run all four locally before opening a PR:

```bash
pnpm test                          # vitest, expect 435+ passing
pnpm exec tsc --noEmit             # type check
pnpm exec biome check --write .    # lint + format
pnpm build                         # compile dist/scripts
```

Then run the project's own diagnostic on your fork:

```bash
node bin/cli.js doctor
```

A `WARNINGS` status is fine for an in-progress branch; `BLOCKED` is not.

If you touched user-facing behavior, add or update an entry under `[Unreleased]` in `CHANGELOG.md`. The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (Added/Changed/Fixed/Removed/Security/⚠️ BREAKING CHANGES).

If your commit is purely internal (CI tweaks, refactors with no observable surface change), add `[skip-changelog]` in the commit body to skip the changelog automation.

## Testing conventions

- Unit tests live in `tests/unit/`. Use the Dependency Injection pattern (`vi.fn()` for `execSync`/`readFileSync`/`getEnv`); no mocking of the `node:fs` or `node:child_process` modules themselves.
- Integration tests in `tests/integration/` exercise the CLI dispatch.
- E2E tests in `tests/e2e/` spawn the actual CLI against a temp git repo (testcontainers-style).
- Real fixtures preferred over mocks of internal pure functions.
- Coverage threshold is informal but new code should have happy-path + at least one error-path test.

## Architecture quick tour

For the full project layout, see [`CLAUDE.md`](./CLAUDE.md). The 30-second tour:

- `bin/cli.js` — CLI entry, dispatches `release-it-preset <command>` to either a release config (spawn release-it) or a utility script.
- `config/*.js` — 7 release-it preset configurations (`default`, `hotfix`, `manual-changelog`, `no-changelog`, `republish`, `retry-publish`, `changelog-only`). All compose from `base-config.js` builders.
- `scripts/*.ts` — utility scripts (DI pattern). The dispatch table is in `bin/cli.js`'s `UTILITY_COMMANDS`.
- `scripts/lib/*.ts` — pure helpers (git utilities, commit parser, semver, error classes, type-map loader).
- `.github/workflows/*.yml` — reusable GHA workflows (`publish.yml` for OIDC trusted publishing, `audit.yml`, `ci.yml`, `hotfix.yml`, `republish.yml`, `validate-pr.yml`, `reusable-verify.yml`, `build-dist.yml`).

## Reporting issues

[Open a GitHub issue](https://github.com/oorabona/release-it-preset/issues). Include:

- The exact command that failed and its full output (use `release-it-preset doctor --json` for environment details).
- The version (`pnpm exec release-it-preset --help` shows it).
- A minimal reproduction if behavioral.

For security concerns, please email olivier.orabona@gmail.com directly rather than opening a public issue. See [`SECURITY.md`](./SECURITY.md) for the disclosure policy.

## Code of Conduct

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
