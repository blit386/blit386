# Kit content audit

Nothing syncs this repo from `blit386` automatically. The kit docs and shipped skills are hand-authored beginner prose,
so they drift silently when the engine changes. This skill walks the staleness checklist and fixes what is out of date.

## Usage

```text
/cbt-kit-audit
```

## Steps

1. Establish what changed in the engine

   If a specific engine change prompted this (a new feature, a renamed `BT.*` member, a getter-vs-method change, new or
   removed constants), note it. Otherwise audit broadly. The sibling engine repo is `../blit386`; its public surface is
   `../blit386/src/BLIT386.ts`, `../blit386/CLAUDE.md` (BT API getters vs methods, Boolean naming), and
   `../blit386/docs/api-*.md`. Read those for the current truth – never from memory.

2. Audit the kit docs

   List the docs first – a list written down here is exactly how this audit goes stale, and it did: it still named six
   docs long after `audio.md` shipped.

   ```bash
   ls packages/kit/content/docs/
   ```

   Check every code example and API mention in each one against the current engine. For what each doc leans on, use the
   "Kit file / Review when" table in `CLAUDE.md` – that table is maintained, so read it rather than copying it here.

3. Audit the shipped skills

   Same rule: enumerate them, do not trust a list.

   ```bash
   ls -d packages/kit/content/skills/*/
   ```

   The skills demonstrate engine APIs the same way the docs do. Check each one whose topic touches the changed surface,
   confirming method-vs-getter usage, `BT` names, and constants against the engine.

   While you are here, confirm every skill directory appears in the skills table in `packages/kit/README.md` – that is
   the only human-facing list of what ships, and it has no automated guard.

4. Check the version pin

   If new games should pin a newer engine, update `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` (and
   `engineRange` in the kit if present).

5. Keep kit content self-contained

   Shipped content may reference only `blit386` (the engine) and other local kit files. Do not introduce references to
   the `blit386-demos` repo (demo slugs or `demos.blit386.dev` URLs).

6. Fix and verify

   Apply fixes in place, then run `pnpm run preflight`. Report which files changed and why.
