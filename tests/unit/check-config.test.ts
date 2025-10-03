import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type CheckConfigDeps,
  checkConfig,
  displayCommitsSinceLastTag,
  displayConfigurationFiles,
  displayEnvironmentVariables,
  displayNpmStatus,
  displayRepositoryInfo,
  displayVersionAndTags,
  getCommitCount,
  getCurrentBranch,
  getEnvironmentVariables,
  getEnvVar,
  getFilesStatus,
  getLatestTag,
  getNpmUsername,
  safeExec,
} from '../../scripts/check-config'
import { getGitHubRepoUrl } from '../../scripts/lib/git-utils'

describe('check-config (improved with atomic functions)', () => {
  let deps: CheckConfigDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
      log: vi.fn(),
    }
  })

  describe('safeExec', () => {
    it('should return command output on success', () => {
      vi.mocked(deps.execSync).mockReturnValue('output value')

      const result = safeExec('test command', deps)

      expect(result).toBe('output value')
    })

    it('should return null on error', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('command failed')
      })

      const result = safeExec('test command', deps)

      expect(result).toBeNull()
    })

    it('should trim output', () => {
      vi.mocked(deps.execSync).mockReturnValue('  value with spaces  \n')

      const result = safeExec('test command', deps)

      expect(result).toBe('value with spaces')
    })
  })

  describe('getGitHubRepoUrl', () => {
    it('should return URL from GITHUB_REPOSITORY env var', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GITHUB_REPOSITORY' ? 'owner/repo' : undefined,
      )

      const result = getGitHubRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
      expect(deps.execSync).not.toHaveBeenCalled()
    })

    it('should get URL from git remote when GITHUB_REPOSITORY not set', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GIT_REMOTE' ? 'origin' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('git@github.com:owner/repo.git\n')

      const result = getGitHubRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
      expect(deps.execSync).toHaveBeenCalledWith(
        'git config --get remote.origin.url',
        expect.any(Object),
      )
    })

    it('should use custom GIT_REMOTE from env', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GIT_REMOTE' ? 'upstream' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      getGitHubRepoUrl(deps)

      expect(deps.execSync).toHaveBeenCalledWith(
        'git config --get remote.upstream.url',
        expect.any(Object),
      )
    })

    it('should return null when git command fails', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = getGitHubRepoUrl(deps)

      expect(result).toBe('')
    })
  })

  describe('getEnvVar', () => {
    it('should return env value with "(from env)" suffix', () => {
      vi.mocked(deps.getEnv).mockReturnValue('custom-value')

      const result = getEnvVar('TEST_VAR', deps, 'default')

      expect(result).toBe('custom-value (from env)')
    })

    it('should return default value with "(default)" suffix', () => {
      const result = getEnvVar('TEST_VAR', deps, 'default-value')

      expect(result).toBe('default-value (default)')
    })

    it('should return "(not set)" when no value and no default', () => {
      const result = getEnvVar('TEST_VAR', deps)

      expect(result).toBe('(not set)')
    })
  })

  describe('getCurrentBranch', () => {
    it('should return current branch name', () => {
      vi.mocked(deps.execSync).mockReturnValue('main')

      const result = getCurrentBranch(deps)

      expect(result).toBe('main')
      expect(deps.execSync).toHaveBeenCalledWith(
        'git rev-parse --abbrev-ref HEAD',
        expect.any(Object),
      )
    })

    it('should return null on error', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = getCurrentBranch(deps)

      expect(result).toBeNull()
    })
  })

  describe('getLatestTag', () => {
    it('should return latest tag', () => {
      vi.mocked(deps.execSync).mockReturnValue('v1.2.3')

      const result = getLatestTag(deps)

      expect(result).toBe('v1.2.3')
      expect(deps.execSync).toHaveBeenCalledWith(
        'git describe --tags --abbrev=0',
        expect.any(Object),
      )
    })

    it('should return null when no tags exist', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('No tags found')
      })

      const result = getLatestTag(deps)

      expect(result).toBeNull()
    })
  })

  describe('getCommitCount', () => {
    it('should count commits since tag', () => {
      vi.mocked(deps.execSync).mockReturnValue('abc123\ndef456\nghi789')

      const result = getCommitCount(deps, 'v1.0.0')

      expect(result).toBe(3)
      expect(deps.execSync).toHaveBeenCalledWith(
        'git log --pretty=format:"%h" v1.0.0..HEAD',
        expect.any(Object),
      )
    })

    it('should count all commits when no tag provided', () => {
      vi.mocked(deps.execSync).mockReturnValue('abc123\ndef456')

      const result = getCommitCount(deps, null)

      expect(result).toBe(2)
      expect(deps.execSync).toHaveBeenCalledWith('git log --pretty=format:"%h"', expect.any(Object))
    })

    it('should return 0 when no commits', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('no commits')
      })

      const result = getCommitCount(deps, 'v1.0.0')

      expect(result).toBe(0)
    })

    it('should handle empty string from git', () => {
      vi.mocked(deps.execSync).mockReturnValue('')

      const result = getCommitCount(deps, 'v1.0.0')

      expect(result).toBe(0)
    })
  })

  describe('getFilesStatus', () => {
    it('should return status of all required files', () => {
      vi.mocked(deps.existsSync).mockImplementation(path => {
        if (path === 'CHANGELOG.md') {
          return true
        }
        if (path === '.release-it.json') {
          return false
        }
        if (path === 'package.json') {
          return true
        }
        if (path === '.git') {
          return true
        }
        return false
      })

      const result = getFilesStatus(deps)

      expect(result).toEqual({
        'CHANGELOG.md': true,
        '.release-it.json': false,
        'package.json': true,
        '.git': true,
      })
    })

    it('should return all false when no files exist', () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = getFilesStatus(deps)

      expect(result).toEqual({
        'CHANGELOG.md': false,
        '.release-it.json': false,
        'package.json': false,
        '.git': false,
      })
    })
  })

  describe('getNpmUsername', () => {
    it('should return npm username', () => {
      vi.mocked(deps.execSync).mockReturnValue('johndoe')

      const result = getNpmUsername(deps)

      expect(result).toBe('johndoe')
      expect(deps.execSync).toHaveBeenCalledWith('npm whoami', expect.any(Object))
    })

    it('should return null when not logged in', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('Not logged in')
      })

      const result = getNpmUsername(deps)

      expect(result).toBeNull()
    })
  })

  describe('getEnvironmentVariables', () => {
    it('should return all environment variables with defaults', () => {
      const result = getEnvironmentVariables(deps)

      expect(result).toHaveProperty('CHANGELOG_FILE')
      expect(result).toHaveProperty('GIT_COMMIT_MESSAGE')
      expect(result).toHaveProperty('GIT_TAG_NAME')
      expect(result).toHaveProperty('GIT_REQUIRE_BRANCH')
      expect(result).toHaveProperty('NPM_PUBLISH')
      expect(result.CHANGELOG_FILE).toContain('CHANGELOG.md')
      expect(result.CHANGELOG_FILE).toContain('(default)')
    })

    it('should use env values when set', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) => {
        if (key === 'CHANGELOG_FILE') {
          return 'HISTORY.md'
        }
        if (key === 'NPM_PUBLISH') {
          return 'false'
        }
        return undefined
      })

      const result = getEnvironmentVariables(deps)

      expect(result.CHANGELOG_FILE).toBe('HISTORY.md (from env)')
      expect(result.NPM_PUBLISH).toBe('false (from env)')
      expect(result.GIT_REQUIRE_BRANCH).toContain('(default)')
    })

    it('should handle env vars without defaults', () => {
      const result = getEnvironmentVariables(deps)

      expect(result.GITHUB_REPOSITORY).toBe('(not set)')
    })
  })

  describe('checkConfig', () => {
    it('should return config result with all fields', () => {
      vi.mocked(deps.execSync).mockImplementation((cmd: string) => {
        if (cmd.includes('rev-parse')) {
          return 'main'
        }
        if (cmd.includes('describe')) {
          return 'v1.0.0'
        }
        if (cmd.includes('log')) {
          return 'abc123\ndef456'
        }
        if (cmd === 'npm whoami') {
          return 'johndoe'
        }
        return ''
      })
      vi.mocked(deps.existsSync).mockReturnValue(true)

      const result = checkConfig(deps)

      expect(result).toHaveProperty('envVars')
      expect(result).toHaveProperty('repoUrl')
      expect(result).toHaveProperty('currentBranch', 'main')
      expect(result).toHaveProperty('latestTag', 'v1.0.0')
      expect(result).toHaveProperty('commitCount', 2)
      expect(result).toHaveProperty('filesStatus')
      expect(result).toHaveProperty('npmUsername', 'johndoe')
    })

    it('should handle all null values gracefully', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git not available')
      })
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = checkConfig(deps)

      expect(result.repoUrl).toBeNull()
      expect(result.currentBranch).toBeNull()
      expect(result.latestTag).toBeNull()
      expect(result.commitCount).toBe(0)
      expect(result.npmUsername).toBeNull()
      expect(result.filesStatus).toEqual({
        'CHANGELOG.md': false,
        '.release-it.json': false,
        'package.json': false,
        '.git': false,
      })
    })
  })

  describe('display helpers', () => {
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      logSpy.mockRestore()
    })

    it('should render environment variables table', () => {
      displayEnvironmentVariables({ FOO: 'bar', BAZ: 'qux' })

      const messages = logSpy.mock.calls.map(args => args[0])
      expect(messages.join('\n')).toContain('FOO')
      expect(messages.join('\n')).toContain('bar')
    })

    it('should render repository information with remote and clean status', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git config --get')) {
            return 'https://github.com/owner/repo.git'
          }
          if (command.includes('@{u}')) {
            return 'origin/main'
          }
          if (command.startsWith('git status')) {
            return ''
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn((key: string) => (key === 'GIT_REMOTE' ? 'origin' : undefined)),
        log: vi.fn(),
      }

      displayRepositoryInfo(localDeps, 'https://github.com/owner/repo', 'main')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Repository URL: https://github.com/owner/repo')
      expect(output).toContain('Upstream: origin/main')
      expect(output).toContain('Working directory: ✅ Clean')
    })

    it('should render repository fallbacks when data missing', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git status')) {
            return 'M file1\nA file2'
          }
          throw new Error('no data')
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(() => undefined),
        log: vi.fn(),
      }

      displayRepositoryInfo(localDeps, null, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Repository URL: ❌ Could not determine')
      expect(output).toContain('Upstream: ❌ No upstream configured')
      expect(output).toContain('⚠️  2 uncommitted change(s)')
    })

    it('should render version and tags information', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git tag')) {
            return 'v1.2.0\nv1.1.0\nv1.0.0'
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => true) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '{"version":"1.3.0"}') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayVersionAndTags(localDeps, 'v1.2.0')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Current version (package.json): 1.3.0')
      expect(output).toContain('Latest git tag: v1.2.0')
      expect(output).toContain('Recent tags (last 5)')
    })

    it('should handle missing package.json or invalid data', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation(() => {
          throw new Error('no tags')
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => true) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '{') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayVersionAndTags(localDeps, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Current version: ❌ Failed to read package.json')
      expect(output).toContain('Latest git tag: ❌ No tags found')
    })

    it('should show fallback when package.json lacks a version', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation(() => '') as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => true) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '{}') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayVersionAndTags(localDeps, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Current version (package.json): ❌ Not set')
    })

    it('should report when package.json is missing', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation(() => {
          throw new Error('no tags')
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: ((path: unknown) => path !== 'package.json') as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayVersionAndTags(localDeps, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Current version: ❌ package.json not found')
    })

    it('should list extra tags when more than five exist', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git tag')) {
            return ['v6.0.0', 'v5.0.0', 'v4.0.0', 'v3.0.0', 'v2.0.0', 'v1.0.0', 'v0.1.0'].join('\n')
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: ((path: unknown) => path === 'package.json') as CheckConfigDeps['existsSync'],
        readFileSync: (() => '{"version":"6.1.0"}') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayVersionAndTags(localDeps, 'v6.0.0')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Recent tags (last 5)')
      expect(output).toContain('... and 2 more')
    })

    it('should render commits since last tag', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git log')) {
            return 'abc123 feat: add feature\ndef456 fix: bug'
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayCommitsSinceLastTag(localDeps, 'v1.0.0')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Range: v1.0.0..HEAD')
      expect(output).toContain('Total commits: 2')
      expect(output).toContain('abc123 feat: add feature')
    })

    it('should limit commit list to ten entries and mention remaining count', () => {
      const commits = Array.from(
        { length: 12 },
        (_value, index) => `sha${index} message ${index}`,
      ).join('\n')

      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('git log')) {
            return commits
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayCommitsSinceLastTag(localDeps, 'v1.0.0')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('Last 10 commit(s):')
      expect(output).toContain('... and 2 more')
    })

    it('should handle repositories without tags or commits', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation(() => {
          throw new Error('no commits')
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayCommitsSinceLastTag(localDeps, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('No tags found, showing all commits')
      expect(output).toContain('✨ No commits since repository creation')
    })

    it('should render configuration files status including custom changelog', () => {
      const exists = ((path: unknown) =>
        typeof path === 'string' &&
        (path === 'HISTORY.md' ||
          path === 'CHANGELOG.md')) as unknown as CheckConfigDeps['existsSync']

      const localDeps: CheckConfigDeps = {
        execSync: (() => '') as unknown as CheckConfigDeps['execSync'],
        existsSync: exists,
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn((key: string) => (key === 'CHANGELOG_FILE' ? 'HISTORY.md' : undefined)),
        log: vi.fn(),
      }

      displayConfigurationFiles(localDeps, {
        'CHANGELOG.md': true,
        '.release-it.json': false,
        'package.json': true,
        '.git': true,
      })

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('✅ Changelog')
      expect(output).toContain('❌ Release-it config')
      expect(output).toContain('Custom changelog')
    })

    it('should skip custom changelog note when using default path', () => {
      const localDeps: CheckConfigDeps = {
        execSync: (() => '') as unknown as CheckConfigDeps['execSync'],
        existsSync: ((path: unknown) => path === 'CHANGELOG.md') as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(() => undefined),
        log: vi.fn(),
      }

      displayConfigurationFiles(localDeps, {
        'CHANGELOG.md': true,
        '.release-it.json': false,
        'package.json': true,
        '.git': true,
      })

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).not.toContain('Custom changelog')
    })

    it('should render npm status with registry info', () => {
      const execMock = vi
        .fn<(command: string, options?: unknown) => string>(() => '')
        .mockImplementation((command: string) => {
          if (command.startsWith('npm config get registry')) {
            return 'https://registry.npmjs.org/'
          }
          return ''
        }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayNpmStatus(localDeps, 'jane')

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('✅ Logged in as: jane')
      expect(output).toContain('Registry: https://registry.npmjs.org/')
    })

    it('should render npm status fallback when not logged in', () => {
      const execMock = vi.fn<(command: string, options?: unknown) => string>(() => {
        throw new Error('no registry')
      }) as unknown as CheckConfigDeps['execSync']

      const localDeps: CheckConfigDeps = {
        execSync: execMock,
        existsSync: (() => false) as CheckConfigDeps['existsSync'],
        readFileSync: (() => '') as unknown as CheckConfigDeps['readFileSync'],
        getEnv: vi.fn(),
        log: vi.fn(),
      }

      displayNpmStatus(localDeps, null)

      const output = logSpy.mock.calls.map(args => args[0]).join('\n')
      expect(output).toContain('❌ Not logged in (run: npm login)')
    })
  })
})
