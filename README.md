# @oorabona/release-it-preset

Shared [release-it](https://github.com/release-it/release-it) configuration and scripts for automated versioning, changelog generation, and package publishing.

## Features

- 📦 Multiple release configurations for different scenarios
- 📝 Automatic changelog generation using [Keep a Changelog](https://keepachangelog.com/) format
- 🤖 Conventional commits parsing and categorization
- 🏷️ Git tagging and GitHub releases
- 🚀 npm publishing with provenance
- 🔄 Republish and retry mechanisms for failed releases
- ⚡ Hotfix release support
- 🎯 Environment variable configuration

## Installation

```bash
pnpm add -D @oorabona/release-it-preset release-it
```

## Quick Start

### Option 1: Using the CLI (Recommended)

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "release": "release-it-preset default",
    "release:hotfix": "release-it-preset hotfix"
  }
}
```

Then run:

```bash
pnpm release
```

### Option 2: Using extends

Create `.release-it.json` in your project:

```json
{
  "extends": "@oorabona/release-it-preset/config/default"
}
```

Add scripts to your `package.json`:

```json
{
  "scripts": {
    "release": "release-it"
  }
}
```

### Initialize CHANGELOG.md

Create a `CHANGELOG.md` file with Keep a Changelog format:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release
```

## GitHub Actions

- Reuse the PR validation workflow from this package:

```yaml
name: PR Checks

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      base-ref: origin/${{ github.base_ref }}
      head-ref: ${{ github.sha }}
    secrets: inherit
```

Pair it with a follow-up job to post a summary comment using the outputs exposed by the reusable workflow (see `.github/workflows/validate-pr.yml` in this repo for a full example).

## Available Configurations

### `default` - Standard Release

Full-featured release with changelog, git operations, GitHub releases, and npm publishing.

**CLI:**
```bash
pnpm release-it-preset default
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/default"
}
```

Features:
- ✅ Version bumping (interactive)
- ✅ Changelog generation with @release-it/keep-a-changelog
- ✅ Git commit, tag, and push
- ✅ GitHub release creation
- ✅ npm publishing with provenance

### `hotfix` - Emergency Hotfix

For urgent patches that need quick changelog generation from git log.

**CLI:**
```bash
pnpm release-it-preset hotfix
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/hotfix"
}
```

Features:
- ✅ Forced patch version increment
- ✅ Automatic changelog from recent commits
- ✅ Pre-bump unreleased section population
- ✅ GitHub release with extracted notes

### `changelog-only` - Changelog Preparation

Updates changelog without performing a release (useful in CI or pre-release).

**CLI:**
```bash
pnpm release-it-preset changelog-only --ci
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/changelog-only"
}
```

Features:
- ✅ Populates [Unreleased] section
- ❌ No version bump
- ❌ No git operations
- ❌ No publishing

### `no-changelog` - Quick Release

Standard release without changelog updates.

**CLI:**
```bash
pnpm release-it-preset no-changelog
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/no-changelog"
}
```

Features:
- ✅ Version bumping
- ✅ Git operations
- ✅ GitHub releases
- ✅ npm publishing
- ❌ No changelog updates

### `republish` - Version Republishing

⚠️ **DANGER**: Republishes existing version by moving the git tag (breaks semver immutability).

Only use when you need to fix a broken release.

**CLI:**
```bash
pnpm release-it-preset republish
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/republish"
}
```

Features:
- ⚠️ Moves existing git tag
- ✅ Updates changelog for current version
- ✅ Republishes to npm
- ✅ Updates GitHub release

### `retry-publish` - Retry Failed Publishing

Retries npm/GitHub publishing for an existing tag without modifying git history.

**CLI:**
```bash
# Step 1: Run pre-flight checks (optional)
node node_modules/@oorabona/release-it-preset/dist/scripts/retry-publish.js
# or during local development (TypeScript sources):
pnpm tsx scripts/retry-publish.ts

# Step 2: Retry the publish
pnpm release-it-preset retry-publish
```

**Extends:**
```json
{
  "extends": "@oorabona/release-it-preset/config/retry-publish"
}
```

Features:
- ✅ Republishes to npm
- ✅ Updates GitHub release
- ❌ No version increment
- ❌ No git operations

## CLI Usage

The package provides a `release-it-preset` CLI with two types of commands:

### Release Commands

Run release-it with specific configurations:

```bash
# Show help
pnpm release-it-preset --help

# Run releases
pnpm release-it-preset default --dry-run
pnpm release-it-preset hotfix --verbose
pnpm release-it-preset changelog-only --ci
```

All additional arguments are passed through to release-it.

### Utility Commands

Helper commands for project setup and maintenance:

#### `init` - Initialize Project

Creates CHANGELOG.md, .release-it.json, and optionally adds scripts to package.json:

```bash
# Interactive mode (asks for confirmation)
pnpm release-it-preset init

# Non-interactive mode (skip prompts, use defaults)
pnpm release-it-preset init --yes
```

**What it does:**
- Creates `CHANGELOG.md` with Keep a Changelog template
- Creates `.release-it.json` with extends configuration
- Optionally adds release scripts to `package.json`
- Skips existing files in `--yes` mode

> One-off usage: `pnpm dlx @oorabona/release-it-preset init` (or `npx @oorabona/release-it-preset init`) runs the CLI without installing it as a dependency.

#### `update` - Update Changelog

Updates the [Unreleased] section with commits since last tag:

```bash
pnpm release-it-preset update
```

**What it does:**
- Parses conventional commits since last git tag
- Groups commits by type (Added, Fixed, Changed, etc.)
- Updates [Unreleased] section in CHANGELOG.md
- Generates commit links to repository
- Uses only the conventional commit subject; feel free to edit `CHANGELOG.md` afterwards if you want to add the detailed bullet points that lived in the commit body

#### `validate` - Validate Release Readiness

Checks if project is ready for release:

```bash
# Standard validation
pnpm release-it-preset validate

# Allow uncommitted changes
pnpm release-it-preset validate --allow-dirty
```

**What it checks:**
- ✅ CHANGELOG.md exists and is well-formatted
- ✅ [Unreleased] section has content
- ✅ Working directory is clean (unless --allow-dirty)
- ✅ npm authentication works (npm whoami)
- ✅ Current branch is allowed (if GIT_REQUIRE_BRANCH is set)

Exit code 0 if all checks pass, 1 if any fail (useful in CI/pre-commit hooks).

#### `check` - Diagnostic Information

Displays configuration and project status:

```bash
pnpm release-it-preset check
```

**What it shows:**
- Environment variables and their values
- Repository information (URL, branch, remote)
- Git tags and latest version
- Commits since last tag
- Configuration files status
- npm authentication status

Useful for debugging release issues.

### pnpm Script Shortcuts

The root `package.json` defines helper scripts that wrap the CLI so you can run the most common flows with `pnpm run`:

- `pnpm release` → run the default release config (`release-it-preset default`)
- `pnpm run release:default:dry-run` → dry-run the default release configuration
- `pnpm run release:no-changelog` → publish without touching the changelog
- `pnpm run release:changelog-only` → update only the changelog
- `pnpm run release:hotfix` → execute the hotfix workflow
- `pnpm run release:republish` → trigger the republish workflow (dangerous flow)
- `pnpm run release:retry-publish` → retry npm/GitHub publishing for an existing tag
- `pnpm run release:update` → populate the `[Unreleased]` section
- `pnpm run release:validate` → run release validation checks
- `pnpm run release:validate:allow-dirty` → validation that tolerates uncommitted changes
- `pnpm run release:check` → show diagnostic information about the current repo

## Scripts

Scripts are authored in TypeScript but distributed as compiled ESM JavaScript in `dist/scripts`. Under normal circumstances you should invoke them via the `release-it-preset` CLI or the pnpm aliases listed above; the CLI automatically prefers the compiled build and falls back to `tsx` only for local development. The direct `node` examples below are provided for automation scenarios where you deliberately want to call the compiled output.

### `extract-changelog.ts`

Extracts the changelog entry for a specific version (used automatically by the release notes generator). If you ever need to call it manually:

```bash
node node_modules/@oorabona/release-it-preset/dist/scripts/extract-changelog.js 1.2.3
```

### `populate-unreleased-changelog.ts`

Populates the [Unreleased] section with commits since the last tag using conventional commits.

```bash
# Preferred
pnpm release-it-preset update
# or
pnpm run release:update

# Advanced (call compiled output directly)
node node_modules/@oorabona/release-it-preset/dist/scripts/populate-unreleased-changelog.js
```

Supported commit types:
- `feat`, `feature`, `add` → Added
- `fix`, `bugfix` → Fixed
- `perf`, `refactor`, `style`, `docs`, `test`, `chore`, `build` → Changed
- `ci`, `release`, `hotfix` → Ignored

Add `[skip-changelog]` to commit message to exclude it.

### `republish-changelog.ts`

Moves [Unreleased] content to the current version entry (for republishing).

```bash
# Preferred
pnpm run release:republish
# or
pnpm release-it-preset republish

# Advanced
node node_modules/@oorabona/release-it-preset/dist/scripts/republish-changelog.js
```

### `retry-publish.ts`

Performs pre-flight checks before retrying a failed publish.

```bash
# Preferred
pnpm run release:retry-publish
# or
pnpm release-it-preset retry-publish

# Advanced
node node_modules/@oorabona/release-it-preset/dist/scripts/retry-publish.js
```

## Environment Variables

Customize behavior with environment variables:

### Changelog
- `CHANGELOG_FILE` - Changelog file path (default: `CHANGELOG.md`)

### Git
- `GIT_COMMIT_MESSAGE` - Commit message template (default: `release: bump v${version}`)
- `GIT_TAG_NAME` - Tag name template (default: `v${version}`)
- `GIT_REQUIRE_BRANCH` - Required branch (default: `main`)
- `GIT_REQUIRE_UPSTREAM` - Require upstream tracking (default: `false`)
- `GIT_REQUIRE_CLEAN` - Require clean working directory (default: `false`)
- `GIT_REMOTE` - Git remote name (default: `origin`)

### GitHub
- `GITHUB_RELEASE` - Enable GitHub releases (default: `true`)
- `GITHUB_REPOSITORY` - Repository in `owner/repo` format (auto-detected from git remote)

### npm
- `NPM_PUBLISH` - Enable npm publishing (default: `true`)
- `NPM_SKIP_CHECKS` - Skip npm checks (default: `false`)
- `NPM_ACCESS` - npm access level (default: `public`)

### Example

```bash
CHANGELOG_FILE="HISTORY.md" \
GIT_REQUIRE_BRANCH="develop" \
GIT_REQUIRE_CLEAN="true" \
pnpm release
```

## Configuration Override

You can override any configuration in your project's `.release-it.json`:

```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "git": {
    "requireBranch": "develop",
    "commitMessage": "chore: release v${version}"
  },
  "github": {
    "releaseName": "Release ${version}"
  }
}
```

## Borrowing Scripts & Workflows

- The root `package.json` of this repository shows how to expose convenient `pnpm run release:*` shortcuts. Feel free to copy that block into your own project (adjust the commands if you only need a subset).
- The GitHub Actions workflows under `.github/workflows/*.yml` illustrate how to wire the CLI into CI. They are safe to reuse, provided you review the permissions/secrets section and adapt branch names or triggers to your process.

## Release Workflow

### Recommended Workflow

**Local (Developer):**
1. Make changes and commit with conventional commits (amend afterwards to fold the changelog update if desired)
2. Run `pnpm run release:update` to populate the `[Unreleased]` section from commits
3. Review `CHANGELOG.md`, stage it, and if you want `git commit --amend` to update with last changes
4. Run `pnpm run release:validate` (or `pnpm run release:validate:allow-dirty`) to verify readiness
5. Dry-run the release with `pnpm run release:default:dry-run`
6. Execute `pnpm release` (alias for the default preset) to perform the real release
  - This bumps the version, moves changelog entries, creates the release commit + tag, pushes to origin, and creates the GitHub release locally
  - **Note:** npm publish is skipped locally; the publish workflow handles it after the tag push
  - Want to add narrative paragraphs to the changelog? When the prompt asks `Commit (release: bump vX.Y.Z)?`, answer **No**, edit/stage `CHANGELOG.md`, then re-run `pnpm release -- --retry` (or simply restart the command). The preset now passes `--allow-same-version` to `npm version`, so retrying with the same version no longer fails. Once satisfied, confirm the commit so the amended changelog is captured before the tag is created.

```mermaid
flowchart TD
  A[Conventional commits] --> B[pnpm run release:update]
  B --> C[Review changelog \u0026 stage changes]
  C --> D[pnpm run release:validate]
  D --> E[pnpm run release:default:dry-run]
  E --> F[pnpm release]
  F --> G[Push commit \u0026 tag]
  G --> H[Publish workflow runs in CI]
```

**CI (GitHub Actions):**
- When tag is pushed, CI publishes to npm with provenance

### Why This Workflow?

- **GitHub release created by release-it** (locally) - Uses GITHUB_TOKEN with proper permissions
- **npm publish done by CI** - Uses NPM_TOKEN with provenance attestation
- **Separation of concerns** - Version control (git) vs package distribution (npm)
- **Better security** - CI has minimal permissions, only publish to npm

### GitHub Actions Setup

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Package

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: read
  id-token: write  # For npm provenance

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm publish --provenance --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Required Secrets:**
- `NPM_TOKEN` - Automation token from npmjs.com (Settings → Access Tokens → Generate New Token → Automation)

**Required Permissions (locally):**
- `GITHUB_TOKEN` environment variable with `repo` scope for creating GitHub releases

### Alternative: Full CI Release

If you prefer to run the entire release in CI:

```yaml
on:
  workflow_dispatch:  # Manual trigger
    inputs:
      version:
        description: 'Version bump type'
        required: true
        type: choice
        options: [patch, minor, major]

permissions:
  contents: write  # For git operations and GitHub releases
  id-token: write  # For npm provenance

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      # ... setup steps ...

      - run: pnpm release-it-preset default --ci --increment ${{ inputs.version }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## GitHub Actions Workflows

This repository includes several GitHub Actions workflows for automated CI/CD and release management.

### Available Workflows

You can copy these files into your own repository (adjusting names, branches, and secrets to match your context). They are designed to work as-is with the release-it-preset CLI defaults but feel free to trim the jobs that you don’t need.

#### 1. **CI** (`.github/workflows/ci.yml`)

**Triggers:** Push to main, Pull Requests, Manual (workflow_dispatch)

**Jobs:**
- **validate** - Validates TypeScript compilation and file structure
- **test-cli** - Tests all CLI commands (help, check, validate, init)
- **release** - Manual release creation (workflow_dispatch only)

**Manual Release:**
```bash
# Go to Actions → CI → Run workflow
# Select increment type: patch, minor, or major
```

#### 2. **Validate PR** (`.github/workflows/validate-pr.yml`)

**Trigger:** Pull Request opened/updated

**What it does:**
- Validates TypeScript compilation
- Runs release validation checks
- Checks if CHANGELOG.md was updated
- Validates conventional commits format
- Posts summary comment on PR

**Helpful for:**
- Ensuring PRs follow best practices
- Catching issues before merge
- Promoting conventional commits usage

#### 3. **Hotfix Release** (`.github/workflows/hotfix.yml`)

**Trigger:** Manual (workflow_dispatch)

**Inputs:**
- `increment` - patch or minor (required)
- `commit` - Specific commit SHA (optional)
- `dry_run` - Test without publishing (boolean)

**What it does:**
- Validates code
- Creates emergency hotfix release
- Uses `release-it-preset hotfix` config
- Auto-generates changelog from commits

**When to use:**
Critical bugs that need immediate patch release.

#### 4. **Retry Publish** (`.github/workflows/retry-publish.yml`)

**Trigger:** Manual (workflow_dispatch)

**Inputs:**
- `tag_name` - Tag to republish (defaults to latest)
- `npm_only` - Publish to npm only
- `github_only` - Create GitHub Release only

**What it does:**
- Republishes existing tag to npm and/or GitHub
- Runs pre-flight checks
- Extracts changelog for release notes

**When to use:**
When previous publish failed (network issue, auth problem, etc.)

#### 5. **Republish (EXCEPTIONAL)** (`.github/workflows/republish.yml`)

**Trigger:** Manual (workflow_dispatch)

**Inputs:**
- `version` - Version to republish (e.g., 1.2.3)
- `confirmation` - Must type "I understand the risks"

**What it does:**
⚠️ **DANGER**: Moves existing git tag (breaks semver immutability)
- Pre-flight safety checks
- 10-second delay before execution
- Validates code
- Moves git tag to current commit
- Updates changelog
- Republishes to npm
- Updates GitHub Release
- Creates audit trail document

**When to use:**
ONLY for exceptional cases where a published version has critical issues and must be replaced.

#### 6. **Publish** (`.github/workflows/publish.yml`)

**Trigger:** Tag push (v*)

**What it does:**
- Publishes package to npm with provenance
- Triggered automatically when release-it creates and pushes a tag

**Note:** GitHub Release is created by release-it locally, not by this workflow.

## Best Practices

1. **Use conventional commits** - Enables automatic changelog generation
2. **Keep [Unreleased] updated** - Run `pnpm release-it-preset update` regularly or before releases
3. **Validate before releasing** - Run `pnpm release-it-preset validate` to catch issues early
4. **Test releases** - Use `--dry-run` flag to test without publishing
5. **Protect main branch** - Require PR reviews before merging
6. **Use CI for npm publish** - Let GitHub Actions handle npm publishing with provenance
7. **Separate concerns** - Create releases locally (git/GitHub), publish to npm in CI

## Troubleshooting

### Changelog not updating

Run the update command:
```bash
pnpm release-it-preset update
```

### GitHub releases failing

Ensure you have a `GITHUB_TOKEN` with `repo` scope:
```bash
GITHUB_TOKEN=your_token pnpm release-it-preset default
```

Or use GitHub CLI authentication:
```bash
gh auth login
pnpm release-it-preset default
```

### npm publish failing in CI

Check that:
1. `NPM_TOKEN` secret is set in repository settings
2. Token is an **automation token** (not a publish token)
3. Token has permission to publish the package
4. Package name is available (not already taken)

Test locally:
```bash
pnpm release-it-preset check  # Check npm auth status
pnpm npm whoami  # Verify authentication
```

### Validation failing

Run check command to see detailed status:
```bash
pnpm release-it-preset check
```

Common issues:
- Working directory not clean → commit or stash changes, or use `--allow-dirty`
- [Unreleased] section empty → run `pnpm release-it-preset update`
- Not on required branch → checkout correct branch or update `GIT_REQUIRE_BRANCH`

### `npm error Version not changed`

This can appear if you interrupt a release, tweak `CHANGELOG.md`, then retry with the same version. The preset automatically passes `--allow-same-version` to `npm version`, so simply re-run `pnpm release` (or `pnpm release-it-preset default --retry`) and select the same version—`npm` will no longer abort.

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or pull request.

