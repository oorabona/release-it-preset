# ADR 0005: Narrow `republish` preset scope to git + GitHub (no npm)

- **Status**: Accepted
- **Date**: 2026-05-04
- **Deciders**: Project maintainer
- **Supersedes**: —
- **Superseded by**: —

## Context

The `republish` preset (`config/republish.js`) was designed for exceptional recovery
scenarios where an existing release needed to be "republished". It wired up
`npm: createBaseNpmConfig()`, which respects the `NPM_PUBLISH` environment variable.

During v1.0.0-rc.0 soak, it became clear that the npm publish path in `republish`
was dead code: npm has enforced strict version immutability since 2016 (post
left-pad incident). Once a version is published to the registry, it cannot be
overwritten under any dist-tag — `npm publish` for an existing version exits with:

```
npm error code E403
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/... -
npm error 403 You cannot publish over the previously published versions of ...
```

This means any user who set `NPM_PUBLISH=true` with the `republish` preset would
see a guaranteed npm-step failure. The preset's real value — moving a git tag and
updating the GitHub release — was unaffected, but the failed npm step produced
confusing, misleading output.

## Decision

Hardcode `npm.publish = false` in `config/republish.js` by passing
`{ publish: false }` to `createBaseNpmConfig()`. This is a structural impossibility,
not a runtime guard — no env var can override it for this preset.

Update the file-level JSDoc comment and README to document the narrowed scope and
provide explicit alternatives for the cases users were likely trying to solve:

- dist-tag changes: `npm dist-tag add <pkg>@<version> <tag>`
- failed mid-flight publishes: `retry-publish` preset

The change is classified as BREAKING for `republish` users who set `NPM_PUBLISH=true`,
though the real-world impact is zero: that path always failed at the npm step anyway.

## Alternatives Considered

### Option A: Deprecate `republish` preset entirely

**Pros:** Clean break; no confusion about what the preset does.
**Cons:** The preset retains genuine utility for git-tag-move + GitHub-release-update
scenarios. Removing it forces users back to manual `git tag -f` + `gh release edit`
sequences, which is exactly the kind of manual work this package exists to avoid.
**Rejected.**

### Option B (chosen): Narrow scope structurally — `publish: false` hardcoded

**Pros:** Removes dead code. Documents real behavior. Structural impossibility is
clearer than a runtime check. The preset still covers its genuine use cases.
**Cons:** Breaking change for anyone who set `NPM_PUBLISH=true` expecting it to work.
Real impact: none (always failed). Included in rc.1 rather than v2 on that basis.
**Chosen.**

### Option C: Rename to `move-tag` or `fix-tag`

**Pros:** More accurate name for the narrowed scope.
**Cons:** Breaking change in preset name without proportional benefit. "republish"
is recognized by existing users and maps to the `.github/workflows/republish.yml`
workflow name. A rename would require updating bin/cli.js, README, workflows, and
user configs.
**Rejected.**

### Option D: Runtime guard — exit with error when `NPM_PUBLISH=true`

**Pros:** Explicit failure mode; user sees a clear error rather than silent ignore.
**Cons:** Adds code and tests for a check that is better expressed as structural
impossibility. Fail-loud adds noise for the common case (no NPM_PUBLISH set).
**Rejected.**

## Consequences

- **Breaking**: `NPM_PUBLISH=true` is silently ignored for the `republish` preset.
  Any user relying on it to publish to npm must switch to `retry-publish` (for
  failed publishes) or `npm dist-tag add` (for dist-tag changes).
- **Real impact**: Zero — `npm publish` for an existing version always returned E403.
  This change converts a confusing failure into a documented non-operation.
- **Positive**: Preset behavior now matches its documented purpose. The `republish`
  preset's scope is unambiguous: git tag move + GitHub release update.
- **Justification for rc.1 inclusion**: Because the "breaking" path was always broken,
  this is a correctness fix dressed as a breaking change. Waiting for v2 would leave
  the misleading behavior in the stable v1.0 surface.

## References

- npm immutability policy: https://docs.npmjs.com/policies/unpublish
- `config/republish.js` — `npm: createBaseNpmConfig({ publish: false })`
- `config/base-config.js` — `createBaseNpmConfig()` builder
- v1.0.0-rc.0 ship: 2026-04-30
- MIGRATION.md — `1.0.0-rc.0 → 1.0.0-rc.1` section
