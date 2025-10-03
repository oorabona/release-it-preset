# CI Integration Examples

Examples of integrating `@oorabona/release-it-preset` with CI/CD pipelines.

## GitHub Actions

### Automatic Release on Tag

**.github/workflows/release.yml**:
```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write
  id-token: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm test

      - run: pnpm build

      - run: pnpm publish --provenance --access public --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        run: |
          VERSION=$(node -p "require('./package.json').version")
          pnpm tsx node_modules/@oorabona/release-it-preset/scripts/extract-changelog.ts $VERSION > RELEASE_NOTES.md
          gh release create v$VERSION --notes-file RELEASE_NOTES.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Changelog Validation in PRs

**.github/workflows/pr-check.yml**:
```yaml
name: PR Checks

on:
  pull_request:
    branches:
      - main

jobs:
  changelog:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install

      - name: Check changelog
        run: |
          pnpm tsx node_modules/@oorabona/release-it-preset/scripts/populate-unreleased-changelog.ts
          if git diff --exit-code CHANGELOG.md; then
            echo "✅ Changelog is up to date"
          else
            echo "❌ Changelog needs updating"
            git diff CHANGELOG.md
            exit 1
          fi

### Reusable PR Validation Workflow

Call the reusable workflow published by this package to run TypeScript compilation, optional tests, release validation, and PR hygiene checks with a single include:

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
      run-tests: true
    secrets: inherit

  summarize:
    needs: validate
    runs-on: ubuntu-latest
    if: always()
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const releaseValidation = '${{ needs.validate.outputs.release_validation }}';
            const changelogStatus = '${{ needs.validate.outputs.changelog_status }}';
            const conventional = '${{ needs.validate.outputs.conventional_commits }}' === 'true';
            core.summary.addHeading('PR Validation Summary');
            core.summary.addRaw(`Release validation: ${releaseValidation === 'true' ? '✅ Passed' : '⚠️  Issues detected'}`);
            core.summary.addRaw(`Changelog status: ${changelogStatus}`);
            core.summary.addRaw(`Conventional commits: ${conventional ? '✅ Yes' : 'ℹ️  Not detected'}`);
            await core.summary.write();
```
```

### Automated Releases on Main

**.github/workflows/auto-release.yml**:
```yaml
name: Auto Release

on:
  push:
    branches:
      - main

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://registry.npmjs.org'
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm test

      - name: Release
        run: pnpm release --ci --no-git.requireCleanWorkingDir
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

## GitLab CI

**.gitlab-ci.yml**:
```yaml
stages:
  - test
  - release

variables:
  FF_USE_FASTZIP: "true"

test:
  stage: test
  image: node:20
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - pnpm test
    - pnpm lint

release:
  stage: release
  image: node:20
  only:
    - tags
  before_script:
    - corepack enable
    - pnpm install --frozen-lockfile
  script:
    - pnpm build
    - echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
    - pnpm publish --provenance --access public --no-git-checks
  after_script:
    - rm -f .npmrc
```

## CircleCI

**.circleci/config.yml**:
```yaml
version: 2.1

workflows:
  test-and-release:
    jobs:
      - test:
          filters:
            tags:
              only: /.*/
      - release:
          requires:
            - test
          filters:
            tags:
              only: /^v.*/
            branches:
              ignore: /.*/

jobs:
  test:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - restore_cache:
          keys:
            - pnpm-{{ checksum "pnpm-lock.yaml" }}
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - save_cache:
          key: pnpm-{{ checksum "pnpm-lock.yaml" }}
          paths:
            - ~/.pnpm-store
      - run: pnpm test

  release:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc
      - run: pnpm publish --provenance --access public --no-git-checks
```

## Jenkins

**Jenkinsfile**:
```groovy
pipeline {
  agent any

  environment {
    NODE_VERSION = '20'
  }

  stages {
    stage('Install') {
      steps {
        sh 'corepack enable'
        sh 'pnpm install --frozen-lockfile'
      }
    }

    stage('Test') {
      steps {
        sh 'pnpm test'
      }
    }

    stage('Release') {
      when {
        tag pattern: "v\\d+\\.\\d+\\.\\d+", comparator: "REGEXP"
      }
      steps {
        sh 'pnpm build'
        withCredentials([string(credentialsId: 'npm-token', variable: 'NPM_TOKEN')]) {
          sh 'echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > .npmrc'
          sh 'pnpm publish --provenance --access public --no-git-checks'
        }
      }
    }
  }

  post {
    always {
      sh 'rm -f .npmrc'
    }
  }
}
```

## Best Practices for CI

1. **Use `--frozen-lockfile`** to ensure consistent dependencies
2. **Run tests before publishing** to catch issues early
3. **Use secrets management** for NPM_TOKEN and GITHUB_TOKEN
4. **Enable provenance** for npm packages (`--provenance`)
5. **Cache dependencies** to speed up builds
6. **Use `--no-git-checks`** when publishing in CI (git operations already done)
7. **Clean up credentials** in post steps
8. **Validate changelog** in PR checks
