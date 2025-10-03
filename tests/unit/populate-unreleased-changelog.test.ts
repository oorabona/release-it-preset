import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGitHubRepoUrl } from '../../scripts/lib/git-utils'
import {
  extractConventionalCommitParts,
  normalizeCommitType,
  type PopulateChangelogDeps,
  parseCommitsWithMultiplePrefixes,
  populateChangelog,
} from '../../scripts/populate-unreleased-changelog'

describe('populate-unreleased-changelog (with DI)', () => {
  let deps: PopulateChangelogDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
  })

  describe('extractConventionalCommitParts', () => {
    it('should extract single conventional commit', () => {
      const result = extractConventionalCommitParts('feat: add new feature', 'abc1234')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'feat',
        scope: undefined,
        description: 'add new feature',
        sha: 'abc1234',
        breaking: false,
      })
    })

    it('should extract commit with scope', () => {
      const result = extractConventionalCommitParts('fix(api): correct endpoint', 'def5678')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'fix',
        scope: 'api',
        description: 'correct endpoint',
        sha: 'def5678',
        breaking: false,
      })
    })

    it('should extract multiple commits from same message', () => {
      const body = 'feat: add feature A\nfix: fix bug B\nchore: update deps'
      const result = extractConventionalCommitParts(body, 'abc1234')

      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('feat')
      expect(result[1].type).toBe('fix')
      expect(result[2].type).toBe('chore')
    })

    it('should clean up extra whitespace in descriptions', () => {
      // The regex captures descriptions with extra whitespace
      // description.trim().replace(/\s+/g, ' ') normalizes it
      const result = extractConventionalCommitParts(
        'feat:   add   feature   with   spaces',
        'abc1234',
      )

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('feat')
      expect(result[0].description).toBe('add feature with spaces')
      expect(result[0].breaking).toBe(false)
    })

    it('should flag breaking changes with bang syntax', () => {
      const result = extractConventionalCommitParts('feat!: introduce breaking change', 'abc1234')

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        type: 'feat',
        description: 'introduce breaking change',
        breaking: true,
      })
    })
  })

  describe('normalizeCommitType', () => {
    it('should map feat to Added', () => {
      expect(normalizeCommitType('feat')).toBe('### Added')
      expect(normalizeCommitType('feature')).toBe('### Added')
      expect(normalizeCommitType('add')).toBe('### Added')
    })

    it('should map fix to Fixed', () => {
      expect(normalizeCommitType('fix')).toBe('### Fixed')
      expect(normalizeCommitType('bugfix')).toBe('### Fixed')
    })

    it('should map refactor/chore/etc to Changed', () => {
      expect(normalizeCommitType('refactor')).toBe('### Changed')
      expect(normalizeCommitType('chore')).toBe('### Changed')
      expect(normalizeCommitType('docs')).toBe('### Changed')
      expect(normalizeCommitType('test')).toBe('### Changed')
    })

    it('should map remove/delete commits to Removed', () => {
      expect(normalizeCommitType('remove')).toBe('### Removed')
      expect(normalizeCommitType('deleted')).toBe('### Removed')
    })

    it('should ignore ci/release/hotfix', () => {
      expect(normalizeCommitType('ci')).toBe(false)
      expect(normalizeCommitType('release')).toBe(false)
      expect(normalizeCommitType('hotfix')).toBe(false)
    })

    it('should default unknown types to Changed', () => {
      expect(normalizeCommitType('unknown')).toBe('### Changed')
    })

    it('should be case-insensitive', () => {
      expect(normalizeCommitType('FEAT')).toBe('### Added')
      expect(normalizeCommitType('Fix')).toBe('### Fixed')
    })

    it('should map security related commits to Security section', () => {
      expect(normalizeCommitType('security')).toBe('### Security')
    })

    it('should map dependency updates to Changed section', () => {
      expect(normalizeCommitType('deps')).toBe('### Changed')
      expect(normalizeCommitType('dependencies')).toBe('### Changed')
    })
  })

  describe('parseCommitsWithMultiplePrefixes', () => {
    it('should parse empty git output', () => {
      const result = parseCommitsWithMultiplePrefixes('', 'https://github.com/owner/repo')
      expect(result).toBe('')
    })

    it('should parse single commit with conventional format', () => {
      const gitOutput = 'abc1234567890|feat: add new feature|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('add new feature')
      expect(result).toContain('[abc1234](https://github.com/owner/repo/commit/abc1234)')
    })

    it('should skip commits with [skip-changelog]', () => {
      const gitOutput = 'abc1234|[skip-changelog] feat: skip this|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    it('should skip commits when [skip-changelog] appears later in message', () => {
      const gitOutput = 'abc1234|feat: add feature [skip-changelog]|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    it('should group commits by type', () => {
      const gitOutput =
        'abc1234|feat: add A|||END|||def5678|fix: fix B|||END|||ghi9012|feat: add C|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('add A')
      expect(result).toContain('add C')
      expect(result).toContain('### Fixed')
      expect(result).toContain('fix B')
    })

    it('should handle commits with scope', () => {
      const gitOutput = 'abc1234|feat(api): add endpoint|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('add endpoint (api)')
    })

    it('should include breaking indicator for bang commits', () => {
      const gitOutput = 'abc1234|feat!: breaking change|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('⚠️ BREAKING')
    })

    it('should include scope information for breaking commits', () => {
      const gitOutput = 'abc1234|feat(core)!: breaking change|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('⚠️ BREAKING')
      expect(result).toContain('breaking change (core)')
      expect(result).toContain('[abc1234](https://github.com/owner/repo/commit/abc1234)')
    })

    it('should handle non-conventional commits as misc/Changed', () => {
      const gitOutput = 'abc1234|Just a random commit message|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Changed')
      expect(result).toContain('Just a random commit message')
    })

    it('should return "No changes yet" when no valid commits', () => {
      const gitOutput = 'abc1234|ci: update workflow|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    it('should handle commits without repo URL', () => {
      const gitOutput = 'abc1234|feat!: add feature|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, '')

      expect(result).toContain('⚠️ BREAKING')
      expect(result).toContain('(abc1234)')
      expect(result).not.toContain('[abc1234]')
    })
  })

  describe('getGitHubRepoUrl', () => {
    it('should use GITHUB_REPOSITORY env var when available', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'GITHUB_REPOSITORY' ? 'owner/repo' : undefined,
      )

      const url = getGitHubRepoUrl(deps)
      expect(url).toBe('https://github.com/owner/repo')
    })

    it('should extract URL from git remote when GITHUB_REPOSITORY not set', () => {
      vi.mocked(deps.execSync).mockReturnValue('git@github.com:owner/repo.git')

      const url = getGitHubRepoUrl(deps)
      expect(url).toBe('https://github.com/owner/repo')
    })

    it('should handle HTTPS remote URLs', () => {
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      const url = getGitHubRepoUrl(deps)
      expect(url).toBe('https://github.com/owner/repo')
    })

    it('should return empty string on error', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const url = getGitHubRepoUrl(deps)
      expect(url).toBe('')
      expect(deps.warn).toHaveBeenCalled()
    })

    it('should use custom GIT_REMOTE from env', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'GIT_REMOTE' ? 'upstream' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('git@github.com:owner/repo.git')

      getGitHubRepoUrl(deps)

      expect(deps.execSync).toHaveBeenCalledWith(
        'git config --get remote.upstream.url',
        expect.any(Object),
      )
    })
  })

  describe('populateChangelog', () => {
    beforeEach(() => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [Unreleased]\n\nNo changes yet.\n\n',
      )
    })

    it('should update changelog with commits since last tag', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('v1.0.0') // git describe
        .mockReturnValueOnce('abc1234|feat: add feature|||END|||') // git log

      populateChangelog(deps)

      expect(deps.writeFileSync).toHaveBeenCalled()
      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('### Added')
      expect(writtenContent).toContain('add feature')
    })

    it('should handle no tags found', () => {
      vi.mocked(deps.execSync)
        .mockImplementationOnce(() => {
          throw new Error('no tags')
        })
        .mockReturnValueOnce('abc1234|feat: add feature|||END|||')

      populateChangelog(deps)

      expect(deps.log).toHaveBeenCalledWith('ℹ️  No tags found, using all commits')
      expect(deps.writeFileSync).toHaveBeenCalled()
    })

    it('should handle no new commits', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('v1.0.0')
        .mockImplementationOnce(() => {
          throw new Error('no commits')
        })

      populateChangelog(deps)

      expect(deps.log).toHaveBeenCalledWith('ℹ️  No new commits found')
    })

    it('should use custom CHANGELOG_FILE', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_FILE' ? 'HISTORY.md' : undefined,
      )
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('no tags')
      })

      populateChangelog(deps)

      expect(deps.readFileSync).toHaveBeenCalledWith('HISTORY.md', 'utf8')
    })

    it('should insert Unreleased section if missing', () => {
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\nSome content\n')
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('v1.0.0')
        .mockReturnValueOnce('abc1234|feat: add feature|||END|||')

      populateChangelog(deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [Unreleased]')
    })

    it('should append Unreleased section when changelog lacks separators', () => {
      vi.mocked(deps.readFileSync).mockReturnValue('Initial changelog content')
      vi.mocked(deps.execSync).mockImplementation(command => {
        if (command.startsWith('git describe')) {
          throw new Error('no tags')
        }
        if (command.startsWith('git log')) {
          return 'abc1234|feat: add feature|||END|||'
        }
        return ''
      })

      populateChangelog(deps)

      expect(deps.writeFileSync).toHaveBeenCalled()
      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent.startsWith('Initial changelog content\n\n## [Unreleased]')).toBe(true)
    })

    it('should prepend Unreleased section when changelog empty', () => {
      vi.mocked(deps.readFileSync).mockReturnValue('')
      vi.mocked(deps.execSync).mockImplementation(command => {
        if (command.startsWith('git describe')) {
          throw new Error('no tags')
        }
        if (command.startsWith('git log')) {
          return ''
        }
        return ''
      })

      populateChangelog(deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toBe('## [Unreleased]\n\nNo changes yet.\n\n')
      expect(deps.log).toHaveBeenCalledWith('✅ Updated [Unreleased] section with 0 commit(s)')
    })
  })
})
