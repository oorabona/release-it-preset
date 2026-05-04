import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILTIN_TYPE_MAP } from '../../scripts/lib/changelog-types'
import { ValidationError } from '../../scripts/lib/errors'
import { getGitHubRepoUrl } from '../../scripts/lib/git-utils'
import {
  extractConventionalCommitParts,
  normalizeCommitType,
  type PopulateChangelogDeps,
  parseCommitsWithMultiplePrefixes,
  populateChangelog,
  resolveSinceBaseline,
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

    it('should map deprecate/deprecated/deprecation to Deprecated section', () => {
      expect(normalizeCommitType('deprecate')).toBe('### Deprecated')
      expect(normalizeCommitType('deprecated')).toBe('### Deprecated')
      expect(normalizeCommitType('deprecation')).toBe('### Deprecated')
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

    it('should emit ### Deprecated section for deprecate/deprecated/deprecation commits', () => {
      const gitOutput =
        'abc1234|deprecate(api): old endpoint sunset|||END|||def5678|deprecated: legacy auth flow|||END|||ghi9012|deprecation: v1 style config|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Deprecated')
      expect(result).toContain('old endpoint sunset')
      expect(result).toContain('legacy auth flow')
      expect(result).toContain('v1 style config')
      expect(result).not.toContain('### Changed')
    })

    it('should order sections per Keep a Changelog 1.1.0 spec (Added, Changed, Deprecated, Removed, Fixed, Security)', () => {
      const gitOutput = [
        'sha1111|feat: add alpha|||END|||',
        'sha2222|fix: fix beta|||END|||',
        'sha3333|chore: update gamma|||END|||',
        'sha4444|deprecate(api): sunset delta|||END|||',
        'sha5555|remove: drop epsilon|||END|||',
        'sha6666|security: patch zeta|||END|||',
      ].join('')
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      const addedIdx = result.indexOf('### Added')
      const changedIdx = result.indexOf('### Changed')
      const deprecatedIdx = result.indexOf('### Deprecated')
      const removedIdx = result.indexOf('### Removed')
      const fixedIdx = result.indexOf('### Fixed')
      const securityIdx = result.indexOf('### Security')

      // All sections must be present
      expect(addedIdx).toBeGreaterThan(-1)
      expect(changedIdx).toBeGreaterThan(-1)
      expect(deprecatedIdx).toBeGreaterThan(-1)
      expect(removedIdx).toBeGreaterThan(-1)
      expect(fixedIdx).toBeGreaterThan(-1)
      expect(securityIdx).toBeGreaterThan(-1)

      // Order: Added < Changed < Deprecated < Removed < Fixed < Security
      expect(addedIdx).toBeLessThan(changedIdx)
      expect(changedIdx).toBeLessThan(deprecatedIdx)
      expect(deprecatedIdx).toBeLessThan(removedIdx)
      expect(removedIdx).toBeLessThan(fixedIdx)
      expect(fixedIdx).toBeLessThan(securityIdx)
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

    it('should ignore release commits parsed as conventional', () => {
      const gitOutput = 'abc1234|release: bump version|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    it('should ignore release commits without conventional formatting', () => {
      const gitOutput = 'abc1234|Release v0.3.0|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    it('should ignore release-please commits with dash in prefix', () => {
      const gitOutput = 'abc1234|release-please: cut release v0.4.0|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
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

    // multi-line body with paragraph-separated footer must NOT leak into CHANGELOG
    it('should not emit footer fragments (Refs:) as changelog entries', () => {
      // The full body has a blank line separating the subject from the body paragraph,
      // and the "Refs:" footer trailer. Before the fix, "Refs: #42" matched the
      // conventional-commit regex and appeared as a spurious "### Changed" entry.
      const gitOutput =
        'abc1234|feat: add login flow\n\nImplements password + magic-link options.\nRefs: #42|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('add login flow')
      // The Refs footer must NOT be emitted as a changelog entry
      expect(result).not.toContain('### Changed')
      expect(result).not.toMatch(/^- Refs/m)
      // "#42" must not appear except possibly inside the SHA commit link
      const lines = result.split('\n')
      const nonShaLines = lines.filter(l => !l.includes('abc1234'))
      expect(nonShaLines.join('\n')).not.toContain('#42')
    })

    // BREAKING CHANGE: footer in body must promote first part to breaking
    it('should detect BREAKING CHANGE: footer and mark the commit as breaking', () => {
      const gitOutput =
        'abc1234|feat: migrate config format\n\nUsers must update their config file.\nBREAKING CHANGE: config schema changed|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('migrate config format')
      // The BREAKING CHANGE trailer must not be emitted as a separate changelog entry
      expect(result).not.toMatch(/^- BREAKING CHANGE/m)
    })

    // edge case — standalone BREAKING CHANGE footer with no leading conventional prefix
    it('should emit standalone breaking entry when BREAKING CHANGE footer present but no conventional prefix', () => {
      const gitOutput =
        'abc1234|Non-conventional subject line\n\nBREAKING CHANGE: removed the foo API|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('removed the foo API')
    })

    // [skip-changelog] in a non-first body line must still trigger the skip
    it('should skip commit when [skip-changelog] appears in body paragraph (not first line)', () => {
      const gitOutput =
        'abc1234|feat: internal refactor\n\nThis is an internal-only change.\n[skip-changelog]|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toBe('No changes yet.')
    })

    // consecutive multi-prefix lines (no blank line between) must produce 2 entries
    it('should emit two entries for consecutive conventional prefix lines with no blank line between', () => {
      // No blank line between feat: and fix: — both are in the header block
      const gitOutput = 'abc1234|feat: add X\nfix: fix Y|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('add X')
      expect(result).toContain('### Fixed')
      expect(result).toContain('fix Y')
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

    describe('GIT_CHANGELOG_PATH path scoping', () => {
      beforeEach(() => {
        vi.mocked(deps.readFileSync).mockReturnValue(
          '# Changelog\n\n## [Unreleased]\n\nNo changes yet.\n\n',
        )
      })

      it('should append -- <path> to git log when GIT_CHANGELOG_PATH is set', () => {
        vi.mocked(deps.getEnv).mockImplementation(key =>
          key === 'GIT_CHANGELOG_PATH' ? 'packages/tar-xz' : undefined,
        )
        vi.mocked(deps.execSync)
          .mockReturnValueOnce('v1.0.0') // git describe
          .mockReturnValueOnce('') // git log

        populateChangelog(deps)

        const execCalls = vi.mocked(deps.execSync).mock.calls
        const gitLogCall = execCalls.find(
          ([cmd]) => typeof cmd === 'string' && cmd.startsWith('git log'),
        )
        expect(gitLogCall).toBeDefined()
        expect(gitLogCall?.[0]).toContain(' -- packages/tar-xz')
      })

      it('should throw ValidationError when GIT_CHANGELOG_PATH starts with ..', () => {
        vi.mocked(deps.getEnv).mockImplementation(key =>
          key === 'GIT_CHANGELOG_PATH' ? '../escape' : undefined,
        )
        vi.mocked(deps.execSync).mockReturnValue('v1.0.0')

        expect(() => populateChangelog(deps)).toThrow(ValidationError)
        expect(() => populateChangelog(deps)).toThrow(
          /GIT_CHANGELOG_PATH must be a relative path under the repository/,
        )
      })

      it('should throw ValidationError when GIT_CHANGELOG_PATH starts with /', () => {
        vi.mocked(deps.getEnv).mockImplementation(key =>
          key === 'GIT_CHANGELOG_PATH' ? '/absolute/path' : undefined,
        )
        vi.mocked(deps.execSync).mockReturnValue('v1.0.0')

        expect(() => populateChangelog(deps)).toThrow(ValidationError)
      })

      it('should not append path filter when GIT_CHANGELOG_PATH is empty', () => {
        vi.mocked(deps.getEnv).mockImplementation(key =>
          key === 'GIT_CHANGELOG_PATH' ? '' : undefined,
        )
        vi.mocked(deps.execSync).mockReturnValueOnce('v1.0.0').mockReturnValueOnce('')

        populateChangelog(deps)

        const execCalls = vi.mocked(deps.execSync).mock.calls
        const gitLogCall = execCalls.find(
          ([cmd]) => typeof cmd === 'string' && cmd.startsWith('git log'),
        )
        expect(gitLogCall).toBeDefined()
        expect(gitLogCall?.[0]).not.toContain(' -- ')
      })
    })
  })

  describe('resolveSinceBaseline', () => {
    beforeEach(() => {
      deps = {
        execSync: vi.fn(),
        readFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        getEnv: vi.fn(() => undefined),
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as PopulateChangelogDeps
    })

    it('GIT_CHANGELOG_SINCE override wins over everything else', () => {
      vi.mocked(deps.getEnv).mockImplementation(k =>
        k === 'GIT_CHANGELOG_SINCE' ? 'abc123def456' : undefined,
      )
      const result = resolveSinceBaseline(deps)
      expect(result).toBe('abc123def456')
      expect(deps.execSync).not.toHaveBeenCalled()
    })

    it('per-package detection: uses last chore(<pkg>): release commit when GIT_CHANGELOG_PATH is set', () => {
      vi.mocked(deps.getEnv).mockImplementation(k =>
        k === 'GIT_CHANGELOG_PATH' ? 'packages/nxz' : undefined,
      )
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ name: '@org/nxz-cli' }))
      vi.mocked(deps.execSync).mockReturnValue('ecff028aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n')
      const result = resolveSinceBaseline(deps)
      expect(result).toBe('ecff028aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      expect(vi.mocked(deps.execSync).mock.calls[0][0]).toMatch(
        /--grep="\^chore\(nxz-cli\): release v"/,
      )
    })

    it('per-package detection: falls back to tag when no prior release commit found', () => {
      vi.mocked(deps.getEnv).mockImplementation(k =>
        k === 'GIT_CHANGELOG_PATH' ? 'packages/nxz' : undefined,
      )
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ name: 'nxz-cli' }))
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('') // git log --grep returns empty
        .mockReturnValueOnce('v1.2.3\n') // git describe returns tag
      const result = resolveSinceBaseline(deps)
      expect(result).toBe('v1.2.3')
    })

    it('no GIT_CHANGELOG_PATH: per-package detection NOT attempted, single-package behavior preserved', () => {
      vi.mocked(deps.getEnv).mockReturnValue(undefined)
      vi.mocked(deps.execSync).mockReturnValue('v1.0.0\n')
      const result = resolveSinceBaseline(deps)
      expect(result).toBe('v1.0.0')
      // Only ONE execSync call (git describe), NOT two
      expect(vi.mocked(deps.execSync)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(deps.execSync).mock.calls[0][0]).toContain('git describe')
    })

    it('package.json missing: skip per-package detection, fall through to tag', () => {
      vi.mocked(deps.getEnv).mockImplementation(k => (k === 'GIT_CHANGELOG_PATH' ? '.' : undefined))
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.mocked(deps.execSync).mockReturnValue('v0.1.0\n')
      const result = resolveSinceBaseline(deps)
      expect(result).toBe('v0.1.0')
    })
  })

  describe('breaking parts dedupe (only in BREAKING CHANGES, not in native section)', () => {
    it('bang-style breaking commit appears ONLY in BREAKING CHANGES, not in ### Added', () => {
      const gitOutput = 'abc1234567890|feat!: migrate config format|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('migrate config format')
      // exactly one occurrence in the whole output (dedupe: not also in ### Added)
      expect((result.match(/migrate config format/g) ?? []).length).toBe(1)
      expect(result).not.toContain('### Added')
    })

    it('BREAKING CHANGE footer entry appears ONLY in BREAKING CHANGES, not in ### Added', () => {
      const gitOutput =
        'abc1234567890|feat: add big thing\n\nBREAKING CHANGE: config schema changed|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('add big thing')
      // dedupe: appears exactly once
      expect((result.match(/add big thing/g) ?? []).length).toBe(1)
      expect(result).not.toContain('### Added')
    })
  })

  describe('strict BREAKING CHANGE: footer (requires blank-line separation)', () => {
    it('mid-body BREAKING CHANGE (no blank line) does NOT promote to breaking', () => {
      // No blank line between header and "BREAKING CHANGE:" — not a footer
      const gitOutput = 'abc1234567890|feat: x\nBREAKING CHANGE: not a footer|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).not.toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('### Added')
      expect(result).toContain('- x')
    })

    it('proper footer BREAKING CHANGE (blank line before) DOES promote to breaking', () => {
      const gitOutput = 'abc1234567890|feat: x\n\nBREAKING CHANGE: real footer|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('x')
      // dedupe: only in breaking section
      expect(result).not.toContain('### Added')
    })

    it('BREAKING-CHANGE (hyphen variant) in proper footer promotes to breaking', () => {
      const gitOutput = 'abc1234567890|feat: y\n\nBREAKING-CHANGE: hyphen variant|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('hyphen variant')
    })
  })

  describe('multi-footer BREAKING CHANGE (multiple lines in last paragraph)', () => {
    it('two BREAKING CHANGE lines in last paragraph emit two breaking entries', () => {
      const gitOutput =
        'abc1234567890|feat: big refactor\n\nBREAKING CHANGE: API changed\nBREAKING CHANGE: config changed|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('API changed')
      expect(result).toContain('config changed')
      // both breaking lines present
      expect((result.match(/API changed/g) ?? []).length).toBe(1)
      expect((result.match(/config changed/g) ?? []).length).toBe(1)
    })

    it('standalone commit (no prefix) with two BREAKING CHANGE footers emits two entries', () => {
      const gitOutput =
        'abc1234567890|Non-conventional subject\n\nBREAKING CHANGE: removed foo\nBREAKING CHANGE: removed bar|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('removed foo')
      expect(result).toContain('removed bar')
    })
  })

  describe('entry-count locks (regex match counts, not just substring)', () => {
    it('BREAKING CHANGE footer entry appears exactly once after dedupe', () => {
      const gitOutput =
        'abc1234567890|feat: migrate config format\n\nUsers must update their config file.\nBREAKING CHANGE: config schema changed|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      // "migrate config format" should appear exactly once (not duplicated across sections)
      expect((result.match(/migrate config format/g) ?? []).length).toBe(1)
    })

    it('two consecutive prefix lines emit exactly one entry each', () => {
      const gitOutput = 'abc1234567890|feat: add X\nfix: fix Y|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect((result.match(/add X/g) ?? []).length).toBe(1)
      expect((result.match(/fix Y/g) ?? []).length).toBe(1)
    })
  })

  describe('edge cases (CRLF, whitespace-only separator, mid-body BREAKING CHANGE)', () => {
    it('CRLF line endings are handled correctly', () => {
      // Windows-style \r\n — blank line is \r\n\r\n
      const gitOutput = 'abc1234567890|feat: x\r\n\r\nbody\r\nRefs: #1|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('x')
      // Refs: line must NOT become a changelog entry
      expect(result).not.toMatch(/- Refs/m)
    })

    it('whitespace-only line acts as paragraph separator', () => {
      // A line with only spaces is a blank-line separator per the spec
      const gitOutput = 'abc1234567890|feat: x\n   \nbody text|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### Added')
      expect(result).toContain('x')
      // "body text" must not be a changelog entry
      expect(result).not.toContain('body text')
    })

    it('mid-body BREAKING CHANGE without blank-line separator is not treated as footer', () => {
      const gitOutput = 'abc1234567890|feat: x\nBREAKING CHANGE: not a footer|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).not.toContain('### ⚠️ BREAKING CHANGES')
      // The commit still appears as a regular Added entry
      expect(result).toContain('### Added')
    })

    it('CRLF body with proper blank-line BREAKING CHANGE footer DOES promote', () => {
      // Windows-authored commit: paragraph separator is \r\n\r\n, not \n\n.
      // The splitter must accept both line endings so the footer is detected.
      const gitOutput =
        'abc1234567890|feat: rewrite parser\r\n\r\nBREAKING CHANGE: rule names changed|||END|||'
      const result = parseCommitsWithMultiplePrefixes(gitOutput, 'https://github.com/owner/repo')

      expect(result).toContain('### ⚠️ BREAKING CHANGES')
      expect(result).toContain('rewrite parser')
    })
  })

  describe('custom type map: normalizeCommitType with override', () => {
    it('custom typeMap routes unknown type to custom section', () => {
      const customMap = { ...BUILTIN_TYPE_MAP, deps: '### Dependencies' }
      expect(normalizeCommitType('deps', customMap)).toBe('### Dependencies')
    })

    it('custom typeMap false value suppresses type', () => {
      const customMap = { ...BUILTIN_TYPE_MAP, docs: false as const }
      expect(normalizeCommitType('docs', customMap)).toBe(false)
    })

    it('env CHANGELOG_TYPE_MAP routes deps commits to custom section via parseCommitsWithMultiplePrefixes', () => {
      const customMap = { ...BUILTIN_TYPE_MAP, deps: '### Dependencies' }
      const gitOutput = 'abc1234567890|deps: bump foo to 1.2.3|||END|||'
      const result = parseCommitsWithMultiplePrefixes(
        gitOutput,
        'https://github.com/owner/repo',
        customMap,
      )

      expect(result).toContain('### Dependencies')
      expect(result).toContain('bump foo to 1.2.3')
      expect(result).not.toContain('### Changed')
    })

    it('populateChangelog uses CHANGELOG_TYPE_MAP env var to route custom types', () => {
      vi.mocked(deps.readFileSync).mockImplementation(path => {
        if (path === '.changelog-types.json') {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        }
        return '# Changelog\n\n## [Unreleased]\n\nNo changes yet.\n\n'
      })
      vi.mocked(deps.getEnv).mockImplementation(key => {
        if (key === 'CHANGELOG_TYPE_MAP') {
          return JSON.stringify({ ops: '### Operations' })
        }
        return undefined
      })
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('v1.0.0') // git describe
        .mockReturnValueOnce('abc1234567890|ops: deploy infra|||END|||') // git log
        .mockReturnValueOnce('') // git remote (getGitHubRepoUrl)

      populateChangelog(deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('### Operations')
      expect(writtenContent).toContain('deploy infra')
    })
  })
})
