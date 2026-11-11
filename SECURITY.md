# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |
| 0.x | No |

The 1.x release line is actively maintained. Security fixes are published as patch releases on 1.x. Pre-1.0 (0.x)
releases reached end-of-life at 1.0.0 and no longer receive security updates.

## Reporting a Vulnerability

If you discover a security vulnerability in a supported 1.x release, please report it responsibly.

Do not open a public issue. Report privately through
[GitHub's private vulnerability reporting](https://github.com/blit386/blit386/security/advisories/new).

We will acknowledge receipt within 48 hours and provide a timeline for a fix. Once resolved, we will publish a fix on
the supported 1.x line and credit you in the release notes (unless you prefer to remain anonymous).

## Scope

This policy covers every package in this repository:

- `blit386` - a client-side WebGPU rendering library: WebGPU resource handling and asset loading.
- `create-blit386` and `@blit386/kit` - they write files into a user's project and install agent hooks that run
  unattended inside AI assistants (shell and file guards, format-on-edit, a session-start install), so a flaw there runs
  on the user's machine.
- The docs site at [blit386.dev](https://blit386.dev), including its public `/mcp` documentation server.
- The demos site at [demos.blit386.dev](https://demos.blit386.dev) and its security headers.
- Supply chain (dependencies) and build pipeline integrity for all of the above. The dependency rules are in
  [`packages/blit386/docs/security/dependency-policy.md`](packages/blit386/docs/security/dependency-policy.md).
