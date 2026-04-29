# Testing

This document describes the test architecture, how to run the suite, and how to add new tests.

## Layout

```
tests/
├── unit/          - One file per script/module. Pure unit tests with injected dependencies.
└── integration/   - CLI behavior across modes (extends, monorepo, smoke, full workflows).
```

Source under test:

```
scripts/        - Main scripts (TypeScript), each exposes a callable function + a guarded CLI entry.
scripts/lib/    - Pure utility modules (git-utils, commit-parser, semver-utils, string-utils).
bin/            - JS CLI wrapper (validators are unit-tested via tests/unit/validators.test.ts).
```

## Running

```bash
pnpm test                  # All tests (unit + integration)
pnpm test:unit             # Unit only
pnpm test:coverage         # All, with v8 coverage (text + html + lcov)
pnpm test:unit:coverage    # Unit only, with coverage
pnpm test:watch            # Watch mode
pnpm test:ui               # Vitest UI
```

Coverage reports land in `coverage/` (lcov uploaded to Codecov by CI).

## Test approach: Dependency Injection

Scripts in `scripts/*.ts` follow a Dependency Injection (DI) pattern so the business logic runs **for real** in tests (not stubbed out by `vi.mock()`).

### Pattern

```typescript
// 1. Declare a deps interface
export interface PopulateChangelogDeps {
  execSync: (cmd: string, opts?: ExecSyncOptions) => Buffer | string
  readFileSync: typeof readFileSync
  writeFileSync: typeof writeFileSync
  getEnv: (key: string) => string | undefined
  log: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

// 2. Export a pure function taking deps
export function populateChangelog(deps: PopulateChangelogDeps): void {
  const path = deps.getEnv('CHANGELOG_FILE') ?? 'CHANGELOG.md'
  // ... business logic uses `deps.*` — never imports node:fs / node:child_process directly
}

// 3. Guarded CLI entry wires real dependencies
if (import.meta.url === `file://${process.argv[1]}`) {
  populateChangelog({
    execSync, readFileSync, writeFileSync,
    getEnv: (k) => process.env[k],
    log: console.log, warn: console.warn, error: console.error,
  })
}
```

### Test usage

```typescript
import { populateChangelog, type PopulateChangelogDeps } from '../../scripts/populate-unreleased-changelog'

describe('populate-unreleased-changelog', () => {
  let deps: PopulateChangelogDeps

  beforeEach(() => {
    deps = {
      execSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      getEnv: vi.fn(() => undefined),
      log: vi.fn(), warn: vi.fn(), error: vi.fn(),
    }
  })

  it('writes Added section for feat commits', () => {
    vi.mocked(deps.readFileSync).mockReturnValue('# Changelog\n\n## [Unreleased]\n')
    vi.mocked(deps.execSync)
      .mockReturnValueOnce('v1.0.0')
      .mockReturnValueOnce('abc1234|feat: add feature|||END|||')

    populateChangelog(deps)

    const written = vi.mocked(deps.writeFileSync).mock.calls[0][1] as string
    expect(written).toContain('### Added')
    expect(written).toContain('add feature')
  })
})
```

### Error handling

Scripts use a small typed-error hierarchy and a shared `runScript()` wrapper for consistent CLI exit codes:

- `ValidationError` — precondition failure (missing CHANGELOG, wrong branch). Exit 2.
- `GitError` — git command failure. Exit 1.
- `ChangelogError` — parse/write failure. Exit 1.
- Any other thrown `Error` — generic. Exit 1.

The CLI guard at the bottom of each script wraps the body in `runScript()`, which logs an icon-prefixed message and calls `process.exit` with the appropriate code. Tests can drive `runScript` directly with a fake `{ error, exit }` to assert exit codes without spawning a process.

### Why DI rather than `vi.mock()`

ESM module mocking via `vi.mock()` replaces the module — the real code never executes, which leaves statement coverage at the floor. With DI:

- The function under test runs end-to-end with controlled inputs.
- Coverage reflects real branch decisions and code paths.
- No global state; tests are isolated and parallel-safe.
- Scripts remain runnable as CLI entry points (the `import.meta.url` guard wires the real deps).

## Coverage thresholds

`vitest.config.ts` enforces a **branches threshold (60%)**. Statement/line/function thresholds are disabled because some integration paths use `vi.mock()` (notably the CLI wrapper in `bin/`), which inflates the noise without adding signal. Branches give a stable, meaningful gate.

Run `pnpm test:coverage` and inspect `coverage/index.html` for current numbers.

## Adding a new test

1. **For a new script:** export a `*Deps` interface + a pure function. Wire a guarded CLI entry. Mirror the DI pattern above.
2. **For a new utility in `scripts/lib/`:** keep it pure (no I/O, no env reads). Test directly with example inputs.
3. **For new CLI behavior:** add an integration test under `tests/integration/` that spawns `node bin/cli.js …` against a temp directory.

## E2E (real git repos)

E2E tests live in `tests/e2e/` and use a real temporary git repository with no mocks at any layer. Every test creates an isolated repo on disk, runs actual git commands, calls the compiled CLI (`node bin/cli.js`), and asserts on real file output and exit codes.

### How to run

```bash
pnpm test:e2e          # Run only E2E tests (opt-in, ~30 s timeout per test)
pnpm test              # Unit + integration (does not include E2E)
```

CI runs both:
- `pnpm test:coverage` — unit + integration with coverage
- `pnpm test:e2e` — E2E suite (separate step in `tests` job)

### Helper API

`tests/helpers/temp-repo.ts` exposes two functions:

```typescript
import { createTempGitRepo, withTempGitRepo } from '../helpers/temp-repo.js'

// Manual lifecycle
const repo = createTempGitRepo({ branch: 'main' })
repo.commit('feat: add login', { 'src/index.ts': 'export {}' })
repo.tag('1.0.0')
const { stdout, stderr, exitCode } = repo.runCli(['update'])
repo.cleanup()

// Auto-cleanup via try/finally
await withTempGitRepo(async (repo) => {
  repo.commit('fix: edge case')
  const result = repo.runCli(['validate'])
  expect(result.exitCode).toBe(0)
})
```

All temp directories are also cleaned up on process exit (orphan safety net).

### Safe env defaults

`runCli()` injects these defaults so tests never accidentally push or publish:

| Variable | Value | Purpose |
|---|---|---|
| `GITHUB_RELEASE` | `false` | Disable GitHub release creation |
| `NPM_PUBLISH` | `false` | Disable npm publish |
| `NPM_SKIP_CHECKS` | `true` | Skip pre-publish npm safety checks |
| `GIT_REQUIRE_UPSTREAM` | `false` | Don't require an upstream-tracking branch |
| `GIT_REQUIRE_CLEAN` | `false` | Allow runs against repos with pending changes |
| `CI` | `true` | Take the CI auth-token branch in `validate-release` |
| `NPM_TOKEN` | `dummy-e2e-token` | Satisfies the CI auth-token check without contacting the registry |

Pass an `env` object to `runCli()` to override any of these on a per-call basis.

## Known limitations

- `bin/cli.js` is exercised end-to-end through integration tests (`tests/integration/cli*.test.ts`) but is not in the coverage `include` glob (it is plain JS, not TypeScript). Integration tests assert behavior; line coverage for the wrapper is intentionally out of scope.
- Network-bound release steps (npm publish, GitHub release creation) remain disabled in E2E tests via the safe env defaults above. They are not fully exercised at the E2E layer — doing so would require real registry credentials and network access. The compiled script logic up to the point of network I/O is fully covered.
