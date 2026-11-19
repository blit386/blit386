# Commit review gate

Every `git commit` a Claude Code session runs in this repo - main session or subagent - is refused unless `/review` and
`/ponytail:ponytail-review` both saw exactly the content being committed (BT-815). Commits you type in your own terminal
are not affected.

- **How it knows.** `scripts/hooks/review-gate.mjs`, wired in `.claude/settings.json`. When either review runs (a Skill
  tool call, or the slash command typed as a prompt), it snapshots the working tree (tracked and untracked, `.gitignore`
  honored) as a git tree object and stores its SHA in `<git dir>/review-gate/<review>` - per worktree, never committed.
  The latest run of each review wins.
- **Reviews count for the session's own checkout** (its working directory), never another worktree, so a parallel
  session's review cannot vouch for your changes. A `cd <other worktree> && git commit` is always blocked: review and
  commit from a session whose working directory is the committing checkout. A subagent cannot change its working
  directory, so give it an isolated worktree (`isolation: "worktree"`) or keep it in the main checkout.
- **What passes.** Every tracked path that differs from `HEAD`, in the index or in the working tree, must match both
  snapshots byte for byte. That covers `commit -a` and pathspec commits without parsing them. Staging after a review is
  fine; one review can cover several commits that split the change.
- **What blocks.** Any edit after a review - including the fixes the review asked for - and any unrelated unstaged edit
  made after it. Run both reviews again after your last edit, then commit. The block message names each stale review and
  the paths it did not see.
- **Generated paths are exempt**, so a commit of only these passes unreviewed: the files
  `pnpm run sync:maintainer-agents` owns (`OWNED_DIRS`, `OWNED_EXACT_FILES`), `.cursor/commands/`, and
  `packages/blit386/docs/_api-history.json`. The `sync:docs` mirror is gitignored, so it never reaches a commit at all.
  There is no env-var bypass.
- **Fail mode.** A missing or stale marker blocks (exit 2). An internal error (git missing, unparsable payload, no
  `HEAD`) allows the commit with a `review-gate: internal error` note on stderr, so a gate bug cannot stop all work.
