# Commit review gate

Every `git commit` and every `gh pr create` a Claude Code session runs in this repo - main session or subagent - is
refused unless `/review` and `/ponytail:ponytail-review` both saw exactly the content being committed or proposed
(BT-815). Commands you type in your own terminal are not affected.

- **Pull requests.** `gh pr create` (and its alias `gh pr new`, with `-R/--repo` before or after `pr`) is found with the
  same tokenizer, wrapper and `cd` handling as `git commit`; other `gh` commands (`gh pr view`, `gh pr edit`,
  `gh issue create`) and quoted mentions are ignored. A PR is usually clean and already committed, so its changed paths
  are counted from the merge base with `origin/<base>` (not from `HEAD`), where `<base>` is `--base`/`-B`, else the
  branch's `gh-merge-base` config, else the remote's default branch as the local `origin/HEAD` records it (refresh it
  with `git remote set-head origin -a`; the gate cannot see a remote default that changed since), else the PR is refused
  until `--base` is passed. Three sets must match both review snapshots byte for byte: paths `HEAD` changes (what the PR
  carries), paths staged, and paths changed in the working tree. A reviewed correction sitting over unreviewed committed
  content therefore still blocks. `--head`/`-H` and `--repo`/`-R` are refused outright, since only this checkout's
  checked-out branch can be checked; so is any `git switch` or `git checkout` earlier in the same command as
  `gh pr create` (switch in a separate call). `--base` and `--head` are read the way `gh` reads them (string options
  consume the next word, `-B=x`, `-Bx` and `-dB x` work, an empty value is "not given", the last occurrence wins, and
  the words after a `$(...)` in the arguments still count, and a `$(...)` inside a word, as in `rel$(x)`, stays part of
  that word, so a base built that way is refused). A PR entry whose `origin/<base>` ref is missing fails open with the
  internal-error note, and does not drop a block another entry in the same command earned. A PR whose changes are all
  generated paths passes. The block message names both skills. Running the reviews only to open the commit gate is not
  enough: `/pr` still wants each as its own full report.

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
  `exec`, `nohup`, `time`, `xargs`, `sudo` in front are skipped. A `#` that starts an unquoted word comments out the
  rest of the line (bash runs nothing in a comment, so neither does the gate). A directory taken from a `$(...)`
  (`cd "$(...)"`, `git -C "$(...)"`) leaves the directory unchanged for a commit, but a `gh pr create` after such a `cd`
  is refused (`cd` in a separate call), and a `$(` that never closes (a missing `)`) still leaves its outer command
  judged; for `gh pr create` the cut-off arguments cannot be trusted, so it is refused (use `--body-file`). A heredoc
  body (`<<DELIM`, `<<-DELIM`) is skipped to its delimiter line: a quoted delimiter makes it inert, an unquoted one
  still runs its `$(` (one that never closes refuses the whole command), and quotes inside it are literal, while `\$(`
  is escaped text; a heredoc whose delimiter line never appears is not skipped, an unquoted body joins escaped-newline
  lines before comparing its delimiter, a `$(...)` or `(...)` keeps its own heredocs apart from the outer command's, and
  `<<<` is a here-string, not a heredoc. The operand of an unquoted redirection (`>`, `>>`, `2>&1`, `<`, `<<<`) is
  dropped from the command's arguments, since it is a file or stdin text. Only a plain, unquoted digit run before the
  operator is a file descriptor (`2>`); a quoted `"2">` is an argument. Inside arithmetic (`$((...))`, `((...))`), `<<`
  is a shift, not a heredoc. Not seen: a wrapper given its own options (`sudo -u x git commit`), a commit inside a shell
  string (`bash -c "git commit"`), or one built from `$VAR`. With `--git-dir` or `--work-tree` the commit is checked in
  the current directory. The gate stops an agent that forgot to review; it is not a sandbox.
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
