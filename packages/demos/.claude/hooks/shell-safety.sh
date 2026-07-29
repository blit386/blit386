#!/bin/sh

set -u

INPUT_JSON="$(cat)"

# Search the whole hook payload for a "command" (or "raw_command") key, whatever
# depth the Bash tool nests it at, mirroring the deleted .cursor/hooks/shell-safety.sh.
COMMAND_TEXT="$(printf '%s' "$INPUT_JSON" | jq -r '
    [.. | objects | (.command // .raw_command)?]
    | map(select(. != null and . != ""))
    | first // empty
' 2>/dev/null)"

if [ -z "$COMMAND_TEXT" ]; then
    exit 0
fi

GIT_PREFIX='git([[:space:]]+(-[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?|--[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?))*[[:space:]]+'
GIT_CLEAN_FLAGS='(-[^[:cntrl:]]*f[^[:cntrl:]]*d|-[^[:cntrl:]]*d[^[:cntrl:]]*f|-([^[:cntrl:]]|[[:space:]])*-f([^[:cntrl:]]|[[:space:]])*-d|-([^[:cntrl:]]|[[:space:]])*-d([^[:cntrl:]]|[[:space:]])*-f)'

if printf '%s' "$COMMAND_TEXT" | grep -Eq "${GIT_PREFIX}reset[[:space:]]+--hard|${GIT_PREFIX}clean[[:space:]]+${GIT_CLEAN_FLAGS}|${GIT_PREFIX}checkout[[:space:]]+--"; then
    printf '[BLOCKED] Destructive git command detected (reset --hard / clean -fd / checkout --). Use a safer git operation or ask for explicit approval.\n' >&2
    exit 2
fi

if printf '%s' "$COMMAND_TEXT" | grep -Eq "${GIT_PREFIX}push[^[:cntrl:]]*--force|${GIT_PREFIX}push[^[:cntrl:]]*-f"; then
    printf '{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"Force push detected. Confirm before continuing."}}\n'
    exit 0
fi

exit 0
