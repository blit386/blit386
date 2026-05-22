#!/bin/sh

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INPUT_JSON="$(cat)"

canonical_path() {
    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import os, sys

path = os.path.normpath(os.path.abspath(sys.argv[1]))
if os.path.exists(path):
    path = os.path.realpath(path)
print(path)
" "$1" 2>/dev/null && return
    fi

    if command -v realpath >/dev/null 2>&1; then
        realpath -m "$1" 2>/dev/null && return
        realpath "$1" 2>/dev/null && return
    fi

    printf '%s\n' "$1"
}

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

if [ ! -f "$TARGET_FILE" ]; then
    exit 0
fi

CANON_REPO_ROOT="$(canonical_path "$REPO_ROOT")"
CANON_TARGET="$(canonical_path "$TARGET_FILE")"

case "$CANON_TARGET" in
    "$CANON_REPO_ROOT"|"$CANON_REPO_ROOT"/*) ;;
    *) exit 0 ;;
esac

case "$TARGET_FILE" in
    *.js|*.cjs|*.mjs|*.json|*.jsonc|*.css)
        (cd "$REPO_ROOT" && $RUNNER biome check --write "$TARGET_FILE" >/dev/null 2>&1) || true
        ;;
esac

case "$TARGET_FILE" in
    *.md|*.mdx|*.yml|*.yaml)
        (cd "$REPO_ROOT" && $RUNNER prettier --write "$TARGET_FILE" >/dev/null 2>&1) || true
        ;;
esac

case "$TARGET_FILE" in
    *.js|*.cjs|*.mjs|*.md|*.mdx)
        SPELLCHECK_OUTPUT="$(cd "$REPO_ROOT" && $RUNNER cspell --no-progress "$TARGET_FILE" 2>&1)" || {
            printf '[SPELLCHECK] %s\n' "$TARGET_FILE" >&2
            printf '%s\n' "$SPELLCHECK_OUTPUT" >&2
        }
        ;;
esac

exit 0
