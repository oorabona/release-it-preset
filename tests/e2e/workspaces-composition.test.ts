/**
 * E2E coverage for composing this preset with @release-it-plugins/workspaces.
 *
 * This test is intentionally fixture-local and install-free: the temp repos get
 * node_modules entries via symlinks to the already-installed local packages.
 * See #61.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isWorkspacesReleaseItPeerMismatch,
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

const WORKSPACE_RELEASE_ARGS = ['1.0.1', '--ci']
const WORKSPACE_DRY_RUN_ARGS = ['patch', '--ci', '--dry-run']

interface NodeVersion {
  major: number
  minor: number
  patch: number
}

function parseNodeVersion(version: string): NodeVersion {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  if (!match) {
    throw new Error(`Unexpected Node version: ${version}`)
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function compareNodeVersions(left: NodeVersion, right: NodeVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor
  }
  return left.patch - right.patch
}

function nodeSatisfiesEngineRange(version: NodeVersion, range: string): boolean {
  return range.split(/\s*\|\|\s*/).some(part => {
    const match = part.trim().match(/^(\^|>=)\s*(\d+\.\d+\.\d+)$/)
    if (!match) {
      throw new Error(`Unsupported release-it Node engine range: ${range}`)
    }

    const base = parseNodeVersion(match[2])
    if (match[1] === '>=') {
      return compareNodeVersions(version, base) >= 0
    }
    return version.major === base.major && compareNodeVersions(version, base) >= 0
  })
}

const RELEASE_IT_PACKAGE_ALIASES: Record<ReleaseItMajor, string> = {
  19: 'release-it19',
  20: 'release-it',
  21: 'release-it21',
}

interface ReleaseItRuntime {
  engineRange: string
  skipReason: string | null
}

function readReleaseItRuntime(
  releaseItMajor: ReleaseItMajor,
  nodeVersionText = process.versions.node,
): ReleaseItRuntime {
  const packageAlias = RELEASE_IT_PACKAGE_ALIASES[releaseItMajor]
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'node_modules', packageAlias, 'package.json'), 'utf8'),
  ) as { engines?: { node?: unknown } }
  const engineRange = manifest.engines?.node
  if (typeof engineRange !== 'string') {
    throw new Error(`${packageAlias} package.json has no Node engine range`)
  }

  const nodeVersion = parseNodeVersion(nodeVersionText)
  return {
    engineRange,
    skipReason: nodeSatisfiesEngineRange(nodeVersion, engineRange)
      ? null
      : `skipped: Node ${nodeVersionText} does not satisfy release-it ${releaseItMajor} engine ${engineRange}`,
  }
}

const releaseItRuntimes: Record<ReleaseItMajor, ReleaseItRuntime> = {
  19: readReleaseItRuntime(19),
  20: readReleaseItRuntime(20),
  21: readReleaseItRuntime(21),
}

function releaseItCase(releaseItMajor: ReleaseItMajor): typeof it {
  return releaseItRuntimes[releaseItMajor].skipReason ? it.skip : it
}

function releaseItCaseName(label: string, releaseItMajor: ReleaseItMajor): string {
  const runtime = releaseItRuntimes[releaseItMajor]
  return runtime.skipReason
    ? `${label} under release-it ${releaseItMajor} (${runtime.skipReason})`
    : `${label} under release-it ${releaseItMajor}`
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

type WorkspaceNpmMode = 'documented' | 'core-npm'

function releaseConfig(
  withWorkspacesPlugin: boolean,
  workspaceNpmMode: WorkspaceNpmMode = 'documented',
): Record<string, unknown> {
  return {
    extends: '@oorabona/release-it-preset/config/default',
    git: false,
    github: false,
    npm:
      withWorkspacesPlugin && workspaceNpmMode === 'documented'
        ? false
        : {
            publish: false,
            skipChecks: true,
          },
    plugins: withWorkspacesPlugin
      ? {
          '@release-it-plugins/workspaces': {
            skipChecks: true,
            publish: false,
          },
        }
      : {},
  }
}

function seedWorkspaceFixture(
  repo: TempRepo,
  withWorkspacesPlugin: boolean,
  releaseItMajor: ReleaseItMajor,
  workspaceNpmMode: WorkspaceNpmMode = 'documented',
): void {
  linkReleaseItCompositionModules(repo, releaseItMajor)

  repo.commit('chore: initial workspace setup', {
    '.release-it.json': json(releaseConfig(withWorkspacesPlugin, workspaceNpmMode)),
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

function gitStatus(repo: TempRepo): string {
  const result = spawnSync('git', ['status', '--short'], {
    cwd: repo.cwd,
    encoding: 'utf8',
  })

  expect(result.status).toBe(0)
  return result.stdout.trim()
}

describe('E2E: @release-it-plugins/workspaces composition', () => {
  it('states why release-it 21 cases skip on an excluded Node runtime', () => {
    const releaseIt21OnNode20 = readReleaseItRuntime(21, '20.19.0')
    expect(releaseIt21OnNode20.skipReason).toBe(
      `skipped: Node 20.19.0 does not satisfy release-it 21 engine ${releaseIt21OnNode20.engineRange}`,
    )
  })

  it('skips release-it 20 on an excluded Node runtime', () => {
    const releaseIt20OnNode220 = readReleaseItRuntime(20, '22.0.0')
    expect(releaseIt20OnNode220.skipReason).toBe(
      `skipped: Node 22.0.0 does not satisfy release-it 20 engine ${releaseIt20OnNode220.engineRange}`,
    )
  })

  it('runs release-it 20 on a supported Node runtime', () => {
    expect(readReleaseItRuntime(20, '22.13.0').skipReason).toBeNull()
  })

  it('does not attribute a different unmet plugin peer to release-it', () => {
    const result: ReleaseItResult = {
      stdout:
        '@release-it-plugins/workspaces has the following unmet peerDependencies\n' +
        '- another-peer: ^1.0.0',
      stderr: '',
      exitCode: 1,
    }

    expect(isWorkspacesReleaseItPeerMismatch(result, 21)).toBe(false)
  })

  it('updates workspace versions and internal dependency ranges under release-it 19', () => {
    const positive = createTempGitRepo({ branch: 'main' })
    const negative = createTempGitRepo({ branch: 'main' })

    try {
      seedWorkspaceFixture(positive, true, 19)
      seedWorkspaceFixture(negative, false, 19)

      const positiveResult = runReleaseIt(positive, 19, WORKSPACE_RELEASE_ARGS)
      expectReleaseItSuccess(positiveResult, 'workspaces composition run')

      const negativeResult = runReleaseIt(negative, 19)
      expectReleaseItSuccess(negativeResult, 'negative control run')

      expect(readPackage(positive, 'package.json').version).toBe('1.0.1')
      expect(readPackage(positive, 'packages/pkg-a/package.json').version).toBe('1.0.1')
      const positivePkgB = readPackage(positive, 'packages/pkg-b/package.json')
      expect(positivePkgB.version).toBe('1.0.1')
      expect(positivePkgB.dependencies?.['@demo/pkg-a']).toBe('^1.0.1')
      const positiveChangelog = readFileSync(join(positive.cwd, 'CHANGELOG.md'), 'utf8')
      expect(positiveChangelog).toContain('## [1.0.1]')
      expect(positiveChangelog).toContain('update workspace package')

      expect(readPackage(negative, 'packages/pkg-a/package.json').version).toBe('1.0.0')
      const negativePkgB = readPackage(negative, 'packages/pkg-b/package.json')
      expect(negativePkgB.version).toBe('1.0.0')
      expect(negativePkgB.dependencies?.['@demo/pkg-a']).toBe('^1.0.0')
    } finally {
      positive.cleanup()
      negative.cleanup()
    }
  })

  for (const releaseItMajor of [19, 20, 21] as const) {
    releaseItCase(releaseItMajor)(
      releaseItCaseName('runs the preset without the workspaces plugin', releaseItMajor),
      () => {
        const repo = createTempGitRepo({ branch: 'main' })

        try {
          seedWorkspaceFixture(repo, false, releaseItMajor)

          const result = runReleaseIt(repo, releaseItMajor)
          expectReleaseItSuccess(result, `no-workspaces release-it ${releaseItMajor} run`)

          expect(readPackage(repo, 'package.json').version).toBe('1.0.1')
          const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')
          expect(changelog).toContain('## [1.0.1]')
        } finally {
          repo.cleanup()
        }
      },
    )
  }

  it('keeps workspaces dry-runs clean only when core npm is disabled', () => {
    const guarded = createTempGitRepo({ branch: 'main' })
    const leaked = createTempGitRepo({ branch: 'main' })

    try {
      seedWorkspaceFixture(guarded, true, 19)
      seedWorkspaceFixture(leaked, true, 19, 'core-npm')

      const guardedVersionBefore = readPackage(guarded, 'package.json').version
      const leakedVersionBefore = readPackage(leaked, 'package.json').version

      const guardedResult = runReleaseIt(guarded, 19, WORKSPACE_DRY_RUN_ARGS)
      expectReleaseItSuccess(guardedResult, 'workspaces npm:false dry-run')

      expect(readPackage(guarded, 'package.json').version).toBe(guardedVersionBefore)
      expect(gitStatus(guarded)).toBe('')

      const leakedResult = runReleaseIt(leaked, 19, WORKSPACE_DRY_RUN_ARGS)
      expectReleaseItSuccess(leakedResult, 'workspaces core npm dry-run')

      expect(readPackage(leaked, 'package.json').version).not.toBe(leakedVersionBefore)
      expect(readPackage(leaked, 'package.json').version).toBe('1.0.1')
      expect(gitStatus(leaked)).toContain('package.json')
    } finally {
      guarded.cleanup()
      leaked.cleanup()
    }
  })

  for (const releaseItMajor of [20, 21] as const) {
    releaseItCase(releaseItMajor)(
      releaseItCaseName(
        'locks the unsupported workspaces peer incompatibility without skipping',
        releaseItMajor,
      ),
      () => {
        const repo = createTempGitRepo({ branch: 'main' })

        try {
          seedWorkspaceFixture(repo, true, releaseItMajor)
          const manifestsBefore = [
            'package.json',
            'packages/pkg-a/package.json',
            'packages/pkg-b/package.json',
          ].map(path => readFileSync(join(repo.cwd, path), 'utf8'))

          const result = runReleaseIt(repo, releaseItMajor)

          expect(result.exitCode).not.toBe(0)
          expect(
            isWorkspacesReleaseItPeerMismatch(result, releaseItMajor),
            `expected release-it ${releaseItMajor} peer mismatch:\n${releaseItOutput(result)}`,
          ).toBe(true)
          expect(
            ['package.json', 'packages/pkg-a/package.json', 'packages/pkg-b/package.json'].map(
              path => readFileSync(join(repo.cwd, path), 'utf8'),
            ),
          ).toEqual(manifestsBefore)
        } finally {
          repo.cleanup()
        }
      },
    )
  }
})
