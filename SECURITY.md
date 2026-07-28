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

blit386 is a client-side WebGPU rendering library. Security concerns are primarily:

- Supply chain (dependencies)
- Build pipeline integrity
- WebGPU resource handling
