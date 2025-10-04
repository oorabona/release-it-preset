# CI/CD Integration Examples

Modern examples of integrating `@oorabona/release-it-preset` with various CI/CD platforms.

## Table of Contents

- [GitHub Actions](#github-actions)
  - [Standard TypeScript/Node.js Project](#standard-typescriptnodejs-project)
  - [Monorepo Setup](#monorepo-setup)
  - [Private npm Package](#private-npm-package)
- [GitLab CI](#gitlab-ci)
- [CircleCI](#circleci)
- [Best Practices](#best-practices)

## GitHub Actions

### Standard TypeScript/Node.js Project

Complete setup for a typical TypeScript project with PR validation, automated releases, and npm publishing.

#### 1. PR Validation

**.github/workflows/validate-pr.yml**:
```yaml
name: Validate PR

on:
  pull_request:
    types: [opened, synchronize, reopened]

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
    secrets: inherit

  comment:
    needs: validate
    runs-on: ubuntu-latest
    if: always()
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            const validation = '${{ needs.validate.outputs.release_validation }}' === 'true';
            const changelog = '${{ needs.validate.outputs.changelog_status }}';
            const conventional = '${{ needs.validate.outputs.conventional_commits }}' === 'true';

            let summary = '## 📋 PR Validation Summary\n\n';
            summary += `${validation ? '✅' : '⚠️'} **Release validation**\n`;
            summary += `${changelog === 'updated' ? '✅' : 'ℹ️'} **Changelog**: ${changelog}\n`;
            summary += `${conventional ? '✅' : 'ℹ️'} **Conventional commits**\n`;

            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            const botComment = comments.find(c =>
              c.user.type === 'Bot' && c.body.includes('PR Validation Summary')
            );

            if (botComment) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: botComment.id,
                body: summary,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body: summary,
              });
            }
```

#### 2. Release Workflow

**.github/workflows/release.yml**:
```yaml
name: Release

on:
  workflow_dispatch:
    inputs:
      increment:
        description: 'Version increment'
        required: true
        type: choice
        options: [patch, minor, major]

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
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Update changelog
        run: pnpm release-it-preset update

      - name: Validate release
        run: pnpm release-it-preset validate

      - name: Create release
        run: pnpm release-it-preset default --ci --increment ${{ inputs.increment }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_PUBLISH: 'false'  # Let publish.yml handle this
```

#### 3. Automated Publish on Tag

**.github/workflows/publish.yml**:
```yaml
name: Publish

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write

jobs:
  publish:
    uses: oorabona/release-it-preset/.github/workflows/publish.yml@main
    secrets:
      NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Or copy the full workflow for customization:

```yaml
name: Publish Package

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  id-token: write

jobs:
  build:
    uses: oorabona/release-it-preset/.github/workflows/build-dist.yml@main

  publish:
    needs: build
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

      - run: pnpm install --frozen-lockfile

      - uses: actions/download-artifact@v4
        with:
          name: ${{ needs.build.outputs.artifact_name }}
          path: dist

      - name: Publish
        run: pnpm release-it-preset retry-publish --ci
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
          NPM_PUBLISH: 'true'
          GITHUB_RELEASE: 'true'
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 4. Required Secrets

Add these secrets to your repository (Settings → Secrets and variables → Actions):

- **`NPM_TOKEN`**: Automation token from npmjs.com
  - Go to npmjs.com → Access Tokens → Generate New Token
  - Select "Automation" type
  - Copy token and add as repository secret

### Monorepo Setup

For monorepos using workspaces (pnpm/npm/yarn):

**.github/workflows/release-package.yml**:
```yaml
name: Release Package

on:
  workflow_dispatch:
    inputs:
      package:
        description: 'Package to release'
        required: true
        type: choice
        options:
          - packages/core
          - packages/utils
          - packages/cli
      increment:
        description: 'Version increment'
        required: true
        type: choice
        options: [patch, minor, major]

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
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - name: Configure Git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Release package
        working-directory: ${{ inputs.package }}
        run: |
          pnpm release-it-preset update
          pnpm release-it-preset validate
          pnpm release-it-preset default --ci --increment ${{ inputs.increment }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GIT_TAG_NAME: "${{ inputs.package }}/v\${version}"
          GIT_COMMIT_MESSAGE: "release(${{ inputs.package }}): bump v\${version}"
```

### Private npm Package

For private packages published to npm or GitHub Packages:

**.github/workflows/publish-private.yml**:
```yaml
name: Publish Private Package

on:
  push:
    tags: ['v*']

permissions:
  contents: write
  packages: write
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: 'https://npm.pkg.github.com'
          scope: '@yourorg'
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm build

      - name: Publish to GitHub Packages
        run: pnpm release-it-preset retry-publish --ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_PUBLISH: 'true'
          GITHUB_RELEASE: 'true'
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_ACCESS: 'restricted'
```

For private npm registry packages:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    registry-url: 'https://registry.npmjs.org'

- run: pnpm release-it-preset retry-publish --ci
  env:
    NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
    NPM_PUBLISH: 'true'
    NPM_ACCESS: 'restricted'  # For private packages
```

## GitLab CI

**.gitlab-ci.yml**:
```yaml
stages:
  - validate
  - release
  - publish

variables:
  FF_USE_FASTZIP: "true"
  PNPM_CACHE_FOLDER: .pnpm-store

cache:
  key:
    files:
      - pnpm-lock.yaml
  paths:
    - .pnpm-store

.node_setup: &node_setup
  image: node:20
  before_script:
    - corepack enable
    - pnpm config set store-dir $PNPM_CACHE_FOLDER
    - pnpm install --frozen-lockfile

validate:
  <<: *node_setup
  stage: validate
  script:
    - pnpm tsc --noEmit
    - pnpm test
    - pnpm release-it-preset validate --allow-dirty

release:
  <<: *node_setup
  stage: release
  only:
    - main
  when: manual
  script:
    - git config user.name "GitLab CI"
    - git config user.email "ci@gitlab.com"
    - pnpm release-it-preset update
    - pnpm release-it-preset default --ci --increment patch
  artifacts:
    reports:
      dotenv: release.env

publish:
  <<: *node_setup
  stage: publish
  only:
    - tags
  script:
    - pnpm build
    - pnpm release-it-preset retry-publish --ci
  environment:
    name: production
    url: https://www.npmjs.com/package/$CI_PROJECT_NAME
```

## CircleCI

**.circleci/config.yml**:
```yaml
version: 2.1

orbs:
  node: circleci/node@5.1.0

workflows:
  test-and-release:
    jobs:
      - validate:
          filters:
            tags:
              only: /.*/
      - release:
          requires:
            - validate
          filters:
            branches:
              only: main
      - publish:
          requires:
            - validate
          filters:
            tags:
              only: /^v.*/
            branches:
              ignore: /.*/

jobs:
  validate:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: pnpm
      - run: pnpm tsc --noEmit
      - run: pnpm test
      - run: pnpm release-it-preset validate --allow-dirty

  release:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: pnpm
      - run:
          name: Configure Git
          command: |
            git config user.name "CircleCI"
            git config user.email "ci@circleci.com"
      - run: pnpm release-it-preset update
      - run: pnpm release-it-preset default --ci --increment patch

  publish:
    docker:
      - image: cimg/node:20.11
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: pnpm
      - run: pnpm build
      - run:
          name: Publish
          command: pnpm release-it-preset retry-publish --ci
          environment:
            NPM_PUBLISH: 'true'
            GITHUB_RELEASE: 'true'
```

## Best Practices

### 1. Secrets Management

- **Never commit tokens** to repository
- Use CI platform's secrets management
- Rotate tokens periodically
- Use automation tokens (not personal tokens)

### 2. Dependency Caching

- Cache `node_modules` or pnpm store
- Use lockfile-based cache keys
- Restore caches before install

### 3. Build Artifacts

- Reuse built artifacts across jobs
- Upload/download using artifact actions
- Avoid rebuilding multiple times

### 4. Git Configuration

- Configure git user for CI commits
- Use service account or bot user
- Set consistent commit messages

### 5. Provenance

- Enable npm provenance with `id-token: write`
- Requires Node.js 20+ and npm 9.5+
- Provides supply chain transparency

### 6. Validation

- Run validation in PRs
- Use `--allow-dirty` in CI validation
- Check changelog before release

### 7. Environment Variables

Customize behavior per environment:

```yaml
env:
  GIT_REQUIRE_BRANCH: 'main'
  GIT_REQUIRE_CLEAN: 'true'
  CHANGELOG_FILE: 'CHANGELOG.md'
  NPM_ACCESS: 'public'  # or 'restricted' for private
```

### 8. Workflow Triggers

- **PR validation**: Run on every PR
- **Release creation**: Manual trigger or automated on merge
- **Publishing**: Automated on tag push
- **Hotfixes**: Manual trigger with specific commit
