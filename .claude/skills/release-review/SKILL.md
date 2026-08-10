---
name: release-review
description:
  'Reconcile a Linear release ticket with what the repo and the milestone actually say, before running /release. Use
  when a release is close and the punch-list ticket needs to be trusted again: stale checkboxes, scope that moved
  milestone, counts that have drifted, issues on the milestone the ticket never mentions, and open PRs that still have
  to land.'
---

# Release Review

A release punch list is written once and read months later. Between those two moments the scope moves, features land
without anyone ticking a box, issues get pushed to the next milestone, and stated counts go stale. This skill makes the
ticket trustworthy again so `/release` can be run against it.

Requires the Linear MCP tools (`get_issue`, `list_issues`, `save_issue`, `list_milestones`). Without them, stop and say
so – there is no useful repo-only subset of this skill.

## Usage

```text
/release-review BT-418
```

With no argument, find the release ticket yourself: `list_issues` on the BLIT386 team for the current milestone and pick
the one titled `Release engine <version>`. Confirm the choice with the user before editing anything.

## What this skill does not do

`/release` already owns the repo-facing half, and reimplementing it is the main way this skill goes wrong:

| Job | Owner |
| --- | --- |
| Merged-PR inventory since the last tag, grouped by package | `/release` steps 2-7 |
| Direct pushes to `main` with no associated PR | `/release` step 5 |
| Per-symbol docs coverage across engine docs, kit content, website mirror | `/release`, "Verify docs coverage" |
| Changelog cross-checked against `_api-history.json` | `/release`, "Mark the changelog as released" |
| Bump, publish, tag, API-history regeneration | `/release`, "After RELEASE.md" |

This skill covers what `/release` never looks at: Linear, and the agent-facing files under `.claude/rules/`.

## 1. Get the inventory from `/release`, do not re-derive it

Read `.claude/skills/release/SKILL.md` and run its steps 2 through 7 – last tag, commits since, merged PRs with their
changed files, direct pushes, per-package grouping. Answer its step 1 version question with the milestone's version.

**Stop before step 8.** Writing `RELEASE.md` belongs to the release, not to the review. What you want is the grouped PR
list and the direct-push list as data.

## 2. Reconcile the ticket against Linear

Pull every issue identifier the ticket mentions, plus every issue on the release milestone, and compare. Each row below
produced a real finding the last time this ran:

| Check | What it looks like |
| --- | --- |
| Scope that moved milestone | The ticket lists a ticket as shipping; that ticket now sits on the next milestone |
| Checkbox versus status | Unchecked boxes for issues that are Done, and "(In Progress)" annotations long out of date |
| Milestone issues the ticket omits | Open issues on the milestone named nowhere in the punch list |
| Status contradicting shipped code | An issue reverted to Todo while its code is on `main` – check the source, not the ticket |
| Wrong-state issues on the milestone | Duplicate or Canceled issues still counting toward the burn-down |

For scope that moved, do not simply delete it. Move it into the ticket's deferred section with the date and a sentence
on what its absence means for this release – a release that quietly loses a feature is worse than one that records why.

## 3. Reconcile the ticket against the repo

Every number and file path a punch list states is a claim with a shelf life. Verify each one and rewrite it with the
date you checked:

- Symbol counts: `unreleased` entries in `packages/blit386/docs/_api-history.json`
- Commit count between the last tag and `main`
- Pre-bump values the bump script rewrites: `BTAPI.VERSION_MAJOR` / `MINOR` / `PATCH`, kit `blit386.engineRange`,
  `scaffold.ts`'s `BLIT386_RANGE`
- Named files: confirm each path exists and holds what the ticket says. A doc item can be satisfied in a different file
  than the one named – when it is, say so explicitly, or the next reader duplicates the content into the named file

## 4. The blind spots

Three classes of problem sit outside both `/release` and the ticket's own checklist:

- **Agent-facing rules.** `/release` greps `docs/*.md` and kit content, never `packages/*/.claude/rules/`. Rules that
  enumerate the public surface by name go stale silently, and a stale enumeration is worse than an absent one: the next
  session reads a complete-looking list and concludes a real symbol is not public. Check every rule that names API.
- **Open PRs that must land.** `/release` only sees merged PRs. An open PR that changes behavior on an existing public
  method belongs to this release, not the next one. List them in the ticket with the reason they gate the bump.
- **Closed-but-not-merged PRs.** A gate phrased as "resolve or merge open PR #N" is satisfied when that PR is closed as
  superseded. Check the state of every PR the ticket names rather than assuming it is still open.

## 5. Patch the ticket

Use `save_issue` with `patch` operations, never a full-body resend – see mechanics below.

Four rules:

1. **Never tick a box you did not verify.** A wrongly ticked box is worse than a stale unchecked one.
2. **Never delete a decision record.** Counts and checkboxes are derivable and safe to rewrite. "Deferred deliberately
   because it is a catalog, not a commitment" is not derivable and must survive.
3. **Date every verification you write in.** "Re-verified 2026-08-10" tells the next reader how much to trust it.
4. **Report milestone and status corrections, do not apply them.** Moving another issue's milestone is the user's call.

## 6. Report

Lead with what is genuinely still open – that is the answer the user wants. Then the corrections you made, then the
milestone and status fixes you are recommending but did not apply. If the review found work worth its own issue, file it
with the `linear-issue` skill rather than burying it in a checkbox.

## Linear mechanics that bite

- `patch` anchors must match the current content **exactly once**, and one failing operation aborts the whole call with
  nothing saved. Re-read with `get_issue` and copy anchors from that output rather than from memory.
- Never wrap an identifier in your own `<issue id="...">` element. Write the bare `BT-470` and let Linear resolve it;
  wrapping it produces nested elements that render badly.
- A bare identifier outside a fenced block becomes a live mention, which is what you want. Inside a fenced block it
  stays literal, so starting prompts survive intact. Verify after saving rather than assuming.
- `save_issue` echoes the whole issue back, which for a punch list can exceed the tool-result limit. That is a display
  failure, not a save failure – confirm the result by grepping the saved tool-result file for a phrase you just wrote.
- `git show --name-only --format=` prints no file names. Use
  `git diff-tree --no-commit-id --name-only -r -m --first-parent <sha>`, which also handles merge commits.
