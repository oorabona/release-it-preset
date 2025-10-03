import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  parseArgs,
  type ValidateReleaseDeps,
  validateBranch,
  validateChangelogExists,
  validateChangelogFormat,
  validateGitRepo,
  validateNpmAuth,
  validateRelease,
  validateUnreleasedHasContent,
  validateWorkingDirectoryClean,
} from '../../scripts/validate-release'

describe('validate-release (with DI)', () => {
  let deps: ValidateReleaseDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
    }
  })

  describe('parseArgs', () => {
    it('should parse --allow-dirty flag', () => {
      const result = parseArgs(['--allow-dirty'])
      expect(result.allowDirty).toBe(true)
    })

    it('should return false when no flag', () => {
      const result = parseArgs([])
      expect(result.allowDirty).toBe(false)
    })

    it('should parse other args without error', () => {
      const result = parseArgs(['--other', '--allow-dirty', '--more'])
      expect(result.allowDirty).toBe(true)
    })
  })

  describe('validateGitRepo', () => {
    it('should pass when in git repo', () => {
      vi.mocked(deps.execSync).mockReturnValue('.git')

      const result = validateGitRepo(deps)

      expect(result.passed).toBe(true)
      expect(result.name).toBe('Git repository')
    })

    it('should fail when not in git repo', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('not a git repo')
      })

      const result = validateGitRepo(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toBe('Not a git repository')
    })
  })

  describe('validateChangelogExists', () => {
    it('should pass when CHANGELOG.md exists', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)

      const result = validateChangelogExists(deps)

      expect(result.passed).toBe(true)
      expect(result.name).toBe('CHANGELOG.md exists')
      expect(deps.existsSync).toHaveBeenCalledWith('CHANGELOG.md')
    })

    it('should fail when CHANGELOG.md does not exist', () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = validateChangelogExists(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('File not found')
    })

    it('should use custom CHANGELOG_FILE', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_FILE' ? 'HISTORY.md' : undefined,
      )
      vi.mocked(deps.existsSync).mockReturnValue(true)

      const result = validateChangelogExists(deps)

      expect(result.passed).toBe(true)
      expect(deps.existsSync).toHaveBeenCalledWith('HISTORY.md')
    })
  })

  describe('validateChangelogFormat', () => {
    it('should pass when changelog has correct format', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\nSee https://keepachangelog.com/',
      )

      const result = validateChangelogFormat(deps)

      expect(result.passed).toBe(true)
    })

    it('should fail when missing title', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('## [Unreleased]\n\nhttps://keepachangelog.com/')

      const result = validateChangelogFormat(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Missing title')
    })

    it('should fail when missing [Unreleased] section', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\nhttps://keepachangelog.com/')

      const result = validateChangelogFormat(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Missing [Unreleased] section')
    })

    it('should fail when missing keepachangelog.com reference', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\n## [Unreleased]\n\nSome content')

      const result = validateChangelogFormat(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Not using Keep a Changelog format')
    })

    it('should fail when file does not exist', () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = validateChangelogFormat(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toBe('File not found')
    })
  })

  describe('validateUnreleasedHasContent', () => {
    it('should pass when [Unreleased] has changes', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\n- Added new feature\n- Fixed bug\n\n',
      )

      const result = validateUnreleasedHasContent(deps)

      expect(result.passed).toBe(true)
    })

    it('should fail when [Unreleased] is empty', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\n## [Unreleased]\n\n')

      const result = validateUnreleasedHasContent(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('empty')
    })

    it('should fail when [Unreleased] has "No changes yet."', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\nNo changes yet.\n\n',
      )

      const result = validateUnreleasedHasContent(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('empty')
    })

    it('should fail when no change entries (no lines starting with -)', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\nSome text but no changes\n\n',
      )

      const result = validateUnreleasedHasContent(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('no change entries')
    })

    it('should fail when [Unreleased] section not found', () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\n## [1.0.0]\n\n- Some change\n\n')

      const result = validateUnreleasedHasContent(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('not found')
    })
  })

  describe('validateWorkingDirectoryClean', () => {
    it('should pass when directory is clean', () => {
      vi.mocked(deps.execSync).mockReturnValue('')

      const result = validateWorkingDirectoryClean(deps, { allowDirty: false })

      expect(result.passed).toBe(true)
    })

    it('should fail when directory has uncommitted changes', () => {
      vi.mocked(deps.execSync).mockReturnValue(' M file1.ts\n M file2.ts')

      const result = validateWorkingDirectoryClean(deps, { allowDirty: false })

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Uncommitted changes detected')
    })

    it('should pass when --allow-dirty is set', () => {
      const result = validateWorkingDirectoryClean(deps, { allowDirty: true })

      expect(result.passed).toBe(true)
      expect(result.message).toContain('Skipped')
    })

    it('should fail when git status fails', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = validateWorkingDirectoryClean(deps, { allowDirty: false })

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Failed to check git status')
    })
  })

  describe('validateNpmAuth', () => {
    it('should pass when authenticated', () => {
      vi.mocked(deps.execSync).mockReturnValue('username')

      const result = validateNpmAuth(deps)

      expect(result.passed).toBe(true)
      expect(result.message).toContain('username')
    })

    it('should fail when not authenticated', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('not authenticated')
      })

      const result = validateNpmAuth(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Not authenticated')
    })

    it('should pass when token-based authentication is configured', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('whoami not available')
      })
      vi.mocked(deps.getEnv).mockImplementation(key => (key === 'NPM_TOKEN' ? 'shhh' : undefined))

      const result = validateNpmAuth(deps)

      expect(result.passed).toBe(true)
      expect(result.message).toContain('Token-based authentication')
    })

    it('should provide CI-specific guidance when no token is detected', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('whoami not available')
      })
      vi.mocked(deps.getEnv).mockImplementation(key => (key === 'CI' ? 'true' : undefined))

      const result = validateNpmAuth(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Ensure NPM_TOKEN is configured')
    })
  })

  describe('validateBranch', () => {
    it('should pass when GIT_REQUIRE_BRANCH not set', () => {
      const result = validateBranch(deps)

      expect(result.passed).toBe(true)
      expect(result.message).toContain('Skipped')
    })

    it('should pass when on required branch', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'GIT_REQUIRE_BRANCH' ? 'main' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('main')

      const result = validateBranch(deps)

      expect(result.passed).toBe(true)
      expect(result.message).toContain('main')
    })

    it('should fail when on wrong branch', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'GIT_REQUIRE_BRANCH' ? 'main' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('develop')

      const result = validateBranch(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('develop')
      expect(result.message).toContain('main')
    })

    it('should fail when git command fails', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'GIT_REQUIRE_BRANCH' ? 'main' : undefined,
      )
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = validateBranch(deps)

      expect(result.passed).toBe(false)
      expect(result.message).toContain('Failed to get current branch')
    })
  })

  describe('validateRelease', () => {
    beforeEach(() => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\n- Change\n\nhttps://keepachangelog.com/',
      )
      vi.mocked(deps.execSync).mockReturnValue('')
    })

    it('should run all validations and return results', () => {
      const results = validateRelease(deps, { allowDirty: false })

      expect(results).toHaveLength(7)
      expect(results[0].name).toBe('Git repository')
      expect(results[1].name).toBe('CHANGELOG.md exists')
      expect(results[2].name).toBe('CHANGELOG.md format')
      expect(results[3].name).toBe('[Unreleased] has content')
      expect(results[4].name).toBe('Working directory clean')
      expect(results[5].name).toBe('Branch check')
      expect(results[6].name).toBe('npm authentication')
    })

    it('should pass all validations when everything is correct', () => {
      const results = validateRelease(deps, { allowDirty: true })

      const allPassed = results.every(r => r.passed)
      expect(allPassed).toBe(true)
    })

    it('should include failures in results', () => {
      vi.mocked(deps.existsSync).mockReturnValue(false) // Changelog missing

      const results = validateRelease(deps, { allowDirty: true })

      const failed = results.filter(r => !r.passed)
      expect(failed.length).toBeGreaterThan(0)
    })
  })
})
