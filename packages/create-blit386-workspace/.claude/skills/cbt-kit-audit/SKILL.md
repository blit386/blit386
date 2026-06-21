---
name: cbt-kit-audit
description:
  Re-audit the shipped kit docs and game-author skills against the current blit386 engine API and fix stale examples.
  Use after adding or renaming engine public API, or when you want to check that kit content has not drifted.
---

# Kit content audit

Nothing syncs this repo from `blit386` automatically. The kit docs and shipped skills are hand-authored beginner prose,
so they drift silently when the engine changes. This skill walks the staleness checklist and fixes what is out of date.

## Usage

```text
/cbt-kit-audit
```

## Steps

1. **Establish what changed in the engine**

   If a specific engine change prompted this (a new feature, a renamed `BT.*` member, a getter-vs-method change, new or
   removed constants), note it. Otherwise audit broadly. The sibling engine repo is `../blit386`; its public surface is
   `../blit386/src/BLIT386.ts`, `../blit386/CLAUDE.md` (BT API getters vs methods, Boolean naming), and
   `../blit386/docs/api-*.md`. Read those for the current truth - never from memory.

2. **Audit the kit docs**

   For each file in `packages/kit/content/docs/`, check every code example and API mention against the current engine:
   - `getting-started.md` - install/run flow, `npx blit run` / `doctor`
   - `basics.md` - `configure()`, loop timing getters (`BT.deltaSeconds`, `BT.ticks`), `bootstrap()` shape
   - `drawing.md` - `BT.clear`, primitives, `systemPrint` / text APIs
   - `input.md` - `BT.isDown` / edges, keyboard, pointer, gamepad, button constants
   - `palette.md` - `paletteCreate`, slots, `Color32`
   - `when-something-breaks.md` - common errors, `await`, palette slot 0, `doctor`

3. **Audit the shipped skills**

   The skills in `packages/kit/content/skills/` demonstrate engine APIs the same way the docs do. Check each one whose
   topic touches the changed surface (for example `use-palette`, `animate-the-palette`, `read-gamepad`, `read-keyboard`,
   `read-pointer`, `add-crt-effect`, `add-sprite`, `add-text`, `draw-shapes`, `move-and-time`, `scroll-with-camera`,
   `show-debug-overlay`). Confirm method-vs-getter usage, `BT` names, and constants match the engine.

4. **Check the version pin**

   If new games should pin a newer engine, update `BLIT386_RANGE` in `packages/create-blit386/src/scaffold.ts` (and
   `engineRange` in the kit if present).

5. **Keep kit content self-contained**

   Shipped content may reference only `blit386` (the engine) and other local kit files. Do not introduce references to
   the `blit386-demos` repo (demo slugs or `demos.blit386.dev` URLs).

6. **Fix and verify**

   Apply fixes in place, then run `pnpm run preflight`. Report which files changed and why.
