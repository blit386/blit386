---
name: audit
description:
  Run the read-only, module-by-module quality audit of the monorepo - one Opus reader per unit applying the review
  checklist and the ponytail cut tags, verified findings filed as one Linear ticket per unit under a dated umbrella, and
  the audit ledger stamped. Use before a quality release, when a unit's ledger date is old, or when the user asks to
  "audit the repo", "audit <module>", or re-run the snow-leopard audit. Takes an optional unit key or package name.
---

# Repo audit

A diff review (`/review`, `/deep-review`) looks at what changed. This skill looks at what is there: every non-test
source and prose unit, against the repo's own rules, with the over-engineering pass on top. The output is Linear
tickets, never edits - the fixes get their own sessions from each ticket's starting prompt.

The first run was the 2026-11-08 audit, umbrella BT-751, 31 module tickets (BT-753 to BT-783). Its shape is the one
below; read a couple of those tickets before writing new ones so the style matches.

## What is fixed and what is derived

- **Units are derived, never listed by hand.** `pnpm run audit:modules -- --list` prints them from the tree
  (`scripts/audit-modules.mjs`): one per `packages/blit386/src/<dir>`, `engine-entry` for the top-level engine files,
  one per demo file, and one per website, kit, scaffolder and root area. Adding a directory, a demo or a package makes a
  new unit appear; `pnpm run audit:modules:check` fails in pre-push and CI until the ledger has a row for it (or, for a
  new package or an unclaimed directory, until a rule is added to the script).
- **The ledger is `modules.md` next to this file.** Only `Last audited` and `Ticket` are human-owned; the other columns
  are rewritten by `pnpm run audit:modules`. Stamp rows with
  `pnpm run audit:modules -- --stamp <date> <ticket> <unit>...` as each ticket is filed, and land the stamped ledger in
  a PR after the run.
- **The reader brief is `brief.md` next to this file.** Common part plus a module-part template. Do not paraphrase it
  into the agent prompt; send the file content and fill the template.

## Step 1 - scope and grouping

1. Run `pnpm run audit:modules:check`. If it fails, fix the ledger or the rules first; auditing a tree the ledger does
   not describe is how units get skipped.
2. Pick the units: everything, one package, or the units the user named. With no argument, prefer the oldest
   `Last audited` dates. Print the chosen list with dates and tickets before spawning anything.
3. Group units into reader jobs. One reader per engine `src` directory and per non-demo unit; `engine-hot`,
   `engine-splash` and `engine-vite` share one reader; demos go in batches of about ten in `DEMO_ORDER` order
   (`packages/demos/plugins/demo-order.js`), grouped by theme where the order makes one obvious. A job over about 4000
   lines gets split. Thirty jobs is a normal full run.
4. For each job, collect the open Linear issues that touch its paths (`list_issues` with a path or symbol query) so the
   module part can list them; readers confirm fixed-or-not instead of re-reporting.

## Step 2 - readers

Spawn one `Agent` per job, in batches of five or six so the reports arrive in review-able waves. Every reader:

- `model: "opus"`, never the orchestrator's model (project memory: Fable subagents drain the budget; a reader costs
  about 150K-300K Opus tokens, so a full run is roughly 6-8M).
- `subagent_type: "general-purpose"`, fresh context. The prompt is `brief.md` verbatim followed by the filled module
  part. Name the absolute scratchpad path for the report file.
- Read-only: the brief forbids edits and state-changing git. If a reader reports that a hook blocked it (the root shell
  guard refuses report text that quotes destructive git strings), have it write the report through the `Write` tool,
  never through Bash.

While readers run, do not start filing. Read each report as it lands and note duplicates across units (two readers
finding the same shared bug from both sides, a prose unit and the code it describes) so the owner is decided once.

## Step 3 - verify before filing

For every high finding, and any medium you intend to put in a ticket title, open the cited `file:line` yourself and
confirm the claim against the authored source, not a generated copy (project memory: verify-diagnosis-against-source).
Drop or downgrade anything that does not hold. A reader's "confirmed with node" is evidence, not proof.

Route cross-module notes to the unit that owns the file; name the source unit in the ticket. Consolidate duplicates into
one owner and mention the other ticket.

## Step 4 - file

Use the `linear-issue` skill's house style for every ticket; the summary here is not a substitute for reading it.

1. **Umbrella first**: title `Audit <YYYY-MM-DD>`, labels `umbrella` + `cleanup`, body with Background, Scope decisions,
   an empty Modules table (`| Rank | Issue | Module | Summary |`), Predecessor (the previous umbrella), and the closing
   "No agent work on the umbrella itself" line. Assign to `me`. No milestone unless the user says so.
2. **One ticket per job**, `parentId` the umbrella, assignee `me`, labels `bug` (correctness findings) + `cleanup`
   (cuts) + the area labels (`audio`, `render`, `demo`, `website`, `create-blit386`, `agent`, `doc`, `security`, `ci`,
   ...). Priority: High when the top finding is high, else Medium. Body sections: Background (what the unit is, size,
   what the reader ran, ticket state confirmed), Findings (numbered, bold lead sentence with `file:line` and severity,
   then plain-English paragraph with trigger, verification, fix shape; end with `Below the bar:`), Cuts (tagged, with
   `net: -N lines possible`), Cross-module notes (with ticket IDs), Not checked, Out of scope, then the fenced
   **Starting prompt** and the `Model/effort/plan-mode:` line. Write `<ID>` in the prompt, then patch the real ID in
   with `save_issue` `patch` after creation (two `replace` ops: the `fetch Linear issue <ID>` sentence and the
   `per <ID>` phrase). Re-read the result; Linear turns `BT-123` into a mention, so a later patch anchor must not
   include text that became one.
3. **Umbrella row per ticket**: `| Must | BT-xxx | <paths> | <three or four clauses> |` (`Must` for a High ticket,
   `Should` for Medium). Insert before the `## Predecessor` heading with an `insert_before` patch anchored on
   `\n\n## Predecessor`, so the table never gets a blank line in it.
4. **Relations only where real**: `blockedBy` when a ticket cannot start before another lands (a shared-constant
   extraction the per-demo tickets import), `relatedTo` for an older open ticket a finding confirms. Never to make the
   graph look connected.
5. **Stamp the ledger** as each ticket is filed: `pnpm run audit:modules -- --stamp <date> <ticket> <unit>...`. The
   stamped `modules.md` goes into its own PR at the end of the run (title `chore(audit): stamp the <date> audit`),
   through the normal branch and PR flow; `main` is protected.

## Step 5 - report

Tell the user: ticket count and IDs, the umbrella link, the highs worth reading first, what readers could not check, and
the token cost. Then propose nothing: the tickets are the work queue and the user assigns milestones.

## Keeping this skill honest

- Any edit to `SKILL.md` needs `pnpm run sync:cursor-commands` and the regenerated `.cursor/commands/audit.md` staged,
  or pre-commit fails. `brief.md` and `modules.md` are not mirrored.
- `scripts/audit-modules.test.mjs` pins the derivation rules; a new rule gets a fixture path there.
- When the review checklist in `.claude/skills/review/SKILL.md` changes, nothing here needs to change: `brief.md` points
  readers at it rather than copying it.
