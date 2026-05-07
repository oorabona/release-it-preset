# @oorabona/release-it-preset

Shareable [release-it](https://github.com/release-it/release-it) configuration and scripts for automated versioning, changelog generation, and package publishing — for solo and small-team JavaScript maintainers who want Keep a Changelog discipline without the ceremony of changesets or the hands-off philosophy of semantic-release.

[![NPM Version](https://img.shields.io/npm/v/@oorabona/release-it-preset.svg)](https://npmjs.org/package/@oorabona/release-it-preset)
[![NPM Downloads](https://img.shields.io/npm/dm/@oorabona/release-it-preset.svg)](https://npmjs.org/package/@oorabona/release-it-preset)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/node/v/@oorabona/release-it-preset.svg)](https://nodejs.org/)
[![OIDC trusted publishing](https://img.shields.io/badge/npm-OIDC%20trusted%20publishing-green.svg)](https://docs.npmjs.com/trusted-publishers)
[![CI](https://github.com/oorabona/release-it-preset/actions/workflows/ci.yml/badge.svg)](https://github.com/oorabona/release-it-preset/actions/workflows/ci.yml)
[![Audit](https://github.com/oorabona/release-it-preset/actions/workflows/audit.yml/badge.svg)](https://github.com/oorabona/release-it-preset/actions/workflows/audit.yml)
[![codecov](https://codecov.io/github/oorabona/release-it-preset/graph/badge.svg?token=6RMN34Z7TX)](https://codecov.io/github/oorabona/release-it-preset)
[![TypeScript](https://img.shields.io/badge/TypeScript-supported-blue.svg)](https://www.typescriptlang.org/)

## Quick Start (30 seconds)

```bash
pnpm add -D release-it @oorabona/release-it-preset
pnpm release-it-preset init --with-workflows
```

That's it. You now have:
- `.release-it.json` extending the `default` preset (auto-generated changelog from commits)
- A `CHANGELOG.md` with Keep a Changelog skeleton
- Release scripts in your `package.json` (`pnpm release:patch`, `release:minor`, `release:major`)
- A `.github/workflows/release.yml` that publishes via npm OIDC trusted publishing on tag push

Run a release:
```bash
pnpm release-it-preset validate    # pre-flight checks
pnpm release:minor                 # bump + commit + tag + push (CI publishes)
```

**For monorepos:** `init` auto-detects `pnpm-workspace.yaml` / `package.json#workspaces` and scaffolds per-package `.release-it.json`.

**One-off (no install):** `pnpm dlx @oorabona/release-it-preset init --with-workflows`

→ Full reference: [docs/USAGE.md](docs/USAGE.md) · [Migration v0→v1](docs/MIGRATION.md) · [Public API](docs/PUBLIC_API.md)

## Why this preset?

Most release workflows fall into one of three traps: too much manual work (plain release-it, you assemble everything), too much ceremony (changesets, great for 5+ maintainers, heavy for one), or too much automation with too little control (semantic-release, hands-off by design and format).

`@oorabona/release-it-preset` occupies the productive middle ground for solo and small-team JavaScript package maintainers who want:

- **Human-readable changelogs.** Keep a Changelog format (Added/Changed/Deprecated/Removed/Fixed/Security) generated automatically from conventional commits — no manual entry writing, no machine-format diffs. `[YANKED]` markers in version headings are preserved transparently.
- **OIDC publishing without CI plumbing.** Import the reusable `publish.yml` workflow in three lines. OIDC trusted publishing with npm provenance ships on day one, no `NPM_TOKEN` secret required.
- **Diagnostic confidence before release.** Run `release-it-preset doctor` to surface every misconfiguration — git auth, npm auth, changelog hygiene, branch requirements — before anything breaks in CI.
- **Recovery presets for the real world.** Dedicated `republish` and `retry-publish` configs handle the scenarios other tools pretend don't happen.

**Pick this preset** if you maintain one or a few npm packages, write Keep a Changelog, deploy from GitHub Actions, and want pre-built OIDC publishing without adopting changesets or semantic-release's philosophy.

**Do not pick this preset** if you have a large monorepo with cross-package dependency management needs (use [changesets](https://github.com/changesets/changesets)) or if you want zero human involvement in versioning decisions (use [semantic-release](https://github.com/semantic-release/semantic-release)).

## Ecosystem positioning

| Tool | Strength | When to prefer it |
|---|---|---|
| **`@oorabona/release-it-preset`** (this) | Keep a Changelog discipline + OIDC workflows + `doctor` CLI + recovery presets | Solo / small-team JS maintainer, human-curated changelogs, GitHub Actions CI |
| [release-it](https://github.com/release-it/release-it) (plain) | Maximum flexibility, smallest opinion footprint | You want to assemble each piece yourself |
| [changesets](https://github.com/changesets/changesets) | PR-driven versioning, fixed/linked package versions | 5+ maintainer monorepo, every change deserves explicit intent |
| [semantic-release](https://github.com/semantic-release/semantic-release) | Fully-automated, zero human intervention | Branch-driven release pipelines, no human review of changelogs |
| [release-please](https://github.com/googleapis/release-please) | GitHub Release PR pattern, 20+ language strategies | Polyglot repos, GitHub-native PR-driven workflow |
| [`@release-it-plugins/workspaces`](https://github.com/release-it-plugins/workspaces) | Multi-package iteration + cross-pkg dep sync | Monorepo with bulk publish — composes with this preset |

## Features

- **One-command init** — `init --with-workflows` scaffolds `.release-it.json`, `CHANGELOG.md`, `package.json` scripts, and a GitHub Actions publish workflow.
- **Seven release configs** — `default`, `hotfix`, `manual-changelog`, `no-changelog`, `changelog-only`, `republish`, `retry-publish` — each tuned for a specific scenario. → [docs/USAGE.md#configurations](docs/USAGE.md#available-configurations)
- **Doctor command** — pre-release diagnostics: branch state, npm auth, peer-dep range, CHANGELOG validity, readiness score. → [docs/USAGE.md#doctor](docs/USAGE.md#doctor---release-readiness-diagnostic)
- **OIDC trusted publishing** — zero-config npm provenance via GitHub Actions OIDC; no `NPM_TOKEN` secret needed when using the reusable `publish.yml` workflow.
- **Monorepo support** — `init` auto-detects workspace manifests; `GIT_CHANGELOG_PATH` scopes changelog generation per package.
- **Recovery flows** — `republish` / `retry-publish` for the inevitable "first publish failed at npm step" moment.
- **Smart dist-tag selection** — pre-releases (`-rc`, `-beta`) auto-publish under non-`latest` tags.
- **Conventional Commits aware** — auto-generated `[Unreleased]` from commit history, with curatable manual edits preserved.
- **Reusable GitHub workflows** — `publish.yml`, `hotfix.yml`, `republish.yml` shipped as composable callables.
- **TypeScript-first** — DI pattern in scripts, fully testable (213 unit tests).

## Installation & requirements

- **Node.js** >= 20.19.0
- **Package manager:** pnpm, npm, or yarn
- **Peer dependency:** `release-it ^19.0.0 || ^20.0.0` (v20 recommended for OIDC publishing)
- **TypeScript:** built with TypeScript 6; TypeScript 5+ projects are supported via the compiled ESM distribution

```bash
pnpm add -D release-it @oorabona/release-it-preset
```

**Try without installing:**
```bash
pnpm dlx @oorabona/release-it-preset doctor    # health check on any repo
pnpm dlx @oorabona/release-it-preset init      # scaffold a new project
```

## CHANGELOG

See [CHANGELOG.md](CHANGELOG.md) for all version history, or browse [GitHub Releases](https://github.com/oorabona/release-it-preset/releases).

## Contributing & support

- [CONTRIBUTING.md](CONTRIBUTING.md) — Conventional Commits, branch prefixes, pre-PR checklist, testing conventions
- [SUPPORT.md](SUPPORT.md) — where to ask questions, file bugs, and report security issues
- [Discussions](https://github.com/oorabona/release-it-preset/discussions) — Q&A, usage tips, ideas
- [Issues](https://github.com/oorabona/release-it-preset/issues) — bugs + feature requests (use templates)
- [SECURITY.md](SECURITY.md) — vulnerability reporting (do NOT use public issues)

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).

## License

MIT — see [LICENSE](LICENSE).
