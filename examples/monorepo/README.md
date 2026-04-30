# Monorepo Example — per-package CHANGELOG with release-it-preset

This is a runnable demo of `@oorabona/release-it-preset` driving **per-package
changelog generation** in a pnpm workspace using the `GIT_CHANGELOG_PATH` env
var. Walk through it once, then adapt the patterns to your own monorepo.

## What this example demonstrates

Two sibling packages (`@example/pkg-a`, `@example/pkg-b`) live under
`packages/` in a pnpm workspace. Each has its own `CHANGELOG.md` and
`.release-it.json` that extends the preset's `default` config. The trick:
when you run `release-it-preset update` from inside a package directory with
`GIT_CHANGELOG_PATH=packages/<pkg>` set, the preset filters `git log` to
commits that touched files under that path. Result: pkg-a's CHANGELOG never
sees pkg-b commits, and vice versa.

## Prerequisites

- Node.js ≥ 24 (the preset requires npm ≥ 11.5.1 for OIDC; npm 18+ works for
  this demo since we don't actually publish)
- pnpm ≥ 10
- A git repo at the project root (any parent of this folder will do — the
  example shares its parent's `.git`)

## Setup

```bash
# From the release-it-preset repo root:
cd examples/monorepo
pnpm install
```

`pnpm install` resolves the workspace and links `@oorabona/release-it-preset`
from npm (or from the repo if you run this against a local checkout — adjust
the `devDependencies` path).

## Walkthrough

### 1. Make a baseline commit (so there's a "since" anchor)

> ⚠️ **If you're exploring this example inside a clone of `release-it-preset`,
> do NOT tag the parent repo.** Either copy this folder to a fresh location
> first (`cp -r examples/monorepo /tmp/my-monorepo-demo && cd /tmp/my-monorepo-demo && git init && git add . && git commit -m 'init'`),
> or set `GIT_CHANGELOG_SINCE=<sha>` instead of tagging.

If you're in a fresh clone:

```bash
git tag v0.0.0-monorepo-demo
```

The preset uses `git describe --tags --abbrev=0` as the default `since`
baseline. If your repo has no tags yet, set `GIT_CHANGELOG_SINCE=<commit-sha>`
to override.

### 2. Make per-package commits

```bash
# Add a feature to pkg-a
echo '// feat: add greet()' >> packages/pkg-a/src/index.js
git add packages/pkg-a/src/index.js
git commit -m "feat(pkg-a): add greet function"

# Fix something in pkg-b
echo '// fix: typo' >> packages/pkg-b/src/index.js
git add packages/pkg-b/src/index.js
git commit -m "fix(pkg-b): correct typo in module banner"

# Touch root files only — should NOT appear in either package CHANGELOG
git commit -m "chore: bump root devdep" --allow-empty

# Another pkg-a feature
echo '// feat: add farewell()' >> packages/pkg-a/src/index.js
git add packages/pkg-a/src/index.js
git commit -m "feat(pkg-a): add farewell function"
```

### 3. Update pkg-a's CHANGELOG

> ⚠️ Run `release-it-preset update` from the **monorepo root** (this folder),
> not from inside `packages/pkg-a/`. `GIT_CHANGELOG_PATH` is a `git log -- <path>`
> pathspec that resolves against the current working directory, and from inside
> the package directory the path `packages/pkg-a` would not exist.

```bash
# From the monorepo root (examples/monorepo/):
GIT_CHANGELOG_PATH=packages/pkg-a CHANGELOG_FILE=packages/pkg-a/CHANGELOG.md \
  pnpm release-it-preset update
```

Expected output:

```
🔧 Running utility command: update

📝 Populating [Unreleased] section...
ℹ️  Latest tag: v0.0.0-monorepo-demo
✅ Updated [Unreleased] section with 2 commit(s)
```

Open `CHANGELOG.md`:

```markdown
## [Unreleased]

### Added

- add greet function (pkg-a) ([<sha>](...))
- add farewell function (pkg-a) ([<sha>](...))
```

Note: the `fix(pkg-b)` and `chore: bump root devdep` commits are **absent**
from pkg-a's CHANGELOG — exactly the per-package isolation we wanted.

### 4. Update pkg-b's CHANGELOG

```bash
# Still from the monorepo root:
GIT_CHANGELOG_PATH=packages/pkg-b CHANGELOG_FILE=packages/pkg-b/CHANGELOG.md \
  pnpm release-it-preset update
```

`packages/pkg-b/CHANGELOG.md` now shows only the `fix(pkg-b)` commit:

```markdown
## [Unreleased]

### Fixed

- correct typo in module banner (pkg-b) ([<sha>](...))
```

## Variant — `GIT_CHANGELOG_SINCE` for non-standard release commits

If your monorepo doesn't tag, or you want to override the baseline (e.g.
include commits since a specific feature SHA), set `GIT_CHANGELOG_SINCE`:

```bash
GIT_CHANGELOG_PATH=packages/pkg-a \
  GIT_CHANGELOG_SINCE=abc1234 \
  pnpm release-it-preset update
```

When `GIT_CHANGELOG_SINCE` is set, it bypasses both per-package release
detection and the `git describe --tags` fallback.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Commit appears in the wrong package CHANGELOG | `GIT_CHANGELOG_PATH` doesn't match the package directory (or unset → all commits picked up) | Verify the env var matches the package's location relative to repo root |
| Both packages' CHANGELOGs have all commits | Forgot to set `GIT_CHANGELOG_PATH` | Set it: `GIT_CHANGELOG_PATH=packages/<pkg>` |
| `update` says no commits since last tag | No git tag exists yet | Run `git tag v0.0.0-init` once, or set `GIT_CHANGELOG_SINCE=<sha>` |
| `[Unreleased]` is overwritten | The `update` command replaces existing `[Unreleased]` content | Curate manually after `update`, or use `manual-changelog` config to skip auto-generation at release time |
| Custom commit type lands in wrong section | Default mapping doesn't recognize `deps:` (etc.) | Add a `.changelog-types.json` with `{"deps": "### Dependencies"}` (project-level) or `CHANGELOG_TYPE_MAP` env var (highest priority) |

## Adapting to your monorepo

- Package directory structure can be `packages/`, `apps/`, anything — just match `GIT_CHANGELOG_PATH` to it.
- Combine with `release-it-preset doctor` (run from inside a package) to verify the env vars + git state are right before releasing.
- For per-package release commit auto-detection, see the main project README's `GIT_CHANGELOG_PATH` section: when set, the preset auto-detects `chore(<pkg-name>): release v*` commits and uses them as the `since` baseline.

## Files in this example

- `pnpm-workspace.yaml` — declares `packages/*` as the workspace
- `package.json` — root devdeps (`release-it-preset`, `release-it`)
- `.gitignore` — excludes `node_modules/`
- `packages/pkg-a/`, `packages/pkg-b/`:
  - `package.json` — minimal package metadata
  - `.release-it.json` — extends the preset's `default` config
  - `CHANGELOG.md` — Keep a Changelog skeleton with `[Unreleased]`
  - `src/index.js` — placeholder module
