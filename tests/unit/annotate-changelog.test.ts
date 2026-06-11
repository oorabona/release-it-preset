import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AnnotateChangelogDeps,
  annotateChangelog,
  choosePrimarySha,
  extractStructuredChangelogNotes,
  groupEntriesForLookup,
  parseUnreleasedEntries,
} from '../../scripts/annotate-changelog'

describe('annotate-changelog', () => {
  let deps: AnnotateChangelogDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      getEnv: vi.fn(() => undefined),
      log: vi.fn(),
      warn: vi.fn(),
    }
  })

  it('extracts typed changelog blocks from PR bodies', () => {
    const notes = extractStructuredChangelogNotes(
      `
## Summary
- ignored summary fallback

<!-- changelog:added -->
Add the annotate command.
<!-- /changelog -->

<!-- changelog:FIXED -->
Preserve regenerated notes
across reruns.
<!-- /changelog -->
`,
      { prNumber: 49, warn: deps.warn },
    )

    expect(notes).toEqual([
      { section: '### Added', text: 'Add the annotate command.' },
      { section: '### Fixed', text: 'Preserve regenerated notes across reruns.' },
    ])
  })

  it('warns and ignores unknown typed blocks', () => {
    const notes = extractStructuredChangelogNotes(
      `
<!-- changelog:misc -->
Do not guess where this belongs.
<!-- /changelog -->
`,
      { prNumber: 49, warn: deps.warn },
    )

    expect(notes).toEqual([])
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('PR #49'))
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('unknown changelog type'))
  })

  it('chooses the first primary sha in document order', () => {
    expect(choosePrimarySha(['bbbbbbb', 'aaaaaaa', 'ccccccc'])).toBe('bbbbbbb')
    expect(choosePrimarySha(['ccccccc', 'bbbbbbb', 'aaaaaaa'])).toBe('ccccccc')
  })

  it('keeps multiple entries that point at the same sha in one lookup group', () => {
    const parsed = parseUnreleasedEntries(`
### Added
- add annotate command ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
### Fixed
- fix annotate command ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    const { groups } = groupEntriesForLookup(parsed.entries)

    expect(groups).toHaveLength(1)
    expect(groups[0].entries).toHaveLength(2)
  })

  it('moves typed PR blocks to their canonical sections', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Changed
- fix annotate command (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))

## [1.0.0] - 2026-01-01

- previous release
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 49 --json number,body') {
        return JSON.stringify({
          number: 49,
          body: `<!-- changelog:fixed -->
Ship the annotate workflow.
<!-- /changelog -->`,
        })
      }
      return ''
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain('### Fixed')
    expect(written).toContain(
      '- Ship the annotate workflow. (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))',
    )
    expect(written).not.toContain('### Changed\n- fix annotate command')
    expect(written).toContain('## [1.0.0] - 2026-01-01')
  })

  it('preserves a foreign issue reference at the end of a block text', () => {
    // Mutation lock: stripping ANY trailing (#NNN) before appending the PR
    // reference used to corrupt author text like "issue (#123)" into "(#49)".
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Fixed
- fix crash (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 49 --json number,body') {
        return JSON.stringify({
          number: 49,
          body: `<!-- changelog:fixed -->
Fix the crash reported in issue (#123)
<!-- /changelog -->`,
        })
      }
      return ''
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain(
      '- Fix the crash reported in issue (#123) (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))',
    )
  })

  it('resolves commit shas through the commits pulls endpoint and regroups by PR', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- add annotate command ([bbbbbbb](https://github.com/owner/repo/commit/bbbbbbb))

### Fixed
- fix annotate command ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (
        command ===
        "gh api repos/owner/repo/commits/bbbbbbb/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 49,
            merged_at: '2026-01-02T03:04:05Z',
            body: `<!-- changelog:changed -->
Ship the annotate workflow.
<!-- /changelog -->`,
          },
        ])
      }
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 49,
            merged_at: '2026-01-02T03:04:05Z',
            body: `<!-- changelog:changed -->
Ship the annotate workflow.
<!-- /changelog -->`,
          },
        ])
      }
      return ''
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(
      vi.mocked(deps.execSync).mock.calls.filter(([command]) => command.startsWith('gh api')),
    ).toHaveLength(2)
    expect(written.match(/Ship the annotate workflow/g) ?? []).toHaveLength(1)
    expect(written).toContain(
      '- Ship the annotate workflow. (#49) ([bbbbbbb](https://github.com/owner/repo/commit/bbbbbbb))',
    )
  })

  it('leaves bullets untouched when a sha has no merged PR association', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- add annotate command ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([])
      }
      return ''
    })

    annotateChangelog(deps)

    // Mutation lock: re-rendering on a no-op run used to rewrite the file and
    // restructure non-entry lines; nothing annotated must mean nothing written.
    expect(deps.writeFileSync).not.toHaveBeenCalled()
    expect(vi.mocked(deps.log).mock.calls.flat().join('\n')).toContain('nothing to annotate')
  })

  it('does not touch breaking changes entries', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### ⚠️ BREAKING CHANGES
- remove old behavior (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    annotateChangelog(deps)

    expect(deps.execSync).not.toHaveBeenCalled()
    expect(deps.writeFileSync).not.toHaveBeenCalled()
  })

  it('is idempotent by regenerating from PR data instead of appending', () => {
    const firstInput = `# Changelog

## [Unreleased]

### Changed
- ship the annotate workflow (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`

    vi.mocked(deps.readFileSync).mockReturnValue(firstInput)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 49 --json number,body') {
        return JSON.stringify({
          number: 49,
          body: `<!-- changelog:changed -->
ship the annotate workflow
<!-- /changelog -->`,
        })
      }
      return ''
    })

    annotateChangelog(deps)
    const firstOutput = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string

    vi.mocked(deps.readFileSync).mockReturnValue(firstOutput)
    vi.mocked(deps.writeFileSync).mockClear()

    annotateChangelog(deps)

    const secondOutput = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(secondOutput).toBe(firstOutput)
    expect(secondOutput.match(/ship the annotate workflow/g) ?? []).toHaveLength(1)
  })

  it('throws before writing when gh fails', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- add annotate command (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 49 --json number,body') {
        throw new Error('not logged in to any GitHub hosts')
      }
      return ''
    })

    expect(() => annotateChangelog(deps)).toThrow(/gh pr view 49 --json number,body/)
    expect(deps.writeFileSync).not.toHaveBeenCalled()
  })

  it('throws before any gh lookup when the GitHub repository is unavailable', () => {
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- add annotate command (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        throw new Error('no remote')
      }
      return ''
    })

    expect(() => annotateChangelog(deps)).toThrow(/Could not determine GitHub repository/)
    expect(vi.mocked(deps.execSync).mock.calls.some(([command]) => command.startsWith('gh '))).toBe(
      false,
    )
    expect(deps.writeFileSync).not.toHaveBeenCalled()
  })
})
