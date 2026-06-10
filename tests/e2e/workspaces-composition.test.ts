/**
 * E2E coverage for composing this preset with @release-it-plugins/workspaces.
 *
 * This test is intentionally fixture-local and install-free: the temp repos get
 * node_modules entries via symlinks to the already-installed local packages.
 * See #61.
 */

import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  isWorkspacesReleaseIt20PeerMismatch,
  linkReleaseItCompositionModules,
  type ReleaseItMajor,
  type ReleaseItResult,
  readPackage,
  releaseItOutput,
  runReleaseIt,
} from '../helpers/release-it-composition.js'
import { createTempGitRepo, type TempRepo } from '../helpers/temp-repo.js'

const BASE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function releaseConfig(withWorkspacesPlugin: boolean): Record<string, unknown> {
  return {
    extends: '@oorabona/release-it-preset/config/default',
    git: false,
    github: false,
    npm: {
      publish: false,
      skipChecks: true,
    },
    plugins: withWorkspacesPlugin
      ? {
          '@release-it-plugins/workspaces': {
            skipChecks: true,
            publish: false,
            additionalManifests: {
              versionUpdates: [],
            },
          },
        }
      : {},
  }
}

function seedWorkspaceFixture(
  repo: TempRepo,
  withWorkspacesPlugin: boolean,
  releaseItMajor: ReleaseItMajor,
): void {
  linkReleaseItCompositionModules(repo, releaseItMajor)

  repo.commit('chore: initial workspace setup', {
    '.release-it.json': json(releaseConfig(withWorkspacesPlugin)),
    'CHANGELOG.md': BASE_CHANGELOG,
    'package.json': json({
      name: 'workspace-composition-demo',
      private: true,
      version: '1.0.0',
      workspaces: ['packages/*'],
    }),
    'packages/pkg-a/package.json': json({
      name: '@demo/pkg-a',
      version: '1.0.0',
    }),
    'packages/pkg-a/src/index.js': 'export const value = "a";\n',
    'packages/pkg-b/package.json': json({
      name: '@demo/pkg-b',
      version: '1.0.0',
      dependencies: {
        '@demo/pkg-a': '^1.0.0',
      },
    }),
    'packages/pkg-b/src/index.js': 'export const value = "b";\n',
  })
  repo.tag('1.0.0')

  repo.commit('feat: update workspace package', {
    'packages/pkg-a/src/index.js': 'export const value = "a2";\n',
  })

  // Mutation lock: linkReleaseItCompositionModules runs before the commits
  // above and temp-repo commits stage with `git add -A`; without the helper's
  // .gitignore the fixture would track node_modules symlinks (including one
  // pointing back at the project root).
  const tracked = spawnSync('git', ['ls-files', 'node_modules'], {
    cwd: repo.cwd,
    encoding: 'utf8',
  })
  expect(tracked.stdout.trim()).toBe('')
}

function expectReleaseItSuccess(result: ReleaseItResult, label: string): void {
  expect(result.exitCode, `${label} failed:\n${releaseItOutput(result)}`).toBe(0)
}

describe('E2E: @release-it-plugins/workspaces composition', () => {
  it('updates workspace versions and internal dependency ranges under release-it 19', () => {
    const positive = createTempGitRepo({ branch: 'main' })
    const negative = createTempGitRepo({ branch: 'main' })

    try {
      seedWorkspaceFixture(positive, true, 19)
      seedWorkspaceFixture(negative, false, 19)

      const positiveResult = runReleaseIt(positive, 19)
      expectReleaseItSuccess(positiveResult, 'workspaces composition run')

      const negativeResult = runReleaseIt(negative, 19)
      expectReleaseItSuccess(negativeResult, 'negative control run')

      expect(readPackage(positive, 'packages/pkg-a/package.json').version).toBe('1.0.1')
      const positivePkgB = readPackage(positive, 'packages/pkg-b/package.json')
      expect(positivePkgB.version).toBe('1.0.1')
      expect(positivePkgB.dependencies?.['@demo/pkg-a']).toBe('^1.0.1')

      expect(readPackage(negative, 'packages/pkg-a/package.json').version).toBe('1.0.0')
      const negativePkgB = readPackage(negative, 'packages/pkg-b/package.json')
      expect(negativePkgB.version).toBe('1.0.0')
      expect(negativePkgB.dependencies?.['@demo/pkg-a']).toBe('^1.0.0')
    } finally {
      positive.cleanup()
      negative.cleanup()
    }
  })

  it('locks the release-it 20 workspaces peer incompatibility without skipping', () => {
    const repo = createTempGitRepo({ branch: 'main' })

    try {
      seedWorkspaceFixture(repo, true, 20)

      const result = runReleaseIt(repo, 20)

      expect(result.exitCode).not.toBe(0)
      expect(
        isWorkspacesReleaseIt20PeerMismatch(result),
        `expected release-it 20 peer mismatch:\n${releaseItOutput(result)}`,
      ).toBe(true)
      expect(readPackage(repo, 'packages/pkg-a/package.json').version).toBe('1.0.0')
    } finally {
      repo.cleanup()
    }
  })
})
