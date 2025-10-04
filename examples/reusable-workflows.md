# Reusable Workflows Guide

This guide shows how to leverage the reusable workflows provided by `@oorabona/release-it-preset` in your own projects.

## Table of Contents

- [Overview](#overview)
- [Quick Reference](#quick-reference)
- [reusable-verify.yml](#reusable-verifyyml)
- [build-dist.yml](#build-distyml)
- [Composition Patterns](#composition-patterns)
- [Real-World Examples](#real-world-examples)

## Overview

Reusable workflows allow you to import pre-configured CI/CD logic into your repository without duplicating code. This package provides two production-ready workflows:

| Workflow | Purpose | Best For |
|----------|---------|----------|
| `reusable-verify.yml` | PR validation & hygiene checks | Quality gates, release readiness |
| `build-dist.yml` | Build TypeScript distribution | Artifact sharing across jobs |

## Quick Reference

### reusable-verify.yml

```yaml
jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      node-version: '20'
      base-ref: origin/${{ github.base_ref }}
      head-ref: ${{ github.sha }}
      run-tests: true
    secrets: inherit
```

### build-dist.yml

```yaml
jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main
    with:
      artifact_name: my-dist
      ref: ${{ github.sha }}
```

## reusable-verify.yml

### Full Configuration

```yaml
name: Validate PR

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read

jobs:
  verify:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      # Node.js version (default: '20')
      node-version: '20'

      # Run tests after compilation (default: false)
      run-tests: true

      # Base ref for diff comparisons (e.g., origin/main)
      base-ref: origin/${{ github.base_ref }}

      # Head ref for comparisons (default: 'HEAD')
      head-ref: ${{ github.sha }}

      # Additional pnpm install arguments (default: '--frozen-lockfile')
      install-args: '--frozen-lockfile'

      # Git fetch depth (default: 0 for full history)
      fetch-depth: 0
    secrets: inherit
```

### Inputs Reference

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `node-version` | string | No | `'20'` | Node.js version to use |
| `run-tests` | boolean | No | `false` | Run `pnpm test` after compilation |
| `base-ref` | string | No | `''` | Base ref for diff comparisons |
| `head-ref` | string | No | `'HEAD'` | Head ref for comparisons |
| `install-args` | string | No | `'--frozen-lockfile'` | Additional pnpm install arguments |
| `fetch-depth` | number | No | `0` | Git fetch depth for checkout |

### Outputs Reference

| Output | Type | Description |
|--------|------|-------------|
| `release_validation` | string | `'true'` if release validation passes |
| `changelog_status` | string | `'updated'`, `'skipped'`, or `'missing'` |
| `skip_changelog` | string | `'true'` if `[skip-changelog]` detected |
| `conventional_commits` | string | `'true'` if conventional commits detected |
| `commit_messages` | string | Base64 encoded JSON array of commit messages |
| `changed_files` | string | Base64 encoded JSON array of changed files |

### Using Outputs

Consume outputs in subsequent jobs to create custom validation logic:

```yaml
jobs:
  verify:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      base-ref: origin/${{ github.base_ref }}
      head-ref: ${{ github.sha }}

  enforce-changelog:
    needs: verify
    runs-on: ubuntu-latest
    if: needs.verify.outputs.changelog_status == 'missing'
    steps:
      - name: Block merge if changelog missing
        run: |
          echo "❌ CHANGELOG.md must be updated or include [skip-changelog]"
          exit 1

  post-summary:
    needs: verify
    runs-on: ubuntu-latest
    if: always()
    permissions:
      pull-requests: write
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const outputs = {
              validation: '${{ needs.verify.outputs.release_validation }}',
              changelog: '${{ needs.verify.outputs.changelog_status }}',
              conventional: '${{ needs.verify.outputs.conventional_commits }}',
            };

            // Decode commit messages
            const commitsEncoded = '${{ needs.verify.outputs.commit_messages }}';
            const commits = commitsEncoded
              ? JSON.parse(Buffer.from(commitsEncoded, 'base64').toString())
              : [];

            let summary = '## 📋 Validation Results\n\n';
            summary += `- Release validation: ${outputs.validation === 'true' ? '✅' : '⚠️'}\n`;
            summary += `- Changelog: ${outputs.changelog}\n`;
            summary += `- Conventional commits: ${outputs.conventional === 'true' ? '✅' : '❌'}\n`;

            if (commits.length) {
              summary += '\n### Analyzed Commits\n';
              commits.forEach(msg => summary += `- ${msg}\n`);
            }

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: summary
            });
```

## build-dist.yml

### Full Configuration

```yaml
name: CI

on: [push, pull_request]

jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main
    with:
      # Artifact name (default: 'dist-build')
      artifact_name: my-project-dist

      # Optional git ref to checkout (default: current)
      ref: ${{ github.sha }}

  test:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist

      - run: pnpm test
```

### Inputs Reference

| Input | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `artifact_name` | string | No | `'dist-build'` | Name for the uploaded dist artifact |
| `ref` | string | No | current | Optional git ref to checkout before building |

### Outputs Reference

| Output | Type | Description |
|--------|------|-------------|
| `artifact_name` | string | Name of the uploaded dist artifact |

### Artifact Lifetime

- **Default retention**: 90 days (GitHub default)
- **Storage**: Artifacts count against your account storage
- **Download**: Use `actions/download-artifact@v4` in subsequent jobs

## Composition Patterns

### Pattern 1: Multi-Job Pipeline with Artifact Sharing

Build once, test multiple times:

```yaml
jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main
    with:
      artifact_name: compiled-dist

  unit-tests:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist
      - run: pnpm test:unit

  integration-tests:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist
      - run: pnpm test:integration

  e2e-tests:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist
      - run: pnpm test:e2e
```

### Pattern 2: Matrix Testing with Shared Build

Test across multiple Node.js versions:

```yaml
jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main

  test:
    needs: build
    strategy:
      matrix:
        node-version: [18, 20, 22]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist

      - run: pnpm test
```

### Pattern 3: Combined Validation and Build

Use both reusable workflows together:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      base-ref: origin/${{ github.base_ref || 'main' }}
      head-ref: ${{ github.sha }}
      run-tests: false  # Tests run separately

  build:
    needs: validate
    if: needs.validate.outputs.release_validation == 'true'
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main

  deploy-preview:
    needs: [validate, build]
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist
      - run: npm run deploy:preview
```

### Pattern 4: Conditional Release Gate

Block releases if validation fails:

```yaml
name: Release

on:
  workflow_dispatch:

jobs:
  pre-release-check:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      run-tests: true

  release:
    needs: pre-release-check
    if: |
      needs.pre-release-check.outputs.release_validation == 'true' &&
      needs.pre-release-check.outputs.changelog_status == 'updated'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: pnpm release-it-preset default --ci
```

## Real-World Examples

### Example 1: Open Source TypeScript Library

Complete CI/CD setup for an open-source TypeScript library:

**.github/workflows/ci.yml**:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pull-requests: write

jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      node-version: '20'
      base-ref: origin/${{ github.base_ref || 'main' }}
      head-ref: ${{ github.sha }}
      run-tests: true
    secrets: inherit

  build:
    needs: validate
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main

  comment:
    needs: validate
    if: github.event_name == 'pull_request' && always()
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const summary = [
              '## 🔍 CI Results',
              '',
              `- Release validation: ${
                '${{ needs.validate.outputs.release_validation }}' === 'true'
                  ? '✅ Passed'
                  : '⚠️ Issues found'
              }`,
              `- Changelog: ${{ needs.validate.outputs.changelog_status }}`,
              `- Conventional commits: ${
                '${{ needs.validate.outputs.conventional_commits }}' === 'true'
                  ? '✅ Yes'
                  : 'ℹ️ Not detected'
              }`
            ].join('\n');

            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: summary
            });
```

### Example 2: Private Package with Strict Validation

Enforce strict validation rules for private packages:

```yaml
name: Strict Validation

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      node-version: '20'
      base-ref: origin/${{ github.base_ref }}
      head-ref: ${{ github.sha }}
      run-tests: true

  enforce-rules:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - name: Require changelog update
        if: |
          needs.validate.outputs.changelog_status == 'missing' &&
          github.event.pull_request.draft == false
        run: |
          echo "❌ CHANGELOG.md must be updated for non-draft PRs"
          echo "Add [skip-changelog] to commit message if intentionally skipping"
          exit 1

      - name: Require conventional commits
        if: needs.validate.outputs.conventional_commits != 'true'
        run: |
          echo "⚠️ Conventional commits recommended but not enforced"
          echo "Learn more: https://www.conventionalcommits.org"
```

### Example 3: Multi-Platform Testing

Test across different operating systems and Node versions:

```yaml
name: Cross-Platform Tests

on: [push, pull_request]

jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main

  test:
    needs: build
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20, 22]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist

      - run: pnpm test
```

## Tips and Best Practices

### 1. Version Pinning

Use specific versions for stability:

```yaml
# ✅ Good - specific version
uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@v1.2.3

# ⚠️ Risky - always latest
uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
```

### 2. Secrets Inheritance

Always use `secrets: inherit` when the workflow needs access to repository secrets:

```yaml
jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    secrets: inherit  # Required if workflow needs secrets
```

### 3. Conditional Execution

Use workflow outputs to conditionally run jobs:

```yaml
jobs:
  verify:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main

  deploy:
    needs: verify
    if: |
      github.event_name == 'push' &&
      needs.verify.outputs.release_validation == 'true'
    runs-on: ubuntu-latest
    steps:
      - run: npm run deploy
```

### 4. Artifact Management

Clean up artifacts after use to save storage:

```yaml
jobs:
  cleanup:
    needs: [test, deploy]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - uses: geekyeggo/delete-artifact@v2
        with:
          name: ${{ needs.build.outputs.artifact_name }}
```

### 5. Debugging

Enable debug logging for troubleshooting:

```yaml
jobs:
  validate:
    uses: oorabona/release-it-preset/.github/workflows/reusable-verify.yml@main
    with:
      # Add debug output
      install-args: '--frozen-lockfile --loglevel verbose'
```

Or set `ACTIONS_STEP_DEBUG` secret to `true` in repository settings.
