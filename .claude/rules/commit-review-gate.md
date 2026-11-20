# Commit review gate

Every `git commit` and every `gh pr create` a Claude Code session runs in this repo - main session or subagent - is
refused unless `/review` and `/ponytail:ponytail-review` both saw exactly the content being committed or proposed
(BT-815). Commands you type in your own terminal are not affected.

- **Pull requests.** `gh pr create` (and its alias `gh pr new`, with `-R/--repo` before or after `pr`) is found with the
  same tokenizer, wrapper and `cd` handling as `git commit`; other `gh` commands (`gh pr view`, `gh pr edit`,
  `gh issue create`) and quoted mentions are ignored. A PR is usually clean and already committed, so its changed paths
  are counted from the merge base with `origin/<base>` (not from `HEAD`), where `<base>` is `--base`/`-B` or `main`.
  Three sets must match both review snapshots byte for byte: paths `HEAD` changes (what the PR carries), paths staged,
  and paths changed in the working tree. A reviewed correction sitting over unreviewed committed content therefore still
  blocks. `--head`/`-H` is refused outright, since only the checked-out branch can be checked; so is a `git switch` or
  `git checkout` earlier in the same command as `gh pr create` (switch in a separate call). `--base` and `--head` are
  read the way `gh` reads them (string options consume the next word, `-B=x` and `-Bx` work, the last occurrence wins).
  A PR entry whose `origin/<base>` ref is missing fails open with the internal-error note, and does not drop a block
  another entry in the same command earned. A PR whose changes are all generated paths passes. The block message names
  both skills. Running the reviews only to open the commit gate is not enough: `/pr` still wants each as its own full
  report.

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
