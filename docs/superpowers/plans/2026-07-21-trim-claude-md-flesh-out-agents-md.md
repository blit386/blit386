# Trim/modularize CLAUDE.md and flesh out AGENTS.md Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking. This is a docs-only restructuring (no source code, no tests),
> executed inline in the same session that wrote this plan — no fresh-engineer handoff, so steps are right-sized to that
> reality rather than padded with placeholder TDD ceremony.

**Goal:** Shrink the always-loaded `CLAUDE.md` (709 lines / ~50 KB) by moving task-specific detail that is already
duplicated elsewhere (rule-file mirrors, `docs/developer-experience-guide.md`, `docs/reference-testing.md`,
`docs/performance-testing.md`) into its true canonical home, leaving short summaries + pointers in `CLAUDE.md`. Give
`AGENTS.md` real standalone content instead of a 4-line pointer.

**Architecture:** `CLAUDE.md` is the only file Claude Code auto-loads every session; `.claude/rules/*.md` /
`.cursor/rules/*.mdc` and `docs/*.md` are read on demand. Several `CLAUDE.md` sections already have a fuller or
equally-full copy living in one of those on-demand files, which today point _back_ at `CLAUDE.md` as the "full policy" —
a circular, 3-4x duplication. Fix: flip the circularity so the rule file / doc is the canonical full version,
`CLAUDE.md` keeps the header (preserves anchors, keeps the "Where to Find Information" table valid) and a short summary,
and the file that now holds full detail stops pointing back at `CLAUDE.md`.

**Tech Stack:** Markdown only. Verify with `pnpm run docs:links`, `pnpm run agents:check`, `pnpm run spellcheck`,
`pnpm run format:check` (or `pnpm run format` to fix).

## Global Constraints

- Never delete an existing `CLAUDE.md` H2/H3 header — only shrink the body under it. This keeps the "Where to Find
  Information" table's "below" pointers valid and avoids anchor breakage (confirmed via `rg` that no file links to a
  `CLAUDE.md#anchor`, but prose references like "`CLAUDE.md` (Section Name)" exist across `.claude/skills/*`,
  `.cursor/rules/*.mdc`, `docs/*.md` — preserving header text keeps those valid too).
- `scripts/check-agent-config.mjs` (`pnpm run agents:check`) requires exact basename parity between
  `.cursor/rules/*.mdc` and `.claude/rules/*.md`. Every new rule file must be created as a pair, same basename, both
  sides, in the same task.
- `AGENTS.md` must keep a markdown link matching `](CLAUDE.md)` somewhere (regex-checked by `findAgentsPointerFailures`
  in `scripts/check-agent-config.mjs`).
- No emoji. En dash for parenthetical breaks. American English spelling. (User's global + repo `CLAUDE.md` rules.)
- Do not run `git commit` — the user commits manually (global instruction). Stop after edits + verification.
- Content must move, not vanish: every fact currently in a trimmed `CLAUDE.md` section must still be findable in the
  file it now points to. This is a losslessness constraint, checked in the self-review task.

---

## File Map

| File                                                                   | Action                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                                                            | Trim ~10 sections' bodies to summary + pointer; keep all headers; update ~6 table rows' link targets             |
| `AGENTS.md`                                                            | Rewrite from 4-line pointer to real quick-start content                                                          |
| `.claude/rules/docs-authoring.md` (new)                                | Full: doc banner internals, Fumadocs components, doc prose/rename style                                          |
| `.cursor/rules/docs-authoring.mdc` (new)                               | Cursor pair of the above, glob-scoped to `docs/**/*.md`                                                          |
| `.claude/rules/environment-bootstrap.md` (new)                         | Full: SessionStart hook / devcontainer bootstrap mechanics                                                       |
| `.cursor/rules/environment-bootstrap.mdc` (new)                        | Cursor pair of the above                                                                                         |
| `.claude/rules/environment-gotchas.md` (new)                           | Full: tag-less / no-network sandbox artifacts, when not to "fix" them                                            |
| `.cursor/rules/environment-gotchas.mdc` (new)                          | Cursor pair of the above                                                                                         |
| `.claude/rules/bt-api-getters.md` / `.cursor/rules/bt-api-getters.mdc` | Reword "canonical reference" framing (content already complete)                                                  |
| `.claude/rules/internal-scoped-naming.md` / `.mdc`                     | Same reword                                                                                                      |
| `.claude/rules/ts-file-structure.md` / `.mdc`                          | Same reword                                                                                                      |
| `.claude/rules/docs-sync-required.md` / `.mdc`                         | Repoint 3 "full guidance is in CLAUDE.md" references at `docs-authoring.md`/`.mdc` and `twoslash-docs.md`/`.mdc` |
| `docs/reference-testing.md`                                            | Drop backward "See also CLAUDE.md" line on Known quirks (content there is already a superset)                    |

---

### Task 1: New rule pair — `docs-authoring`

**Files:**

- Create: `.claude/rules/docs-authoring.md`
- Create: `.cursor/rules/docs-authoring.mdc`

**Content to move in** (currently only in `CLAUDE.md`, lines 82-219): the "Public docs site banner" section in full
(banner sentinels, `sync-doc-banners.mjs` ownership, `pnpm run sync:doc-banners` / `:check`), the "Fumadocs components
in published docs" section in full (registered component list, when-to-use-which, the four authoring rules — block form,
JSX props, `Card href` site-absolute paths, validate-before-done), and the "Documentation authoring style" section in
full (prose rules: no bold, no `---`, `×` for dimensions, no walls of text, credit external inspirations, American
English; filename-mirrors-sitemap convention; the 5-step rename/split checklist; the after-any-doc-change checklist).

- [ ] **Step 1:** Write `.claude/rules/docs-authoring.md` with frontmatter:

  ```markdown
  ---
  name: docs-authoring
  description: How to write, rename, and split published docs/*.md pages (Fumadocs components, doc banners, prose style)
  ---
  ```

  Body: condensed version of the three sections above (bullets, not full prose — match the terseness of
  `docs-sync-required.md`). Include the registered component list and the four authoring rules verbatim (they're
  load-bearing — an unregistered component fails the `blit386-dev-fumapress` build). End with:
  `Full policy: .cursor/rules/docs-authoring.mdc. Cursor: always active when editing docs/**/*.md.`

- [ ] **Step 2:** Write `.cursor/rules/docs-authoring.mdc` with frontmatter:

  ```yaml
  ---
  description: Fumadocs components, doc banner internals, and prose house style for published docs/*.md
  globs: { docs/**/*.md }
  alwaysApply: false
  ---
  ```

  Body: the fuller version (can include the short example snippets currently in `CLAUDE.md`, e.g. the `<Callout>`
  block-form example). This becomes the new canonical home — do not point back at `CLAUDE.md` for "full guidance".

- [ ] **Step 3:** Verify: `pnpm run agents:check` passes (basename parity: `docs-authoring` now exists on both sides).

---

### Task 2: New rule pair — `environment-bootstrap`

**Files:**

- Create: `.claude/rules/environment-bootstrap.md`
- Create: `.cursor/rules/environment-bootstrap.mdc`

**Content to move in** (currently only in `CLAUDE.md`, lines 667-686): what `scripts/session-start-bootstrap.sh` does
(frozen-lockfile install, corepack enable, `cksum`-stamped skip-if-unchanged), and the three wiring points
(`.claude/settings.json` SessionStart hook, `.cursor/hooks.json` sessionStart hook, `.devcontainer/devcontainer.json`
postCreateCommand) plus the non-blocking-on-failure behavior and why.

- [ ] **Step 1:** Write `.claude/rules/environment-bootstrap.md`:

  ```markdown
  ---
  name: environment-bootstrap
  description:
    How scripts/session-start-bootstrap.sh warms a fresh remote/web checkout (SessionStart hook, devcontainer)
  ---
  ```

  Body: the moved content, condensed to bullets.

- [ ] **Step 2:** Write `.cursor/rules/environment-bootstrap.mdc`:

  ```yaml
  ---
  description: Fresh-checkout bootstrap script and its three wiring points (Claude/Cursor/devcontainer)
  globs:
    { scripts/session-start-bootstrap.sh, .claude/settings.json, .cursor/hooks.json, .devcontainer/devcontainer.json }
  alwaysApply: false
  ---
  ```

  Body: fuller version of the same content.

- [ ] **Step 3:** Verify: `pnpm run agents:check` passes.

---

### Task 3: New rule pair — `environment-gotchas`

**Files:**

- Create: `.claude/rules/environment-gotchas.md`
- Create: `.cursor/rules/environment-gotchas.mdc`

**Content to move in** (currently only in `CLAUDE.md`, lines 688-709): the four bullets under "Environment and tooling
gotchas" — `_api-history.json` needing git tags, `docs:links` needing outbound network (403 through sandbox proxy on
external URLs only), hooks amplifying both, `.agents/skills/*` being symlinks not separate files,
`pnpm run spellcheck`'s scope vs. the pre-commit hook's wider cspell scope. Preserve the "these are environment
artifacts, not code bugs — do not fix them by editing the checks" framing verbatim; it is the entire point of the
section.

- [ ] **Step 1:** Write `.claude/rules/environment-gotchas.md`:

  ```markdown
  ---
  name: environment-gotchas
  description: Tag-less / no-network sandbox artifacts in preflight (git tag dates, docs:links 403s) - not code bugs
  ---
  ```

  Body: the four bullets, condensed.

- [ ] **Step 2:** Write `.cursor/rules/environment-gotchas.mdc`:

  ```yaml
  ---
  description: Ephemeral/CI-sandbox preflight artifacts to recognize and not "fix"
  alwaysApply: true
  ---
  ```

  Body: fuller version (this one stays `alwaysApply: true` in Cursor — small file, prevents wasted effort chasing
  phantom failures in exactly the kind of ephemeral checkout this repo runs Claude Code in).

- [ ] **Step 3:** Verify: `pnpm run agents:check` passes.

---

### Task 4: Trim CLAUDE.md — docs-authoring-related sections

**Files:**

- Modify: `CLAUDE.md:82-219` (Public docs site banner / Fumadocs components / Documentation authoring style)

- [ ] **Step 1:** Replace the "Public docs site banner" body (keep the H2) with a 3-4 line summary: what the banner is,
      that it's generated-only, and
      `Full detail: .claude/rules/docs-authoring.md (Cursor: .cursor/rules/docs-authoring.mdc).`

- [ ] **Step 2:** Replace the "Fumadocs components in published docs" body (keep the H2) with a 4-6 line summary:
      site-first/MDX-capable framing, the registered-component-list-lives-in-press.config.tsx gotcha (this is the one
      fact most likely to cause a build break if lost — keep it prominent), and the same pointer as Step 1.

- [ ] **Step 3:** Replace the "Documentation authoring style" body (keep the H2) with a 4-6 line summary: the prose
      rules headline (no bold, no `---`, `×` for dimensions), filename-mirrors-sitemap-section convention, and the same
      pointer as Step 1.

- [ ] **Step 4:** Update "Where to Find Information" table rows for "Why does each published doc have a blit386.dev
      banner?", "Can I use Fumadocs components...?", and "How do I write/rename/split a `docs/` page?" so their "Where
      to look" column names `.claude/rules/docs-authoring.md` alongside the existing "below" section pointer.

---

### Task 5: Trim CLAUDE.md — Twoslash section

**Files:**

- Modify: `CLAUDE.md:138-174` (Twoslash in published docs)

- [ ] **Step 1:** Replace the body (keep the H2) with ~8 lines: the non-negotiable ` ```ts twoslash ` rule, the
      self-contained-vs-fragment distinction in one sentence each, one short example (self-contained block only — drop
      the fragment example, it's in the rule file), and
      `Full rules: .claude/rules/twoslash-docs.md / .cursor/rules/twoslash-docs.mdc.` (Those two files already carry the
      complete preamble-rules table; no new file needed here — this task is pure deletion.)

---

### Task 6: Trim CLAUDE.md — BT API getters/methods and Boolean naming

**Files:**

- Modify: `CLAUDE.md:385-455` (BT API: getters vs methods, Boolean naming)

- [ ] **Step 1:** Replace the "BT API: getters vs methods" body (keep H2/H3s) with: the one-sentence rule (getters for
      zero-arg read-only snapshots, methods for actions/params/async), 2-3 example lines, and
      `Full category tables: docs/api-core.md, .claude/rules/bt-api-getters.md (Cursor: .cursor/rules/bt-api-getters.mdc).`
      Drop the "Use getters" / "Use methods" bulleted category lists entirely — `.claude/rules/bt-api-getters.md` and
      `docs/api-core.md` both already carry them in full.

- [ ] **Step 2:** Replace the "Boolean naming" body with the 3-tier one-liner +
      `Full tiers: docs/developer-experience-guide.md (Boolean naming), .claude/rules/bt-api-getters.md.` — it already
      has this pointer to the dev-experience guide; just also drop the two now-duplicated detail bullets and add the
      rule-file pointer.

---

### Task 7: Trim CLAUDE.md — Internal scoped naming

**Files:**

- Modify: `CLAUDE.md:457-471`

- [ ] **Step 1:** Replace the body (keep H2) with the one-sentence rule + one good/bad example pair (keep
      `FrameCapture.request()` not `requestCapture()` — it's the most-cited example elsewhere in the repo, e.g.
      `.claude/skills/bt-review/SKILL.md:41`) +
      `Full policy: .claude/rules/internal-scoped-naming.md (Cursor: .cursor/rules/internal-scoped-naming.mdc), docs/developer-experience-guide.md (Naming conventions).`

---

### Task 8: Trim CLAUDE.md — TypeScript file structure

**Files:**

- Modify: `CLAUDE.md:505-542`

- [ ] **Step 1:** Replace the body (keep H2/H3s) with: the `perfectionist/sort-classes` + `type: 'unsorted'` one-line
      explanation, the "never use `// #region`" rule (this is a hard ban worth keeping visible), and
      `Full layout + member order: .claude/rules/ts-file-structure.md (Cursor: .cursor/rules/ts-file-structure.mdc), docs/developer-experience-guide.md (File structure and member order).`
      Drop the numbered file-layout list and class-member-order list — both rule files and the dev-experience guide
      already have them.

---

### Task 9: Trim CLAUDE.md — Testing subsections and Performance Testing

**Files:**

- Modify: `CLAUDE.md:587-643` (Visual Regression Tests, Known Testing Quirks, Performance Testing)
- Modify: `docs/reference-testing.md:314-323` (Known quirks)

- [ ] **Step 1:** In `docs/reference-testing.md`, delete the line
      `See also [CLAUDE.md](../CLAUDE.md) (Known Testing Quirks):` under "### Known quirks" so the four bullets stand
      alone as the canonical list (it already has all three `CLAUDE.md` bullets plus a fourth about `docs:links` scope —
      it was already the more-complete copy).

- [ ] **Step 2:** In `CLAUDE.md`, replace "Visual Regression Tests" body (keep H3) with 3-4 lines: what
      `pnpm run test:visual` does, that it's the primary correctness tool for rendered output (not perf), and
      `Full workflow + coverage: docs/reference-testing.md.`

- [ ] **Step 3:** In `CLAUDE.md`, replace "Known Testing Quirks" body (keep H3) with:
      `Full list: docs/reference-testing.md (Known quirks).` — one line, since the doc is now the sole source.

- [ ] **Step 4:** In `CLAUDE.md`, replace "Performance Testing" body (keep H2) with: when to reach for CPU benchmarks
      vs. visual regression (1-2 lines), the two commands, and
      `Full CI behavior + workflow: docs/performance-testing.md, .claude/skills/bt-perf/SKILL.md.` Drop the CI-status
      bullets and the "Claude Code reusable skill" callout — both already live in `docs/performance-testing.md` and the
      skill file points back at itself already (no rewording needed in `bt-perf/SKILL.md`).

---

### Task 10: Repoint circular references in existing rule files

**Files:**

- Modify: `.claude/rules/bt-api-getters.md:3`, `.cursor/rules/bt-api-getters.mdc:81`
- Modify: `.claude/rules/internal-scoped-naming.md:60`, `.cursor/rules/internal-scoped-naming.mdc:60`
- Modify: `.claude/rules/ts-file-structure.md:3` and `44`, `.cursor/rules/ts-file-structure.mdc:44`
- Modify: `.claude/rules/docs-sync-required.md:26,33-34`, `.cursor/rules/docs-sync-required.mdc:39-50`

- [ ] **Step 1:** In `bt-api-getters.md`/`.mdc`, reword "Canonical reference: CLAUDE.md (...)" / the closing "See
      CLAUDE.md section..." line so this rule-file pair (plus `docs/api-core.md`) is stated as the full detail, and
      `CLAUDE.md` is described as carrying only a short summary.

- [ ] **Step 2:** Same reword in `internal-scoped-naming.md`/`.mdc` and `ts-file-structure.md`/`.mdc`.

- [ ] **Step 3:** In `docs-sync-required.md`/`.mdc`, change "Full guidance ... is in `CLAUDE.md` (Fumadocs components in
      published docs)" to point at `.claude/rules/docs-authoring.md` / `.cursor/rules/docs-authoring.mdc` instead.
      Change "Full rules in `CLAUDE.md` (Twoslash in published docs) and `.claude/rules/twoslash-docs.md`" to drop the
      `CLAUDE.md` half (the rule file alone is now the full source). Change "Doc prose house style (see `CLAUDE.md`
      Documentation authoring style)" to point at `docs-authoring.md`/`.mdc`.

- [ ] **Step 4:** Verify: `rg -n "CLAUDE\.md" .claude/rules .cursor/rules` — confirm no remaining "full guidance/policy
      is in CLAUDE.md" claims for content that moved out in Tasks 1, 4-8.

---

### Task 11: Rewrite AGENTS.md

**Files:**

- Modify: `AGENTS.md` (currently 4 lines)

- [ ] **Step 1:** Rewrite with real standalone content for agents that key off `AGENTS.md` and don't read `CLAUDE.md`.
      Structure: one-line project description; tech stack (language, runtime, package manager, Node floor); quick-start
      command list (`pnpm install`, `pnpm run dev` if applicable, `pnpm run build`, `pnpm run test`,
      `pnpm run preflight`); the handful of rules that would cause real damage if missed (no emoji, integer coordinates
      via `Vector2i`/`Rect2i`, use `BT` namespace not `BTAPI`, no `any` types, DCO sign-off required, `pnpm` not
      npm/yarn); and a closing line pointing at `CLAUDE.md` as canonical (must keep the literal
      `[`CLAUDE.md`](CLAUDE.md)` link pattern the `findAgentsPointerFailures` regex checks for). Target ~40-60 lines —
      standalone-useful, not a second CLAUDE.md.

- [ ] **Step 2:** Verify: `pnpm run agents:check` passes (AGENTS.md still links to CLAUDE.md).

---

### Task 12: Verify and self-review

- [ ] **Step 1:** Run `pnpm run agents:check` — rules parity (8 existing pairs + 3 new pairs = 11), skills symlinks,
      AGENTS.md pointer, all pass.

- [ ] **Step 2:** Run `pnpm run docs:links` — internal links resolve (ignore any external-URL 403s per
      `environment-gotchas.md`, cross-check that any failure is genuinely external before disregarding).

- [ ] **Step 3:** Run `pnpm run spellcheck` — no new unknown words from the new rule files (they're outside
      `spellcheck`'s scoped dirs per the environment-gotchas note, but check anyway since pre-commit `cspell` does scan
      them).

- [ ] **Step 4:** Run `pnpm run format` — Prettier/Biome formatting on all touched Markdown.

- [ ] **Step 5:** `wc -l CLAUDE.md AGENTS.md` — confirm `CLAUDE.md` dropped meaningfully (target: under ~480 lines, down
      from 709) and `AGENTS.md` grew from 4 lines to real content.

- [ ] **Step 6:** Losslessness pass: for each section trimmed in Tasks 4-9, diff the removed bullets against the file
      they now point to and confirm every fact is present somewhere (rule file, `.mdc`, or `docs/*.md`). Fix any gap
      found by adding the missing fact to the target file, not by re-inflating `CLAUDE.md`.

- [ ] **Step 7:** Read the full rewritten `CLAUDE.md` top to bottom once, as if new to the repo, to confirm it still
      reads coherently (headers still make sense with shorter bodies, no orphaned "below" references).

---

## Self-Review Notes

- Spec coverage: BT-246 asks for two things — (1) trim/modularize `CLAUDE.md`'s cross-repo-duplicated detail into
  `.claude/rules/*` / `docs/*`, keeping the routing table; (2) flesh out `AGENTS.md`. Tasks 1-10 cover (1); Task 11
  covers (2); Task 12 verifies both and checks the routing table stayed intact (Task 4 Step 4 is the only table edit
  needed — other rows already point at retained section headers).
- Explicitly out of scope (belongs to sibling BT-237 sub-issues, not this one): fixing `.cursor/rules` <->
  `.claude/rules` _content_ drift beyond what Task 10 touches, adding `.mcp.json`, generating `.cursor/commands/` from
  `bt-*` skills, adding `.github/copilot-instructions.md`.
- Architecture section (`CLAUDE.md:221-353`) is intentionally left untouched — it's core, frequently-needed reference,
  not the "Fumadocs/twoslash/doc-banner" cross-repo duplication the issue names, and Critical Rule 7 explicitly
  designates it as something to keep updated in `CLAUDE.md` itself.
