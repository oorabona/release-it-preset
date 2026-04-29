/**
 * E2E tests for the hotfix / populate-unreleased-changelog behavior.
 *
 * The `hotfix` release config invokes `populate-unreleased-changelog` in its
 * pre-bump hooks, so validating that script's behavior against a real git repo
 * covers the critical part of the hotfix workflow.
 *
 * The actual release-it bump step (git commit + tag + push) is NOT exercised
 * here because it would require git push access and a real npm registry.
 * Those network-bound steps remain disabled via env flags and are out of scope
 * for the E2E layer. Use `it.skip` is applied where noted below.
 *
 * All tests create a real temporary git repo (no mocks).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempGitRepo, type TempRepo } from '../helpers/temp-repo.js'

const BASE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`

describe('E2E: hotfix / populate-unreleased-changelog', () => {
  let repo: TempRepo

  beforeEach(() => {
    repo = createTempGitRepo({ branch: 'main' })
  })

  afterEach(() => {
    repo.cleanup()
  })

  it('handles a repo with NO prior tag (initial release)', () => {
    // No repo.tag() call — simulates first-ever release
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '0.1.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    repo.commit('feat: initial feature')
    repo.commit('fix: startup crash')

    const result = repo.runCli(['update'])

    // Must not crash on `git describe` returning non-zero (no tags yet)
    expect(result.exitCode, `update stderr: ${result.stderr}`).toBe(0)

    const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')
    // All commits since repo creation should appear
    expect(changelog).toContain('initial feature')
    expect(changelog).toContain('startup crash')
  })

  it('respects [skip-changelog] marker', () => {
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    repo.tag('1.0.0')

    repo.commit('feat: visible thing')
    repo.commit('fix: hidden thing [skip-changelog]')

    const result = repo.runCli(['update'])
    expect(result.exitCode, `update stderr: ${result.stderr}`).toBe(0)

    const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('visible thing')
    expect(changelog).not.toContain('hidden thing')
  })

  it('handles multi-prefix commit (multiple conventional commits in one message body)', () => {
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    repo.tag('1.0.0')

    // A single commit whose body contains two conventional commit lines
    // The script's extractConventionalCommitParts parses all matching lines
    repo.commit('feat: add A\nfix: fix B')

    const result = repo.runCli(['update'])
    expect(result.exitCode, `update stderr: ${result.stderr}`).toBe(0)

    const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')
    // Both parts must appear in their respective sections
    expect(changelog).toContain('add A')
    expect(changelog).toContain('fix B')
    expect(changelog).toContain('### Added')
    expect(changelog).toContain('### Fixed')
  })

  it('generates commit links using the configured remote URL', () => {
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    repo.tag('1.0.0')

    repo.commit('feat: linked feature')

    const result = repo.runCli(['update'])
    expect(result.exitCode, `update stderr: ${result.stderr}`).toBe(0)

    const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')

    // The helper sets remote origin = https://github.com/example/demo-e2e.git
    // The script strips .git and generates links in the form:
    //   ([<sha>](https://github.com/example/demo-e2e/commit/<sha>))
    expect(changelog).toMatch(/\(\[[\da-f]{7}\]\(https:\/\/github\.com\/example\/demo-e2e\/commit\/[\da-f]{7}\)\)/)
    expect(changelog).toContain('linked feature')
  })
})
