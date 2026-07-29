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
JQ_STATUS=$?

# Fail closed: if jq itself failed (missing binary, malformed INPUT_JSON), we
# cannot tell a genuinely command-less payload from an unreadable one, so block
# rather than silently let an unchecked command through.
if [ "$JQ_STATUS" -ne 0 ]; then
    printf '[BLOCKED] Could not parse the tool payload to check for destructive git commands (jq exit %s).\n' "$JQ_STATUS" >&2
    exit 2
fi

if [ -z "$COMMAND_TEXT" ]; then
    exit 0
fi

# Strip quote characters and backslashes before matching so a quoted or
# backslash-escaped subcommand (e.g. `git "reset" --hard`, `git \reset --hard`,
# `git push origin \+main`) cannot dodge the literal-word checks below -- the
# shell drops quotes and escaping backslashes at execution time and runs the
# same destructive command. This may over-match a literal multi-backslash
# sequence (e.g. `\\reset`, which the shell does not turn into `reset`), but
# that is a safe direction to err in for a security check.
NORMALIZED_TEXT="$(printf '%s' "$COMMAND_TEXT" | tr -d "'" | tr -d '"' | tr -d '\\')"

GIT_PREFIX='git([[:space:]]+(-[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?|--[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?))*[[:space:]]+'
GIT_CLEAN_FLAGS='(-[^[:cntrl:]]*f[^[:cntrl:]]*d|-[^[:cntrl:]]*d[^[:cntrl:]]*f|-([^[:cntrl:]]|[[:space:]])*-f([^[:cntrl:]]|[[:space:]])*-d|-([^[:cntrl:]]|[[:space:]])*-d([^[:cntrl:]]|[[:space:]])*-f)'

if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}reset[[:space:]]+--hard|${GIT_PREFIX}clean[[:space:]]+${GIT_CLEAN_FLAGS}|${GIT_PREFIX}checkout[[:space:]]+--"; then
    printf '[BLOCKED] Destructive git command detected (reset --hard / clean -fd / checkout --). Use a safer git operation or ask for explicit approval.\n' >&2
    exit 2
fi

# Require -f/--force/--force-with-lease to sit at an argument boundary
# (whitespace, a shell command separator such as ; & |, or end of line) so it
# does not match a substring inside a ref/branch name, e.g.
# `git push origin foo-feature` must not trip this. A refspec prefixed with
# `+` (e.g. `git push origin +main`) is git's other force-push spelling and
# is matched separately.
FORCE_FLAG='([[:space:]]+[^[:space:]]+)*[[:space:]]+(-f|--force|--force-with-lease(=[^[:space:]]*)?)([[:space:]]|[;&|]|$)'
FORCE_REFSPEC='([[:space:]]+[^[:space:]]+)*[[:space:]]+\+[^[:space:]]+'

if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}push(${FORCE_FLAG}|${FORCE_REFSPEC})"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Force push detected. Confirm before continuing."}}\n'
    exit 0
fi

exit 0
