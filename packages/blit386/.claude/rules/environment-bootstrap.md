---
paths: [scripts/session-start-bootstrap.sh]
---

# Environment bootstrap

How a fresh remote/web/cloud checkout warms its toolchain automatically.

A fresh checkout (Claude Code on the web, a Codespace, any ephemeral agent sandbox) starts with no `node_modules` and no
warmed toolchain. `packages/blit386/scripts/session-start-bootstrap.sh` fixes that: it runs
`pnpm install --frozen-lockfile` for the whole monorepo (enabling `corepack` first if `pnpm` is not yet on `PATH`) so
`pnpm run preflight` and the test suites work without manual setup. It stamps
`node_modules/.session-start-lockfile.cksum` with a `cksum` of `pnpm-lock.yaml` and skips the install on the next call
when the lockfile has not changed, so it stays a fast no-op on a machine that already has dependencies installed.

The same script is wired into two places at the repo root, both pointing at this one file so the bootstrap logic is
never duplicated:

- Root `.claude/settings.json` – a `SessionStart` hook (`matcher: "startup|resume|clear|compact|fork"`) runs it at the
  start of every Claude Code session, regardless of which package the session touches.
- Root `.devcontainer/devcontainer.json` – an optional devcontainer (`typescript-node:22-bookworm`) for reproducible
  Codespaces/cloud environments; `postCreateCommand` runs the same script once the container is created.

Neither blocks nor fails the session/container on a bootstrap error – a missing `pnpm`/network failure is logged and the
script exits `0`, since a `SessionStart` hook cannot prevent a session from starting anyway.
