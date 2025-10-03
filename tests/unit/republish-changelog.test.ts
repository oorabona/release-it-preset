import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getGitHubRepoUrl as getRepoUrl } from '../../scripts/lib/git-utils'
import {
  type RepublishChangelogDeps,
  republishChangelog,
  updateReferenceLinks,
} from '../../scripts/republish-changelog'

describe('republish-changelog (with DI)', () => {
  let deps: RepublishChangelogDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
      getCwd: vi.fn(() => '/test/project'),
      getDate: vi.fn(() => '2024-01-15'),
      log: vi.fn(),
      warn: vi.fn(),
    }
  })

  describe('getRepoUrl', () => {
    it('should return URL from GITHUB_REPOSITORY env var', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GITHUB_REPOSITORY' ? 'owner/repo' : undefined,
      )

      const result = getRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
      expect(deps.execSync).not.toHaveBeenCalled()
    })

    it('should get URL from git remote when GITHUB_REPOSITORY not set', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GIT_REMOTE' ? 'origin' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('git@github.com:owner/repo.git\n')

      const result = getRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
      expect(deps.execSync).toHaveBeenCalledWith('git config --get remote.origin.url', {
        encoding: 'utf8',
      })
    })

    it('should convert SSH URL to HTTPS', () => {
      vi.mocked(deps.execSync).mockReturnValue('git@github.com:owner/repo.git')

      const result = getRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
    })

    it('should remove .git suffix', () => {
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      const result = getRepoUrl(deps)

      expect(result).toBe('https://github.com/owner/repo')
    })

    it('should use custom GIT_REMOTE from env', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'GIT_REMOTE' ? 'upstream' : undefined,
      )
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      getRepoUrl(deps)

      expect(deps.execSync).toHaveBeenCalledWith('git config --get remote.upstream.url', {
        encoding: 'utf8',
      })
    })

    it('should handle execSync error and return empty string', () => {
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      const result = getRepoUrl(deps)

      expect(result).toBe('')
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not determine repository URL'),
      )
    })
  })

  describe('republishChangelog', () => {
    const basicChangelog = `# Changelog

## [Unreleased]

### Added
- New feature

## [v1.0.0] - 2024-01-01

- Initial release
`

    it('should create new version entry when version does not exist', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      expect(deps.writeFileSync).toHaveBeenCalled()
      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [v1.1.0] - 2024-01-15')
      expect(writtenContent).toContain('### Added')
      expect(writtenContent).toContain('- New feature')
      expect(writtenContent).toContain(
        '[v1.1.0]: https://github.com/owner/repo/releases/tag/v1.1.0',
      )
      expect(writtenContent).toContain(
        '[Unreleased]: https://github.com/owner/repo/compare/v1.1.0...HEAD',
      )
    })

    it('should clear [Unreleased] section after moving content', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      const unreleasedMatch = writtenContent.match(/## \[Unreleased\]\s*\n\s*\n## \[v1\.1\.0\]/)
      expect(unreleasedMatch).not.toBeNull()
    })

    it('should do nothing when version exists and Unreleased is empty', () => {
      const changelog = `# Changelog

## [Unreleased]

## [v1.0.0] - 2024-01-01

- Initial release
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      expect(deps.writeFileSync).not.toHaveBeenCalled()
      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('already exists in changelog and [Unreleased] is empty'),
      )
    })

    it('should merge Unreleased content into existing version entry', () => {
      const changelog = `# Changelog

## [Unreleased]

### Fixed
- Bug fix

## [v1.0.0] - 2024-01-01

### Added
- Initial release
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('already exists in changelog but [Unreleased] has content'),
      )
      expect(deps.writeFileSync).toHaveBeenCalled()
      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [v1.0.0] - 2024-01-01')
      expect(writtenContent).toContain('### Fixed')
      expect(writtenContent).toContain('- Bug fix')
      expect(writtenContent).toMatch(/## \[Unreleased]\n\s*\n## \[v1\.0\.0]/)
    })

    it('should refresh existing tag link definitions', () => {
      const changelog = `# Changelog

## [Unreleased]

### Fixed
- Patch

## [v1.0.0] - 2024-01-01

- Initial release

[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD
[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0
`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain(
        '[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD',
      )
      expect(writtenContent).toContain(
        '[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0',
      )
    })

    it('should update existing tag link when URL changes', () => {
      const changelog = `# Changelog

## [Unreleased]

### Fixed
- Patch

## [v1.0.0] - 2024-01-01

- Initial release

[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD
[v1.0.0]: https://example.com/old-release
`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain(
        '[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0',
      )
      expect(writtenContent).not.toContain('[v1.0.0]: https://example.com/old-release')
    })

    it('should not duplicate tag link when replacing existing entry', () => {
      const changelog = `# Changelog

## [Unreleased]

### Fixed
- Patch

## [v1.0.0] - 2024-01-01

- Initial release

[Unreleased]: https://github.com/owner/repo/compare/v0.9.0...HEAD
[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0-old
`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      const tagLinkLines = writtenContent.split('\n').filter(line => line.startsWith('[v1.0.0]: '))
      expect(tagLinkLines).toHaveLength(1)
      expect(tagLinkLines[0]).toBe('[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0')
    })

    it('should throw error when Unreleased section not found', () => {
      const changelog = `# Changelog

## [v1.0.0] - 2024-01-01

- Initial release
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)

      expect(() => {
        republishChangelog('1.1.0', deps)
      }).toThrow('No [Unreleased] section found in CHANGELOG.md')
    })

    it('should throw error when Unreleased is empty and version does not exist', () => {
      const changelog = `# Changelog

## [Unreleased]

## [v1.0.0] - 2024-01-01

- Initial release
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)

      expect(() => {
        republishChangelog('1.1.0', deps)
      }).toThrow('[Unreleased] section is empty')
    })

    it('should use custom CHANGELOG_FILE from env', () => {
      vi.mocked(deps.getEnv).mockImplementation((key: string) =>
        key === 'CHANGELOG_FILE' ? 'HISTORY.md' : undefined,
      )
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      expect(deps.readFileSync).toHaveBeenCalledWith('/test/project/HISTORY.md', 'utf8')
      expect(deps.writeFileSync).toHaveBeenCalledWith(
        '/test/project/HISTORY.md',
        expect.any(String),
        'utf8',
      )
    })

    it('should handle GitLab repository URLs', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://gitlab.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('[v1.1.0]: https://gitlab.com/owner/repo/-/tags/v1.1.0')
      expect(writtenContent).toContain(
        '[Unreleased]: https://gitlab.com/owner/repo/-/compare/v1.1.0...HEAD',
      )
    })

    it('should handle non-GitHub/GitLab repository URLs', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://git.example.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('[v1.1.0]: https://git.example.com/owner/repo')
      expect(writtenContent).toContain('[Unreleased]: https://git.example.com/owner/repo')
    })

    it('should respect changelog headings without v-prefix', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- Something

## [1.0.0] - 2024-01-01

- Entry
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [1.1.0] - 2024-01-15')
      expect(writtenContent).toContain('[1.1.0]: https://github.com/owner/repo/releases/tag/v1.1.0')
      expect(writtenContent).toContain(
        '[v1.1.0]: https://github.com/owner/repo/releases/tag/v1.1.0',
      )
    })

    it('should preserve v-prefix from input when no prior version headings exist', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- Initial entry

`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('v2.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [v2.0.0] - 2024-01-15')
      expect(writtenContent).toContain(
        '[v2.0.0]: https://github.com/owner/repo/releases/tag/v2.0.0',
      )
      expect(writtenContent).toContain(
        '[Unreleased]: https://github.com/owner/repo/compare/v2.0.0...HEAD',
      )
    })

    it('should append link definitions when they do not exist yet', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- Something new
`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain(
        '[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD',
      )
      expect(writtenContent).toContain(
        '[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0',
      )
    })

    it('should append definitions when only some links exist', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- Something new

[Unreleased]: https://github.com/owner/repo/compare/v0.9.0...HEAD
`

      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      const lines = writtenContent.split('\n')
      expect(lines.filter(line => line.startsWith('[Unreleased]: '))).toHaveLength(1)
      expect(writtenContent).toContain(
        '[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0',
      )
    })

    it('should update existing [Unreleased] link', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- New feature

## [v1.0.0] - 2024-01-01

- Initial release

[Unreleased]: https://github.com/owner/repo/compare/v1.0.0...HEAD
[v1.0.0]: https://github.com/owner/repo/releases/tag/v1.0.0
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain(
        '[Unreleased]: https://github.com/owner/repo/compare/v1.1.0...HEAD',
      )
      expect(writtenContent).toContain(
        '[v1.1.0]: https://github.com/owner/repo/releases/tag/v1.1.0',
      )
    })

    it('should handle version with special regex characters', () => {
      const changelog = `# Changelog

## [Unreleased]

### Added
- New feature

## [v1.0.0-beta.1] - 2024-01-01

- Beta release
`
      vi.mocked(deps.readFileSync).mockReturnValue(changelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.0.0-beta.2', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [v1.0.0-beta.2] - 2024-01-15')
    })

    it('should log repository URL when available', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockReturnValue('https://github.com/owner/repo.git')

      republishChangelog('1.1.0', deps)

      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('(https://github.com/owner/repo)'),
      )
    })

    it('should handle missing repository URL gracefully', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(basicChangelog)
      vi.mocked(deps.execSync).mockImplementation(() => {
        throw new Error('git error')
      })

      republishChangelog('1.1.0', deps)

      const writtenContent = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
      expect(writtenContent).toContain('## [v1.1.0] - 2024-01-15')
      expect(deps.log).toHaveBeenCalledWith(expect.not.stringContaining('(https://'))
    })
  })

  describe('updateReferenceLinks', () => {
    const linkTarget = 'https://example.com/releases/v1.0.0'
    const unreleasedLine = '[Unreleased]: https://example.com/compare/v1.0.0...HEAD'

    it('should replace existing links and not report additions', () => {
      const original = `# Notes

[Unreleased]: old
[v1.0.0]: old`

      const result = updateReferenceLinks(original, ['v1.0.0'], linkTarget, unreleasedLine)

      expect(result.changelog).toContain(unreleasedLine)
      expect(result.changelog).toContain('[v1.0.0]: https://example.com/releases/v1.0.0')
      expect(result.addedUnreleasedLink).toBe(false)
      expect(result.addedVersionLinks).toEqual([])
    })

    it('should append missing links and report additions', () => {
      const original = `# Notes`

      const result = updateReferenceLinks(original, ['v1.0.0'], linkTarget, unreleasedLine)

      expect(
        result.changelog.endsWith(
          `${unreleasedLine}\n[v1.0.0]: https://example.com/releases/v1.0.0`,
        ),
      ).toBe(true)
      expect(result.addedUnreleasedLink).toBe(true)
      expect(result.addedVersionLinks).toEqual(['v1.0.0'])
    })

    it('should append only the missing tag link when unreleased already exists', () => {
      const original = `# Notes

[Unreleased]: https://example.com/compare/v0.9.0...HEAD`

      const result = updateReferenceLinks(original, ['v1.0.0'], linkTarget, unreleasedLine)

      const lines = result.changelog.split('\n')
      expect(lines.filter(line => line.startsWith('[Unreleased]: '))).toHaveLength(1)
      expect(result.addedUnreleasedLink).toBe(false)
      expect(result.addedVersionLinks).toEqual(['v1.0.0'])
    })

    it('should update multiple labels when provided', () => {
      const original = `# Notes

[Unreleased]: old
[1.0.0]: old`

      const result = updateReferenceLinks(original, ['v1.0.0', '1.0.0'], linkTarget, unreleasedLine)

      expect(result.changelog).toContain('[1.0.0]: https://example.com/releases/v1.0.0')
      expect(result.changelog).toContain('[v1.0.0]: https://example.com/releases/v1.0.0')
      expect(result.addedUnreleasedLink).toBe(false)
      expect(result.addedVersionLinks).toEqual(['v1.0.0'])
    })

    it('should report all added version labels when none exist', () => {
      const original = `# Notes`

      const result = updateReferenceLinks(original, ['v1.0.0', '1.0.0'], linkTarget, unreleasedLine)

      expect(result.addedVersionLinks).toEqual(['v1.0.0', '1.0.0'])
      expect(result.changelog).toContain('[1.0.0]: https://example.com/releases/v1.0.0')
    })
  })
})
