# Verifying Release Artifacts

This guide verifies a release of `@oorabona/release-it-preset`. Replace
`X.Y.Z` with the version and `vX.Y.Z` with the matching tag. For the first
release containing this chain, use `1.4.0` and `v1.4.0`.

Set the expected tarball name:

```bash
TGZ="oorabona-release-it-preset-X.Y.Z.tgz"
```

## 1. What You Can Verify

| Check | Artifact | Trust model |
|-------|----------|-------------|
| npm provenance | Installed npm package | npm registry provenance binds the package to the publishing GitHub Actions workflow (SLSA L2). |
| SLSA provenance | GitHub release `.intoto.jsonl` | The SLSA generic generator signs provenance from an isolated trusted-builder workflow (SLSA L3). |
| cosign signature | GitHub release `.sigstore.json` | Fulcio/Rekor keyless signing binds the tarball to `publish.yml` on the release tag. |

## 2. npm Provenance (L2)

`npm audit signatures` verifies an installed dependency tree, so run it in a
temporary project:

```bash
tmp="$(mktemp -d)"
cd "${tmp}"
npm init -y
npm install @oorabona/release-it-preset@X.Y.Z
npm audit signatures
```

## 3. SLSA L3 Provenance

Download the release tarball and attestations:

```bash
mkdir "release-it-preset-X.Y.Z-verify"
cd "release-it-preset-X.Y.Z-verify"
gh release download vX.Y.Z --repo oorabona/release-it-preset --pattern '*.tgz' --pattern '*.intoto.jsonl' --pattern '*.sigstore.json'
TGZ="oorabona-release-it-preset-X.Y.Z.tgz"
```

Verify the SLSA provenance:

```bash
slsa-verifier verify-artifact "${TGZ}" --provenance-path "${TGZ}.intoto.jsonl" --source-uri github.com/oorabona/release-it-preset --source-tag vX.Y.Z
```

Use `slsa-verifier` v2.7.1 for this command.

## 4. cosign Keyless Signature

Verify the cosign bundle:

```bash
cosign verify-blob "${TGZ}" --bundle "${TGZ}.sigstore.json" --certificate-identity="https://github.com/oorabona/release-it-preset/.github/workflows/publish.yml@refs/tags/vX.Y.Z" --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
```

This works from the downloaded assets and does not require a GitHub account.

## 5. Binding the Release Asset to npm

Fetch the tarball npm serves into a separate directory. `--pack-destination`
is important because `npm pack` would otherwise use the same basename as the
downloaded release asset.

```bash
mkdir npm-copy
npm pack @oorabona/release-it-preset@X.Y.Z --pack-destination ./npm-copy/
test "$(sha256sum "${TGZ}" | awk '{print $1}')" = "$(sha256sum "./npm-copy/${TGZ}" | awk '{print $1}')"
```

The full trust chain is two-layered: npm provenance verifies the registry
package's source and publish workflow, while the SLSA L3 and cosign assets
verify that the GitHub release tarball is the same registry byte stream signed
by the tag-canonical release workflow. Before signing, the release workflow
additionally verifies that the registry package's `gitHead` matches the tag's
commit, so attestations are never produced for bytes built from another ref.

## 6. Caveats

- Do not rename the downloaded `.tgz` before running `slsa-verifier`; the
  provenance subject is matched by tarball basename.
- Attestation assets are only produced by runs on the tag ref itself.
  Branch replays with `-f tag=vX.Y.Z` from another ref can republish npm and
  GitHub release content, but they never (re)write attestation assets, so
  existing canonical assets cannot be downgraded.
- Releases before `v1.4.0` have npm provenance only. They do not carry the SLSA
  L3 provenance or cosign release assets described here.

## 7. Pinned Tool Versions

These versions are the expected verification and generation pins for this
attestation chain:

- `slsa-verifier` v2.7.1
- cosign CLI v3.x
- `slsa-framework/slsa-github-generator` generic generator v2.1.0

When one of these drifts, update this document and
[ADR 0007](adr/0007-slsa-generic-generator-cosign.md) together.
