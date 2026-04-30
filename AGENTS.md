# Agent Context — `@oorabona/release-it-preset`

This file is a vendor-neutral pointer for AI coding agents (Claude Code, Cursor, Cline, Aider, Continue, GitHub Copilot Workspace, etc.) working in this repository.

## Mission of this package

A shareable [release-it](https://github.com/release-it/release-it) preset for JavaScript / TypeScript / Node.js packages. Provides:

- 7 release configurations (`default`, `hotfix`, `manual-changelog`, `no-changelog`, `changelog-only`, `republish`, `retry-publish`)
- 7 utility CLI commands (`init`, `update`, `validate`, `check`, `doctor`, `check-pr`, `retry-publish-preflight`)
- Reusable GitHub Actions workflows for OIDC trusted publishing
- [Keep a Changelog](https://keepachangelog.com/) auto-population from Conventional Commits
- Smart npm dist-tag selection (pre-release identifier extraction, build-metadata strip, version-named fallback for republished older versions)

Audience: solo and small-team JavaScript package maintainers who want OIDC publishing + Keep a Changelog discipline + diagnostic tooling, without the orchestration overhead of changesets/lerna/nx or the full-automation philosophy of semantic-release.

## Where to look first

When asked to add a feature, fix a bug, or modify behavior in this repository:

1. **Read [`CLAUDE.md`](./CLAUDE.md)** — project conventions, architecture quick tour, commit conventions, build/test workflow. Even if you are not Claude Code, the conventions apply.
2. **Read [`docs/PUBLIC_API.md`](./docs/PUBLIC_API.md)** — the **stable surface** (what semver protects in v1.0+) versus internal items. Modifying anything in the stable list is a major version bump; respect the contract.
3. **Read [`CONTRIBUTING.md`](./CONTRIBUTING.md)** — Conventional Commits requirement, branch prefixes (`feat/`, `fix/`, `refactor/`, `docs/`, `chore/`), pre-PR checklist (tests + tsc + biome + build), testing conventions (DI pattern, no mocks of `node:fs`/`node:child_process`).
4. **Browse [`examples/`](./examples/)** — concrete use cases, especially [`examples/monorepo/`](./examples/monorepo/) for the runnable per-package CHANGELOG demo.

## Decisions that shape the codebase

- **Dependency Injection pattern in scripts** — every script in `scripts/` exports a deps-injected function (e.g., `populateChangelog(deps)`) plus a guarded CLI entry. Tests use `vi.fn()` for `execSync`/`readFileSync`/`getEnv`. Do not mock the `node:fs` or `node:child_process` modules themselves; pass plain function literals or `vi.fn()` as the deps. See [`docs/adr/0003-dependency-injection-pattern.md`](./docs/adr/0003-dependency-injection-pattern.md).
- **No hardcoded values** — every configurable value goes through environment variables with fallbacks defined in `config/constants.js`. See [`docs/PUBLIC_API.md`](./docs/PUBLIC_API.md) for the canonical env var list.
- **Repository agnostic** — scripts must detect repository URL from git remote, never hardcode.
- **ESM only** — `"type": "module"` everywhere; no CommonJS in source.
- **OWASP discipline** — input validation, no command injection, whitelist approach. See `bin/validators.js`.
- **OIDC trusted publishing** — never reintroduce static `NPM_TOKEN` auth in workflows; the migration is documented in [`docs/MIGRATION.md`](./docs/MIGRATION.md).
- **Stable error semantics** — exit codes 0/1/2 are frozen for v1.0+; codes 3-9 are reserved. See [`docs/PUBLIC_API.md`](./docs/PUBLIC_API.md#exit-code-stability).
- **Code comments must reference permanent identifiers** — GH issue refs (`#NN`), ADR file paths, or pure technical descriptions. Session-local labels (review iteration tags, finding IDs, sprint numbers) do not survive the project lifespan and create dangling references.

## Commit conventions (enforced by hook)

Conventional Commits format: `type(scope?)?: lowercase summary`. Types in active use: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `build`, `test`, `ci`. Title ≤ 80 chars. Body wraps ~72 chars. Reference issues with `Closes #N` or `Refs #N` in the body, not the title.

A `commit-msg` hook rejects messages with process artifacts (review iteration tags, finding IDs, severity tags like `BLOCKING`/`CRITICAL`, wave/phase/sprint numbering). Describe results, not the dev journey.

## Environment expectations

- pnpm ≥ 10
- Node ≥ 20.19.0 (the project's `engines.node` floor; matches release-it v20's minimum)
- The published preset peer-depends on `release-it ^19.0.0 || ^20.0.0`. Tests + dev install are on v20; v19 was smoke-tested before the constraint was widened.

## When you are stuck

- For project-specific gotchas, search the `docs/` folder first.
- For agent-specific tooling (Claude Code skills, MCP servers, etc.), check [`CLAUDE.md`](./CLAUDE.md).
- The [issue tracker](https://github.com/oorabona/release-it-preset/issues) and [Public API doc](./docs/PUBLIC_API.md) are the canonical sources of truth for what's contractual versus internal.

## License

MIT — see [`LICENSE`](./LICENSE).
