# Monorepo Workflow Guide

This guide shows how to use `@oorabona/release-it-preset` in monorepo projects with shared configurations.

## Overview

Monorepos often need to:
- **Share** release configuration across packages
- **Customize** individual package release behavior
- **Maintain** consistent versioning strategies
- **Reduce** configuration duplication

This preset supports monorepo workflows through:
- ✅ Parent directory config references (`../../config.json`)
- ✅ Config file composition via array `extends`
- ✅ Per-package customization
- ✅ Zero-config auto-detection mode

## Monorepo Structure Example

```
my-monorepo/
├── package.json                    # Root package (workspaces)
├── .release-it-base.json          # Shared release configuration
├── .github/
│   └── workflows/
│       └── release-package.yml    # Reusable release workflow
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── .release-it.json       # Extends base + preset
│   │   └── CHANGELOG.md
│   ├── utils/
│   │   ├── package.json
│   │   ├── .release-it.json       # Extends base + preset
│   │   └── CHANGELOG.md
│   └── cli/
│       ├── package.json
│       ├── .release-it.json       # Extends base + preset
│       └── CHANGELOG.md
```

## Step-by-Step Setup

### 1. Create Shared Base Configuration

**File: `.release-it-base.json`** (root of monorepo)

```json
{
  "git": {
    "requireBranch": "main",
    "requireCleanWorkingDir": true,
    "requireUpstream": true,
    "commitMessage": "chore(release): ${name} v${version}",
    "tagAnnotation": "Release ${name} v${version}"
  },
  "npm": {
    "publish": false
  },
  "github": {
    "release": false
  },
  "hooks": {
    "before:init": ["pnpm test", "pnpm lint"]
  }
}
```

**Key points:**
- This file defines **shared** configuration for all packages
- Use environment variables for values that differ per package
- Disable npm/GitHub publishing by default (opt-in via env vars)

### 2. Configure Individual Packages

**File: `packages/core/.release-it.json`**

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/default"
  ],
  "git": {
    "tagName": "core-v${version}"
  }
}
```

**File: `packages/utils/.release-it.json`**

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/default"
  ],
  "git": {
    "tagName": "utils-v${version}"
  }
}
```

**File: `packages/cli/.release-it.json`**

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/default"
  ],
  "git": {
    "tagName": "cli-v${version}"
  }
}
```

**Config merge order** (right-to-left priority):
1. `.release-it-base.json` (lowest priority)
2. `@oorabona/release-it-preset/config/default`
3. Package-specific overrides (highest priority - `tagName`)

### 3. Add Package Scripts

**File: `packages/core/package.json`**

```json
{
  "name": "@my-org/core",
  "version": "1.2.3",
  "scripts": {
    "release": "release-it-preset",
    "release:dry-run": "release-it-preset --dry-run",
    "release:manual": "release-it-preset --config .release-it-manual.json"
  }
}
```

**Using zero-config mode:**
- `pnpm release` → Auto-detects preset from `.release-it.json`
- No need to specify preset name!

### 4. Release Individual Packages

```bash
# Navigate to package directory
cd packages/core

# Run release (auto-detection mode)
pnpm release

# Output:
# 🔍 Auto-detected preset: default
# ✅ Config validated: preset "default"
# 📝 Using: .release-it.json (extends ../../.release-it-base.json)
```

## Advanced Patterns

### Pattern 1: Per-Package Customization

Some packages might need different release strategies:

**File: `packages/experimental/.release-it.json`**

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/no-changelog"
  ],
  "git": {
    "tagName": "experimental-v${version}",
    "requireCleanWorkingDir": false
  },
  "npm": {
    "tag": "next"
  }
}
```

This package:
- Uses `no-changelog` preset (experimental = no changelog yet)
- Allows dirty working directory
- Publishes to `next` npm tag

### Pattern 2: Multiple Config Files Per Package

For packages that occasionally need different release modes:

**File: `packages/core/.release-it.json`** (default)

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/default"
  ],
  "git": { "tagName": "core-v${version}" }
}
```

**File: `packages/core/.release-it-manual.json`** (rare cases)

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/manual-changelog"
  ],
  "git": { "tagName": "core-v${version}" }
}
```

**Usage:**

```bash
# Normal release (auto-detection)
pnpm release

# Manual changelog release (passthrough mode)
pnpm release-it-preset --config .release-it-manual.json
```

### Pattern 3: Environment-Specific Releases

Use environment variables for CI/CD:

**File: `.release-it-base.json`**

```json
{
  "git": {
    "requireBranch": "${GIT_REQUIRE_BRANCH:-main}",
    "commitMessage": "chore(release): ${name} v${version}"
  }
}
```

**Local development:**

```bash
cd packages/core
pnpm release  # Uses "main" branch (default)
```

**CI/CD:**

```bash
cd packages/core
GIT_REQUIRE_BRANCH=main \
GITHUB_RELEASE=true \
NPM_PUBLISH=true \
pnpm release --ci
```

### Pattern 4: Shared Scripts

Create shared release scripts in root `package.json`:

**File: `package.json` (root)**

```json
{
  "name": "my-monorepo",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "release:core": "cd packages/core && pnpm release",
    "release:utils": "cd packages/utils && pnpm release",
    "release:cli": "cd packages/cli && pnpm release",
    "release:all": "pnpm -r --workspace-concurrency=1 release"
  }
}
```

**Usage from root:**

```bash
# Release single package
pnpm release:core

# Release all packages sequentially
pnpm release:all
```

## GitHub Actions Integration

### Reusable Workflow for Package Releases

**File: `.github/workflows/release-package.yml`**

```yaml
name: Release Package

on:
  workflow_call:
    inputs:
      package:
        description: 'Package name (e.g., core, utils, cli)'
        required: true
        type: string
      working-directory:
        description: 'Package directory (e.g., packages/core)'
        required: true
        type: string
    secrets:
      GITHUB_TOKEN:
        required: true
      NPM_TOKEN:
        required: true

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          fetch-tags: true

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
          registry-url: 'https://registry.npmjs.org'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Release ${{ inputs.package }}
        working-directory: ${{ inputs.working-directory }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
          GITHUB_RELEASE: true
          NPM_PUBLISH: true
        run: pnpm release-it-preset --ci --verbose
```

### Individual Package Workflows

**File: `.github/workflows/release-core.yml`**

```yaml
name: Release Core

on:
  push:
    tags:
      - 'core-v*'

jobs:
  release:
    uses: ./.github/workflows/release-package.yml
    with:
      package: core
      working-directory: packages/core
    secrets: inherit
```

**File: `.github/workflows/release-utils.yml`**

```yaml
name: Release Utils

on:
  push:
    tags:
      - 'utils-v*'

jobs:
  release:
    uses: ./.github/workflows/release-package.yml
    with:
      package: utils
      working-directory: packages/utils
    secrets: inherit
```

## Security Considerations

### Parent Directory References

The preset validates parent directory references for security:

✅ **Allowed:**
```json
{
  "extends": "../../.release-it-base.json"  // 2 levels up - OK
}
```

✅ **Allowed:**
```json
{
  "extends": "../../../../../.release-it-base.json"  // 5 levels up - OK
}
```

❌ **Blocked:**
```json
{
  "extends": "../../../../../../etc/passwd"  // 6 levels up - BLOCKED
}
```

❌ **Blocked:**
```json
{
  "extends": "/etc/passwd"  // Absolute path - BLOCKED
}
```

### Validation Rules

1. **Extension whitelist:** Only `.json`, `.js`, `.cjs`, `.mjs`, `.yaml`, `.yml`, `.toml`
2. **Depth limit:** Maximum 5 parent directory levels (`../`)
3. **No absolute paths:** Must be relative from project directory
4. **File existence:** Path must point to existing file

**Why this is safe:**
- Config files are **trusted code** (developer controls repository)
- **No privilege escalation** in CLI tool context
- **Industry standard** (TypeScript, ESLint, Prettier all allow `../`)
- **Defense in depth** (multiple validation layers)

## Troubleshooting

### Issue: "Config file not found"

**Symptom:**
```bash
❌ Config file not found: "../../.release-it-base.json"
   Resolved to: /path/to/project/.release-it-base.json
```

**Solution:**
1. Verify the file exists at the expected location
2. Check file path is correct relative to package directory
3. Use `pwd` to confirm current working directory

### Issue: "Too many parent directory references"

**Symptom:**
```bash
❌ Too many parent directory references: 6
   Maximum allowed: 5 levels (../../../../../../)
```

**Solution:**
1. Move shared config closer to packages (max 5 levels up)
2. Or restructure monorepo to reduce nesting depth

### Issue: "Auto-detection fails in monorepo"

**Symptom:**
```bash
❌ .release-it.json does not extend a known preset
```

**Solution:**
Ensure `.release-it.json` has `extends` field with preset:

```json
{
  "extends": [
    "../../.release-it-base.json",
    "@oorabona/release-it-preset/config/default"  // ← Must be present!
  ]
}
```

## Best Practices

### 1. One CHANGELOG per Package

Each package should have its own `CHANGELOG.md`:

```
packages/
├── core/
│   └── CHANGELOG.md     # Core package changelog
├── utils/
│   └── CHANGELOG.md     # Utils package changelog
└── cli/
    └── CHANGELOG.md     # CLI package changelog
```

### 2. Use Scoped Tags

Prefix tags with package name to avoid conflicts:

```json
{
  "git": {
    "tagName": "core-v${version}",        // ✅ Scoped
    "commitMessage": "chore(core): v${version}"
  }
}
```

**Not:**
```json
{
  "git": {
    "tagName": "v${version}"  // ❌ Ambiguous in monorepo
  }
}
```

### 3. Disable Publishing by Default

Set `npm.publish: false` and `github.release: false` in base config:

```json
{
  "npm": { "publish": false },
  "github": { "release": false }
}
```

Enable only when needed via environment variables:

```bash
GITHUB_RELEASE=true NPM_PUBLISH=true pnpm release --ci
```

### 4. Test Before Release

Add pre-release checks in base config:

```json
{
  "hooks": {
    "before:init": [
      "pnpm test",
      "pnpm lint",
      "pnpm typecheck"
    ]
  }
}
```

### 5. Use Workspaces Scripts

Define convenience scripts in root `package.json`:

```json
{
  "scripts": {
    "release:core": "pnpm --filter @my-org/core release",
    "release:utils": "pnpm --filter @my-org/utils release"
  }
}
```

## Complete Example

See a complete working monorepo example in:
[examples/monorepo-complete/](./monorepo-complete/) (coming soon)

## Related Documentation

- [CLI Usage](../README.md#cli-usage)
- [Configuration Modes](../README.md#configuration-modes)
- [Environment Variables](../README.md#environment-variables)
- [Custom Configuration](./custom-configuration.md)
