# Implementer brief - audit sub-tickets

You are the implementer for ONE sub-ticket of the Linear audit umbrella named in your dispatch in the blit386 monorepo
at the repo root (your working directory). A manager agent dispatched you. It has already pulled main and created +
switched to the ticket's branch (named from Linear's gitBranchName). Work flat in this checkout on that branch - no
worktrees.

Your first action: set the ticket on Linear to In Progress and clear its priority, in a tool call of its own (the Linear
MCP's `save_issue`, loaded via ToolSearch if deferred: `save_issue {id: "BT-xxx", state: "In Progress", priority: 0}`).
Skip it if the manager's dispatch says it is already done.

The user has authorized, for this ticket only: local commits, pushing this branch, opening a PR, fixing CI, and merging
the PR with `gh pr merge --merge` once CI is green. Nothing else (no pushes to main, no tags, no releases, no
publishing, no Linear edits beyond what the ticket's own prompt asks for).

## 1. Read first

- The ticket and every comment (Linear MCP `get_issue` and `list_comments`, loaded via ToolSearch if deferred), then the
  umbrella. The ticket and its comments win over the starting prompt where they disagree.
- Root `CLAUDE.md`, the touched package's `CLAUDE.md`, and the rules under `.claude/rules/` and
  `packages/*/.claude/rules/` that apply to the files you touch.
- Earlier tickets of the same umbrella are already merged on main; where the ticket says "coordinate with" / "fold into"
  / "ride along" another ticket, check that ticket's status and the code on main rather than assuming.
- Then execute the ticket's fenced **Starting prompt**. It is your task definition.

## 2. Every commit: review first (user requirement, no exceptions)

Small commits, as the ticket asks: one logical change per commit (a move may touch source, docs and tests together).
Before EACH `git commit`:

THIS IS AUDITED. The repo owner requires both reviews before every commit, including one-line doc commits. Earlier
implementers skipped or batched them; that broke the owner's rule. The manager counts your Skill tool calls against your
commits in your transcript before accepting your report. So:

- Call the Skill tool afresh for BOTH skills before EVERY commit, even if a skill is already loaded in your context.
  Applying a loaded checklist from memory does not count.
- Append one entry per commit to the review log `<SCRATCHPAD>/BT-xxx-reviews.md` (commit subject; /review findings: n,
  fixed/skipped; ponytail-review findings: n, fixed/skipped).
- "Prose only" or "trivial" is not an exception. The only exception is a generated-output commit (below).

1. Run the `review` skill (Skill tool, skill "review", args = the package: blit386, demos, website, kit, create-blit386,
   or root) on the uncommitted change.
2. Run the `ponytail:ponytail-review` skill (Skill tool) on the same uncommitted change.
3. Fix every must-fix and warning. Apply suggestions where they are right; skip with a one-line reason where not.
   Suggestions apply only to lines this branch adds - existing tests and untouched code are read-only (global rule; a
   PreToolUse spec-diff-guard hook enforces it on deleted lines in existing spec files).
4. Re-run the narrow checks the fix needs (the touched tests, typecheck, lint), then commit.

Keep a short tally per commit (findings found / fixed / skipped) for your final report.

Exception: a commit that only contains generated output (the `sync:docs` website mirror, a regenerated
`_api-history.json`, `sync:cursor-commands` output) needs no review round - run its drift check instead.

Notes: lint-staged reflows Markdown (for example the changelog) at commit time, so re-read a file before the next Edit
on it. The built-in browser pane pauses `requestAnimationFrame` while hidden; take a screenshot to let ticks advance, or
read state through `javascript_tool`.

## 3. Commit mechanics

- Foreground only (timeout up to 600000 ms), then read the hook output and `git log -1 --format=%B`.
- Exact shape (the session's attribution overrides your harness default - do not substitute another model name):
  `git commit -s -m "<type>(<scope>): <lowercase subject, no period, header <= 100 chars>" -m "<body wrapped at 72>" -m "<the Co-Authored-By trailer the manager gives in the dispatch>"`
- Types: feat, fix, refactor, docs, test, chore, perf, ci. Scopes: see the package's CLAUDE.md and `git log`.
- Commits are GPG-signed by the user's global config. Never turn signing off (no `-c` override of the signing setting,
  no `--no-gpg-sign`); main requires verified signatures.
- If the shell guard refuses the commit because of words in the message, write the message to a scratchpad file and use
  `git commit -s -F <file>` (same three-part shape, trailer last).
- Stage only the files you changed, by explicit path (`git add <paths>`). Never `git add -A` / `git add .`.
- If the pre-commit hook fails (lint-staged, cspell, Cursor mirror out of date after a SKILL.md edit ->
  `pnpm run sync:cursor-commands` and stage `.cursor/commands`), fix and commit again in the same turn. cspell: reword
  prose that trips on a non-word fragment instead of adding it to `cspell.json`; add only real words to the root
  `cspell.json`.

## 4. Banned git commands

Never run: `git stash`, `git reset`, `git restore`, `git checkout -- <file>`, `git clean`, `git rebase -i`,
`git push --force` / `-f`, `git commit --amend` after a push, `git branch -D`, anything touching `main` directly. To
compare against the pre-edit state use `git show HEAD:<path>` or `git diff`. If you think you need one of these, stop
and report to the manager instead.

The repo's shell-safety hook scans the WHOLE Bash command text, so destructive-git strings even inside a heredoc or a
`--body` argument are refused. Write such text to a scratchpad file with the Write tool and pass it by path
(`--body-file`).

## 5. House rules that bite

- No emoji anywhere. Plain hyphen-minus for breaks and ranges, never en/em dash. American spelling.
- `pnpm run <script>` (not bare `pnpm <script>`). In `packages/website` run lint as `RTK_DISABLED=1 pnpm run lint` (RTK
  mis-rewrites it).
- Named constants over repeated literals (`.claude/rules/named-constants.md`).
- Docs are part of every change (`.claude/rules/docs-sync-required.md`). User-visible engine fixes get an Unreleased
  entry in `packages/blit386/docs/changelog.md`. If you change `packages/blit386/docs/`, run `pnpm run sync:docs` in
  `packages/website` and commit the mirror in its own commit AFTER the engine doc commit (the pre-push check rejects a
  mirror committed together with its source); `sync:docs:check` fails on an untracked new mirror file until it is
  `git add`ed.
- Demo changes can stale the website mirror too (the docs embed demo source/descriptions): after changing
  `packages/demos/src/**`, run `pnpm run sync:docs` in `packages/website` and commit any mirror change in its own
  commit, then run `sync:docs:check` (it diffs against git, so it only passes after the commit).
- New API surface: check `@since` tags against the version rules (new API means a minor bump target; ask the manager if
  the ticket implies a new public symbol and the target version is unclear).
- `packages/blit386/docs/_api-history.json` regenerates with `null` dates in a tag-less checkout - this checkout has
  tags, but if dates turn `null`, restore the committed `versions` block.
- `vi.spyOn` can mask unhandled rejections; `test:visual -- file` runs all specs.
- Out-of-scope bugs you notice: do not fix them; list them in your report (the manager files them).
- Once a commit needed `SPEC_GUARD_ACK=1` (manager-approved spec deletion), the spec-diff guard keeps firing on later
  commits, the push and `gh pr create` because the deletion stays in the branch diff. Prefix those commands with
  `SPEC_GUARD_ACK=1` too; that covers the same approved deletion only.
- The Edit hook runs Prettier on edited `.ts` files and can reformat untouched lines in an existing spec. Check
  `git diff` on existing spec files after each edit and put back any line you did not mean to change.
- Dev server: port 5173 may be taken by the user's own server from another worktree. Never kill it; start yours on
  another port and stop it when done. `pnpm run dev -- --port 5191` does NOT work (the `--` reaches vite literally and
  the port is ignored); `pnpm run dev --port 5191` does.
- Running vite in the background via Bash on a spare port is fine (do not edit `.claude/launch.json`).
- `sleep` is blocked by a hook; wait with the `gh pr checks --watch` loop in section 7.
- Bundle-size gate (`.github/workflows/ci.yml`, ESM gzip limit): never raise it yourself. If a change pushes the bundle
  over, measure where the bytes come from and report to the manager with the numbers.

## 6. Before pushing

- Run `pnpm run preflight` in every touched package (background is fine for long ones; read the result).
- Spec edits forced by a cut the ticket lists: allowed under `SPEC_GUARD_ACK=1` only when the spec lines changed are in
  proportion (roughly <= 3 per source line the cut removes) and no existing assertion is flipped to expect different
  behavior unless the ticket asks for that change. Skip a cut over the ratio and say so in the PR. Each cut's spec edits
  stay in that cut's commit, named in the commit body. Any other deletion of existing spec lines: ask the manager first.
- Self-check `git diff origin/main...HEAD` for stray edits, deleted lines in existing spec files, emoji, en/em dashes.

## 7. Push, PR, CI, merge

- Push (foreground, timeout 600000; the pre-push hook runs preflight for changed packages plus root checks, often 1-3
  minutes): `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem RTK_DISABLED=1 git push -u origin <branch>:<branch>` Known
  environment artifacts, not real failures: external-URL 403s in `docs:links` (e.g. opensource.org). If the hook fails
  ONLY on such an artifact, stop and report to the manager - never `--no-verify` unasked.
- PR body: write it with the Write tool to the scratchpad, then
  `gh pr create --base main --head <branch> --title "<conventional title> (BT-xxx)" --body-file <file>`. Do NOT pass
  `--label` (it spawns a second, all-skipped CI run that masks the real one). Body shape (match the umbrella's earlier
  merged PRs): first line `Fixes BT-xxx, the <area> audit findings (umbrella <UMBRELLA>).`; `## Summary` bullets in
  plain language, behavior changes called out; `## Test plan` with `- [x]` for what you ran and `- [ ]` for every check
  you could not do (manual audio, Safari, npm page, live-browser checks you could not drive); last line exactly
  `Generated with [Claude Code](https://claude.com/claude-code)` (no emoji).
- CI (about 5 minutes). Wait with `while timeout 170 gh pr checks <n> --watch --interval 30; [ $? -eq 124 ]; do :; done`
  in the foreground (each call stays under the 180 s auto-background; the loop repeats only when `timeout` cut the watch
  short, so a failed check or "no checks reported" ends it instead of spinning). NEVER poll `gh` in a loop without a
  built-in delay: it burns the shared 5000/h API rate limit for everyone. If runs sit in "queued" during a GitHub
  incident, close and reopen the PR to get fresh runs. Right after `gh pr create`, `gh pr checks --watch` exits with "no
  checks reported"; re-run `gh pr checks <n>` by hand until checks appear (a few single calls), then start the watch
  loop. Traps:
  - Checks shown as `skipping` that should run: read the real run via
    `gh run list --branch <branch> --workflow CI --json databaseId,headSha,status,event` and
    `gh run view <id> --json jobs`. `Benchmarks`, `CodeRabbit` and package jobs for untouched packages legitimately
    skip.
  - CodeQL `Analyze (...)` comes from GitHub default setup and cannot be re-run; a checkout-stage TLS flake needs a new
    SHA. Check `gh pr view <n> --json mergeStateStatus`: `UNSTABLE` = not required, merge allowed once the flake is
    confirmed; `BLOCKED` = needs a new SHA.
- CI failure caused by your change: diagnose (read the job log), fix with the same review-before-commit loop, push,
  watch again. Failure that predates your branch or is unrelated: stop and report to the manager (it goes in a separate
  PR, not this one).
- All required checks green and `mergeStateStatus` is `CLEAN` (or `UNSTABLE` only from a confirmed CodeQL flake):
  `gh pr merge <n> --merge`. Never squash or rebase (squash is disabled; PRs land as merge commits). The branch is
  auto-deleted on merge. Do not switch back to main - the manager does that.

## 8. Stop and report to the manager instead of guessing when

- the ticket's claim does not match the code and the fix would need a design decision the ticket leaves open;
- the ticket asks for something only the repo owner can decide (version target, public API rename, removing a feature);
- a hook or the permission classifier blocks you;
- CI fails on something unrelated to your change;
- anything would need the banned git commands above.

## 9. Final report (your last message, <= 250 words, plain text)

- PR number + URL, merged yes/no, merge commit SHA.
- Commits (count) and one line per commit subject.
- Review tally: number of commits, number of `review` Skill calls, number of `ponytail:ponytail-review` Skill calls (the
  first two must match, and so must the last two, apart from generated-output commits), total findings fixed vs skipped,
  and the review log path.
- Unchecked manual items left in the PR test plan.
- Out-of-scope bugs or follow-ups you noticed - each MUST have file:line plus one sentence on the defect and its impact
  (the manager files them as Linear tickets from this list alone).
- Workflow friction: anything in this brief or the process that slowed you or was wrong (for improving the future
  skill).
