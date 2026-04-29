# Backlog Study

Future features and improvements identified during clarification — items deferred from the v1.0 roadmap. Each entry includes a brief rationale and a suggested revisit milestone.

## TODO refresh — Out of Scope (post-v1)

**Date:** 2026-04-29
**Source:** `/clarify` — TODO.md cleanup vs v0.9.0
**Parent Story:** Roadmap-v1.0-cleanup

### Open product questions (originally "Questions to Resolve")

- [ ] 💡 [Feature] Custom commit type mappings — user-defined `type → changelog category`. *Why deferred:* current mapping covers conventional-commits canonical set; demand unproven.
- [ ] 💡 [Feature] Plugin system for custom hooks / transformations. *Why deferred:* large surface, breaks lockstep with `release-it`'s own plugin model — needs design.
- [ ] 💡 [Feature] Standalone binary (pkg/nexe) for zero-dependency usage. *Why deferred:* Node distribution already covers 99% of users; bundle size + maintenance cost high.
- [ ] 💡 [Feature] Support other changelog formats beyond Keep a Changelog. *Why deferred:* KaC is the de facto standard; format pluralism complicates parsing.
- [ ] 💡 [Telemetry] Opt-in usage analytics. *Why deferred:* trust-sensitive — needs explicit privacy policy + opt-in UX before any wire-level work.

### Lower-value v1 candidates moved here

- [ ] 💡 [Quality] Performance benchmarks (changelog populate, CLI startup, large repos). *Why deferred:* current ops complete < 1s on typical repos; no user complaint reported.
- [ ] 💡 [Compliance] License & attribution audit (NOTICE file, third-party attributions). *Why deferred:* MIT-only deps verified at last audit; revisit only if new deps land.
- [ ] 💡 [Docs] Video/GIF demos for release / hotfix workflows. *Why deferred:* nice-to-have; written examples cover same ground.
- [ ] 💡 [Examples] `examples/custom-hooks/`, `examples/ci-only-publish/`, `examples/private-package/`. *Why deferred:* users can extrapolate from existing `examples/monorepo-workflow.md`; create on-demand.

### Meta / housekeeping

- [ ] 💡 [Meta] Migrate TODO.md to GitHub Issues for assignment + visibility. *Why deferred:* current text-based flow works for solo maintenance; reconsider when contributors arrive.
- [ ] 💡 [Meta] Tidy untracked root-level `.md` files (`IMPLEMENTATION_SUMMARY.md`, `TESTING_SUMMARY.md`, `TEST_STRATEGY.md`) — archive under `docs/` or `.gitignore`. *Why deferred:* low impact; bundle with next docs pass.

### When to Revisit

- After v1.0.0 stabilization (real user feedback resolves several "Why deferred" rationales).
- Priority globally: **L** (none of these block v1.0).
- Plugin system + commit-type mapping become **M** if a contributor PR proposes a clean shape.
