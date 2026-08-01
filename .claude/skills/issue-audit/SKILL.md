---
name: issue-audit
description:
  Re-audit open GitHub issues against the current codebase and post a new audit-update comment only when the situation
  has genuinely changed since the last audit.
---

# Issue Audit Pass

Walk every open issue on `blit386/blit386`, compare its last recorded audit comment against the current state of the
code, and post a fresh audit-update comment only for issues whose situation is now materially different. Issues whose
feature area has seen no relevant change get nothing.

Use `gh` for all GitHub reads and writes (GitHub MCP is an acceptable substitute if `gh` is unavailable).

## Usage

```text
/issue-audit
```

## Core rule

Add a new comment only if the situation is now different from the most recent audit comment on that issue (the audit
bucket, evidence, or recommended status has changed). When in doubt, do not comment. Never restate an unchanged audit.

## Audit buckets

- `not implemented` – no shipped code addresses the ticket
- `partial` – some of the requested surface shipped; concrete gaps remain
- `implemented` – the requested behavior is shipped (candidate to close)

## Comment format

Match the existing audit comments exactly. Every comment starts with a dated heading:

```md
## Audit update (YYYY-MM-DD)

- Audit bucket: <bucket> (was: <previous bucket> on <previous date>)
- Evidence: <specific files / APIs / commits proving the current state>
- Recommended next status: <Keep Backlog | Keep Todo | Close | ...>
- Suggested next step: <concrete action>
```

Include the `(was: ...)` parenthetical only when the bucket actually changed. Cite real symbols and paths (e.g.
`OverlayTimingSnapshot`, `HardwareSettings.isOverlayRendererDiagnosticsBarEnabled`), not vague claims. Plain text only,
no emoji.

## Steps

1. List open issues and their last audit.
   - `gh issue list --repo blit386/blit386 --state open --limit 100 --json number,title,labels,updatedAt`
   - For each issue, pull the most recent audit comment:
     `gh issue view <n> --repo blit386/blit386 --json comments --jq '.comments[] | select(.body | startswith("## Audit update")) | .body'`
   - Note the date of the latest audit comment per issue. Issues with no audit comment have no baseline – flag them in
     the summary but do not invent a "changed" verdict for them unless the user asks for a first-time audit.

2. Find what changed in the code since the last audit.
   - Record each issue's own last-audit date from step 1 (`lastAuditDate` per issue). Audit dates differ between issues
     – never collapse them into a single "most recent across issues" cutoff, or commits that landed between an
     earlier-audited issue's date and that global latest date get missed, yielding false "unchanged" verdicts.
   - For the broad prefilter, use the earliest `lastAuditDate` across all issues as the baseline so no relevant commit
     is excluded: `git log --since=<earliest-lastAuditDate> --pretty=format:'%h %ad %s' --date=short`
   - Filter to behavior-changing work: `... | grep -E '(feat|fix)\('`. Ignore `docs`, `chore`, `refactor`, `test`, `ci`,
     and `style` commits – renames and formatting do not change an audit verdict. A breaking rename (`feat(...)!`) can
     matter if it adds or removes public surface.
   - The earliest-baseline log is only a prefilter. Each candidate is judged per issue against its own `lastAuditDate`
     in step 4, not against the global baseline.

3. Map changed feature areas to issues.
   - Group the `feat`/`fix` commits by area (overlay, renderer, api, assets, input, etc.) and match them to the open
     issues those areas would affect. Only those issues are candidates for a changed verdict; everything else is
     unchanged by definition.

4. Verify each candidate against the codebase, per issue.
   - Compare commits against that issue's own `lastAuditDate`, not the global baseline: a commit only counts toward a
     changed verdict if it landed strictly after the issue was last audited
     (`git log --since=<issue.lastAuditDate> -- <relevant paths>`).
   - Do not trust commit subjects alone. Confirm the actual public surface with `rg` / `git grep` and by reading the
     relevant `packages/blit386/src/` files (e.g. confirm an API exists in `packages/blit386/src/BLIT386.ts`, a type
     field in `packages/blit386/src/core/IBTDemo.ts`, a metric in `packages/blit386/src/overlay/`).
   - Re-read the issue body so the verdict addresses what the ticket actually asked for, including partial coverage
     (some sub-points shipped, others not).

5. Decide and post.
   - If the bucket / evidence / recommended status is unchanged: post nothing.
   - If it changed: post one audit-update comment in the format above, dated today.
     `gh issue comment <n> --repo blit386/blit386 --body '<comment>'`
   - Be precise about what shipped and what is still missing; name the residual gap so the ticket can be re-scoped or
     closed.

6. Summarize for the user.
   - List which issues got a new comment and why (old bucket -> new bucket).
   - List issues that were candidates but ruled unchanged after verification.
   - List any open issues with no prior audit baseline (e.g. CodeRabbit-only comments) that were skipped.

## Notes

- This is a read-then-write workflow against live GitHub issues. Posting comments is outward-facing; only post the
  comments warranted by step 5. If unsure whether a verdict changed, report it in the summary and let the user decide
  rather than commenting.
- Prefer one comment per genuinely-changed issue. Do not bulk-comment.
- Cross-reference `packages/blit386/CLAUDE.md` for the public API shape (getters vs methods, `HardwareSettings` field
  names) when judging whether requested surface actually exists.
