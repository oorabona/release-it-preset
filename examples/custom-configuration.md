# Custom Configuration Example

This example shows how to customize the release configuration for your specific needs.

## Configuration Modes Overview

The preset supports two configuration modes (see [README - Configuration Modes](../README.md#configuration-modes) for full details):

1. **Mode 1: Direct Preset** - No config file
2. **Mode 2: Preset + Overrides** - Config file WITH `extends` (recommended for customization)

---

## Mode 2: Preset + User Overrides (Recommended)

**Use this when you need to customize specific options while keeping preset defaults.**

Create `.release-it.json` **WITH the `extends` field**:

```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "git": {
    "requireBranch": "develop",
    "commitMessage": "chore(release): ${version}",
    "requireCleanWorkingDir": true
  },
  "github": {
    "releaseName": "Version ${version}",
    "releaseNotes": "echo 'Custom release notes for ${version}'"
  },
  "npm": {
    "publish": false
  }
}
```

Then run:

```bash
pnpm release-it-preset default
```

**How it works:**
- The `extends` field loads the preset configuration
- release-it merges your overrides on top via c12
- **Your values take precedence** over preset defaults
- CLI validates that `extends` matches the command

**Benefits:**
- ✅ Explicit preset declaration
- ✅ Guaranteed config merging
- ✅ Industry standard pattern (like ESLint, TypeScript)
- ✅ Clear error messages if misconfigured

---

## Why `extends` is Required

Without `extends`, release-it only loads your `.release-it.json` and uses release-it's own defaults. The preset is never loaded!

```json
// ❌ WRONG - This won't work:
{
  "git": { "requireBranch": "develop" }
}
```

```bash
pnpm release-it-preset default

# ❌ Configuration error!
#    .release-it.json is missing the required "extends" field.
#    Without "extends", you'll get release-it defaults instead of preset defaults.
```

**Always include `extends`** to ensure proper config merging:

```json
// ✅ CORRECT:
{
  "extends": "@oorabona/release-it-preset/config/default",
  "git": { "requireBranch": "develop" }
}
```

## Using Environment Variables

Set environment variables in your shell or CI:

```bash
export GIT_REQUIRE_BRANCH="main"
export GIT_REQUIRE_CLEAN="true"
export GITHUB_REPOSITORY="oorabona/my-project"
export NPM_ACCESS="restricted"

pnpm release
```

Or in a `.env` file:

```env
GIT_REQUIRE_BRANCH=main
GIT_REQUIRE_CLEAN=true
GITHUB_REPOSITORY=oorabona/my-project
NPM_ACCESS=restricted
CHANGELOG_FILE=HISTORY.md
```

Then load it before releasing:

```bash
source .env && pnpm release
```

## Multiple Configurations

Create different configs for different scenarios:

**.release-it.json** (default for regular releases):
```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "git": {
    "requireBranch": "main"
  }
}
```

**.release-it-beta.json** (for beta releases):
```json
{
  "extends": "@oorabona/release-it-preset/config/no-changelog",
  "preRelease": "beta",
  "npm": {
    "tag": "beta"
  }
}
```

**.release-it-hotfix.json** (for hotfixes):
```json
{
  "extends": "@oorabona/release-it-preset/config/hotfix"
}
```

Then add scripts to `package.json`:

```json
{
  "scripts": {
    "release": "release-it",
    "release:beta": "release-it --config .release-it-beta.json",
    "release:hotfix": "release-it --config .release-it-hotfix.json"
  }
}
```

## Custom Hooks

Add custom hooks to your configuration:

```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "hooks": {
    "before:init": [
      "pnpm test",
      "pnpm lint"
    ],
    "after:bump": [
      "pnpm build"
    ],
    "after:release": [
      "echo Released version ${version}",
      "pnpm notify-team"
    ]
  }
}
```

## Monorepo Configuration

For monorepos, you might want different configurations per package:

**packages/core/.release-it.json**:
```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "npm": {
    "publishPath": "."
  },
  "git": {
    "tagName": "core-v${version}",
    "commitMessage": "chore(core): release v${version}"
  }
}
```

**packages/utils/.release-it.json**:
```json
{
  "extends": "@oorabona/release-it-preset/config/default",
  "npm": {
    "publishPath": "."
  },
  "git": {
    "tagName": "utils-v${version}",
    "commitMessage": "chore(utils): release v${version}"
  }
}
```
