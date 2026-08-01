# Documentation and API Versioning Guide

How to keep public API changes documented to the same standard as the rest of the engine: every public symbol carries an
accurate `@since`/`@changed`/`@deprecated` history, and every published doc page that discusses a symbol shows its
version badge, availability table, and per-page changelog. This is not optional polish - it is part of shipping the
feature, the same way updating `docs/api-*.md` prose already is (see
[Docs sync required](../../../.claude/rules/docs-sync-required.md) and the root `CLAUDE.md`, "Working with Claude").

Contributor-only - not published to blit386.dev. See the
[Documentation index](developer-experience-guide.md#documentation-index) for the published guides this one is about
maintaining.

## When this applies

Anything that touches the public surface enumerated by `scripts/gen-api-history.mjs` - today, that is every top-level
`export {}` / `export type {}` name in `src/BLIT386.ts` plus every member of the `BT` namespace object (class methods
are Phase 2 scope, opt-in per class, not covered yet). If you:

- add a new public export, a new `BT` member, or a new `HardwareSettings`/config type,
- change an existing public symbol's signature or behavior in a way users need to know about,
- deprecate a public symbol,

then this workflow applies. Purely internal changes (private fields, internal-only helpers, refactors with no public
surface change) do not need any of this.

## The two-repo picture

```text
src/BLIT386.ts, src/**/*.ts     @since / @changed / @deprecated JSDoc tags   (you write these)
      |
      | scripts/gen-api-history.mjs (TypeScript compiler API + git tag dates)
      v
docs/_api-history.json          committed, deterministic, generated - never hand-edit
      |
      | you add <Since>/<ApiAvailability>/<PageChangelog> tags to docs/*.md pages
      | (this repo, blit386)
      v
      | pnpm run sync:docs  (blit386-dev-fumapress repo)
      v
content/docs/**/*.mdx           generated mirror - never hand-edit
      |
Fumapress components read docs/_api-history.json (copied as api-history.generated.json) -> rendered HTML
```

All git and tag resolution happens only in this repo (`blit386` - the only one with full history and tags); the result
is committed to `docs/_api-history.json`. The sibling `blit386-dev-fumapress` repo never touches git for this data, it
only copies the JSON verbatim during `pnpm run sync:docs`.

## Step 1: tag the symbol in source

Add the tag to the JSDoc block on the symbol's **original declaration** - for `BT` namespace members that means the
property/getter's JSDoc block directly in `src/BLIT386.ts`; for classes, helpers, and presets it means the declaration
in its own source file (`src/assets/Palette.ts`, `src/utils/Color32.ts`, and so on), not the re-export line in
`src/BLIT386.ts`. The generator resolves through re-exports via the TypeScript compiler API, so it finds the tag either
way, but keeping tags at the real declaration is what every existing symbol already does.

```ts
/**
 * Draws a sprite at the given position, resolved through the active palette.
 *
 * @since 1.3.0
 * @param sheet - Indexed sprite sheet to draw from.
 * @param srcRect - Source rectangle within the sheet.
 * @param pos - Destination position in logical pixels.
 */
drawSprite: (sheet: SpriteSheet, srcRect: Rect2i, pos: Vector2i): void => { ... },
```

Tag syntax:

- `@since <version>` - bare semver, no `v` prefix. The release the symbol first shipped in. If you are adding the symbol
  on `main` ahead of the next tagged release, use the actual target version (check `package.json`'s current `version`
  field and the project's release cadence - ask if unsure, do not guess).
- `@changed <version> <note>` - repeatable, one per behavioral or signature change. The note is a short human-readable
  summary in the same voice as a Keep a Changelog "Changed" entry.
  ```
  @since 1.0.3
  @changed 1.2.0 Added the optional paletteOffset parameter.
  @changed 1.3.0 Now throws when the sheet is not indexized.
  ```
  A malformed `@changed` tag (missing the note, or empty) is not silently dropped - the generator warns to stderr with
  the file and line so it is visible during manifest generation. Fix the tag rather than ignoring the warning.
- `@deprecated` - extend the tag to carry a version while keeping the removal-checklist date:
  ```
  @deprecated Deprecated since 1.3.0 (2026-08-01). Use {@link newMethodName} instead.
  ```
  `docs/reference-deprecations.md` greps for the literal `Deprecated since` string for its removal checklist - keep that
  phrasing.

## Step 2: regenerate and verify locally

```bash
pnpm run api:history          # regenerate docs/_api-history.json from source tags
pnpm run api:since:check      # fails if any public export lacks @since
pnpm run api:history:check    # fails if the committed JSON has drifted from source
```

All three are already wired into `pnpm run preflight`, so a normal preflight run catches a missing or malformed tag
before you get to docs work. Commit the regenerated `docs/_api-history.json` alongside your source change - it is a
deterministic, sorted-key, timestamp-free file, so an unrelated regeneration should produce a byte-identical diff
(empty) if nothing you changed affects the manifest.

## Step 3: decide the symbol's documentation home - one home per symbol

Before adding any `<Since>` tag to a doc page, check whether the symbol already has one:

```bash
grep -o '"'"'[^"]*'"'"': \[' docs/_api-history.json   # list every page key currently in use
# or just open docs/_api-history.json and read the "pages" object directly
```

The rule this project follows throughout `docs/`: a symbol gets its `<Since>` badge on the **one page that most
substantively documents it** - the page with real explanatory prose, not just a passing mention, a type annotation in a
code sample, or a one-line table entry. Every other page that merely uses or references the symbol should not re-tag it.
This keeps `<ApiAvailability>` tables meaningful (a symbol appears in exactly one table) and avoids maintaining the same
badge in two places that could drift.

Two consequences worth knowing before you guess:

- A symbol can lack a dedicated `api-*.md` page entirely - the input subsystem (`BTN_*`, `AXIS_*`, `BT.isPressed`, and
  so on) has no `api-input.md`; its only home is `guide-input.md`. Check `docs/_sitemap.json` for the full page list
  before assuming an `api-*` page exists.
- A symbol can be genuinely under-documented on the page that first seems obvious (for example an effect class only
  table-listed on `api-rendering.md`) while a **guide** page gives it real per-symbol prose (
  `guide-post-process-effects.md`'s dedicated `### ClassName` sections). When that happens, the guide page is the home,
  not the api page - substance decides, not the page's category.

If you cannot confidently identify a page that substantively documents the symbol, it is correct to leave it untagged
for now rather than force a badge onto a page that only mentions it in passing. `<ApiAvailability>` still surfaces every
symbol that page does claim; an occasional untagged symbol is a smaller problem than a misattributed badge.

## Step 4: add the components

Three MDX components, registered on the `blit386-dev-fumapress` side and passed through verbatim by the sync script -
write them directly into the engine `.md` source:

```
<ApiAvailability page="api/core-types" />
```

One per page, placed after the intro prose and before the first heading. Renders a table of every symbol homed on that
page: name, since, last changed, status. The `page` prop is the page's `path` from `docs/_sitemap.json`
(`api-core-types.md` -> `api/core-types`), not the filename.

```
<Since symbol="Vector2i" />
```

One per symbol, placed near the content that documents it - directly after the heading when the heading is the symbol's
name (`## Vector2i`), or immediately before the code block that demonstrates it when there is no natural per-symbol
heading. When several symbols are introduced together as a cohesive unit under one heading (for example a family of
related constants, or several getters described in the same paragraph), stack their `<Since>` tags together rather than
spreading them across the section - matches the precedent set across every page in this rollout.

```
<PageChangelog page="api/core-types" />
```

One per page (optional - skip it if the page has zero homed symbols), placed near the bottom, before `## See also`.
Renders a Keep-a-Changelog-style grouped view of every `@since`/`@changed`/`@deprecated` event across the page's
symbols.

All three are block form: a blank line before and after the tag, never inline in a sentence. Props are always bare
string literals (`symbol="Vector2i"`, `page="api/core-types"`) - never a `{` expression or a lowercase-initial tag
inside a prop, or the sync script's MDX-aware prose escaper will corrupt the output.

## Step 5: verify end-to-end

In this repo:

```bash
pnpm run docs:links       # markdown link check
pnpm run spellcheck       # cspell
pnpm run preflight        # everything, including api:since:check / api:history:check
```

One known caveat: a brand-new published page's own `blit386.dev-banner` link points at a URL that does not exist until
the site is deployed with your branch, so `docs:links` will report that one link as dead until then. This only applies
to a page's first-ever publication, not to adding tags to an already-published page. If you hit it, confirm every
_other_ page's banner link still resolves (curl a couple, or trust that they were already passing before your change)
before concluding it is this expected, deploy-order artifact rather than a real regression.

In `blit386-dev-fumapress` (after pulling or having your engine-side commit available locally at `../blit386` relative
to that repo, per `ENGINE_DOCS_DIR`):

```bash
pnpm run sync:docs         # mirrors docs/*.md and docs/_api-history.json into content/docs
pnpm run build             # CLOUDFLARE=1 production build - the most conclusive check
pnpm run test              # script test suite
```

A build success is not sufficient proof by itself. Actually inspect the built output for your page:

```bash
grep -o "Since [0-9.]*\|Unreleased\|Deprecated [0-9.]*" dist/public/docs/<section>/<page>/index.html
```

If nothing matches, the tag did not render - most likely a symbol name that does not exactly match a key in
`docs/_api-history.json`'s `symbols` object (a typo silently renders nothing; the `<Since>` component design prefers a
missing badge over a build failure). Cross-check every symbol name against the JSON before trusting a green build.

## Review discipline

This is the checklist a second pair of eyes (human or agent) should actually run, not just read:

1. For every `<Since symbol="X">` added, confirm `X` is an exact key in `docs/_api-history.json`'s `symbols` object -
   grep it, do not eyeball it.
2. For every symbol tagged, read the actual surrounding prose and confirm it substantively documents that symbol - a
   badge next to a heading that does not really explain the symbol is a misattribution, not a win.
3. For every symbol _not_ tagged that you would have expected to see, check whether it is legitimately homed on a
   different page (search `docs/_api-history.json`'s `pages` object) before treating the omission as a gap.
4. Confirm no symbol is double-homed - the same symbol name should not appear in two different pages' entries in the
   `pages` object.
5. Run the actual build and grep the rendered HTML for the expected badge text (see Step 5) - do not accept "the
   generator ran without errors" as proof of correct rendering.
6. Run the full verification suite in both repos (Step 5) - a change that only touches one repo's docs is incomplete
   until the sibling repo's sync and build are re-verified too.

## See also

- [Docs sync required](../../../.claude/rules/docs-sync-required.md) - the broader rule this workflow is one instance
  of.
- [Deprecation Timeline](reference-deprecations.md) - the removal checklist `@deprecated` tags feed into.
- [Developer Experience](developer-experience-guide.md) - general contributing workflow, code style, commit conventions.
- `blit386-dev-fumapress/CLAUDE.md`, Documentation mirror section - how the sync script consumes what this guide
  produces.
