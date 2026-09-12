# Roadmap

Strategic framing for **post-v1.0 features**. Items here are deferred from the v1.0 roadmap and will be revisited once the v1.0 stable tag has soaked and real user signal emerges.

> Renamed from `BACKLOG_STUDY.md` on 2026-05-05 — content has matured from a study of "what to consider" into a curated roadmap with explicit priorities and explicit non-goals.

**Last updated:** 2026-09-12
**Status:** v1.4.1 published; v1.5.0 in preparation.

The project's moat is: **human-curated changelogs + recovery presets + `doctor` diagnostic + OIDC zero-config**. Every candidate below is evaluated against whether it strengthens the moat or opens a defensible new axis. Rows marked ✅ Done are kept for provenance and are not candidates.

---

## A. Reinforce the moat (high value, low cost)

| # | Idea | Why now | Effort | Priority |
|---|---|---|---|---|
| A1 | **`doctor` extensions** — publish workflow freshness, npm provenance readiness, SLSA attestation availability, workspace dependency ranges, peer range. | `doctor` is the signature feature. Each new check tightens the "diagnostic confidence before release" pitch. | Low | ✅ Done |
| A2 | **Industry templates** — `release-it-preset init --template typescript-lib\|react-component\|cli-tool\|monorepo` generates a `.release-it.json` plus matching `package.json` scripts | Drops the 1st-time user friction; measurable via npm install spike post-shipped. | Medium | 🟢 H |
| A3 | **Breaking-change auto-detection** — analyze `dist/` output or `.d.ts` exports to flag a commit as breaking when the public surface diff would justify it | Strong differentiator vs semantic-release (which infers breaking from commit message only). Aligned with Hyrum's Law: if the surface changes, semver should reflect it. | Medium-high | 🟡 M |

## B. Ecosystem openings (medium value, medium cost)

| # | Idea | Why | Effort | Priority |
|---|---|---|---|---|
| B1 | **GitLab support** | Many references in workflows + docs are GitHub-hardcoded. GitLab also has OIDC trusted publishing toward npm since 2024; market is non-saturated and aligned with the OIDC pitch. | High | 🟡 M (post-v1.1) |
| B2 | **SLSA L3 / Sigstore attestation** alongside npm provenance. `docs/VERIFY.md` states which releases carry the assets and how to check them. | npm provenance gets us SLSA L1; L3 + cosign signing is the next supply-chain step and is becoming enterprise table-stakes. | Medium | ✅ Done |
| B3 | **`@release-it-plugins/workspaces` composition tests in CI** — shipped by #61 with release-it 19 composition coverage and a release-it 20 peer-incompatibility lock test | Real monorepo users benefit from an asserted composition path instead of docs-only guidance. | Medium | ✅ Done |

## C. Quality-of-life (medium value, low-medium cost)

| # | Idea | Why | Effort | Priority |
|---|---|---|---|---|
| C1 | **`release-it-preset annotate`** — enrich auto-generated `[Unreleased]` entries with PR descriptions / breaking-change footers via `gh pr view` | Reduces manual post-`update` curation. Compatible with the "human-curated" promise — automation enriches but does not replace. | Medium | ✅ Done |
| C2 | **`release-it-preset retro N`** — backfill changelog for the past N versions from git log when a project has none | Onboarding for projects adopting the preset without a historical changelog. | Low-medium | 🟢 M |
| C3 | **Composite action for smart npm dist-tag selection** — see [#30](https://github.com/oorabona/release-it-preset/issues/30) | DRY across `publish.yml` and `republish.yml`. Already decided: defer until 3+ callers need it. Trigger awaited. | Low | 🟡 M (waiting trigger) |

## D. Buried — explicit non-goals

These were considered and explicitly will **not** be pursued. Documented to prevent re-litigation.

| Idea | Why buried |
|---|---|
| Plugin system for custom hooks / transformations | release-it already has its plugin model. Duplicating = complexity without unique value. Better path: document how to compose with existing release-it plugins. |
| Standalone binary (pkg/nexe) | `pnpm dlx` / `npx -y` covers 99% of zero-install cases. Binary maintenance cost > any user benefit. |
| Other changelog formats (non-Keep a Changelog) | Keep a Changelog is the project's identity promise. Supporting JSON / markdown-extra dilutes the positioning. |

## E. Emerging ideas (worth tracking)

| # | Idea | Rationale |
|---|---|---|
| E1 | **`release-it-preset preflight` GH composite action** — run dry-run + e2e check on ALL workflow_dispatch entry points (hotfix, republish, default) in parallel for PR validation | The rc.1 → rc.2 cycle surfaced 4 real production bugs via e2e dry-runs. Productizing this discipline is an honest differentiator. |
| E2 | **Conventional Commits 2.0 readiness watch** | If/when the spec ships new types or footer reformatting, we want to be ready to iterate. Active watch, no work yet. |
| E3 | **Peer-dep advisor in `doctor`** — when a release-it major outside `peerDependencies.release-it` ships, describe the breaking-change surface that affects preset users. Distinct from the existing `release-it major version` check, which only warns that a newer major exists. | Aligned with the diagnostic moat; positions the project as advisor, not just executor. |

## F. Carry-overs from earlier backlog (still applicable)

| Item | Status |
|---|---|
| License & attribution audit (NOTICE file, third-party attributions) | Reviewed 2026-09-12 when `semver` became the single runtime dependency. It is ISC, installs as its own package carrying its own `LICENSE`, and has no transitive runtime dependencies, so npm delivers the notice with the package and no bundled NOTICE file is owed. Revisit if a dependency lands that is vendored rather than installed, or is not ISC/MIT/BSD. |
| Video / GIF demos for release / hotfix workflows | Nice-to-have. Written examples cover the same ground today. Bundle with first marketing push if it happens. |
| Additional `examples/` dirs (`custom-hooks/`, `ci-only-publish/`, `private-package/`) | Create on user demand. Existing `examples/monorepo-workflow.md` is the template. |
| Tidy untracked root-level `.md` files | Bundle with next docs pass; not blocking. |

---

## Historical: the v1.1 / v1.2 recommendation made at v1.0

Kept for provenance. It named A1, A2, C1 and B2. Only A2 is still open; the other three are marked
✅ Done above.

---

## What is actually next

Nothing here is scheduled. Each item waits on a signal — an issue, a contributor PR, a bug report.

- **A2 — industry `init --template`** is the largest untouched item, and the only one of the
  original four still open.
- [#89](https://github.com/oorabona/release-it-preset/issues/89) and
  [#88](https://github.com/oorabona/release-it-preset/issues/88) are the open defects, both in
  version-comparison code and both bounded.
- **Each new release-it major**: check whether the peer range needs widening, and scan for advisor
  opportunities (E3).
