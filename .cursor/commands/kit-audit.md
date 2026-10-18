# Kit content audit

Nothing syncs `packages/kit` / `packages/create-blit386` from `packages/blit386` automatically. The kit docs and shipped
skills are hand-authored beginner prose, so they drift silently when the engine changes.

## Usage

```text
/kit-audit
```

## Steps

1. Establish what changed in the engine

   If a specific engine change prompted this (a new feature, a renamed `BT.*` member, a getter-vs-method change, new or
   removed constants), note it. Otherwise audit broadly. The engine package is `packages/blit386`; its public surface is
   `packages/blit386/src/BLIT386.ts`, `packages/blit386/CLAUDE.md` (BT API getters vs methods, Boolean naming), and
   `packages/blit386/docs/api-*.md`. Read those for the current truth - never from memory.

2. Audit the kit docs

   List the docs first - a list written down here is exactly how this audit goes stale.

   ```bash
   ls packages/kit/content/docs/
   ```

   Check every code example and API mention in each one against the current engine. For what each doc leans on, use the
   "Kit file / Review when" table in this package's `CLAUDE.md` - that table is maintained, so read it rather than
   copying it here.

3. Audit the shipped skills

   Same rule: enumerate them, do not trust a list.

   ```bash
   ls -d packages/kit/content/skills/*/
   ```

   The skills demonstrate engine APIs the same way the docs do. Check each one whose topic touches the changed surface,
   confirming method-vs-getter usage, `BT` names, and constants against the engine.

   While you are here, confirm every skill directory appears in the skills table in `packages/kit/README.md` - that is
   the only human-facing list of what ships, and it has no automated guard.

4. Check the version pin and the review stamp

   `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` and `blit386.engineRange` in `packages/kit/package.json`
   are derived from the engine version by `scripts/bump-lockstep.mjs` - never hand-edit them; `pnpm run bump:check`
   fails when either drifts. If new games should pin a newer engine, that is a lockstep release (`/release`), not an
   audit edit. What this audit does own is `blit386.docsReviewedAt` in `packages/kit/package.json`: set it to the engine
   version you just checked the docs against. `blit doctor` compares it with the installed engine, and
   `scripts/check-kit-docs-drift.mjs` (root, `.github/workflows/kit-docs-drift.yml`) compares it with
   `docs/_api-history.json` to decide when to file a drift issue.

5. Keep kit content self-contained

   Shipped content may reference only `blit386` (the engine) and other local kit files. Do not introduce references to
   the `packages/demos` package (demo slugs or `demos.blit386.dev` URLs).

6. Fix and verify

   Apply fixes in place, then run `/preflight kit` (or `/preflight create-blit386`). Report which files changed and why.
