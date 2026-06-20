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

if printf '%s' "$COMMAND_TEXT" | grep -Eq 'git[^[:cntrl:]]*[[:space:]]reset[^[:cntrl:]]*--hard|git[^[:cntrl:]]*[[:space:]]clean[^[:cntrl:]]*-[^[:cntrl:]]*f|git[^[:cntrl:]]*[[:space:]]checkout[^[:cntrl:]]*--'; then
    printf '{"permission":"deny","user_message":"Blocked risky destructive git command.","agent_message":"Use safer git operations or ask for explicit approval."}\n'
    exit 0
fi

if printf '%s' "$COMMAND_TEXT" | grep -Eq 'git[^[:cntrl:]]*[[:space:]]push[^[:cntrl:]]*--force|git[^[:cntrl:]]*[[:space:]]push[^[:cntrl:]]*-f'; then
    printf '{"permission":"ask","user_message":"Force push detected. Confirm before continuing.","agent_message":"Potential history rewrite command requires confirmation."}\n'
    exit 0
fi

printf '{"permission":"allow"}\n'
exit 0
