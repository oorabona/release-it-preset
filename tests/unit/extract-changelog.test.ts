import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ExtractChangelogDeps, extractChangelog } from '../../scripts/extract-changelog'
import { escapeRegExp } from '../../scripts/lib/string-utils'

describe('extract-changelog (with DI)', () => {
  let deps: ExtractChangelogDeps

  beforeEach(() => {
    deps = {
      readFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
      getCwd: () => '/test/project',
    }
  })

  describe('escapeRegExp', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegExp('v1.0.0')).toBe('v1\\.0\\.0')
      expect(escapeRegExp('v1.0.0-beta.1')).toBe('v1\\.0\\.0\\-beta\\.1') // - IS escaped by string-utils
      expect(escapeRegExp('[test]')).toBe('\\[test\\]')
      expect(escapeRegExp('(test)')).toBe('\\(test\\)')
      expect(escapeRegExp('test*')).toBe('test\\*')
      expect(escapeRegExp('test+')).toBe('test\\+')
      expect(escapeRegExp('test?')).toBe('test\\?')
      expect(escapeRegExp('test^')).toBe('test\\^')
      expect(escapeRegExp('test$')).toBe('test\\$')
      expect(escapeRegExp('test{1}')).toBe('test\\{1\\}')
      expect(escapeRegExp('test|other')).toBe('test\\|other')
      expect(escapeRegExp('test\\path')).toBe('test\\\\path')
    })

    it('should handle strings without special characters', () => {
      expect(escapeRegExp('test')).toBe('test')
      expect(escapeRegExp('v100')).toBe('v100')
    })
  })

  describe('extractChangelog', () => {
    it('should extract changelog for a version', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [v1.0.0] - 2024-01-01\n\n- Added feature A\n- Fixed bug B\n\n## [v0.9.0] - 2023-12-01\n\n- Initial release\n',
      )

      const result = extractChangelog('1.0.0', deps)

      expect(result).toContain('# Release v1.0.0')
      expect(result).toContain('## [v1.0.0] - 2024-01-01')
      expect(result).toContain('- Added feature A')
      expect(result).toContain('- Fixed bug B')
      expect(result).not.toContain('v0.9.0')
    })

    it('should handle version without brackets', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## v1.0.0 - 2024-01-01\n\n- Change 1\n\n## v0.9.0\n\n- Change 2\n',
      )

      const result = extractChangelog('1.0.0', deps)

      expect(result).toContain('v1.0.0')
      expect(result).toContain('- Change 1')
      expect(result).not.toContain('v0.9.0')
    })

    it('should not extract a prerelease section for its stable version', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [1.6.0-rc.0] - 2026-01-02\n\n- Release candidate\n',
      )

      expect(() => extractChangelog('1.6.0', deps)).toThrow('No [v1.6.0] or [1.6.0] section found')
    })

    it('should extract the stable section when a prerelease heading comes first', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [1.6.0-rc.0] - 2026-01-02\n\n- Release candidate\n\n## [1.6.0] - 2026-01-03\n\n- Stable release\n',
      )

      const result = extractChangelog('1.6.0', deps)

      expect(result).toContain('- Stable release')
      expect(result).not.toContain('- Release candidate')
    })

    it('should not extract a build-metadata section for its stable version', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [1.6.0+build.1] - 2026-01-02\n\n- Build metadata release\n',
      )

      expect(() => extractChangelog('1.6.0', deps)).toThrow('No [v1.6.0] or [1.6.0] section found')
    })

    it('should extract an unbracketed exact version heading', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## 1.6.0 - 2026-01-02\n\n- Stable release\n',
      )

      const result = extractChangelog('1.6.0', deps)

      expect(result).toContain('## 1.6.0 - 2026-01-02')
    })

    it('should throw error when version not found', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [v0.9.0] - 2023-12-01\n\n- Initial release\n',
      )

      expect(() => extractChangelog('1.0.0', deps)).toThrow(
        /No \[v1\.0\.0] or \[1\.0\.0] section found/,
      )
    })

    it('should throw error when version has no content', () => {
      vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\n## [v1.0.0] - 2024-01-01\n\n')

      expect(() => extractChangelog('1.0.0', deps)).toThrow('No changelog entry found')
    })

    it('should use custom CHANGELOG_FILE', () => {
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_FILE' ? 'HISTORY.md' : undefined,
      )
      vi.mocked(deps.readFileSync).mockReturnValue('# History\n\n## [v1.0.0]\n\n- Change\n\n')

      extractChangelog('1.0.0', deps)

      expect(deps.readFileSync).toHaveBeenCalledWith('/test/project/HISTORY.md', 'utf8')
    })

    it('should extract version with date and link', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [v1.0.0] - 2024-01-01\n\n### Added\n- Feature\n\n## [v0.9.0]\n\n- Old\n',
      )

      const result = extractChangelog('1.0.0', deps)

      expect(result).toContain('## [v1.0.0] - 2024-01-01')
      expect(result).toContain('### Added')
      expect(result).toContain('- Feature')
      expect(result).not.toContain('v0.9.0')
    })

    it('should handle version at end of file', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [v1.1.0]\n\n- New\n\n## [v1.0.0]\n\n- Last version',
      )

      const result = extractChangelog('1.0.0', deps)

      expect(result).toContain('## [v1.0.0]')
      expect(result).toContain('- Last version')
      expect(result).not.toContain('v1.1.0')
    })

    it('should preserve build metadata in the generated release title and tag', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [v1.0.0-beta.1+build.123] - 2024-01-01\n\n- Beta feature\n\n',
      )

      const result = extractChangelog('1.0.0-beta.1+build.123', deps)

      expect(result).toBe(
        '# Release v1.0.0-beta.1+build.123\n\n## [v1.0.0-beta.1+build.123] - 2024-01-01\n\n- Beta feature',
      )
    })

    it('should find version without v-prefix when requesting v-prefixed tag', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        '# Changelog\n\n## [1.0.0] - 2024-01-01\n\n- Entry\n',
      )

      const result = extractChangelog('v1.0.0', deps)

      expect(result).toContain('# Release v1.0.0')
      expect(result).toContain('## [1.0.0] - 2024-01-01')
      expect(result).toContain('- Entry')
    })

    it('should reject invalid versions with the existing error message', () => {
      expect(() => extractChangelog('01.0.0', deps)).toThrow(
        'Invalid semantic version: "01.0.0". Expected format: [v]MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]',
      )
    })

    it('should reject padded versions with the existing error message', () => {
      expect(() => extractChangelog(' v1.2.3 ', deps)).toThrow(
        'Invalid semantic version: " v1.2.3 ". Expected format: [v]MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]',
      )
    })
  })
})
