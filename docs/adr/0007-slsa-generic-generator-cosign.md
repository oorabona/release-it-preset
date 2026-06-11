# ADR-0007: SLSA generic generator plus cosign release attestations

## Status

Accepted (2026-06-11).

## Context

Issue #50 requires each release to attach verifiable SLSA L3 provenance and a
Sigstore signature for the exact tarball npm serves, without changing the
existing release-it driven npm publish or adding repository secrets.

The initially proposed slsa-github-generator Node.js builder does not fit this
package. It does not support pnpm and it takes over the build and publish flow,
which would replace the existing `release-it-preset retry-publish --ci` path
and risk changing npm provenance behavior.

GitHub Artifact Attestations were also evaluated. They are improving quickly,
but the L3 claim depends on splitting the signing work into a reusable workflow,
and the result is not verifiable by `slsa-verifier` against the
slsa-github-generator trusted-builder identity.

## Decision

Use the slsa-github-generator generic SLSA3 reusable workflow
(`generator_generic_slsa3.yml@v2.1.0`) to attest the registry tarball after npm
publish completes, and use cosign keyless signing to produce a Sigstore bundle
for the same bytes.

The release chain is:

1. Publish with the existing release-it retry-publish flow and npm OIDC
   provenance.
2. Download the just-published tarball from the npm registry with `npm pack`
   and verify the registry `gitHead` matches the tag commit before attesting.
3. Generate SLSA L3 provenance for that tarball with the generic generator.
4. Sign the same tarball with cosign keyless signing.
5. Attach the tarball, provenance, and Sigstore bundle to the GitHub release.

The generator remains tag-pinned to `v2.1.0` because the SLSA trusted-builder
protocol depends on that identity.

## Consequences

- **Positive**: The npm publish path remains unchanged, preserving npm OIDC
  trusted publishing and existing release-it behavior.
- **Positive**: Consumers can verify the L3 provenance with `slsa-verifier` and
  the signature with the cosign CLI using only GitHub release assets.
- **Positive**: The attested subject is the exact registry tarball, not a local
  rebuild that could drift from npm's served bytes.
- **Negative**: Release runs gain post-publish jobs and depend on npm registry
  propagation before attestations can be generated.
- **Negative**: The release trust story has two layers: npm provenance binds the
  registry package to source, while SLSA L3 and cosign bind the release asset to
  the registry bytes.

## Alternatives considered

- **slsa-github-generator Node.js builder**: rejected because it does not
  support pnpm and would take over build and npm publish.
- **GitHub Artifact Attestations only**: rejected for now because the L3 posture
  depends on an additional reusable-workflow split and is not
  `slsa-verifier`-verifiable through the slsa-github-generator trusted builder.
- **cosign only**: rejected because a signature proves the workflow identity for
  the tarball but does not provide SLSA L3 provenance.
- **npm provenance only**: rejected because npm provenance is SLSA L2 and does
  not produce the requested GitHub release attestation assets.

## Migration trigger

Re-evaluate GitHub Artifact Attestations when either condition becomes true:

1. `slsa-github-generator` publishes a deprecation notice.
2. The OSSF revamp ships a GA replacement for the generic generator.

At that point, compare GitHub Artifact Attestations against the current
`slsa-verifier` workflow and migrate only if consumers retain copy-pasteable
verification for release tarballs.
