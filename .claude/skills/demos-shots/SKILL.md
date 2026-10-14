---
name: demos-shots
description:
  Capture pixel-perfect, deterministic frames of packages/demos demos into the /shots gallery, inspect them for layout
  and spacing problems in the shared UI kit, and add poses or lint rules. Use when the user wants screenshots of demos,
  a before/after check of a UI kit change, or asks to look at how the demos render.
---

# Demo shots

The `/shots` page in `packages/demos` is both the capture engine (dev server only) and the gallery (every build, and
live at next.demos.blit386.dev/shots). Captures are committed under `packages/demos/public/shots/`. The page source is
`packages/demos/_shots/`: `shots.js` is the entry, `capture.js` the engine, `capture-mode.js` the dev-only wiring, and
`review-mode.js` the review aids (diff, findings).

## Usage

```text
/demos-shots                 # capture every demo with the committed variants, then inspect
/demos-shots changed         # only demos whose source differs from origin/main (every demo if src/shared changed)
/demos-shots basics,sprites  # a slug list
```

## Steps

### 1. Capture

Start the dev server through the preview tool (`pnpm run dev` in `packages/demos`, port 5173). Then, from
`packages/demos`:

```bash
pnpm run capture:shots -- --all
```

`--changed` and `--demos a,b` select subsets; `--variants display,uidebug,output,software,touch` picks variants
(default: the committed pair). `--changed` selects every demo whenever any file under `src/shared/` differs from
`origin/main`, tests included. The driver opens `/shots?auto...` in Chrome, waits for the page to finish, and writes
`public/shots/<slug>/<pose>.<variant>.png` plus a merged `manifest.json`. It refuses to write outside `public/shots/`.
Exit code 1 means at least one tile failed; the failure list names the step (`load`, `seek`, `step`, `capture`).

### 2. Inspect

Order of operations for an agent:

1. Read `public/shots/manifest.json` and list entries with a non-empty `lint` array or an `error`. Lint rules:
   `overlap`, `out-of-display`, `margin`, `row-gap` (`src/shared/ui-lint.js`).
2. Read the flagged PNGs with the Read tool. The `uidebug` variant draws the group box (accent), the pad inset (dim),
   and every widget hit rect (warm), which is where spacing problems show.
3. When a single pixel matters, make a 4x nearest-neighbor crop before reading:
   `ffmpeg -i public/shots/<slug>/<pose>.display.png -vf "crop=120:60:0:140,scale=iw*4:ih*4:flags=neighbor" /tmp/crop.png`
4. Open `/shots` in the built-in browser for the human view: `g` toggles the focused stack, `Shift+G` all stacks,
   `Enter` opens the lightbox, `1` `2` `4` `+` `-` zoom it, `#` shows the pixel grid, `?` lists every key.

### 3. Compare against main

Serve main's `public/shots` on another port (a second worktree's dev server, or `npx serve public/shots -l 5174`) and
open `/shots?baseline=http://localhost:5174`. The baseline must be an http(s) URL or a same-origin path; anything else
is refused. `d` toggles the diff overlay, `b` cycles current, baseline, diff.

### 4. Add a pose

Edit `POSES_BY_SLUG` in `packages/demos/_shots/poses.js`. A pose is `{ id, at }` plus at most one of `keys: ['Digit1']`,
`pointer: { x, y }` (display pixels, hover), or `touch: true`. Ids are kebab-case and become file names. Run
`pnpm run test` (the pose table is validated against the registry) and re-capture that demo.

### 5. Add a lint rule

Add a pure function in `src/shared/ui-lint.js`, append its name to `LINT_RULES`, add cases to
`src/shared/__tests__/ui-lint.test.mjs`, re-capture, and confirm the badge appears.

### 6. Before a PR

Any change under `src/shared/` is followed by `pnpm run capture:shots -- --changed`, and the resulting PNG diff is part
of the PR. `check:demo-registry` refuses a demo named `shots`.
