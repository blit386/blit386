#!/bin/sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT_JSON="$(cat)"

if command -v rtk >/dev/null 2>&1; then
    RUNNER='rtk pnpm exec'
else
    RUNNER='pnpm exec'
fi

FILE_PATH="$(printf '%s' "$INPUT_JSON" | python3 -c "
import json, sys

def walk(node):
    if isinstance(node, dict):
        for key in ('file_path', 'path'):
            value = node.get(key)
            if isinstance(value, str) and value:
                return value
        for value in node.values():
            found = walk(value)
            if found:
                return found
    elif isinstance(node, list):
        for value in node:
            found = walk(value)
            if found:
                return found
    return ''

try:
    data = json.load(sys.stdin)
except Exception:
    print('')
    raise SystemExit(0)

print(walk(data))
")"

if [ -z "$FILE_PATH" ]; then
    exit 0
fi

case "$FILE_PATH" in
/*) TARGET_FILE="$FILE_PATH" ;;
*) TARGET_FILE="$REPO_ROOT/$FILE_PATH" ;;
esac

NORMALIZED_TARGET="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$TARGET_FILE" 2>/dev/null)" || exit 0
CANONICAL_REPO_ROOT="$(python3 -c 'import os, sys; print(os.path.realpath(sys.argv[1]))' "$REPO_ROOT")"

if [ ! -f "$NORMALIZED_TARGET" ]; then
    exit 0
fi

case "$NORMALIZED_TARGET" in
"$CANONICAL_REPO_ROOT"/*) ;;
*) exit 0 ;;
esac

case "$NORMALIZED_TARGET" in
*.ts | *.tsx | *.js | *.cjs | *.mjs | *.json | *.jsonc)
    (cd "$REPO_ROOT" && $RUNNER biome check --write "$NORMALIZED_TARGET" >/dev/null 2>&1) || true
    ;;
esac

case "$NORMALIZED_TARGET" in
*.md | *.mdx | *.mdc | *.yml | *.yaml)
    (cd "$REPO_ROOT" && $RUNNER prettier --write "$NORMALIZED_TARGET" >/dev/null 2>&1) || true
    ;;
esac

case "$NORMALIZED_TARGET" in
*.ts | *.tsx | *.js | *.cjs | *.mjs | *.md | *.mdx)
    SPELLCHECK_OUTPUT="$(cd "$REPO_ROOT" && $RUNNER cspell --no-progress "$NORMALIZED_TARGET" 2>&1)" || {
        printf '[SPELLCHECK] %s\n' "$NORMALIZED_TARGET" >&2
        printf '%s\n' "$SPELLCHECK_OUTPUT" >&2
    }
    ;;
esac

exit 0
