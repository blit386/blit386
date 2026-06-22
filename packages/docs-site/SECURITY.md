# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

This documentation site is pre-1.0. Security fixes ship on the default branch and deploy to blit386.dev.

## Reporting a Vulnerability

Do not open a public issue for security vulnerabilities.

Use [GitHub private vulnerability reporting](https://github.com/blit386/blit386-dev-fumapress/security/advisories/new)
or contact the maintainers directly.

## Scope

Primary concerns:

- Supply chain (npm dependencies)
- CI/CD and Cloudflare deploy credentials
- User-facing content injection via MDX (review PRs carefully)

For engine/runtime security issues in the BLIT386 library itself, report to
[blit386/blit386](https://github.com/blit386/blit386/security/advisories/new).
