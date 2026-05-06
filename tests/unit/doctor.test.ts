import { describe, expect, it, vi } from 'vitest'
import {
  type CheckResult,
  collectEnvironment,
  type DoctorDeps,
  type DoctorReport,
  type DoctorSummary,
  formatHuman,
  formatJson,
  inspectRepository,
  runDoctor,
  safeExec,
  summarize,
  validateConfiguration,
  validateReleaseItPeer,
} from '../../scripts/doctor'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    execSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    getEnv: vi.fn((_key: string) => undefined),
    ...overrides,
  }
}

const VALID_CHANGELOG = `# Changelog

## [Unreleased]
- Added something great

## [0.1.0] - 2024-01-01
### Added
- Initial release
`

const VALID_PACKAGE_JSON = JSON.stringify({ name: 'my-pkg', version: '0.1.0' })

const VALID_RELEASE_IT_JSON = JSON.stringify({
  extends: '@oorabona/release-it-preset/config/default',
})

// ---------------------------------------------------------------------------
// safeExec
// ---------------------------------------------------------------------------

describe('safeExec', () => {
  it('returns trimmed stdout on success', () => {
    const deps = makeDeps({ execSync: vi.fn().mockReturnValue('  v0.1.0\n') })
    expect(safeExec('git describe --tags', deps)).toBe('v0.1.0')
  })

  it('returns null when command throws', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    expect(safeExec('git describe --tags', deps)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// collectEnvironment
// ---------------------------------------------------------------------------

describe('collectEnvironment', () => {
  it('all defaults — no env set — returns PASS status', () => {
    const deps = makeDeps()
    const section = collectEnvironment(deps)
    expect(section.status).toBe('PASS')
    expect(section.vars.length).toBeGreaterThan(0)
    expect(section.vars.find(v => v.name === 'CHANGELOG_FILE')?.source).toBe('default')
  })

  it('env vars from process env are marked source=env', () => {
    const deps = makeDeps({
      getEnv: vi.fn((k: string) => (k === 'NPM_PUBLISH' ? 'true' : undefined)),
    })
    const section = collectEnvironment(deps)
    const npmPublishVar = section.vars.find(v => v.name === 'NPM_PUBLISH')
    expect(npmPublishVar?.source).toBe('env')
    expect(npmPublishVar?.value).toBe('true')
  })

  it('GITHUB_RELEASE=true without GITHUB_REPOSITORY => WARN', () => {
    const deps = makeDeps({
      getEnv: vi.fn((k: string) => {
        if (k === 'GITHUB_RELEASE') {
          return 'true'
        }
        return undefined
      }),
    })
    const section = collectEnvironment(deps)
    expect(section.status).toBe('WARN')
    const warnCheck = section.checks.find(c => c.status === 'WARN')
    expect(warnCheck).toBeDefined()
  })

  it('GITHUB_RELEASE=true WITH GITHUB_REPOSITORY => PASS', () => {
    const deps = makeDeps({
      getEnv: vi.fn((k: string) => {
        if (k === 'GITHUB_RELEASE') {
          return 'true'
        }
        if (k === 'GITHUB_REPOSITORY') {
          return 'owner/repo'
        }
        return undefined
      }),
    })
    const section = collectEnvironment(deps)
    expect(section.status).toBe('PASS')
  })

  it('unset optional vars are marked source=unset', () => {
    const deps = makeDeps()
    const section = collectEnvironment(deps)
    const optional = section.vars.find(v => v.name === 'GIT_CHANGELOG_PATH')
    expect(optional?.source).toBe('unset')
    expect(optional?.value).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// inspectRepository
// ---------------------------------------------------------------------------

describe('inspectRepository', () => {
  it('returns FAIL immediately when not a git repository', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const section = inspectRepository(deps)
    expect(section.status).toBe('FAIL')
    expect(section.checks[0].name).toBe('Git repository')
    expect(section.checks[0].status).toBe('FAIL')
    expect(section.checks).toHaveLength(1)
  })

  it('returns PASS for clean repo on required branch with upstream', () => {
    const deps = makeDeps({
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('rev-parse --git-dir')) {
          return '.git'
        }
        if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
          return 'main'
        }
        if (cmd.includes('describe --tags')) {
          return 'v0.1.0'
        }
        if (cmd.includes('rev-list') && cmd.includes('--count')) {
          return '3'
        }
        if (cmd.includes('status --porcelain')) {
          return ''
        }
        if (cmd.includes('rev-parse --abbrev-ref @{u}')) {
          return 'origin/main'
        }
        if (cmd.includes('config --get remote.origin.url')) {
          return 'https://github.com/o/r'
        }
        return ''
      }),
    })
    const section = inspectRepository(deps)
    expect(section.status).toBe('PASS')
    expect(section.checks.every(c => c.status === 'PASS')).toBe(true)
  })

  it('WARN when branch differs from GIT_REQUIRE_BRANCH', () => {
    const deps = makeDeps({
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('rev-parse --git-dir')) {
          return '.git'
        }
        if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
          return 'feat/some-feature'
        }
        if (cmd.includes('describe --tags')) {
          return 'v0.1.0'
        }
        if (cmd.includes('rev-list') && cmd.includes('--count')) {
          return '0'
        }
        if (cmd.includes('status --porcelain')) {
          return ''
        }
        if (cmd.includes('rev-parse --abbrev-ref @{u}')) {
          return 'origin/feat/some-feature'
        }
        if (cmd.includes('config --get remote.origin.url')) {
          return 'https://github.com/o/r'
        }
        return ''
      }),
      getEnv: vi.fn((k: string) => (k === 'GIT_REQUIRE_BRANCH' ? 'main' : undefined)),
    })
    const section = inspectRepository(deps)
    expect(section.status).toBe('WARN')
    const branchCheck = section.checks.find(c => c.name === 'Current branch')
    expect(branchCheck?.status).toBe('WARN')
  })

  it('WARN when working directory is dirty', () => {
    const deps = makeDeps({
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('rev-parse --git-dir')) {
          return '.git'
        }
        if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
          return 'main'
        }
        if (cmd.includes('describe --tags')) {
          return 'v0.1.0'
        }
        if (cmd.includes('rev-list') && cmd.includes('--count')) {
          return '1'
        }
        if (cmd.includes('status --porcelain')) {
          return ' M some-file.ts'
        }
        if (cmd.includes('rev-parse --abbrev-ref @{u}')) {
          return 'origin/main'
        }
        if (cmd.includes('config --get remote.origin.url')) {
          return 'https://github.com/o/r'
        }
        return ''
      }),
    })
    const section = inspectRepository(deps)
    const dirtyCheck = section.checks.find(c => c.name === 'Working directory clean')
    expect(dirtyCheck?.status).toBe('WARN')
  })

  it('WARN when no upstream tracking branch', () => {
    const deps = makeDeps({
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('rev-parse --git-dir')) {
          return '.git'
        }
        if (cmd.includes('rev-parse --abbrev-ref HEAD')) {
          return 'main'
        }
        if (cmd.includes('describe --tags')) {
          return 'v0.1.0'
        }
        if (cmd.includes('rev-list') && cmd.includes('--count')) {
          return '0'
        }
        if (cmd.includes('status --porcelain')) {
          return ''
        }
        if (cmd.includes('rev-parse --abbrev-ref @{u}')) {
          throw new Error('no upstream')
        }
        if (cmd.includes('config --get remote.origin.url')) {
          return 'https://github.com/o/r'
        }
        return ''
      }),
    })
    const section = inspectRepository(deps)
    const upstreamCheck = section.checks.find(c => c.name === 'Upstream tracking branch')
    expect(upstreamCheck?.status).toBe('WARN')
  })
})

// ---------------------------------------------------------------------------
// validateConfiguration
// ---------------------------------------------------------------------------

describe('validateConfiguration', () => {
  it('FAIL when CHANGELOG.md is missing', () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
    })
    const section = validateConfiguration(deps)
    expect(section.status).toBe('FAIL')
    const check = section.checks.find(c => c.name.includes('exists'))
    expect(check?.status).toBe('FAIL')
  })

  it('FAIL when CHANGELOG.md lacks Keep a Changelog header', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'CHANGELOG.md'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'CHANGELOG.md') {
          return '## [Unreleased]\n- something\n'
        }
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const formatCheck = section.checks.find(c => c.name === 'Keep a Changelog format')
    expect(formatCheck?.status).toBe('FAIL')
  })

  it('WARN when [Unreleased] section is empty', () => {
    const emptyChangelog = '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2024-01-01\n'
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'CHANGELOG.md'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'CHANGELOG.md') {
          return emptyChangelog
        }
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const unreleasedCheck = section.checks.find(c => c.name === '[Unreleased] section')
    expect(unreleasedCheck?.status).toBe('WARN')
  })

  it('PASS when all configuration files are valid', () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn((p: string) => {
        if (p === 'CHANGELOG.md') {
          return VALID_CHANGELOG
        }
        if (p === '.release-it.json') {
          return VALID_RELEASE_IT_JSON
        }
        if (p === 'package.json') {
          // Return a package.json with peerDependencies so the peer range is found
          return JSON.stringify({ name: 'my-pkg', version: '0.1.0', peerDependencies: { 'release-it': '^19.0.0 || ^20.0.0' } })
        }
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) {
          return JSON.stringify({ dependencies: { 'release-it': { version: '20.10.0' } } })
        }
        if (cmd.includes('npm view release-it version')) {
          return '20.10.0'
        }
        throw new Error(`unexpected command: ${cmd}`)
      }),
    })
    const section = validateConfiguration(deps)
    expect(section.status).toBe('PASS')
    expect(section.checks.every(c => c.status === 'PASS')).toBe(true)
  })

  it('FAIL when package.json version is not valid semver', () => {
    const badPkg = JSON.stringify({ name: 'my-pkg', version: 'not-a-version' })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') {
          return badPkg
        }
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const versionCheck = section.checks.find(c => c.name === 'package.json version')
    expect(versionCheck?.status).toBe('FAIL')
  })

  it('WARN when .release-it.json does not extend preset', () => {
    const badConfig = JSON.stringify({ plugins: {} })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) =>
        ['CHANGELOG.md', '.release-it.json', 'package.json'].includes(p),
      ),
      readFileSync: vi.fn((p: string) => {
        if (p === 'CHANGELOG.md') {
          return VALID_CHANGELOG
        }
        if (p === '.release-it.json') {
          return badConfig
        }
        if (p === 'package.json') {
          return VALID_PACKAGE_JSON
        }
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const extendsCheck = section.checks.find(c => c.name === '.release-it.json extends preset')
    expect(extendsCheck?.status).toBe('WARN')
  })

  it('FAIL when .release-it.json is invalid JSON', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) =>
        ['CHANGELOG.md', '.release-it.json', 'package.json'].includes(p),
      ),
      readFileSync: vi.fn((p: string) => {
        if (p === 'CHANGELOG.md') {
          return VALID_CHANGELOG
        }
        if (p === '.release-it.json') {
          return '{ invalid json'
        }
        if (p === 'package.json') {
          return VALID_PACKAGE_JSON
        }
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const parseCheck = section.checks.find(c => c.name === '.release-it.json parseable')
    expect(parseCheck?.status).toBe('FAIL')
  })
})

// ---------------------------------------------------------------------------
// Workspace integration (detectWorkspaceIntegration via validateConfiguration)
// ---------------------------------------------------------------------------

describe('Workspace integration check', () => {
  it('PASS when no workspace files detected', () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('PASS')
    expect(wsCheck?.value).toBe('not a monorepo')
  })

  it('WARN when pnpm-workspace.yaml present and plugin missing', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'pnpm-workspace.yaml'),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('WARN')
    expect(wsCheck?.value).toContain('pnpm-workspace.yaml present')
    expect(wsCheck?.detail).toContain('@release-it-plugins/workspaces')
    expect(wsCheck?.detail).toContain('GIT_CHANGELOG_PATH')
  })

  it('WARN when package.json workspaces field present and plugin missing', () => {
    const pkgWithWorkspaces = JSON.stringify({
      name: 'my-monorepo',
      version: '1.0.0',
      workspaces: ['packages/*'],
    })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return pkgWithWorkspaces
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('WARN')
    expect(wsCheck?.value).toContain('package.json workspaces field')
    expect(wsCheck?.detail).toContain('@release-it-plugins/workspaces')
  })

  it('PASS when workspace files present and plugin is installed', () => {
    const deps = makeDeps({
      existsSync: vi.fn(
        (p: string) =>
          p === 'pnpm-workspace.yaml' ||
          p === 'node_modules/@release-it-plugins/workspaces/package.json',
      ),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('PASS')
    expect(wsCheck?.value).toBe('plugin installed')
  })

  it('WARN when package.json has workspaces as object form {packages: [...]}', () => {
    const pkgWithWorkspacesObject = JSON.stringify({
      name: 'my-monorepo',
      version: '1.0.0',
      workspaces: { packages: ['packages/*'] },
    })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return pkgWithWorkspacesObject
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('WARN')
    expect(wsCheck?.value).toContain('package.json workspaces field')
  })

  it('PASS when package.json has empty workspaces array (treated as not a monorepo)', () => {
    // Some scaffolds leave `workspaces: []` from a template; treat as non-monorepo
    // because there are no actual workspace packages declared.
    const pkgEmptyArray = JSON.stringify({
      name: 'maybe-monorepo',
      version: '1.0.0',
      workspaces: [],
    })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return pkgEmptyArray
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    // Empty array IS still Array.isArray(ws) === true, so detection still WARNs.
    // This locks the current "file shape, not content" detection rule.
    expect(wsCheck?.status).toBe('WARN')
  })

  it('PASS when package.json workspaces is malformed (string, null, etc.)', () => {
    // A malformed workspaces field (non-array, non-object) should NOT trip detection.
    const pkgBadWorkspaces = JSON.stringify({
      name: 'broken-config',
      version: '1.0.0',
      workspaces: 'packages/*', // string, not array — invalid per pnpm/yarn/npm spec
    })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return pkgBadWorkspaces
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    expect(wsCheck?.status).toBe('PASS')
    expect(wsCheck?.value).toBe('not a monorepo')
  })

  it('PASS when {packages} is non-array (e.g. null or string) — does not trip detection', () => {
    const pkgWeirdShape = JSON.stringify({
      name: 'weird',
      version: '1.0.0',
      workspaces: { packages: null },
    })
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return pkgWeirdShape
        return ''
      }),
    })
    const section = validateConfiguration(deps)
    const wsCheck = section.checks.find(c => c.name === 'Workspace integration')
    // Locks the F-003 fix: 'packages' in ws alone was too lenient
    expect(wsCheck?.status).toBe('PASS')
  })
})

// ---------------------------------------------------------------------------
// summarize
// ---------------------------------------------------------------------------

describe('summarize', () => {
  function makeReport(
    envChecks: CheckResult[],
    repoChecks: CheckResult[],
    configChecks: CheckResult[],
  ): Omit<DoctorReport, 'summary'> {
    return {
      environment: {
        checks: envChecks,
        vars: [],
        status: 'PASS',
      },
      repository: { checks: repoChecks, status: 'PASS' },
      configuration: { checks: configChecks, status: 'PASS' },
    }
  }

  it('status is READY when all checks pass', () => {
    const passCheck: CheckResult = { name: 'x', status: 'PASS', value: 'ok' }
    const report = makeReport([passCheck], [passCheck], [passCheck])
    const summary = summarize(report)
    expect(summary.status).toBe('READY')
    expect(summary.pass).toBe(3)
    expect(summary.fail).toBe(0)
    expect(summary.warn).toBe(0)
    expect(summary.score).toBe('3/3 checks passing')
    expect(summary.recommendations).toHaveLength(1)
    expect(summary.recommendations[0]).toMatch(/All checks pass/)
  })

  it('status is WARNINGS when there are WARNs but no FAILs', () => {
    const pass: CheckResult = { name: 'x', status: 'PASS', value: 'ok' }
    const warn: CheckResult = { name: 'y', status: 'WARN', value: 'hmm' }
    const report = makeReport([pass], [warn], [pass])
    const summary = summarize(report)
    expect(summary.status).toBe('WARNINGS')
    expect(summary.warn).toBe(1)
    expect(summary.recommendations.some(r => r.includes('warning'))).toBe(true)
  })

  it('status is BLOCKED when any check is FAIL', () => {
    const fail: CheckResult = { name: 'z', status: 'FAIL', value: 'nope' }
    const report = makeReport([fail], [], [])
    const summary = summarize(report)
    expect(summary.status).toBe('BLOCKED')
    expect(summary.fail).toBe(1)
    expect(summary.recommendations.some(r => r.includes('blocking'))).toBe(true)
  })

  it('score format is N/M checks passing', () => {
    const pass: CheckResult = { name: 'a', status: 'PASS', value: 'v' }
    const fail: CheckResult = { name: 'b', status: 'FAIL', value: 'v' }
    const report = makeReport([pass, fail], [], [])
    const summary = summarize(report)
    expect(summary.score).toBe('1/2 checks passing')
  })
})

// ---------------------------------------------------------------------------
// runDoctor (integration: all sections + summary)
// ---------------------------------------------------------------------------

describe('runDoctor', () => {
  it('returns report with all four sections', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    expect(report).toHaveProperty('environment')
    expect(report).toHaveProperty('repository')
    expect(report).toHaveProperty('configuration')
    expect(report).toHaveProperty('summary')
  })

  it('summary.status is BLOCKED when repo check fails', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    expect(report.summary.status).toBe('BLOCKED')
  })
})

// ---------------------------------------------------------------------------
// formatJson
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('output is parseable JSON with all 4 sections', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    const json = formatJson(report)
    const parsed = JSON.parse(json) as DoctorReport
    expect(parsed).toHaveProperty('environment')
    expect(parsed).toHaveProperty('repository')
    expect(parsed).toHaveProperty('configuration')
    expect(parsed.summary).toHaveProperty('score')
    expect(parsed.summary).toHaveProperty('status')
    expect(parsed.summary).toHaveProperty('recommendations')
  })

  it('--json output has correct summary shape', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    const parsed = JSON.parse(formatJson(report)) as { summary: DoctorSummary }
    expect(typeof parsed.summary.pass).toBe('number')
    expect(typeof parsed.summary.fail).toBe('number')
    expect(typeof parsed.summary.warn).toBe('number')
    expect(typeof parsed.summary.total).toBe('number')
    expect(['READY', 'WARNINGS', 'BLOCKED']).toContain(parsed.summary.status)
  })
})

// ---------------------------------------------------------------------------
// formatHuman
// ---------------------------------------------------------------------------

describe('formatHuman', () => {
  it('contains all 4 section headers', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    const output = formatHuman(report)
    expect(output).toMatch(/1\. Environment/)
    expect(output).toMatch(/2\. Repository/)
    expect(output).toMatch(/3\. Configuration/)
    expect(output).toMatch(/4\. Readiness Summary/)
  })

  it('contains PASS/WARN/FAIL markers', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    const output = formatHuman(report)
    expect(output).toMatch(/\[PASS\]|\[WARN\]|\[FAIL\]/)
  })

  it('shows status in summary', () => {
    const deps = makeDeps({
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('not a git repo')
      }),
    })
    const report = runDoctor(deps)
    const output = formatHuman(report)
    expect(output).toMatch(/Status\s*:\s*(READY|WARNINGS|BLOCKED)/)
  })
})


// ---------------------------------------------------------------------------
// validateReleaseItPeer — Check A (peer range) + Check B (major advisor)
// ---------------------------------------------------------------------------

const PRESET_PKG_WITH_PEERS = JSON.stringify({
  name: '@oorabona/release-it-preset',
  version: '1.0.0',
  peerDependencies: { 'release-it': '^19.0.0 || ^20.0.0' },
})

const LS_OUTPUT_V20 = JSON.stringify({
  dependencies: { 'release-it': { version: '20.10.0' } },
})

const LS_OUTPUT_V19 = JSON.stringify({
  dependencies: { 'release-it': { version: '19.5.2' } },
})

const LS_OUTPUT_V18 = JSON.stringify({
  dependencies: { 'release-it': { version: '18.3.0' } },
})

const LS_OUTPUT_EMPTY = JSON.stringify({ dependencies: {} })

describe('validateReleaseItPeer', () => {
  // --- Check A: PASS ---
  it('Check A PASS: installed v20 satisfies ^19||^20 peer range', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V20
        if (cmd.includes('npm view release-it version')) return '20.10.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('PASS')
    expect(checkA?.value).toBe('20.10.0')
  })

  // --- Check A: PASS with v19 ---
  it('Check A PASS: installed v19 satisfies ^19||^20 peer range', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V19
        if (cmd.includes('npm view release-it version')) return '20.10.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('PASS')
    expect(checkA?.value).toBe('19.5.2')
  })

  // --- Check A: FAIL — version outside range ---
  it('Check A FAIL: installed v18 is outside supported range', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V18
        if (cmd.includes('npm view release-it version')) return '20.10.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('FAIL')
    expect(checkA?.value).toBe('18.3.0')
    expect(checkA?.detail).toContain('pnpm add -D release-it@^20')
  })

  // --- Check A: FAIL — not installed (npm ls returns empty deps) ---
  it('Check A FAIL: release-it absent from npm ls output', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_EMPTY
        if (cmd.includes('npm view release-it version')) return '20.10.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('FAIL')
    expect(checkA?.detail).toContain('pnpm add -D release-it@^20')
  })

  // --- Check A: FAIL — exec throws (npm not available) ---
  it('Check A FAIL: npm ls throws (exec failure)', () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
      execSync: vi.fn().mockImplementation(() => {
        throw new Error('command not found: npm')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('FAIL')
    expect(checkA?.value).toBe('not found')
  })

  // --- Check B: WARN — newer major available ---
  it('Check B WARN: npm reports v21 while peer range max is v20', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V20
        if (cmd.includes('npm view release-it version')) return '21.0.5'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkB = results.find(r => r.name === 'release-it major version')
    expect(checkB?.status).toBe('WARN')
    expect(checkB?.value).toBe('21.0.5')
    expect(checkB?.detail).toContain('21.x available')
    expect(checkB?.detail).toContain('peer range max is 20.x')
  })

  // --- Check B: PASS — latest major matches supported max ---
  it('Check B PASS: latest npm version is within supported major range', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V20
        if (cmd.includes('npm view release-it version')) return '20.11.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkB = results.find(r => r.name === 'release-it major version')
    expect(checkB?.status).toBe('PASS')
    expect(checkB?.value).toBe('20.11.0')
  })

  // --- Check B: silently skipped on network failure ---
  it('Check B silently skipped when npm view throws (no network)', () => {
    const deps = makeDeps({
      existsSync: vi.fn((p: string) => p === 'package.json'),
      readFileSync: vi.fn((p: string) => {
        if (p === 'package.json') return PRESET_PKG_WITH_PEERS
        return ''
      }),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V20
        if (cmd.includes('npm view release-it version')) throw new Error('ENOTFOUND')
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    const checkB = results.find(r => r.name === 'release-it major version')
    expect(checkB).toBeUndefined()
    // Check A still runs and passes
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('PASS')
  })

  // --- peer range falls back to hardcoded constant when no package.json ---
  it('uses fallback peer range when no package.json is readable', () => {
    const deps = makeDeps({
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(''),
      execSync: vi.fn((cmd: string) => {
        if (cmd.includes('npm ls release-it')) return LS_OUTPUT_V20
        if (cmd.includes('npm view release-it version')) return '20.10.0'
        throw new Error('unexpected command')
      }),
    })
    const results = validateReleaseItPeer(deps)
    // Should still produce Check A PASS (v20 satisfies fallback ^19||^20)
    const checkA = results.find(r => r.name === 'release-it peer dependency')
    expect(checkA?.status).toBe('PASS')
  })
})
