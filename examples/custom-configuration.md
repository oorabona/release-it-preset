# Custom Configuration Example

This example shows how to customize the release configuration for your specific needs.

## Extending the Default Configuration

Create `.release-it.json`:

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

This configuration:
- Requires releases to be made from the `develop` branch
- Uses a custom commit message format
- Requires a clean working directory
- Customizes GitHub release naming
- Disables npm publishing

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
