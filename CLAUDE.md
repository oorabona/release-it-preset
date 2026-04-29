# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@oorabona/release-it-preset`, a shareable release-it configuration package that provides:
- Seven release configurations for different scenarios (`default`, `hotfix`, `changelog-only`, `manual-changelog`, `no-changelog`, `republish`, `retry-publish`)
- TypeScript-authored scripts (compiled to ESM JS in `dist/scripts/`) for changelog management, commit parsing, and pre-release validation
- Environment variable-driven configuration (no hardcoded values)
- Keep a Changelog format support with conventional commits
- Dependency Injection pattern in scripts for end-to-end testability — see [`docs/testing.md`](docs/testing.md)

## Package Manager & Commands

**Package Manager:** pnpm (v9.15.4)

### Development Commands
```bash
# Install dependencies
pnpm install

# Build compiled JS (scripts -> dist/scripts)
pnpm build

# Run a local TS script directly (dev only)
pnpm tsx scripts/<script-name>.ts

# Test release (dry-run)
pnpm release-it --dry-run

# Create release without changelog update
pnpm release

# Create release with automatic changelog
pnpm release:auto
```

### Testing Scripts (Compiled Runtime)
```bash
# Test changelog population (compiled)
node dist/scripts/populate-unreleased-changelog.js

# Test changelog extraction for a version
node dist/scripts/extract-changelog.js 1.0.0

# Test republish changelog
node dist/scripts/republish-changelog.js

# Test retry publish checks
pnpm exec release-it-preset retry-publish-preflight
```

### CLI Commands
```bash
# Test CLI help
node bin/cli.js --help

# Test release commands
node bin/cli.js default --dry-run
node bin/cli.js hotfix --dry-run
node bin/cli.js changelog-only --ci

# Test utility commands
node bin/cli.js init --yes
node bin/cli.js update
node bin/cli.js validate --allow-dirty
node bin/cli.js check
```

## Architecture

### CLI Wrapper (bin/cli.js)
The package provides a unified CLI with two types of commands:

**Release Commands:**
- Maps config names to config file paths
- **Intelligently detects `.release-it.json`:**
  - If `.release-it.json` exists: spawns release-it WITHOUT `--config`, allowing natural merge with user config
  - If `.release-it.json` absent: spawns release-it WITH `--config <preset-path>`
- User configuration has priority when using extends mode
- Passes all additional arguments through
- **Security:** All inputs validated before execution (whitelist + sanitization)

**Utility Commands:**
- `init` - Runs scripts/init-project.ts for project setup
- `update` - Runs scripts/populate-unreleased-changelog.ts
- `validate` - Runs scripts/validate-release.ts for pre-release checks
- `check` - Runs scripts/check-config.ts for diagnostics

Architecture:
- `handleReleaseCommand()` - Detects user config, spawns release-it appropriately
- `handleUtilityCommand()` - Spawns Node on compiled script path (dist) (dev fallback: tsx if dist missing)
- `bin/validators.js` - Input validation (OWASP principles: whitelist, sanitization, path traversal protection)
- Clear separation between release operations and utility operations
- All commands validated before execution (`validateConfigName`, `validateUtilityCommand`, `sanitizeArgs`)
- **Security:** `shell: false` on all spawn calls to prevent command injection

Client usage:
```bash
# Release commands
pnpm release-it-preset hotfix --dry-run

# Utility commands
pnpm release-it-preset init
pnpm release-it-preset validate
```

### Configuration Files (config/)

**Architecture (refactored for DRY and SOLID):**
- `config/constants.js` - All default values centralized (GIT_DEFAULTS, NPM_DEFAULTS, CHANGELOG_DEFAULTS, HOTFIX_DEFAULTS)
- `config/base-config.js` - Reusable configuration builders:
  - `createBaseGitConfig(overrides)` - Git configuration with environment variables + constants fallbacks
  - `createBaseNpmConfig(overrides)` - npm configuration with provenance support
  - `createBaseGitHubConfig(overrides)` - GitHub release configuration
- `config/helpers.js` - Shared utilities (`runScriptCommand`, `createReleaseNotesGenerator`, `getGitChangelogCommand`)

**All 7 configuration files:**
- Export default ES module configuration object
- Use `createBase*Config()` builders to eliminate duplication (~40% reduction)
- Use environment variables for ALL configurable values (no hardcoded values)
- Provide sensible fallbacks via constants.js
- Can be extended by client projects using release-it's `extends` mechanism OR accessed via CLI

**Two usage modes:**
1. **CLI mode (recommended)**: `release-it-preset <config>` - CLI detects and respects `.release-it.json`
2. **Extends mode**: `.release-it.json` with `extends: "@oorabona/release-it-preset/config/<config>"`

**Configuration hierarchy:**
- `default.js` - Full release workflow (changelog + git + GitHub + npm)
- `hotfix.js` - Emergency patches with auto-generated changelog from commits
- `changelog-only.js` - Update changelog only, no release
- `manual-changelog.js` - Release with manually edited changelog (skip auto-generation)
- `no-changelog.js` - Release without changelog updates
- `republish.js` - Republish existing version (moves git tag)
- `retry-publish.js` - Retry failed npm/GitHub publish without git operations

### Scripts (scripts/ → dist/scripts/)
Scripts are authored in TypeScript and compiled to ESM JavaScript in `dist/scripts`. Development can still use `tsx` for rapid iteration; published consumers execute compiled JS via Node.

**Release-related scripts (used by configs):**

**populate-unreleased-changelog (dist/scripts/populate-unreleased-changelog.js):**
- Reads commits since last git tag
- Parses conventional commit format (type(scope): description)
- Groups commits into Keep a Changelog sections (Added/Fixed/Changed/Removed/Security)
- Supports multi-prefix commits (multiple conventional commits in one commit message)
- Respects `[skip-changelog]` marker
- Generates commit links using repository URL from git remote
- **CLI alias:** `release-it-preset update`

**extract-changelog (dist/scripts/extract-changelog.js):**
- Extracts specific version section from CHANGELOG.md
- Used for GitHub release notes
- Takes version as argument

**republish-changelog (dist/scripts/republish-changelog.js):**
- Moves [Unreleased] content to current package.json version
- Used when republishing an existing version
- Refreshes/creates reference link definitions via a dedicated helper so existing links are replaced instead of duplicated

**retry-publish (dist/scripts/retry-publish.js / CLI: `release-it-preset retry-publish-preflight`):**
- Pre-flight checks before retrying publish
- Validates git tag exists and matches package.json version

**check-pr-status (dist/scripts/check-pr-status.js):**
- Evaluates PR hygiene (changelog updates, `[skip-changelog]`, conventional commits)
- Writes machine-readable outputs for GitHub Actions to consume

**Utility scripts (exposed via CLI):**

**init-project (dist/scripts/init-project.js):**
- Creates CHANGELOG.md with Keep a Changelog template
- Creates .release-it.json with extends configuration
- Optionally updates package.json scripts
- Interactive (prompt) or non-interactive (--yes) mode
- Checks for existing files and asks for overwrite confirmation
- **CLI command:** `release-it-preset init [--yes]`

**validate-release (dist/scripts/validate-release.js):**
- Validates CHANGELOG.md exists and format
- Checks [Unreleased] has content
- Verifies working directory is clean (unless --allow-dirty)
- Checks npm authentication (npm whoami)
- Validates current branch matches requirements
- Exit code 0 on success, 1 on failure (CI-friendly)
- **CLI command:** `release-it-preset validate [--allow-dirty]`

**check-config (dist/scripts/check-config.js):**
- Displays all environment variables and their values
- Shows repository information (URL, branch, remote, upstream)
- Lists git tags and version information
- Shows commits since last tag
- Checks configuration files status
- Displays npm authentication status
- **CLI command:** `release-it-preset check`

### Conventional Commits Mapping
The scripts use this type mapping:
- `feat`, `feature`, `add` → **Added**
- `fix`, `bugfix` → **Fixed**
- `perf`, `refactor`, `style`, `docs`, `test`, `chore`, `build` → **Changed**
- `ci`, `release`, `hotfix` → Ignored
- Unknown types → **Changed**

### Environment Variables
All configurations support these variables:
- `CHANGELOG_FILE` - Changelog path (default: CHANGELOG.md)
- `GIT_CHANGELOG_PATH` - Optional. Restrict changelog generation to commits touching this repository-relative path (e.g. `packages/tar-xz`). Useful for monorepo per-package CHANGELOG files. Empty / unset = repository-wide (default).
- `GIT_COMMIT_MESSAGE` - Commit message template
- `GIT_TAG_NAME` - Tag name template
- `GIT_REQUIRE_BRANCH` - Required branch for releases
- `GIT_REQUIRE_UPSTREAM` - Require upstream tracking (true/false)
- `GIT_REQUIRE_CLEAN` - Require clean working directory (true/false)
- `GIT_REMOTE` - Git remote name (default: origin)
- `GIT_CHANGELOG_COMMAND` - Override git log used for release preview filtering
- `GIT_CHANGELOG_DESCRIBE_COMMAND` - Override command used to find latest tag (default `git describe --tags --abbrev=0`)
- `GIT_CHANGELOG_COMMAND` - Override the git log command used for release previews
- `GITHUB_RELEASE` - Enable GitHub releases (`true` to opt in, default: `false`)
- `GITHUB_REPOSITORY` - Repository in owner/repo format
- `NPM_PUBLISH` - Enable npm publishing (`true` to opt in, default: `false`)
- `NPM_SKIP_CHECKS` - Skip npm checks (true/false)
- `NPM_ACCESS` - npm access level (default: public)
- `NPM_TAG` - Optional. When set, npm publish appends `--tag <value>` (e.g. `legacy-v0.10.0`). Prevents overwriting `latest` when republishing older versions. Empty / unset = npm uses `latest`.

## Important Constraints

1. **No hardcoded values**: All configuration values MUST use environment variables with fallbacks from `config/constants.js` ✅
2. **Repository agnostic**: Scripts detect repository URL from git remote, never hardcode ✅
3. **ESM only**: Package uses `"type": "module"` ✅
4. **Peer dependencies**: Client projects must install `release-it` only (scripts ship compiled) ✅
5. **SOLID principles**: Follow Single Responsibility, DRY, Dependency Inversion ✅
6. **OWASP security**: Input validation, no command injection, whitelist approach ✅
7. **TypeScript scripts**: Authored in TS, compiled during publish (dev may still run with tsx) ✅

## File Structure

```
bin/
├── cli.js           - CLI wrapper executable with intelligent .release-it.json detection
└── validators.js    - Input validation and security (OWASP)

config/
├── constants.js     - All default values centralized (NEW)
├── base-config.js   - Reusable configuration builders (NEW)
├── helpers.js       - Shared utilities
├── default.js       - Standard release (refactored)
├── hotfix.js        - Emergency patches (refactored)
├── changelog-only.js - Changelog preparation only
├── manual-changelog.js - Manual changelog release (refactored)
├── no-changelog.js  - Release without changelog (refactored)
├── republish.js     - Republish existing version (refactored)
└── retry-publish.js - Retry failed publish (refactored)

scripts/             - TypeScript sources (not published)
├── lib/             - Pure utility modules (git-utils, commit-parser, semver-utils, string-utils)
└── *.ts             - Main scripts, each exporting a deps-injected function + a guarded CLI entry
dist/scripts/        - Compiled runtime scripts (published)
tests/
├── unit/            - One test file per script/module (DI pattern, see docs/testing.md)
└── integration/     - CLI mode coverage (extends detection, monorepo, smoke, workflows)
examples/            - Usage documentation (markdown)
docs/                - Long-form docs (testing.md, archive/)
.github/workflows/   - CI/CD automation (GitHub release + npm publish)
```

## Package Exports

The package exports via package.json:

**Binary:**
```json
"bin": {
  "release-it-preset": "./bin/cli.js"
}
```

**Configurations and scripts:**
```json
"exports": {
   "./config/default": "./config/default.js",
   "./config/hotfix": "./config/hotfix.js",
   "./scripts/*": "./dist/scripts/*.js"
}
```

**Usage patterns:**

CLI mode (recommended):
```bash
pnpm release-it-preset hotfix
```

Extends mode:
```json
{
  "extends": "@oorabona/release-it-preset/config/default"
}
```

## Release Workflow

**Recommended approach (Hybrid - Local + CI):**

1. **Local (Developer):**
   - Run `pnpm release-it-preset update` to refresh `[Unreleased]`
   - Run `pnpm release-it-preset validate` to check readiness
   - Run `pnpm release-it-preset default` to bump/version/tag/push
     - GitHub release/npm publish remain disabled unless you export `GITHUB_RELEASE=true` / `NPM_PUBLISH=true`
     - Optionally enable those flags if you intentionally want to publish from your machine (provide `GITHUB_TOKEN`/`NPM_TOKEN`)

2. **CI (GitHub Actions):**
   - Triggered by tag push (`v*`)
   - Runs `pnpm exec release-it-preset retry-publish --ci` with `GITHUB_RELEASE=true` and `NPM_PUBLISH=true`
   - Updates the GitHub release (using the workflow `GITHUB_TOKEN`) and publishes to npm with provenance (`NPM_TOKEN` + `id-token: write`)

**Why this separation?**
- Publishing requires deliberate opt-in, so local runs stay safe by default
- CI holds the minimal secrets necessary for GitHub + npm publishing and produces provenance attestations
- The same `retry-publish` preset doubles as a recovery flow if npm/GitHub need to be retried

**GitHub Actions workflows:**

1. **ci.yml** - Continuous Integration
   - Runs on: push to main, PRs, manual trigger
   - Jobs: validate (TypeScript, files), test-cli (CLI commands), release (manual)
   - Uses our own CLI commands for testing

2. **validate-pr.yml** - Pull Request Validation
   - Runs on: PR open/update
   - Checks: CHANGELOG updated, conventional commits, release validation
   - Posts summary comment with recommendations

3. **hotfix.yml** - Emergency Hotfix Releases
   - Manual trigger with inputs (increment, commit SHA, dry-run)
   - Uses `release-it-preset hotfix --ci`
   - Auto-generates changelog from commits

4. **republish.yml** - Exceptional Republish (DANGEROUS)
   - Moves existing git tag (breaks semver immutability)
   - Requires confirmation phrase: "I understand the risks"
   - 10-second safety delay
   - Creates audit trail
   - Only for critical emergencies

5. **publish.yml** - Unified GitHub Release + npm Publish
   - Triggered on tag push (`v*`), `workflow_call`, or `workflow_dispatch`
   - Manual replay: `gh workflow run publish.yml --ref main -f tag=vX.Y.Z`
   - Optional `npm_only` / `github_only` inputs scope a partial replay
   - Uses npm OIDC trusted publishing — no `NPM_TOKEN` secret needed
   - Runs `release-it-preset retry-publish-preflight` then `retry-publish --ci`

**Principle: "Eat our own dog food"**
All workflows use our own `release-it-preset` commands instead of custom code or direct release-it calls.

## When Modifying Code

- If adding new environment variables, update README.md environment variables section
- If adding new configurations, update bin/cli.js RELEASE_CONFIGS mapping and README.md
- If adding new utility commands, update bin/cli.js UTILITY_COMMANDS mapping and README.md
- If changing commit type mappings, update both scripts and README.md
- Config files remain plain JS (no compilation)
- CLI wrapper must remain simple with no external dependencies (only Node.js built-ins)
- Utility scripts should provide clear error messages and exit codes
- Scripts should handle missing git tags gracefully (first release scenario)
- Ensure `pnpm build` is executed before publishing (handled by prepublishOnly)
- All regex patterns should be tested with edge cases (multi-line commits, special characters)
- Maintain Keep a Changelog format compliance
- Utility commands should be idempotent when possible (safe to run multiple times)
- GitHub Actions workflow now drives both GitHub release updates and npm publishing via the `retry-publish` preset
