# Architecture Decision Records

This directory captures the rationale behind significant architectural decisions in `@oorabona/release-it-preset`. Each ADR is a small, dated document describing a problem, the alternatives considered, the choice made, and its consequences. Once accepted, an ADR is rarely modified — new decisions get new ADRs.

Format follows Michael Nygard's lightweight template.

| Number | Title | Status |
|--------|-------|--------|
| [0001](0001-peer-dependency.md) | `release-it` as `peerDependency`, not `dependency` | Accepted |
| [0002](0002-strict-extends-validation.md) | Strict `extends` validation in `.release-it.json` | Accepted |
| [0003](0003-dependency-injection.md) | Dependency Injection pattern for scripts | Accepted |
| [0004](0004-conventional-commit-defaults.md) | Conventional Commits format for default release messages | Accepted |

When updating the project significantly, consider whether the change is worth recording. Heuristic: if a future contributor would ask "why was X done this way?" and the answer is non-obvious from the code, write an ADR.

## Adding a new ADR

1. Pick the next sequential number (zero-padded to 4 digits).
2. Use a short kebab-case slug for the filename (e.g. `0005-some-decision.md`).
3. Copy an existing ADR and replace the content; keep the headers consistent: **Status / Date / Deciders / Context / Decision / Alternatives considered / Consequences / References**.
4. Add a row to the table above.
5. Submit alongside the change that introduces or codifies the decision, so the ADR lands at the same time as the code.
