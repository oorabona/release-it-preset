# ADR-0003: Dependency Injection pattern for scripts

- **Status**: Accepted
- **Date**: 2026-04-29
- **Deciders**: maintainers

## Context

The TypeScript scripts in `scripts/` are compiled to ESM JavaScript in
`dist/scripts/` for runtime use. Under Vitest 3+, ESM module mocking via
`vi.mock()` replaces the module so the real code paths are never exercised —
the test effectively becomes a mock-verification exercise, not a real test
of the script's behavior. Statement and branch coverage under this approach
was near zero for the actual script logic.

An additional constraint: `vi.spyOn` does not intercept named exports from
ESM modules. Because `node:fs`, `node:child_process`, and `process.env` are
imported as named exports or accessed directly, the only conventional Vitest
option for replacing them was `vi.mock()` at module scope — with the coverage
problem described above.

The v0.10.0 work (commit `6483e5d`) added a typed error hierarchy
(`ValidationError` exit 2, `GitError` exit 1, `ChangelogError` exit 1) and
needed a consistent exit-code mapping across all 8 main scripts. The
`runScript()` wrapper in `scripts/lib/run-script.ts` handles this mapping. As
a side effect, the wrapper is also the natural boundary where real I/O deps
are wired in, and an injectable-deps interface fits cleanly.

## Decision

Each `scripts/*.ts` file exports:

1. A `<ScriptName>Deps` interface describing the I/O dependencies the script
   needs (e.g. `execSync`, `readFileSync`, `writeFileSync`, `getEnv`, `log`).
2. A pure main function (`populate(deps: PopulateChangelogDeps)`) that receives
   deps at call time.
3. A CLI guard at the bottom (`if (isMain(import.meta.url)) { runScript(...) }`)
   that wires real deps from `node:fs`, `node:child_process`, and `process.env`.

The `runScript()` wrapper catches `ScriptError` subclasses and maps them to the
correct exit code. It also catches unhandled exceptions and exits 1.

Tests instantiate the script function with fake deps (plain objects
implementing the interface), assert behavior, and never touch the real
filesystem or git repository. The E2E test suite under `tests/e2e/` uses
a real git temp-repo helper (`tests/helpers/temp-repo.ts`) for integration
coverage.

Near-90% branch coverage on tested scripts was achieved after this change,
up from near-zero with `vi.mock()`-based tests.

## Alternatives considered

- **`vi.mock()` at module scope**: Straightforward to write, but the
  `vi.mock()` factory replaces the module entirely so the real code is never
  executed. Branch coverage stays near zero. Rejected.
- **`vi.spyOn` on ESM named exports**: Does not intercept reads of named
  imports in ESM (the imported binding is a live read from the module
  namespace, not a property descriptor accessible to spyOn). Rejected.
- **Class-based `BaseScript` with abstract methods**: Would have required
  converting all 8 scripts to classes and restructuring CLI entry points.
  Marginal coverage gain over the function+interface approach with significantly
  more churn. Rejected as over-engineered.
- **Separate test doubles per script (hand-written mocks)**: Equivalent to
  the interface approach but without the TypeScript type-safety on the test
  double shape. The interface ensures test doubles stay in sync with the
  real dep signatures. Rejected.
- **Integration tests only, no unit tests for scripts**: Feasible with the
  temp-repo helper, but slow for CI and provides no isolation for testing
  individual parsing/validation logic. Unit tests via DI + E2E tests for
  CLI behavior is the better trade-off. Rejected as sole strategy.

## Consequences

- **Positive**: Near-90% branch coverage on scripts achievable without mocking
  the module graph.
- **Positive**: `runScript()` wrapper standardizes exit codes across all 8
  scripts: `ValidationError` → 2, `GitError`/`ChangelogError` → 1, unexpected
  → 1. No per-script exit-code logic to maintain.
- **Positive**: Pure function core is easier to reason about and test in
  isolation. Side effects are at the boundary only.
- **Negative**: Every new script requires authoring a `Deps` interface and a
  CLI guard block. This is a small fixed overhead per script.
- **Negative**: Test doubles must be maintained alongside the `Deps` interface.
  TypeScript catches shape mismatches, but logic errors in the test double
  can still produce false-positive tests.
- **Neutral**: E2E tests (`tests/e2e/`) complement unit tests by exercising
  the full CLI path with a real git repository. Both test layers are required
  for full confidence.

## References

- `scripts/lib/errors.ts` — typed error hierarchy
- `scripts/lib/run-script.ts` — `runScript()` wrapper
- `scripts/populate-unreleased-changelog.ts` — reference DI implementation
- `docs/testing.md` — DI pattern guide + E2E helper documentation
- Commit `6483e5d` — typed errors + DI refactor (v0.10.0)
- Commit `467cca0` — E2E test suite (v0.10.0)
