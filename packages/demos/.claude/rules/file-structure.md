# Demo file structure

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (Layout, Adding a New Demo, File Organization, Comment format). The
`/demos-new` skill (root `.claude/skills/demos-new/SKILL.md`) scaffolds the shape below.

## Where things live

| Path | Holds |
| --- | --- |
| `src/<topic>.js` | One demo per file (52 today); number-free kebab-case, the filename is the slug |
| `src/shared/` | The UI kit (`ui.js` entry; `ui-core`, `ui-widgets`, `ui-theme`, `ui-dpad`, `ui-gestures`, `ui-lint`), `key-names.js`, `canvas-sprites.js`, `crt-glitch.js`, `post-process-backend.js`, and `__tests__/` |
| `plugins/` | `virtual-demos.js` (serves `src/*.js` as pages), `demo-order.js` (`DEMO_ORDER`), `demo-registry.js`, `demo-vintage-urls.js`, `social-meta.js`, `sitemap.js`, `channel-headers.js`, `highlight-demo-source.js`, `html-escape.js`, and `__tests__/` |
| `_partials/` | `layout.html` (the one page template), `demo-shell*.js` (banner, combobox, nav, analytics), `source-panel*.js`, `capture-expose.js` |
| `_shots/` | The `/shots` capture gallery and the `/` demo sheet: `poses.js`, `capture*.js`, `gallery.js`, `shots.{html,js,css}`, `sheet.{html,js,css}`, `sheet-entries.js`, review aids, and `__tests__/` |
| `scripts/` | `check-demo-registry.mjs`, `check-demo-comment-links.mjs`, `capture-demo-shots.mjs`, `capture-og-image.mjs`, `capture-demo-clip.mjs`, `generate-audio-loops.mjs`, the shared `playwright-session.mjs`, and `__tests__/` |
| `styles/` | `layout.css`, `demo-source.css`, `twoslash-rich.css` |
| `public/` | Static assets: `sprites/`, `fonts/`, `audio/`, `social/og-<slug>.png`, `shots/<slug>/*.png` plus `shots/manifest.json`, `_headers`, `404.html`, `favicon.svg` |

No HTML file exists per demo: `virtual-demos` renders every page from `_partials/layout.html`.

## Inside a demo file

Section order: header comment → imports → `@typedef` lines → configuration constants → module state → helper functions →
the `Demo` class → `bootstrap(Demo);` last. Never use `// #region` / `// #endregion` in `src/*.js`.

The header is one `/* ... */` block: a blank line, the title line (`Demo Name: one-sentence summary.`), the **required**
`@description` (one line, 60-104 characters, ending in a period, within the first `HEADER_SCAN_BYTES` = 2000 bytes - it
feeds the meta description and social card), optional `@pageTitle` / `@ogScale`, a blank line,
`Part of the BLIT386 demo series.`, `Prerequisites:` (omitted when there are none), `Live version:`, `Guides:`,
`Reference:`, a `---` separator, then UPPERCASE sections underlined with hyphens: `WHAT YOU WILL SEE`,
`WHAT YOU WILL LEARN`, any explanatory sections, `TRY THIS` last. `palette-fade.js` is the reference shape;
`check:demo-registry` enforces the tag rules.

Demo class member order: instance fields → `configure()` (optional) → `init()` → `update()` → `render()` → helper
methods. No JSDoc beyond `/** @type */` and `/** @typedef */`; comments are `//` lines wrapped at 90 columns.

Cross-cutting: beginner-friendly comments on nearly every block; integer coordinates only; library public API names;
`applyTheme()` + `ui.*` from `src/shared/ui.js` for every panel, button, tooltip, and HUD label (the only exceptions are
`flurry`, `hello-world`, `hypercube`, `logo-lowres`, `pattern-fill`).

## Beside the file

A demo is known by its slug, nowhere else. Each of these is keyed on it:

- `plugins/demo-order.js` - append the slug to `DEMO_ORDER`. Navigation order; required, or `check:demo-registry` fails.
- `README.md` `## Demos` list - one `[slug](https://demos.blit386.dev/slug)` entry. Enforced by the same check.
- `public/social/og-<slug>.png` - `pnpm run capture:og -- <slug> --force --base-url http://localhost:4173` against a
  `preview` build. A missing card fails the check.
- `public/shots/<slug>/` - `pnpm run capture:shots -- --demos <slug>` with the dev server running. Without a clean
  `display` capture the demo is missing from the site index.
- `_shots/poses.js` - optional `POSES_BY_SLUG` entry (`{ id, at, keys?, pointer?, touch? }`, kebab-case ids). Demos
  without one get `DEFAULT_POSES` (`start` at 0 s, `settled` at 4 s). The first pose is both the OG card frame and the
  site-index tile.
- `plugins/demo-vintage-urls.js` - only on a rename: repoint the vacated slug and map the old public path.
