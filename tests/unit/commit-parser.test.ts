import { describe, expect, it } from 'vitest'
import {
  CONVENTIONAL_COMMIT_REGEX,
  isConventionalCommit,
  isStrictConventionalCommit,
  parseConventionalCommit,
  STRICT_CONVENTIONAL_COMMIT_REGEX,
} from '../../scripts/lib/commit-parser'

describe('commit-parser utilities', () => {
  it('matches conventional commits with base regex', () => {
    expect(isConventionalCommit('feat(api): add endpoint')).toBe(true)
    expect(CONVENTIONAL_COMMIT_REGEX.test('chore: maintenance')).toBe(true)
    expect(isConventionalCommit('Update docs')).toBe(false)
  })

  it('validates strict conventional commit types', () => {
    expect(isStrictConventionalCommit('fix: bug')).toBe(true)
    expect(STRICT_CONVENTIONAL_COMMIT_REGEX.test('perf: optimize')).toBe(true)
    expect(isStrictConventionalCommit('misc: task')).toBe(false)
  })

  it('parses commit details', () => {
    const parsed = parseConventionalCommit('feat(core)!: new API surface')

    expect(parsed).toEqual({
      type: 'feat',
      scope: 'core',
      breaking: true,
      description: 'new API surface',
    })
  })

  it('returns null for non-conventional commits', () => {
    expect(parseConventionalCommit('random message')).toBeNull()
  })
})
