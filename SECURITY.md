# Security Policy

## Supported Versions

| Version | Status |
|---------|--------|
| 0.9.x (latest minor) | ✅ Active support |
| 0.8.x | ⚠️ Critical security fixes only (grace period until 0.10.0) |
| < 0.8 | ❌ Unsupported |

## Reporting a Vulnerability

Please **do not** file a public GitHub issue for security vulnerabilities.

Report security vulnerabilities privately via GitHub Security Advisories:
**[https://github.com/oorabona/release-it-preset/security/advisories/new](https://github.com/oorabona/release-it-preset/security/advisories/new)**

### Response SLAs

| Event | Target |
|-------|--------|
| Acknowledgement | Within 7 days of report |
| Triage / status update | Within 14 days of report |
| Coordinated disclosure window | 90 days preferred; negotiable for severe issues |

We follow coordinated disclosure: fixes are prepared privately, released, and then the advisory is published. We will credit reporters unless they prefer to remain anonymous.

## Scope

### In scope

- CLI entry point and command routing (`bin/cli.js`)
- Input validation and sanitisation (`bin/validators.js`)
- Release configurations (`config/`)
- TypeScript scripts compiled to `dist/scripts/` (changelog management, commit parsing, pre-flight checks)

### Out of scope

- Vulnerabilities in `release-it` itself — please report to [https://github.com/release-it/release-it](https://github.com/release-it/release-it)
- Vulnerabilities in transitive npm dependencies — use `pnpm audit` or the [npm advisory database](https://github.com/advisories)
- User misconfigurations of environment variables or CI secrets

## Security Best Practices for Users

- **Never commit secrets.** Keep `NPM_TOKEN`, `GITHUB_TOKEN`, and any other release credentials in CI secrets or a `.env` file that is gitignored — never in source control.
- **Scope npm tokens narrowly.** Use publish-only automation tokens and rotate them after each release cycle to limit blast radius.
- **Run `pnpm audit` before releasing.** This preset's CI runs `pnpm audit --audit-level=high` automatically on every PR; run it locally as well before tagging a release.
- **Use `--dry-run` first.** When testing a new release configuration or preset for the first time, pass `--dry-run` to verify the generated changelog, version bump, and git commands before they execute.
- **Review changelog diffs.** Inspect the diff produced by `release-it-preset update` before committing — automated commit parsing may include or exclude entries unexpectedly.
