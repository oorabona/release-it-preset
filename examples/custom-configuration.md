# Custom Configuration Example

This example shows how to customize the release configuration for your specific needs.

## Configuration Modes Overview

The preset supports three configuration modes (see [README - Configuration Modes](../README.md#configuration-modes) for full details):

1. **Mode 1: CLI Only** - No config file, pure CLI usage
2. **Mode 2: CLI + User Overrides (Recommended)** - Config file WITHOUT `extends`
3. **Mode 3: File with Extends (Advanced)** - Config file WITH `extends`

---

## Mode 2: CLI + User Overrides (Recommended)

**This is the recommended approach** for most use cases.

Create `.release-it.json` **WITHOUT the `extends` field**:

```json
{
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
- CLI selects the `default` preset
- release-it merges your overrides on top
- Your values take precedence over preset defaults

**Benefits:**
- ✅ CLI controls which preset is used
- ✅ Easy to switch between presets (just change the CLI command)
- ✅ Declarative overrides in config file
- ✅ No `extends` maintenance

---

## Mode 3: File with Extends (Advanced)

**Only use this if you want to lock a specific preset** in the config file.

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
pnpm release-it-preset default  # Must match the extends!
```

⚠️ **Important:** The CLI preset **must match** the `extends` value, or you'll get an error.

**When to use this:**
- You want to ensure a specific preset is always used
- Prevents accidental use of wrong presets
- Good for projects with strict release processes

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
