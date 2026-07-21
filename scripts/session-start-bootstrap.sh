#!/bin/sh

# Bootstraps the pnpm toolchain for ephemeral remote/web/cloud sessions (Claude Code SessionStart
# hook, Cursor sessionStart hook, and the devcontainer postCreateCommand). Installs dependencies
# only when pnpm-lock.yaml has changed since the last successful install here, so it is a fast
# no-op on a machine that already has node_modules set up.

set -u

export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT" || exit 0

if ! command -v pnpm >/dev/null 2>&1; then
    if command -v corepack >/dev/null 2>&1; then
        corepack enable >/dev/null 2>&1 || true
    fi
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "[session-start] pnpm not found on PATH; skipping dependency bootstrap." >&2
    exit 0
fi

LOCKFILE_STAMP="node_modules/.session-start-lockfile.cksum"
CURRENT_CKSUM="$(cksum pnpm-lock.yaml 2>/dev/null)"

if [ -d node_modules ] && [ -f "$LOCKFILE_STAMP" ] && [ "$(cat "$LOCKFILE_STAMP" 2>/dev/null)" = "$CURRENT_CKSUM" ]; then
    exit 0
fi

INSTALL_OUTPUT="$(pnpm install --frozen-lockfile 2>&1)"
INSTALL_STATUS=$?

if [ "$INSTALL_STATUS" -ne 0 ]; then
    echo "[session-start] pnpm install failed; the session will continue without a warmed toolchain." >&2
    printf '%s\n' "$INSTALL_OUTPUT" >&2
    exit 0
fi

mkdir -p node_modules
printf '%s' "$CURRENT_CKSUM" >"$LOCKFILE_STAMP"

exit 0
