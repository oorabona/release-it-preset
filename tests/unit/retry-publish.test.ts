import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type RetryPublishDeps, retryPublish } from '../../scripts/retry-publish'

describe('retry-publish (with DI)', () => {
  let deps: RetryPublishDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      readFileSync: vi.fn(),
    }
  })

  describe('retryPublish', () => {
    it('should successfully check retry publish readiness', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('main') // current branch
        .mockReturnValueOnce('v1.0.0') // latest tag
        .mockReturnValueOnce('abc1234567890') // tag commit
        .mockReturnValueOnce('') // git diff
        .mockReturnValueOnce('') // git diff --cached
      vi.mocked(deps.readFileSync).mockReturnValue('{"version":"1.0.0"}')

      const result = retryPublish(deps)

      expect(result.currentBranch).toBe('main')
      expect(result.latestTag).toBe('v1.0.0')
      expect(result.tagCommit).toBe('abc1234567890')
      expect(result.hasUncommittedChanges).toBe(false)
      expect(deps.log).toHaveBeenCalledWith('🔄 Starting retry publish process...')
      expect(deps.log).toHaveBeenCalledWith('✅ Pre-flight checks passed. Ready to retry publish.')
      expect(deps.log).toHaveBeenCalledWith(
        'ℹ️  package.json version (1.0.0) matches the latest tag.',
      )
    })

    it('should throw error when no tags found', () => {
      vi.mocked(deps.execSync).mockReturnValueOnce('main') // current branch
      vi.mocked(deps.execSync).mockImplementationOnce(() => {
        throw new Error('no tags')
      })

      expect(() => retryPublish(deps)).toThrow('No tags found in repository')
    })

    it('should throw error when tag does not exist', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('main') // current branch
        .mockReturnValueOnce('v1.0.0') // latest tag
      vi.mocked(deps.execSync).mockImplementationOnce(() => {
        throw new Error('tag not found')
      })

      expect(() => retryPublish(deps)).toThrow('Tag v1.0.0 not found')
    })

    it('should detect uncommitted changes', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('main')
        .mockReturnValueOnce('v1.0.0')
        .mockReturnValueOnce('abc1234567890')

      // git diff throws (has changes)
      vi.mocked(deps.execSync).mockImplementationOnce(() => {
        throw new Error('has changes')
      })

      const result = retryPublish(deps)

      expect(result.hasUncommittedChanges).toBe(true)
      expect(deps.warn).toHaveBeenCalledWith(
        '⚠️  You have uncommitted changes. They will be preserved.',
      )
    })

    it('should detect staged changes', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('main')
        .mockReturnValueOnce('v1.0.0')
        .mockReturnValueOnce('abc1234567890')
        .mockReturnValueOnce('') // git diff (no unstaged)

      // git diff --cached throws (has staged)
      vi.mocked(deps.execSync).mockImplementationOnce(() => {
        throw new Error('has staged changes')
      })

      const result = retryPublish(deps)

      expect(result.hasUncommittedChanges).toBe(true)
    })

    it('should truncate commit SHA to 8 characters in log', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('develop')
        .mockReturnValueOnce('v2.0.0-beta.1')
        .mockReturnValueOnce('abcdef1234567890abcdef1234567890')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
      vi.mocked(deps.readFileSync).mockReturnValue('{"version":"2.0.0-beta.1"}')

      const result = retryPublish(deps)

      expect(result.tagCommit).toBe('abcdef1234567890abcdef1234567890')
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('abcdef12'))
    })

    it('should log all steps of the process', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('feature/test')
        .mockReturnValueOnce('v1.2.3')
        .mockReturnValueOnce('xyz987654321')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
      vi.mocked(deps.readFileSync).mockReturnValue('{"version":"1.2.3"}')

      retryPublish(deps)

      expect(deps.log).toHaveBeenCalledWith('🔄 Starting retry publish process...')
      expect(deps.log).toHaveBeenCalledWith('ℹ️  Current branch: feature/test')
      expect(deps.log).toHaveBeenCalledWith('ℹ️  Latest tag found: v1.2.3')
      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('ℹ️  Tag v1.2.3 points to commit:'),
      )
      expect(deps.log).toHaveBeenCalledWith('✅ Pre-flight checks passed. Ready to retry publish.')
      expect(deps.log).toHaveBeenCalledWith(
        '📦 This will republish from tag v1.2.3 to npm and GitHub Releases',
      )
      expect(deps.log).toHaveBeenCalledWith('🔒 No Git history will be modified')
      expect(deps.log).toHaveBeenCalledWith(
        '💡 Next command: release-it --config node_modules/@oorabona/release-it-preset/config/retry-publish.js',
      )
    })

    it('should warn when package.json version mismatches the tag', () => {
      vi.mocked(deps.execSync)
        .mockReturnValueOnce('main')
        .mockReturnValueOnce('v1.0.0')
        .mockReturnValueOnce('abc1234567890')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('')
      vi.mocked(deps.readFileSync).mockReturnValue('{"version":"2.0.0"}')

      const result = retryPublish(deps)

      expect(result.packageVersion).toBe('2.0.0')
      expect(deps.warn).toHaveBeenCalledWith(
        '⚠️  package.json version (2.0.0) does not match latest tag (1.0.0).',
      )
    })
  })
})
