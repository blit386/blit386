# Security Policy

This package (`blit386-website`, the source for blit386.dev) is `private: true` and has no release line of its own – it
deploys straight from `main` to Cloudflare Workers on every push, not from a version tag. The supported-versions table
in the [root `SECURITY.md`](../../SECURITY.md) describes the published `blit386` engine and does not apply here; this
file exists only to route reports and note the scope specific to this package. The root file is the canonical policy.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

Use [GitHub private vulnerability reporting](https://github.com/blit386/blit386/security/advisories/new) or contact the
maintainers directly.

## Scope specific to this package

- Supply chain (npm dependencies of the docs site)
- CI/CD and Cloudflare deploy credentials
- User-facing content injection via MDX (review PRs carefully)

For engine/runtime security issues in the BLIT386 library itself, or the reporting timeline and supported-version
policy, see the [root `SECURITY.md`](../../SECURITY.md).
