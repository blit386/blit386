# blit386-demos

Interactive demos and examples for BLIT386, a palette-first WebGPU retro engine for TypeScript. Deployed to
demos.blit386.dev via Cloudflare Pages. The engine is consumed as `workspace:*` from the sibling `packages/blit386`
package in this monorepo.

Shared monorepo conventions (no emoji, dash typography, American English, commit format, DCO, `main` protection, compact
tables, …) live in the root [`CLAUDE.md`](../../CLAUDE.md) – read together with this file.

## Critical Rules

- Integer coordinates – all rendering uses `Vector2i` and `Rect2i`
- Plain JavaScript – ES2022, never TypeScript, even for a "small" helper
- Beginner-friendly comments – see Documentation Style below. This is the point of the package, not a nicety
- Mutation is fine here – demo classes mutate instance state in `update()` / `render()` for performance. The general
  prefer-immutability default does not apply to per-frame demo state
- Relaxed linting versus the engine: JSDoc is not required (though class-level `@implements {IBTDemo}` is encouraged)
  and console logging is allowed. Clarity beats ceremony

## Layout

One demo per file under `src/`, and that file is the single source of truth – no `demos/` directory exists on disk. The
`virtual-demos` Vite plugin serves each at `/demos/<slug>.html` in dev; the production build flattens them to
`https://demos.blit386.dev/<slug>`. That difference is a build-time value, not runtime sniffing: `virtual-demos` stamps
`data-page-suffix` onto `<body>` (`.html` in dev, empty in the build) and `_partials/demo-shell.js` appends it in
`urlFor()`, so the shell's `history.pushState` URL and its iframe `?embed&source` src are extensionless in production.
`src/shared/` holds the UI kit and cross-demo helpers, `public/` static assets (including `favicon.svg` and the
committed `social/` OG cards), `_partials/` the shared HTML template and shell scripts, `plugins/` the Vite plugin plus
the order and vintage-URL registries, the social/SEO head builder (`social-meta.js`) and its shared `html-escape.js`,
`scripts/` the check, generate, and capture scripts plus the `agent-browser-session.mjs` helpers the two capture scripts
share.

Filenames are number-free kebab-case (`basics.js`, `sprite-effects.js`); the first path segment must start with a
letter, so legacy `001-topic.js` names are rejected. Navigation order is **not** derived from the filename – it comes
from `DEMO_ORDER` in `plugins/demo-order.js`.

## Adding a New Demo

1. Create `src/<topic>.js` with the standard demo class pattern (`configure?`, `init`, `update`, `render`, then
   `bootstrap(Demo)`) and beginner-friendly comments. The `/demos-new` skill scaffolds the shape.
2. Append the slug to `DEMO_ORDER` in `plugins/demo-order.js`. Required – otherwise the registry check fails and the
   demo is only soft-appended after the ordered entries.
3. No `vite.config.js` edit, HTML file, or vintage-map entry is needed for a brand-new slug. On a **rename**, update the
   vacated slug's target in `VINTAGE_URLS` (`plugins/demo-vintage-urls.js`) and add a mapping for the old public path so
   bookmarks keep working.
4. Run `pnpm run check:demo-registry` so disk, order, vintage, and nav-hidden sets stay consistent.
5. Add the demo to the `## Demos` list in `README.md` under the right category, using the hosted URL.

The page title defaults to `BLIT386 Demo - Title Cased Topic` (plain hyphen; only the sidebar `navLabel` uses an en
dash). Override with a `// @pageTitle Custom Title` comment in the file header.

Three header tags are parsed out of the first `HEADER_SCAN_BYTES` (2000) of each demo file by
`plugins/demo-registry.js`:

| Tag | Required | Purpose |
| --- | --- | --- |
| `@pageTitle` | no | Overrides the derived `<title>` and nav label |
| `@description` | **yes** | One line, 60–104 characters, ending in a period. Feeds the meta description, `og:description`, `twitter:description`, and the JSON-LD `description` |
| `@ogScale` | no | `auto` (default), `integer`, or `fit` – how `scripts/capture-og-image.mjs` frames this demo's social card |

All three are single-line: the patterns stop at the first newline, so a wrapped value truncates rather than failing.
`pnpm run check:demo-registry` is the gate – it fails on a missing `@description`, one outside the length range, one
without sentence-final punctuation, and on an `@ogScale` value that is not a real mode. The 104-character ceiling is the
column budget, not an SEO limit: the tag must fit this repo's 120-column line with its 16-character prefix.

## Social metadata and OG cards

`plugins/social-meta.js` builds the whole social/SEO head block – meta description, `rel=canonical`, two favicon links,
OpenGraph, Twitter card, and a `SoftwareApplication` JSON-LD block – and `plugins/virtual-demos.js` substitutes it into
`{{socialMeta}}` **last** in its replacement chain, through a function replacer, so a `$&` or another placeholder's
literal text inside a description can never trigger a second substitution pass.

Two rules there are load-bearing rather than stylistic:

- **Every URL is absolute**, built from `SITE_URL` / `NEXT_SITE_URL` in `plugins/sitemap.js`. Vite rewrites `og:image`
  and `twitter:image` like any other asset reference, and under `base: './'` a root-absolute path becomes `../social/…`
  for a page built at `demos/<slug>.html` – which `flattenDemosPlugin` then moves to `dist/` root, leaving it pointing
  outside `dist/`. Absolute `https://` URLs are skipped as external and survive untouched.
- **The JSON-LD is never HTML-escaped.** Escaping it would put `&quot;` inside a `<script>` body and break every parser.
  Its only transform is `</` → `<\/`, which is a valid JSON escape and stops any description from closing the element.

The favicon links carry `vite-ignore` for the same reason, and `flattenDemosPlugin` additionally rewrites every
`src="../` / `href="../` to `./` so no future public-dir link can fall into that trap.

Cards live at `public/social/og-<slug>.png`, are generated by hand with `pnpm run capture:og` (never in CI), and are
committed. `buildSocialMeta` falls back to `og-default.png` for any slug without one, so `og:image` is never a 404.

## Documentation Style

Demo source is written for readers with little or no coding experience. Comments explain what the code does and why,
never just restating it.

- Comment nearly every line or logical block in plain English
- Explain programming concepts as they appear (what `Math.sin()` returns, what `%` does)
- Use analogies where they help ("like looking through a window" for camera offset)
- Never assume the reader knows what a function does from its name
- Short sentences. No jargon unless you explain it immediately
- Reference earlier demos when a concept was already covered: "We learned about X in the Basics demo:
  <https://demos.blit386.dev/basics>"

Do this:

```js
// Move the square by adding its speed to its position.
// Think of it like adding steps to where you are standing.
this.pos = this.pos.add(this.speed);

// If the square goes past the right edge of the screen...
// BT.displaySize.x is how wide the screen is in pixels.
if (this.pos.x >= BT.displaySize.x - this.size.x) {
  // Flip the horizontal direction so it bounces back.
  this.speed.x = -this.speed.x;
}
```

Not this:

```js
// Update position.
this.pos = this.pos.add(this.speed);

if (this.pos.x >= BT.displaySize.x - this.size.x) {
  this.speed.x = -this.speed.x;
}
```

When reviewing a demo, check that the comments would make sense to someone who has never written code. A block with no
comment, or a comment that only restates the code, is a quality issue.

## Engine API in demos

Current signatures live in the engine: `packages/blit386/src/BLIT386.ts`, `packages/blit386/src/core/BTAPI.ts`,
`packages/blit386/src/audio/`. Match the library's public names exactly – configure flags use grammatical `is*`, runtime
input uses `BT.isDown` / `BT.isPressed` / `BT.isKeyDown`. Prefer the built-ins over re-deriving them:
`Color32#luminance` over inline luma weights, `Color32#multiply` over a hand-rolled tint, `palette.applyHUD(startSlot?)`
over six `palette.set()` calls, `SpriteSheet.loadColorsIntoPalette` before `indexize`.

Two engine behaviors that bite in demos:

**Keyboard edges clear per update tick.** Read `BT.isKeyPressed`, `BT.isKeyReleased`, `BT.inputString`, and the
keyboard-mapped half of `BT.isPressed` / `BT.isReleased` (players 0/1) from `update()`, never `render()`. They clear
once per fixed-update tick, which always runs before that frame's `render()`, so reading an edge from `render()`
intermittently drops presses under rapid input. `BT.isKeyDown` / `BT.isDown` are held state and safe from either.

**Audio unlock is asymmetric.** Browsers refuse sound until a user gesture; `BT.init()` installs one-shot `pointerdown`
/ `keydown` / `touchstart` listeners and `BT.isAudioUnlocked` flips true on the first. Before unlock, `BT.soundPlay()`
is dropped (inert `SoundRef`, no voice) while `BT.musicPlay()` is remembered and starts the instant the context unlocks.
Loading and synthesizing clips work fine while locked. So every audio demo shows a "click or press a key to enable
sound" prompt gated on `BT.isAudioUnlocked` and never assumes a first-frame SFX was heard. There is no
`BT.audioUnlock()` and no `BT.soundLoad()`.

## Shared UI kit

All demo UI – panels, labels, key-value rows, checkboxes, pips, buttons, sliders, meters, the touch D-pad, swipes, tap
zones – comes from the immediate-mode kit in `src/shared/ui.js`. Read that file for the current widget list and options.
Never hand-roll panels, buttons, or HUD text colors in a demo. Of the 45 demos, 41 import it; the intentional exceptions
are `filip-test-02` (a bare-bones starter with no demo UI at all) and `flurry`, `hypercube`, `logo-lowres`
(immersive/showcase pieces with no demo HUD).

- `applyTheme(this.palette)` in `init()`, before `BT.paletteSet()` – installs the 12 shared UI colors (slots 240-251 by
  default; pass a `startSlot` if that range collides)
- `ui.tick()` as the first line of `update()` whenever the demo uses `{ key }` bindings, gestures, or the D-pad. This is
  what makes keyboard bindings edge-safe – never read `BT.isKeyPressed` in `render()` yourself
- `ui.begin(anchor)` / widgets / `ui.end()` in `render()`. Widget identity is the label; pass `{ id }` for duplicates.
  The kit allocates nothing per frame, so calling it at 60 FPS is fine
- `configure()` runs before `init()`, so overlay styles needing theme colors use literal slot numbers (240 + offset)
  with a comment, or dedicated scene slots
- Every demo must be usable on touch: key-triggered actions get a `ui.button` with a `{ key }` binding, directional
  input gets `ui.dpadWidget()` + `ui.swipe()`, and hardware-showcase demos (`keyboard-input`, `gamepad-input`,
  `keyboard-diagnostic`) show a warm "needs a keyboard/gamepad" label when `ui.hasTouch()` is true
- Post-process demos import `isAvailable()` and `SOFTWARE_FALLBACK_NOTE` from `src/shared/post-process-backend.js`, set
  `this.effectsAvailable = isAvailable()` after `init()` (it checks `BT.activeBackend`, not `requestedBackend`), and
  show the note when effects are skipped

## Hot Reload

`pnpm run dev` / `dev:watch` wire the `blit386/vite` plugin alongside the `virtual-demos` watcher. Editing a demo's own
`src/<slug>.js` no longer full-reloads the page. What happens depends on what you changed:

| Change | Result |
| --- | --- |
| Method body (`render()`, `update()`, …) | Class prototype swapped in place; state kept, `init()` not re-run |
| `init()`, constructor, class field | Instance re-created and `init()` re-run while the old one keeps driving the loop, then swapped on success; `onHotReload(oldSnapshot)` fires if defined |
| `configure()` hardware settings | Full page reload – these are baked into the renderer/audio graph at init |
| Asset in `public/sprites`, `public/audio`, `public/fonts` | Loaded `SpriteSheet` / `AudioClip` / `BitmapFont` replaced in place, no reload |

Still always full-reloads: `_partials/*` edits, a `blit386` dist rebuild (a changed engine bundle invalidates
everything), and adding or removing a `src/<slug>.js` file.

A module-level constant that `init()` also reads to build a cached instance field (not just one a method reads fresh
each tick) does not get the "Method body" row's live-edit treatment – see the caveat in
[the engine's hot-reload guide](../blit386/docs/guide-hot-reload.md#tier-1-method-only-change).

Editing `src/shared/*.js` hot-swaps through Vite's own module graph rather than the engine's swap. That re-evaluates
module-scope state: `ui.js`'s singleton `UiContext` is replaced, and `ui-dpad.js` / `ui-gestures.js` reset their D-pad
and swipe state. So the D-pad can briefly hide, an in-flight swipe or keypress can drop, and `ui.hasTouch()` can revert
to `false` until the next touch – all self-healing within a frame or two. No `addEventListener` runs at module scope in
those files, so a shared-UI edit never double-registers a listener.

Known gap: under `?backend=software`, any `src/<slug>.js` edit currently full-reloads, even a pure `render()`-body
change that hot-swaps cleanly under `webgpu`. That is a tier-detection parity gap in the engine's `src/hot/` runtime,
not in this package's wiring – tracked against the engine. There is no automated coverage for hot reload; the
`/test demos` skill carries the manual check script to run after touching the wiring.

Editing engine source under `packages/blit386/src/` (anything feeding the browser bundle, `dist/blit386.js`) rebuilds
automatically under `dev:watch` and full-reloads this page – no restart needed.

If you change the engine's `blit386/vite` plugin itself (`packages/blit386/src/vite/**`, the Node-targeted
`dist/vite.js` bundle), `dev:watch` does not watch it: `packages/demos/vite.config.js` loads that plugin once at its own
server startup, so a rebuilt `dist/vite.js` is not picked up by a running server regardless. Run a one-shot
`pnpm run build` in `packages/blit386`, then restart `pnpm run dev` here.

## File Organization

Section order: header comment (`// Demo Topic – …`, prerequisites, hosted links, optional `// @pageTitle`) → imports →
`@typedef` JSDoc → configuration constants → module state → helper functions → the `Demo` class → `bootstrap(Demo);`
last. Class member order: instance fields → `configure()` → `init()` → `update()` → `render()` → helpers. Region markers
(`// #region`) are banned in demo content (`src/*.js`) – `scripts/*.mjs` may use them, matching `encode-video.mjs`'s
convention. Full detail: `.claude/rules/file-structure.md`.

## Commands, formatting, git

Scripts are `pnpm run <script>` from this package's directory (or `pnpm --filter blit386-demos run <script>` from the
repo root); `package.json` is the list and `pnpm run preflight` is the gating set. Shell commands are rewritten by
`rtk hook claude` – prefer `rtk read` / `rtk grep` over native Read/Grep.

Biome owns JS/JSON/CSS, Prettier owns Markdown/YAML: 4-space indent (2 for JSON/YAML/Markdown), 120 columns, single
quotes, semicolons, trailing commas. Markdown tables are compact by design via the shared root
`scripts/prettier-plugin-compact-tables.mjs` – never hand-align one.

Commit scopes (convention only – prefer one already in this package's history): `demos`, `ui`, `assets`, `docs`,
`skills`, `deps`. Husky runs lint-staged on pre-commit, commitlint on commit-msg, and `pnpm run preflight` on pre-push.

The build copies each virtual demo to `dist/<slug>.html` at the site root and generates `dist/_redirects` from
`VINTAGE_URLS` plus a site-index rule, so vintage numbered paths (`/001-basics` and `/001-basics.html`) 301 to the
current extensionless slug everywhere. The site-index rule is the one entry that still names `dist/<slug>.html`, because
a `200` rewrite has to name the asset. Cloudflare Pages serves each `dist/<slug>.html` at `/<slug>` and 308s
`/<slug>.html` to it, which is why nothing else should emit the extension.

`.github/workflows/deploy.yml` runs two jobs against this package: `deploy-demos` deploys to the `blit386-demos` Pages
project (`demos.blit386.dev`) on a release tag push (`x.y.z`, no `v` prefix, no prerelease suffix) or a manual
`workflow_dispatch`; `deploy-demos-next` deploys to the `blit386-demos-next` Pages project (`next.demos.blit386.dev`) on
every push to main, no path filter. The `-next` job sets `BLIT386_CHANNEL=next` on the build step, which
`plugins/virtual-demos.js` and `plugins/channel-headers.js` read directly (Node context, at build time – no client-side
env var involved) to render the unreleased-work banner and a `noindex` meta tag into every page, append
`X-Robots-Tag: noindex` to `dist/_headers`, and write a disallow-all `dist/robots.txt`. Production gets none of that –
no banner, no noindex header, and `_headers` stays exactly what `viteStaticCopy` copied. Production's `robots.txt`
instead allows everything and points crawlers at `dist/sitemap.xml`, which `plugins/sitemap.js` writes from the live
demo registry (site root plus every demo's canonical extensionless URL, skipped entirely on the `next` channel).
