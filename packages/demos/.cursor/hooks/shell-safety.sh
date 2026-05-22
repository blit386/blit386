#!/bin/sh

set -u

INPUT_JSON="$(cat)"

COMMAND_TEXT="$(printf '%s' "$INPUT_JSON" | python3 -c "
import json, sys

def walk(node):
    if isinstance(node, dict):
        for key in ('command', 'raw_command'):
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

if [ -z "$COMMAND_TEXT" ]; then
    printf '{"permission":"allow"}\n'
    exit 0
fi

GIT_PREFIX='git([[:space:]]+(-[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?|--[^[:space:]]+([[:space:]]+[^-][^[:space:]]*)?))*[[:space:]]+'
GIT_CLEAN_FLAGS='(-[^[:cntrl:]]*f[^[:cntrl:]]*d|-[^[:cntrl:]]*d[^[:cntrl:]]*f|-([^[:cntrl:]]|[[:space:]])*-f([^[:cntrl:]]|[[:space:]])*-d|-([^[:cntrl:]]|[[:space:]])*-d([^[:cntrl:]]|[[:space:]])*-f)'

if printf '%s' "$COMMAND_TEXT" | grep -Eq "${GIT_PREFIX}reset[[:space:]]+--hard|${GIT_PREFIX}clean[[:space:]]+${GIT_CLEAN_FLAGS}|${GIT_PREFIX}checkout[[:space:]]+--"; then
    printf '{"permission":"deny","user_message":"Blocked risky destructive git command.","agent_message":"Use safer git operations or ask for explicit approval."}\n'
    exit 0
fi

if printf '%s' "$COMMAND_TEXT" | grep -Eq "${GIT_PREFIX}push[^[:cntrl:]]*--force|${GIT_PREFIX}push[^[:cntrl:]]*-f"; then
    printf '{"permission":"ask","user_message":"Force push detected. Confirm before continuing.","agent_message":"Potential history rewrite command requires confirmation."}\n'
    exit 0
fi

printf '{"permission":"allow"}\n'
exit 0
