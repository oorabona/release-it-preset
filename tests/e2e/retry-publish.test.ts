/**
 * E2E tests for the retry-publish-preflight CLI command.
 *
 * These tests validate the pre-flight check behavior of the compiled
 * `dist/scripts/retry-publish.js` script against a real git repository.
 *
 * The actual release-it invocation (npm publish, GitHub release) is NOT
 * tested here; those steps remain disabled via env flags.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTempGitRepo, type TempRepo } from '../helpers/temp-repo.js'

const BASE_CHANGELOG = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
`

describe('E2E: retry-publish-preflight', () => {
  let repo: TempRepo

  beforeEach(() => {
    repo = createTempGitRepo({ branch: 'main' })
  })

  afterEach(() => {
    repo.cleanup()
  })

  it('preflight passes when tag matches package.json version', () => {
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '2.3.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    repo.tag('2.3.0')

    // Note: the CLI command is `retry-publish-preflight`, which maps to
    // the `retry-publish` utility script (see UTILITY_COMMANDS in bin/cli.js).
    const result = repo.runCli(['retry-publish-preflight'])

    expect(result.exitCode, `preflight stderr: ${result.stderr}`).toBe(0)
    // Output should confirm version / tag match
    const output = result.stdout + result.stderr
    expect(output).toContain('2.3.0')
  })

  it('preflight fails when no matching tag exists', () => {
    // package.json says 2.3.0 but no git tag has been created
    repo.commit('chore: init', {
      'package.json': JSON.stringify({ name: 'demo', version: '2.3.0' }),
      'CHANGELOG.md': BASE_CHANGELOG,
    })
    // Intentionally no repo.tag() call

    const result = repo.runCli(['retry-publish-preflight'])

    // Should fail because retry-publish.ts throws when no tags exist
    expect(result.exitCode).not.toBe(0)
    const output = result.stdout + result.stderr
    expect(output.toLowerCase()).toMatch(/no tags|tag.*not found|pre-flight.*fail/i)
  })
})
