import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AnnotateChangelogDeps,
  annotateChangelog,
  choosePrimarySha,
  extractCommitShas,
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

  it('rejects overlapping blocks and keeps only the well-formed inner one', () => {
    // Mutation lock: without the nested-marker guard the outer block leaked
    // the raw inner marker into the changelog and duplicated the inner text.
    const notes = extractStructuredChangelogNotes(
      '<!-- changelog:added -->A<!-- changelog:fixed -->B<!-- /changelog -->',
      { prNumber: 49, warn: deps.warn },
    )

    expect(notes).toEqual([{ section: '### Fixed', text: 'B' }])
    expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('nested changelog marker'))
  })

  it('ignores changelog markers inside fenced code regions', () => {
    // Mutation lock: without fence masking the documentation EXAMPLE block in
    // a PR body was imported as a real entry during the v1.3.0 dogfood (#66).
    const notes = extractStructuredChangelogNotes(
      `
Real entry below.

<!-- changelog:added -->
The real entry.
<!-- /changelog -->

Example for the docs:

\`\`\`html
<!-- changelog:fixed -->
Describe the user-visible fix.
<!-- /changelog -->
\`\`\`

~~~
<!-- changelog:security -->
Another inert example.
<!-- /changelog -->
~~~
`,
      { prNumber: 66, warn: deps.warn },
    )

    expect(notes).toEqual([{ section: '### Added', text: 'The real entry.' }])
    expect(deps.warn).not.toHaveBeenCalled()
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

  it('ignores hex-looking prose words, keeps generated commit references', () => {
    // Mutation lock: matching any bare 7-40 hex word used to send ticket ids
    // and words like "deadbeef" to the commits/<sha>/pulls endpoint.
    expect(extractCommitShas('bump build 1234567 cache key for deadbeef')).toEqual([])
    expect(extractCommitShas('add feature (1a2b3c4)')).toEqual(['1a2b3c4'])
    expect(
      extractCommitShas('add feature ([1a2b3c4](https://github.com/o/r/commit/1a2b3c4))'),
    ).toEqual(['1a2b3c4'])
    // Imported author prose may embed commit URLs and PR references — only
    // the generated trailing forms identify the bullet.
    expect(extractCommitShas('see https://github.com/o/r/commit/bbbbbbb for context')).toEqual([])
    expect(
      extractCommitShas(
        'see https://github.com/o/r/commit/bbbbbbb (#80) ([ccccccc](https://github.com/o/r/commit/ccccccc))',
      ),
    ).toEqual(['ccccccc'])
  })

  it('never regenerates entries from an unmerged pull request body', () => {
    // Mutation lock: gh pr view answers for open PRs too — without the
    // mergedAt filter an unreviewed open-PR body could rewrite the changelog.
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Changed
- prepare the next migration (#321)
`)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 321 --repo owner/repo --json number,body,mergedAt') {
        return JSON.stringify({
          number: 321,
          mergedAt: null,
          body: '<!-- changelog:changed -->\nUnreviewed text\n<!-- /changelog -->',
        })
      }
      return ''
    })

    annotateChangelog(deps)

    expect(deps.writeFileSync).not.toHaveBeenCalled()
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
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 49,
            merged_at: '2026-01-01T00:00:00Z',
            body: `<!-- changelog:fixed -->
Ship the annotate workflow.
<!-- /changelog -->`,
          },
        ])
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
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 49,
            merged_at: '2026-01-01T00:00:00Z',
            body: `<!-- changelog:fixed -->
Fix the crash reported in issue (#123)
<!-- /changelog -->`,
          },
        ])
      }
      return ''
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain(
      '- Fix the crash reported in issue (#123) (#49) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))',
    )
  })

  it('preserves wrapped bullets and curated notes in their original section', () => {
    // Mutation lock: the previous renderer hoisted non-bullet lines above all
    // sections and dropped bullet continuation lines, so annotating one PR
    // corrupted unrelated, manually curated content.
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- add annotate command ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))

### Fixed
- a manually written fix that wraps
  onto a second indented line
> curator note kept under Fixed
`)

    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 72,
            merged_at: '2026-01-01T00:00:00Z',
            body: `<!-- changelog:added -->
Add the annotate command.
<!-- /changelog -->`,
          },
        ])
      }
      return ''
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain('- a manually written fix that wraps\n  onto a second indented line')
    const fixedIndex = written.indexOf('### Fixed')
    expect(fixedIndex).toBeGreaterThan(-1)
    expect(written.indexOf('> curator note kept under Fixed')).toBeGreaterThan(fixedIndex)
    expect(written).toContain(
      '- Add the annotate command. (#72) ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))',
    )
  })

  it('reports the number of PRs actually applied, not merely resolved', () => {
    // Mutation lock: the summary used to count every resolved PR — the
    // v1.3.0 dogfood printed "Annotated 8" while only 4 had blocks (#66).
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Added
- with a block ([aaaaaaa](https://github.com/owner/repo/commit/aaaaaaa))
- without a block ([dddddDD](https://github.com/owner/repo/commit/ddddddd))
`)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (String(command).includes('commits/aaaaaaa/pulls')) {
        return JSON.stringify([
          {
            number: 90,
            merged_at: '2026-01-01T00:00:00Z',
            body: '<!-- changelog:added -->\nWith a block.\n<!-- /changelog -->',
          },
        ])
      }
      if (String(command).includes('commits/ddddddd/pulls')) {
        return JSON.stringify([
          { number: 91, merged_at: '2026-01-01T00:00:00Z', body: 'no block here' },
        ])
      }
      return ''
    })

    annotateChangelog(deps)

    const logs = vi.mocked(deps.log).mock.calls.flat().join('\n')
    expect(logs).toContain('Annotated 1 pull request(s)')
  })

  it('keeps attribution to the source PR when imported text embeds other references', () => {
    // Mutation lock: prose-embedded "PR #72" and commit URLs used to out-rank
    // the generated trailing reference, re-keying the bullet to the wrong PR
    // on the next run.
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Fixed
- See PR #72 and https://github.com/owner/repo/commit/bbbbbbb for context (#80) ([ccccccc](https://github.com/owner/repo/commit/ccccccc))
`)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (
        command ===
        "gh api repos/owner/repo/commits/ccccccc/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 80,
            merged_at: '2026-01-01T00:00:00Z',
            body: '<!-- changelog:fixed -->\nSee PR #72 and https://github.com/owner/repo/commit/bbbbbbb for context\n<!-- /changelog -->',
          },
        ])
      }
      throw new Error(`unexpected command: ${command}`)
    })

    annotateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain(
      'See PR #72 and https://github.com/owner/repo/commit/bbbbbbb for context (#80) ([ccccccc](https://github.com/owner/repo/commit/ccccccc))',
    )
  })

  it('treats a mid-text issue reference without a commit link as plain text', () => {
    // Mutation lock: the unanchored (#N) regex used to send issue references
    // to gh pr view; prose entries without a PR marker must not trigger any
    // lookup at all.
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Fixed
- fix crash reported in issue (#123) by retrying
`)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      throw new Error(`unexpected command: ${command}`)
    })

    annotateChangelog(deps)

    expect(deps.writeFileSync).not.toHaveBeenCalled()
  })

  it('leaves a bullet untouched when its trailing reference is an issue, not a PR', () => {
    // Mutation lock: a thrown "Could not resolve to a PullRequest" used to be
    // fatal; an issue number in squash position must be benign passthrough.
    vi.mocked(deps.readFileSync).mockReturnValue(`# Changelog

## [Unreleased]

### Changed
- documented the recovery flow in the handbook (#123)
`)
    vi.mocked(deps.execSync).mockImplementation(command => {
      if (command === 'git config --get remote.origin.url') {
        return 'https://github.com/owner/repo.git'
      }
      if (command === 'gh pr view 123 --repo owner/repo --json number,body,mergedAt') {
        throw new Error('GraphQL: Could not resolve to a PullRequest with the number of 123.')
      }
      return ''
    })

    annotateChangelog(deps)

    expect(deps.writeFileSync).not.toHaveBeenCalled()
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
      if (
        command ===
        "gh api repos/owner/repo/commits/aaaaaaa/pulls --jq '[.[] | {number: .number, body: .body, merged_at: .merged_at}]'"
      ) {
        return JSON.stringify([
          {
            number: 49,
            merged_at: '2026-01-01T00:00:00Z',
            body: `<!-- changelog:changed -->
ship the annotate workflow
<!-- /changelog -->`,
          },
        ])
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
      if (command.startsWith('gh api repos/owner/repo/commits/aaaaaaa/pulls')) {
        throw new Error('not logged in to any GitHub hosts')
      }
      return ''
    })

    expect(() => annotateChangelog(deps)).toThrow(
      /gh api repos\/owner\/repo\/commits\/aaaaaaa\/pulls/,
    )
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
