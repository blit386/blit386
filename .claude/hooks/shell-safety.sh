#!/bin/sh

# Policy: which git operations get gated here, and how hard.
#
# Two tiers, split by whether git itself can still recover what the command would discard:
#
#   - Hard block (exit 2, no override): git reset --hard, git checkout -- / git restore in any
#     form that touches the worktree, and git clean without a no-force dry run. Each of these
#     destroys content with no git object ever created for it – uncommitted worktree/index
#     changes, or untracked files – so nothing is left to recover once the command runs, and no
#     amount of after-the-fact approval changes that. `git restore --staged <path>` (without
#     --worktree) is the one safe form: it only unstages, the worktree file is untouched, so it is
#     not gated.
#
#   - Ask (permissionDecision "ask", overridable by an explicit approval): git push --force*,
#     git branch -D, and git stash drop/clear. Each of these can still discard work, but git keeps
#     the underlying commits reachable via reflog (or the remote's own reflog, for a force push)
#     for a window afterward, so an approval that lets the command through is not approving
#     something irreversible.
#
# `git checkout --` and `git restore` are two spellings of the same operation (git split
# checkout's overloaded roles in 2.23; restore is the current, recommended spelling) and must
# always land in the same tier – see BT-413. Do not add a new destructive command to either tier
# without updating both copies of this file: this one and
# packages/kit/content/hooks/shell-safety.sh (the copy shipped into every scaffolded game).

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

# `git clean` deletes untracked files, so treat every invocation as destructive
# unless it is an explicit preview. Matching force flags alone was not enough:
# `git -c clean.requireForce=false clean -d` deletes without ever naming a force
# flag, and any other way around clean.requireForce would slip past the same way.
# So only a dry run (`-n`, `--dry-run`) that carries no force flag is allowed
# through; everything else, a bare `git clean` included, is denied. A preview
# that still bundles an f (`git clean -nfd`) is denied too: over-matching is the
# safe direction here, and the message says what to do instead. Each argument
# scan stops at a shell separator, so flags belonging to a later command
# (`git clean -n && rm -f build.log`) are never read as part of the clean.
GIT_CLEAN='clean([[:space:]]|[;&|<>]|$)'
GIT_CLEAN_FORCE='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+(-[[:alnum:]]*f[[:alnum:]]*|--force)([[:space:]]|[;&|<>]|$)'
GIT_CLEAN_DRY_RUN='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+(-[[:alnum:]]*n[[:alnum:]]*|--dry-run)([[:space:]]|[;&|<>]|$)'

# Exit status 0 when the command runs a `git clean` that is not a no-force dry run.
is_destructive_clean() {
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}${GIT_CLEAN}" || return 1
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}clean${GIT_CLEAN_FORCE}" && return 0
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}clean${GIT_CLEAN_DRY_RUN}" && return 1
    return 0
}

# `git restore` is the modern spelling of what `git checkout -- <path>` used to do, and must be
# gated the same way (BT-413). Every form touches the worktree and discards uncommitted changes
# with no recovery path, except `--staged`/`-S` given without `--worktree`/`-W`: that form only
# unstages, leaving the worktree file exactly as it was, so it is the one safe spelling.
GIT_RESTORE='restore([[:space:]]|[;&|<>]|$)'
GIT_RESTORE_STAGED='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+(-S|--staged)([[:space:]]|[;&|<>]|$)'
GIT_RESTORE_WORKTREE='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+(-W|--worktree)([[:space:]]|[;&|<>]|$)'

# Exit status 0 when the command runs a `git restore` that is not the staged-only safe form.
is_destructive_restore() {
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}${GIT_RESTORE}" || return 1
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}restore${GIT_RESTORE_STAGED}" || return 0
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}restore${GIT_RESTORE_WORKTREE}" && return 0
    return 1
}

if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}reset[[:space:]]+--hard|${GIT_PREFIX}checkout[[:space:]]+--" || is_destructive_clean || is_destructive_restore; then
    printf '[BLOCKED] Destructive git command detected (reset --hard / clean without --dry-run / checkout -- / restore that touches the worktree). Use a safer git operation or ask for explicit approval.\n' >&2
    exit 2
fi

# Require -f/--force/--force-with-lease to sit at an argument boundary
# (whitespace, a shell command separator such as ; & |, an unquoted
# redirection > or <, or end of line) so it does not match a substring inside
# a ref/branch name, e.g. `git push origin foo-feature` must not trip this.
# The shell splits an unquoted `--force>out` / `--force<in` into the argument
# `--force` plus a redirection with no whitespace needed, so > and < are
# argument boundaries too, same as ; & |. A refspec prefixed with `+` (e.g.
# `git push origin +main`) is git's other force-push spelling and is matched
# separately.
FORCE_FLAG='([[:space:]]+[^[:space:]]+)*[[:space:]]+(-f|--force|--force-with-lease(=[^[:space:]]*)?)([[:space:]]|[;&|<>]|$)'
FORCE_REFSPEC='([[:space:]]+[^[:space:]]+)*[[:space:]]+\+[^[:space:]]+'

if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}push(${FORCE_FLAG}|${FORCE_REFSPEC})"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Force push detected. Confirm before continuing."}}\n'
    exit 0
fi

# `git branch -D` permanently deletes an unmerged branch. The deleted commits stay reachable via
# reflog for a while (unlike reset --hard / checkout --/ restore / clean above), so this is "ask"
# rather than a hard block. `-D` is shorthand for `--delete --force`; scan for either spelling,
# including `-D` bundled with other short flags (e.g. `-Dq`).
GIT_BRANCH='branch([[:space:]]|[;&|<>]|$)'
GIT_BRANCH_SHORT_D='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+-[[:alnum:]]*D[[:alnum:]]*([[:space:]]|[;&|<>]|$)'
GIT_BRANCH_LONG_DELETE='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+--delete([[:space:]]|[;&|<>]|$)'
GIT_BRANCH_LONG_FORCE='([[:space:]]+[^[:space:];&|<>]+)*[[:space:]]+(-f|--force)([[:space:]]|[;&|<>]|$)'

# Exit status 0 when the command force-deletes a branch (`-D`, or `--delete` plus `--force`).
is_force_branch_delete() {
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}${GIT_BRANCH}" || return 1
    printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}branch${GIT_BRANCH_SHORT_D}" && return 0
    if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}branch${GIT_BRANCH_LONG_DELETE}" \
        && printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}branch${GIT_BRANCH_LONG_FORCE}"; then
        return 0
    fi
    return 1
}

if is_force_branch_delete; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Force branch delete detected (git branch -D). Confirm before continuing."}}\n'
    exit 0
fi

# `git stash drop`/`git stash clear` permanently discards stashed work, but a stash entry is a
# commit object, so it stays reachable via reflog for a while – same "ask" tier as branch -D and
# force push, not a hard block.
GIT_STASH_DROP_CLEAR='stash[[:space:]]+(drop|clear)([[:space:]]|[;&|<>]|$)'

if printf '%s' "$NORMALIZED_TEXT" | grep -Eq "${GIT_PREFIX}${GIT_STASH_DROP_CLEAR}"; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Stash drop/clear detected. Confirm before continuing."}}\n'
    exit 0
fi

exit 0
