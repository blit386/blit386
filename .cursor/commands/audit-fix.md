# Work an audit umbrella

`/audit` files the tickets; this skill lands them. The main thread is a manager: it never edits code. Each sub-ticket
gets one fresh implementer subagent that reads `brief.md` (next to this file) and the ticket, works on its own branch,
and merges its own PR. The manager sequences tickets, approves plans, checks every report against the transcript and
Linear, and carries notes from one ticket to the next.

The first run was the 2026-11-08 umbrella BT-751: 22 tickets, 22 ticket PRs plus one post-hoc fix PR (#969-#991), about
12 hours wall clock. The rules below are what that run learned; do not drop one without knowing why it is there.

## Fixed rules (from the user)

- Sequential, one ticket at a time, flat in the main checkout on branches. No worktrees.
- Branch name = the ticket's Linear `gitBranchName`, created from freshly pulled `main`, so the PR pairs with Linear.
- Model, effort and plan mode come from the ticket's `Model/effort/plan-mode:` line. "medium-high" means `high`.
  Subagents run on `model: "opus"` unless the ticket names another model (project memory: Fable subagents drain the
  budget).
- `review <package>` and `ponytail:ponytail-review` run before EVERY commit, docs and one-liners included. Only a
  generated-output commit (sync:docs mirror, `_api-history.json`, `sync:cursor-commands`, /shots captures) is exempt.
- The implementer pushes, opens the PR, gets CI green and merges with `gh pr merge --merge` without asking.
- Stop and tell the user only when something is off: an owner decision, a gate the implementer may not move (bundle
  size), a broken rule.

## Step 0 - set up the run

1. Read the umbrella and its comments (`get_issue`, `list_comments`), then list its children (`list_issues` with
   `parentId`). Dispatch only children that are not Done or Canceled; include Backlog children only if the user says so.
2. Spawn ONE read-only research subagent (Opus, medium) to sweep every child: model/effort/plan line, open blockers,
   "coordinate with / ride along / fold into" notes, files touched, and shared-file hotspots between tickets. This is
   what makes an order possible without reading every ticket in the main thread.
3. Propose an order: by package (engine, kit, demos, website, repo), tickets that export something before the ones that
   import it, a ticket that sweeps many files (link or anchor fixes) last. Ask the user once, with AskUserQuestion,
   about: the order, Backlog children, and how to handle checks only a human can run (default: unchecked items in the PR
   test plan, collected for the end).
4. Write two scratchpad files and keep them current for the whole run:
   - `<SCRATCHPAD>/<UMBRELLA>-ledger.md`: order, user decisions, per-ticket outcome (PR, merge SHA, commits, review
     counts, minutes, behavior changes), manual checks owed, out-of-scope findings with `file:line`, lessons.
   - `<SCRATCHPAD>/implementer-brief.md`: a copy of `brief.md` with `<SCRATCHPAD>` and `<UMBRELLA>` filled in. Harden it
     when a ticket teaches something; every later implementer reads the new version.
5. Check repo facts once:
   `gh api repos/{owner}/{repo} --jq '{allow_auto_merge,allow_squash_merge,delete_branch_on_merge}'`. This repo: no
   auto-merge, merge commits only, branches deleted on merge. CodeRabbit reviews only PRs labeled `cr`
   (`.coderabbit.yaml`, `auto_review.enabled: false`) and costs money, so never add the label unless the user asks.

## Step 1 - per ticket

Manager, before dispatch (one Bash call):

```bash
git switch -q main && git pull -q --ff-only && git branch -d <previous-branch> && git switch -c <gitBranchName>
```

On the first ticket there is no previous branch: drop the `git branch -d` step. `&&` all the way means a failed switch,
pull or delete stops the chain instead of cutting the new branch from the wrong place. `-q` on pull keeps a big merge's
diffstat out of the manager's context. `branch -d` (not `-D`) fails loudly if the previous branch did not merge.

Dispatch with `Agent` (`subagent_type: "general-purpose"`, `run_in_background: true`, the ticket's model and effort).
The prompt is short; the brief carries the rules:

- ticket ID and title, umbrella ID, repo path, branch already checked out, `main` SHA;
- "Read your binding brief first, in full": the scratchpad brief path;
- the Linear In Progress + priority 0 write is the implementer's first action (`save_issue` echoes the whole ticket
  body, which would bloat the manager);
- the `review` args for the package;
- the exact `Co-Authored-By` trailer for its commits (the brief leaves it to the dispatch);
- "Stay with the PR until it is merged; do not send the final report while CI is still running";
- the cross-ticket context: what earlier tickets merged that this one builds on (module paths, exported names), what a
  later ticket owns (stay out), items an earlier ticket handed over or deferred, known out-of-scope items not to fix.

### Plan mode

There is no plan-mode switch for subagents. Emulate it in two phases with the same agent:

1. Phase 1 dispatch: plan only, no edits. Write the plan to `<SCRATCHPAD>/BT-xxx-plan.md`, check every ticket claim
   against `main`, self-critique, and reply with a summary, numbered open decisions with a recommendation each, and the
   deviations from the ticket. Then stop.
2. Read the plan section behind any decision that could destroy user data or change behavior (BT-776: a merge that would
   have dropped comments from a user's editor settings; the manager changed it to text insertion).
3. Approve or adjust with `SendMessage` to the same agent. Phase 2 implements per the brief.

### Rulings the manager makes without the user

- Spec edits forced by a cut the ticket lists: allowed under `SPEC_GUARD_ACK=1` at roughly <= 3 spec lines per source
  line removed, never flipping an assertion's expected behavior. Pure renames checked by script are fine at any size.
- A ticket claim that is false on `main`: skip it, say so in the PR. A ticket fix that would not work (BT-760: the
  suggested decodeURI): the implementer fixes the real cause and explains.
- A deviation that keeps a safety property (BT-775: no script rename that would turn existing games' guards off):
  approve and have it named under "Deviations from the ticket" in the PR plus a follow-up.

## Step 2 - after each report

Never tell the user a ticket is done from the report alone.

1. **Audit the review rule.** Count Skill calls in the transcript and compare with the commits:

   ```bash
   F=<tasks dir>/<agentId>.output
   grep -o '"name":"Skill","input":{"skill":"review"' $F | wc -l
   grep -o '"name":"Skill","input":{"skill":"ponytail:ponytail-review"' $F | wc -l
   git rev-list --count <merge>^1..<merge>^2
   ```

   Both counts must be at least the number of non-generated commits. Counting `git commit` in the transcript over-counts
   failed attempts; use `rev-list` on the merge. A shortfall is a broken rule: tell the user, and offer the post-hoc
   remedy (Step 4).

2. **Verify Linear**: `get_issue` with `fields: ["status"]` must say Done (the GitHub integration closes the issue when
   a PR whose branch carries the ID merges).
3. **Check anything the report does not explain**: a deleted file, an unexpected changed screenshot, a skipped finding.
   Look at the merge diff before moving on (BT-768: two deleted /shots tiles turned out to be orphans, verified from
   `poses.js` on the merge's first parent).
4. **Update the ledger**: outcome, manual checks, follow-ups with `file:line`, lessons. Harden the brief if the
   implementer hit friction that the next one would hit too.
5. Pull, create the next branch, dispatch. Tell the user in a few lines: merged PR link, what changed that they will
   notice, new manual checks, what started next.

## Events while an implementer owns a PR

- **Linear linkback bot comment** (Auto-fix event): ignore.
- **CodeQL alert or background security review on the branch**: forward to the implementer with `SendMessage` - the
  finding, the file:line, a suggested fix, "verify each claim first", a test, and (for CodeQL) a one-line reply in the
  alert thread ending `_Addressed by [Claude Code](https://claude.com/claude-code)_` (no emoji). Do not edit the branch
  from the manager.
- **CI failure**: the implementer owns it. Act only if it has already handed back.
- **Hand-back before merge** (CI still running): resume it with `SendMessage` to watch CI and merge. Do not merge from
  the manager; two writers on one PR is how duplicate merges and pushes happen.
- **"Waiting on its own background work"** notices: nothing to do; the report follows.

## Step 3 - group-level steps

- **One recapture per visual area.** Demo tickets each change pixels. Have each report the slugs whose pixels change and
  any stale /shots pose, and give the single /shots recapture to the last demo ticket together with the full list, so it
  can diff expected vs actual changed tiles and explain every surprise.
- **Mirrors**: engine docs and demo source feed the website mirror. `sync:docs`, commit the mirror in its own commit
  after the source commits, then `sync:docs:check` (it diffs against git, so it only passes after the commit).

## Step 4 - post-hoc review (remedy, and worth doing per group)

When the review rule was broken, or after a group of large PRs: spawn one read-only reviewer per merged PR in parallel
(Opus, medium) with `posthoc-brief.md` and the merge SHA. Each reviews `git diff <merge>^1 <merge>` with both skills and
re-locates every finding on current `main`. Then one implementer fixes all findings in one follow-up PR. That PR's
branch, title and body must NOT contain a ticket ID, or the Linear integration may close the umbrella. In the first run
the post-hoc pass found a real bug and five wrong doc statements the per-commit flow had missed, at about 3 minutes per
PR.

## Step 5 - end of run

1. Confirm every dispatched child is Done (`list_issues` with `parentId`). List Canceled children and the Backlog
   children the user left out separately, not as failures.
2. Give the user the manual checks owed, grouped by PR, short.
3. List the out-of-scope findings and ask before filing. File with the `linear-issue` skill: one umbrella plus
   sub-issues under the right area hub, assignee `me`.
4. Report the lessons that should change `brief.md` or this file, and offer to land them.

## Keeping this skill honest

- Any edit to `SKILL.md` needs `pnpm run sync:cursor-commands` and the regenerated `.cursor/commands/audit-fix.md`
  staged. `brief.md` and `posthoc-brief.md` are not mirrored.
- `brief.md` is the hardened implementer brief. When a run hardens its scratchpad copy, fold the lasting changes back
  here (with the placeholders kept).
