# Basic Usage Example

This example demonstrates the most common usage of `@oorabona/release-it-preset`.

## Setup

1. Install the package:

```bash
pnpm add -D @oorabona/release-it-preset release-it tsx
```

2. Create `.release-it.json` in your project root:

```json
{
  "extends": "@oorabona/release-it-preset/config/default"
}
```

3. Add scripts to `package.json`:

```json
{
  "scripts": {
    "release": "release-it"
  }
}
```

4. Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup
```

## Making Commits

Use conventional commit format:

```bash
git commit -m "feat: add authentication feature"
git commit -m "fix: resolve login issue"
git commit -m "docs: update API documentation"
```

## Updating Changelog

Before release, populate the [Unreleased] section:

```bash
pnpm tsx node_modules/@oorabona/release-it-preset/scripts/populate-unreleased-changelog.ts
```

This will parse your commits and update CHANGELOG.md automatically.

## Running a Release

```bash
pnpm release
```

This will:
1. Prompt for version bump (patch/minor/major)
2. Update CHANGELOG.md with the new version
3. Commit the changes
4. Create a git tag
5. Push to remote
6. Create a GitHub release
7. Publish to npm

## Dry Run

Test the release process without actually publishing:

```bash
pnpm release --dry-run
```
