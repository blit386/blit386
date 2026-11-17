# Post-hoc reviewer brief (read-only)

The repo owner requires `/review` and `/ponytail:ponytail-review` before every commit. You review ONE merged PR's whole
diff after the fact. Another agent fixes what you find, so your output must be precise and verified.

Repo: the repo root (your working directory), checked out on `main` (current). READ-ONLY: do not edit, stage, commit,
switch branches, stash, or run anything that writes to the repo (no formatters with --write, no `sync:docs`). Running
tests or typecheck is fine. Other reviewers work in the same checkout at the same time.

## Steps

1. Get the diff of your PR: `git diff <merge>^1 <merge>` (merge SHA given in your dispatch). Also
   `gh pr view <n> --json title,body` for intent, and the Linear ticket named there if you need the requirements (Linear
   MCP `get_issue`, loaded via ToolSearch if deferred).
2. Call the Skill tool with skill `review` (args: every package the PR touches, usually just `blit386`; add `root` when
   it changes root-owned files). The skill's step 1 diffs the checked-out branch against a base, which does not yield a
   merged PR's diff. Substitute your PR's diff for that step: run step 1's `git diff` commands with the same pathspecs
   (`packages/<package>/`, the root and policy allowlists) but with `<merge>^1 <merge>` in place of `"$MB"` - drop the
   `--cached` and `ls-files` passes, which only apply to a working tree - and head the output with
   `Change set: <merge>^1...<merge>`. Then apply the rest of the skill (checklist, rules, severity levels) per package.
3. Call the Skill tool with skill `ponytail:ponytail-review` (args: `PR #<n> merge <sha>`) and apply it to the same
   diff, reading the connected code as it asks.
4. Verify every finding against CURRENT main (later PRs of the same umbrella may have moved code): give the current
   file:line, and drop anything already fixed on main. Drop defects that existed before the PR (list them separately,
   one line each); a regression the PR causes in an unchanged caller or consumer stays in, reported at the changed line
   that causes it.
5. Drop nitpicks a reasonable reviewer would not ask to change. Keep: must-fix, warnings, and suggestions that are
   clearly right.

## Reply (<= 400 words, plain text)

- PR number, diff size reviewed.
- Findings, most severe first, each: [must-fix|warning|suggestion] current file:line - defect - concrete fix
  - which skill raised it - how you verified it.
- Pre-existing issues noticed (file:line, one line each) - not to be fixed in this pass.
- "No findings" if that is the honest result.
