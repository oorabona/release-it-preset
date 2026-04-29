# ADR-0001: release-it as peerDependency, not dependency

- **Status**: Accepted
- **Date**: 2025-10-04
- **Deciders**: maintainers

## Context

`@oorabona/release-it-preset` ships configuration files and scripts that
extend and hook into `release-it`. The question of whether `release-it` itself
belongs in `dependencies` or `peerDependencies` has a concrete impact on every
consumer of this package.

If `release-it` were listed in `dependencies`, npm/pnpm would install the
package's own copy alongside any copy the consumer already has. This creates
two parallel installations: the consumer's CLI (`pnpm release-it`) and the
preset's internal copy. Hoisting heuristics may or may not collapse them.
When they differ by semver range, the consumer ends up with both versions on
disk, and the CLI invocations the preset generates (`spawn('release-it', ...)`)
may resolve to a different binary than the consumer expects.

`release-it` is a CLI tool the consumer must install to use this preset at all.
The consumer chooses which version they want in their project. The preset's job
is to configure release-it, not to bundle it.

This pattern is well established in the ecosystem: ESLint configs declare
`eslint` as a peer; Babel presets declare `@babel/core` as a peer; Storybook
addons declare `storybook` as a peer. The rule is: if your package augments or
configures a host tool that consumers install themselves, make the host tool a
peer.

## Decision

`release-it` is listed under `peerDependencies` only. The minimum supported
version is `^20.0.0` (updated from `^19.0.0` in v0.10.0 when development
aligned to the release-it 20.x API).

`@release-it/keep-a-changelog`, by contrast, is a regular `dependency`.
It is a plugin that the preset's config files invoke directly via the
`plugins` field. Consumers do not install it themselves; the preset does. This
is the correct distinction: plugins invoked by the preset belong in
`dependencies`; the host CLI belongs in `peerDependencies`.

## Alternatives considered

- **Move `release-it` to `dependencies`**: Allows the preset to guarantee its
  own working version, but causes version duplication on disk, potential
  resolution ambiguity, and violates the principle that CLI host tools should
  not be bundled inside extensions.
- **No `peerDependencies` entry at all**: Would allow the package to install
  without release-it, making the misconfiguration silent. Explicit peer
  declaration documents the contract and triggers consumer-side warnings.
- **Pin to an exact release-it version**: Over-constrains consumers who may
  want to use a newer patch. Semver ranges in `peerDependencies` are the
  idiomatic approach.

## Consequences

- **Positive**: Consumers have full control over their release-it version.
  No duplicate installations. Package size is smaller (release-it is heavy).
- **Positive**: Version mismatches surface as peer warnings at install time,
  not silent runtime failures.
- **Negative**: The preset cannot use API surface that does not exist in all
  versions within the declared peer range. Changes to release-it's plugin or
  hook API require a peer range bump and a migration note.
- **Negative**: Consumers must install release-it explicitly. The error message
  in `bin/cli.js` (`Make sure release-it is installed: pnpm add -D release-it`)
  handles the most common case.

## References

- `package.json` `peerDependencies` field (current value: `"release-it": "^20.0.0"`)
- CHANGELOG.md v0.10.0: peer contract updated from `^19.0.0` to `^20.0.0`
  (commit `d24df9a`)
- ESLint config authoring guide: https://eslint.org/docs/developer-guide/shareable-configs
