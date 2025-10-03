import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createDefaultDeps,
  evaluateChangelogStatus,
  hasConventionalCommits,
  hasSkipChangelog,
  normalizeBaseRef,
  type PrCheckDeps,
  parseArgs,
  renderSummary,
  runPrCheck,
  safeExec,
  splitList,
  writeOutputs,
} from '../../scripts/check-pr-status'

describe('check-pr-status utilities', () => {
  it('normalizes base refs with origin prefix', () => {
    expect(normalizeBaseRef('main')).toBe('origin/main')
    expect(normalizeBaseRef('origin/dev')).toBe('origin/dev')
    expect(normalizeBaseRef('refs/heads/feature')).toBe('refs/heads/feature')
    expect(normalizeBaseRef(undefined)).toBeNull()
  })

  it('parses command line arguments', () => {
    const result = parseArgs(['--base', 'develop', '--head', 'feature'])
    expect(result).toEqual({ base: 'develop', head: 'feature' })
  })

  it('splits list strings into trimmed entries', () => {
    expect(splitList('foo\nbar\n')).toEqual(['foo', 'bar'])
    expect(splitList(null)).toEqual([])
  })

  it('detects skip changelog markers', () => {
    expect(hasSkipChangelog(['feat: add', 'chore: test'])).toBe(false)
    expect(hasSkipChangelog(['fix: bug [skip-changelog]'])).toBe(true)
  })

  it('detects conventional commits', () => {
    expect(hasConventionalCommits(['feat: add feature'])).toBe(true)
    expect(hasConventionalCommits(['docs(scope): update docs'])).toBe(true)
    expect(hasConventionalCommits(['update readme'])).toBe(false)
  })

  it('evaluates changelog status correctly', () => {
    const updated = evaluateChangelogStatus(['CHANGELOG.md'], 'CHANGELOG.md', [])
    expect(updated).toEqual({ status: 'updated', skipMarker: false })

    const skipped = evaluateChangelogStatus([], 'CHANGELOG.md', ['chore: task [skip-changelog]'])
    expect(skipped).toEqual({ status: 'skipped', skipMarker: true })

    const missing = evaluateChangelogStatus([], 'CHANGELOG.md', [])
    expect(missing).toEqual({ status: 'missing', skipMarker: false })
  })

  it('falls back to default changelog filename when blank', () => {
    const result = evaluateChangelogStatus(['CHANGELOG.md'], '', [])
    expect(result.status).toBe('updated')
  })

  it('wraps exec errors and returns null', () => {
    const deps: PrCheckDeps = {
      execSync: () => {
        throw new Error('failure')
      },
      getEnv: vi.fn(),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = safeExec('git status', deps)
    expect(result).toBeNull()
    expect(deps.warn).toHaveBeenCalled()
  })

  it('stringifies non-error failures', () => {
    const deps: PrCheckDeps = {
      execSync: () => {
        // eslint-disable-next-line no-throw-literal
        throw 'failure'
      },
      getEnv: vi.fn(),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }

    safeExec('git status', deps)

    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('failure'))
  })

  it('runs PR check with provided dependencies', () => {
    const exec = vi.fn<(command: string) => string>(command => {
      if (command.startsWith('git diff')) {
        return 'CHANGELOG.md\nsrc/index.ts'
      }
      if (command.startsWith('git log')) {
        return 'feat: add feature\nchore: maintenance'
      }
      return ''
    })

    const deps: PrCheckDeps = {
      execSync: exec,
      getEnv: vi.fn((key: string) => {
        if (key === 'CHANGELOG_FILE') {
          return 'CHANGELOG.md'
        }
        return undefined
      }),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = runPrCheck({ base: 'develop', head: 'HEAD' }, deps)

    expect(result.baseRef).toBe('origin/develop')
    expect(result.changelogStatus).toBe('updated')
    expect(result.hasConventionalCommits).toBe(true)
    expect(result.commits).toHaveLength(2)
  })

  it('uses environment fallbacks when args are absent', () => {
    const commands: string[] = []
    const exec = vi.fn<(command: string) => string>(command => {
      commands.push(command)
      if (command.startsWith('git diff')) {
        return 'docs/README.md'
      }
      if (command.startsWith('git log')) {
        return 'docs: update documentation'
      }
      return ''
    })

    const deps: PrCheckDeps = {
      execSync: exec,
      getEnv: vi.fn((key: string) => {
        if (key === 'PR_BASE_REF' || key === 'GITHUB_BASE_REF') {
          return undefined
        }
        if (key === 'PR_HEAD_REF' || key === 'GITHUB_HEAD_REF') {
          return 'feature-branch'
        }
        return undefined
      }),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = runPrCheck({}, deps)

    expect(result.baseRef).toBeNull()
    expect(result.headRef).toBe('feature-branch')
    expect(commands).toContain('git diff --name-only feature-branch')
    expect(commands).toContain('git log feature-branch --pretty=format:%s')
    expect(result.changelogStatus).toBe('missing')
    expect(result.hasConventionalCommits).toBe(true)
  })

  it('prefers environment refs when args undefined and normalizes blanks', () => {
    const commands: string[] = []
    const exec = vi.fn<(command: string) => string>(command => {
      commands.push(command)
      if (command.startsWith('git diff')) {
        throw new Error('diff failed')
      }
      if (command.startsWith('git log')) {
        throw 'log failed'
      }
      return ''
    })

    const warn = vi.fn()
    const deps: PrCheckDeps = {
      execSync: exec,
      getEnv: vi.fn((key: string) => {
        if (key === 'PR_BASE_REF') {
          return 'release'
        }
        if (key === 'PR_HEAD_REF') {
          return undefined
        }
        if (key === 'GITHUB_HEAD_REF') {
          return '   '
        }
        return undefined
      }),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn,
    }

    const result = runPrCheck({}, deps)

    expect(result.baseRef).toBe('origin/release')
    expect(result.headRef).toBe('HEAD')
    expect(commands).toContain('git diff --name-only origin/release..HEAD')
    expect(commands).toContain('git log origin/release..HEAD --pretty=format:%s')
    expect(result.changedFiles).toEqual([])
    expect(result.commits).toEqual([])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls[0][0]).toContain('diff failed')
    expect(warn.mock.calls[1][0]).toContain('log failed')
  })

  it('defaults to HEAD when env head is missing', () => {
    const commands: string[] = []
    const exec = vi.fn<(command: string) => string>(command => {
      commands.push(command)
      if (command.startsWith('git diff')) {
        return 'file.txt'
      }
      if (command.startsWith('git log')) {
        return ''
      }
      return ''
    })

    const deps: PrCheckDeps = {
      execSync: exec,
      getEnv: vi.fn(() => undefined),
      writeOutput: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = runPrCheck({}, deps)

    expect(result.baseRef).toBeNull()
    expect(result.headRef).toBe('HEAD')
    expect(commands).toContain('git diff --name-only HEAD')
    expect(commands).toContain('git log HEAD --pretty=format:%s')
  })

  it('writes outputs in encoded format', () => {
    const outputs: Record<string, string> = {}
    const deps: PrCheckDeps = {
      execSync: vi.fn(),
      getEnv: vi.fn(),
      writeOutput: (key, value) => {
        outputs[key] = value
      },
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = {
      baseRef: 'origin/main',
      headRef: 'HEAD',
      changedFiles: ['CHANGELOG.md'],
      commits: ['feat: update CHANGELOG'],
      changelogStatus: 'updated' as const,
      skipChangelogMarker: false,
      hasConventionalCommits: true,
    }

    writeOutputs(result, deps)

    expect(outputs.changelog_status).toBe('updated')
    expect(outputs.skip_changelog).toBe('false')
    expect(outputs.conventional_commits).toBe('true')

    const decodedCommits = JSON.parse(
      Buffer.from(outputs.commit_messages, 'base64').toString('utf8'),
    )
    expect(decodedCommits).toEqual(result.commits)

    const decodedFiles = JSON.parse(Buffer.from(outputs.changed_files, 'base64').toString('utf8'))
    expect(decodedFiles).toEqual(result.changedFiles)
  })

  it('writes empty base ref output when base ref is missing', () => {
    const outputs: Record<string, string> = {}
    const deps: PrCheckDeps = {
      execSync: vi.fn(),
      getEnv: vi.fn(),
      writeOutput: (key, value) => {
        outputs[key] = value
      },
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = {
      baseRef: null,
      headRef: 'feature-branch',
      changedFiles: [],
      commits: [],
      changelogStatus: 'missing' as const,
      skipChangelogMarker: false,
      hasConventionalCommits: false,
    }

    writeOutputs(result, deps)

    expect(outputs.base_ref).toBe('')
    expect(outputs.head_ref).toBe('feature-branch')
  })

  it('writes skip flag when changelog marker present', () => {
    const outputs: Record<string, string> = {}
    const deps: PrCheckDeps = {
      execSync: vi.fn(),
      getEnv: vi.fn(),
      writeOutput: (key, value) => {
        outputs[key] = value
      },
      log: vi.fn(),
      warn: vi.fn(),
    }

    const result = {
      baseRef: 'origin/main' as const,
      headRef: 'HEAD',
      changedFiles: [],
      commits: ['chore: something [skip-changelog]'],
      changelogStatus: 'skipped' as const,
      skipChangelogMarker: true,
      hasConventionalCommits: false,
    }

    writeOutputs(result, deps)

    expect(outputs.skip_changelog).toBe('true')
  })

  it('renders summary for different changelog states', () => {
    const logs: string[] = []
    const deps: PrCheckDeps = {
      execSync: vi.fn(),
      getEnv: vi.fn(),
      writeOutput: vi.fn(),
      log: (message: string) => {
        logs.push(message)
      },
      warn: vi.fn(),
    }

    renderSummary(
      {
        baseRef: 'origin/main',
        headRef: 'feature',
        changedFiles: [],
        commits: ['feat: add feature'],
        changelogStatus: 'updated',
        skipChangelogMarker: false,
        hasConventionalCommits: true,
      },
      deps,
    )

    renderSummary(
      {
        baseRef: null,
        headRef: 'feature',
        changedFiles: [],
        commits: ['chore: maintenance'],
        changelogStatus: 'skipped',
        skipChangelogMarker: true,
        hasConventionalCommits: false,
      },
      deps,
    )

    renderSummary(
      {
        baseRef: null,
        headRef: 'feature',
        changedFiles: [],
        commits: [],
        changelogStatus: 'missing',
        skipChangelogMarker: false,
        hasConventionalCommits: false,
      },
      deps,
    )

    expect(logs.some(line => line.includes('CHANGELOG: updated'))).toBe(true)
    expect(logs.some(line => line.includes('CHANGELOG: skipped'))).toBe(true)
    expect(logs.some(line => line.includes('CHANGELOG: no updates'))).toBe(true)
  })

  it('respects GITHUB_OUTPUT behavior when writing outputs', () => {
    const original = process.env.GITHUB_OUTPUT
    const tempDir = mkdtempSync(join(tmpdir(), 'pr-status-'))
    const outputFile = join(tempDir, 'github-output.txt')

    try {
      delete process.env.GITHUB_OUTPUT

      const depsWithoutFile = createDefaultDeps()
      depsWithoutFile.writeOutput('foo', 'bar')
      expect(existsSync(outputFile)).toBe(false)

      process.env.GITHUB_OUTPUT = outputFile

      const depsWithFile = createDefaultDeps()
      depsWithFile.writeOutput('foo', 'bar')
      expect(depsWithFile.getEnv('NON_EXISTENT_ENV')).toBeUndefined()

      expect(readFileSync(outputFile, 'utf8')).toBe('foo=bar\n')
    } finally {
      if (existsSync(outputFile)) {
        rmSync(outputFile)
      }
      rmSync(tempDir, { recursive: true, force: true })
      if (original === undefined) {
        delete process.env.GITHUB_OUTPUT
      } else {
        process.env.GITHUB_OUTPUT = original
      }
    }
  })
})
