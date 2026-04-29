/**
 * E2E tests for the default release workflow.
 *
 * These tests use a real temporary git repository with no mocks.
 * They exercise the `update` (populate changelog) and `validate`
 * CLI commands end-to-end, including file I/O, git operations, and
 * the compiled dist scripts.
 *
 * The `default` release command itself is NOT invoked here because it
 * spawns release-it which would attempt network-bound git-push and npm
 * publish steps. Those remain disabled via env flags in CI and are tested
 * at the integration level instead.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempGitRepo, type TempRepo } from '../helpers/temp-repo.js'

// Keep a Changelog compatible CHANGELOG.md template
const CHANGELOG_TEMPLATE = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`

describe('E2E: release-default workflow', () => {
  let repo: TempRepo

  beforeEach(() => {
    repo = createTempGitRepo({ branch: 'main' })
  })

  afterEach(() => {
    repo.cleanup()
  })

  it('populates [Unreleased] from conventional commits and validates', () => {
    // 1. Seed the repository
    repo.commit('chore: initial setup', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'CHANGELOG.md': CHANGELOG_TEMPLATE,
    })
    repo.tag('1.0.0')

    // 2. Add conventional commits since the tag
    repo.commit('feat: add login')
    repo.commit('fix: handle edge case')
    repo.commit('docs: update readme')

    // 3. Populate the [Unreleased] section
    const updateResult = repo.runCli(['update'])
    expect(updateResult.exitCode, `update stderr: ${updateResult.stderr}`).toBe(0)

    // 4. Assert changelog sections
    const changelog = readFileSync(join(repo.cwd, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('### Added')
    expect(changelog).toContain('add login')
    expect(changelog).toContain('### Fixed')
    expect(changelog).toContain('handle edge case')
    expect(changelog).toContain('### Changed')
    expect(changelog).toContain('update readme')

    // 5. Commit the updated changelog so working dir is clean for validate
    execFileSync('git', ['add', 'CHANGELOG.md'], { cwd: repo.cwd, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', 'docs: update changelog'], { cwd: repo.cwd, stdio: 'pipe' })

    // 6. validate should now pass (changelog has content, clean working dir)
    const validateResult = repo.runCli(['validate'])
    expect(validateResult.exitCode, `validate stderr: ${validateResult.stderr}`).toBe(0)
  })

  it('validate exits non-zero when [Unreleased] is empty', () => {
    // CHANGELOG with an empty [Unreleased] section (no change entries)
    const emptyChangelog = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

`
    repo.commit('chore: initial setup', {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
      'CHANGELOG.md': emptyChangelog,
    })
    repo.tag('1.0.0')

    const validateResult = repo.runCli(['validate'])

    // Should fail because [Unreleased] has no content
    expect(validateResult.exitCode).not.toBe(0)
    const output = validateResult.stdout + validateResult.stderr
    expect(output.toLowerCase()).toMatch(/empty|unreleased|no change/i)
  })
})
