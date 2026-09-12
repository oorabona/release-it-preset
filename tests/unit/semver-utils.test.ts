import { describe, expect, it } from 'vitest'
import { isStrictSemver, rangeIncludesVersion } from '../../scripts/lib/semver-utils'

describe('semver-utils', () => {
  it('accepts valid raw version identifiers without surrounding whitespace', () => {
    expect(isStrictSemver('1.2.3')).toBe(true)
    expect(isStrictSemver('v1.2.3')).toBe(true)
    expect(isStrictSemver('1.0.0-beta.1+build.123')).toBe(true)
  })

  it('rejects padded or incomplete raw version identifiers', () => {
    expect(isStrictSemver(' v1.2.3 ')).toBe(false)
    expect(isStrictSemver('\n1.2.3\n')).toBe(false)
    expect(isStrictSemver('1.0')).toBe(false)
  })

  it('treats workspace protocol passthrough ranges as including the workspace version', () => {
    expect(rangeIncludesVersion('workspace:*', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('workspace:^', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('workspace:~', '1.2.3')).toBe(true)
  })

  it('evaluates explicit workspace protocol ranges after stripping the prefix', () => {
    expect(rangeIncludesVersion('workspace:1.2.3', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('workspace:1.2.4', '1.2.3')).toBe(false)
    expect(rangeIncludesVersion('workspace:^1.2.0', '1.3.0')).toBe(true)
    expect(rangeIncludesVersion('workspace:^1.2.0', '2.0.0')).toBe(false)
    expect(rangeIncludesVersion('workspace:~1.2.0', '1.2.9')).toBe(true)
    expect(rangeIncludesVersion('workspace:~1.2.0', '1.3.0')).toBe(false)
    expect(rangeIncludesVersion('workspace:>=1.2.0', '1.5.0')).toBe(true)
    expect(rangeIncludesVersion('workspace:>=1.2.0', '1.1.9')).toBe(false)
  })

  it('evaluates exact ranges', () => {
    expect(rangeIncludesVersion('1.2.3', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('=1.2.3', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('1.2.4', '1.2.3')).toBe(false)
  })

  it('evaluates caret ranges', () => {
    expect(rangeIncludesVersion('^1.2.0', '1.3.0')).toBe(true)
    expect(rangeIncludesVersion('^1.2.0', '2.0.0')).toBe(false)
    expect(rangeIncludesVersion('^0.2.0', '0.2.5')).toBe(true)
    expect(rangeIncludesVersion('^0.2.0', '0.3.0')).toBe(false)
  })

  it('evaluates tilde ranges', () => {
    expect(rangeIncludesVersion('~1.2.0', '1.2.9')).toBe(true)
    expect(rangeIncludesVersion('~1.2.0', '1.3.0')).toBe(false)
  })

  it('evaluates greater-than-or-equal ranges', () => {
    expect(rangeIncludesVersion('>=1.2.0', '1.2.0')).toBe(true)
    expect(rangeIncludesVersion('>=1.2.0', '1.5.0')).toBe(true)
    expect(rangeIncludesVersion('>=1.2.0', '1.1.9')).toBe(false)
  })

  it('evaluates OR-joined supported ranges', () => {
    expect(rangeIncludesVersion('^0.9.0 || ^1.0.0', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('^0.9.0||^1.0.0', '1.2.3')).toBe(true)
    expect(rangeIncludesVersion('^0.9.0 || ^2.0.0', '1.2.3')).toBe(false)
  })

  it('returns null for unsupported range syntax', () => {
    expect(rangeIncludesVersion('>=1.0.0 <2.0.0', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('latest', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('latest || ^2.0.0', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('workspace:', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('workspace:latest', '1.2.3')).toBeNull()
    expect(rangeIncludesVersion('workspace:>=1.0.0 <2.0.0', '1.2.3')).toBeNull()
  })

  it('returns null when the workspace version carries prerelease or build metadata', () => {
    expect(rangeIncludesVersion('^1.0.0', '1.0.0-beta.1')).toBeNull()
    expect(rangeIncludesVersion('>=1.0.0', '1.0.0-beta.1')).toBeNull()
    expect(rangeIncludesVersion('^1.0.0', '1.0.0+build.5')).toBeNull()
    expect(rangeIncludesVersion('^1.0.0', '01.0.0')).toBeNull()
  })

  it('returns null when a range operand carries prerelease metadata', () => {
    expect(rangeIncludesVersion('^1.0.0-rc.1', '1.2.0')).toBeNull()
  })
})
