# Commit review gate

Every `git commit` a Claude Code session runs in this repo - main session or subagent - is refused unless `/review` and
`/ponytail:ponytail-review` both saw exactly the content being committed (BT-815). Commits you type in your own terminal
are not affected.

- **How it knows.** `scripts/hooks/review-gate.mjs`, wired in `.claude/settings.json`. When either review runs (a Skill
  tool call, or the slash command typed as a prompt), it snapshots the working tree (tracked and untracked, `.gitignore`
  honored) as a git tree object and stores its SHA in `<git dir>/review-gate/<review>` - per worktree, never committed.
  The latest run of each review wins.
- **Reviews count for the checkout they ran in.** A review writes markers for the session's working directory; the gate
  reads them from the committing checkout (after any `cd X` or `git -C X` before the commit). So a review run in your
  checkout never vouches for another one: a `cd <other worktree> && git commit` passes only if a review run from that
  worktree saw the content, and is otherwise blocked with a note naming both checkouts. Review and commit from a session
  whose working directory is the committing checkout. A subagent cannot change its working directory, so give it an
  isolated worktree (`isolation: "worktree"`) or keep it in the main checkout.
- **What it sees as a commit.** The Bash command is split into simple commands, quotes respected, and walked in order:
  each `cd X` moves the directory, and every `git <global options> commit` is checked in the directory it runs in, so
  `git -C A commit && git -C B commit` checks both. `VAR=x` assignments and the wrappers `rtk`, `env`, `command`,
  `exec`, `nohup`, `time`, `xargs`, `sudo` in front are skipped. Not seen: a wrapper given its own options
  (`sudo -u x git commit`), a commit inside a shell string (`bash -c "git commit"`), or one built from `$VAR`. With
  `--git-dir` or `--work-tree` the commit is checked in the current directory. The gate stops an agent that forgot to
  review; it is not a sandbox.
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
