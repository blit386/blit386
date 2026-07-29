---
name: demos-test
description:
  Explain that blit386-demos has no automated tests and how to verify demos by hand instead. Use when the user asks to
  run, write, or find tests in this repo.
---

# Tests

There are no automated tests in `blit386-demos`. Do not look for `pnpm run test`, `vitest`, or a `tests/` directory -
none of these exist here.

## Usage

```text
/demos-test
```

## Why no tests

Demos are interactive, visual, and authored for a single developer. Correctness is verified by:

1. Running the dev server (`pnpm run dev`) and opening the demo in a browser
2. The production build (`pnpm run build`) – a build failure surfaces broken imports or plugin errors
3. Preflight checks (`pnpm run preflight`) – lint, format, spellcheck, knip, docs:links, check:demo-registry

Automated unit or E2E tests would require a headless WebGPU runtime (not broadly available) and would largely duplicate
what the library's own test suite (`blit386`) already covers.

## What to do instead

- Verify a new demo works: `pnpm run dev`, open `/demos/<slug>.html`, exercise the demo manually
- Confirm no build regression: `pnpm run build`
- Check code quality: `/demos-preflight` or `/demos-review`
- Full pre-push audit: `/demos-deep-review`

## Manual hot-reload check

Nothing automated covers hot reload. Run this by hand after any change to the hot-reload wiring – this repo's
`vite.config.js` / `plugins/virtual-demos.js`, or the engine's `src/hot/` and `src/vite/`.

1. `pnpm run dev:watch`, then open `basics` (shell URL; the demo runs inside the `?embed&source` iframe).
2. Edit a `render()` color constant – visual change, state such as ticks and positions kept, console shows
   `[BT] Hot reload #1 (methods)`.
3. Edit `init()` – re-init runs and `onHotReload` fires with a snapshot (add a temporary hook to verify), no page
   reload.
4. Edit `configure()`'s `displaySize` – full page reload.
5. Edit a `public/sprites/*.png` used by `image-output` or `game-scene` – texture updates in place, no reload.
6. Edit `public/audio/blip.wav` (audio-basics) – the next `soundPlay` uses the new sound. Replace the playing music clip
   (music) – the track restarts.
7. Edit `src/shared/ui.js` – the demo keeps its own state and the UI kit still works. D-pad visibility may reset; that
   is expected, see Hot Reload in `CLAUDE.md`.
8. Edit `_partials/layout.html` or `_partials/demo-shell.js` – full reload of the shell. The source panel still updates
   on demo edits without a reload.
9. Jump to another demo via the banner fuzzy combobox or prev/next – the address bar updates via `pushState`, the banner
   stays mounted, only the iframe reloads, and browser back/forward restores the previous demo.
10. Edit an engine `src/` file – the library rebuilds and the page full-reloads (`blit386WatchReload` preserved).
11. Repeat steps 2-3 with `?backend=software` on the embed URL. Full reload is expected here, not parity – that is the
    known tier-detection gap, so verify it still matches the gap rather than treating it as a regression.
12. Introduce a syntax error in a demo – the old demo keeps running (Vite may or may not show its error overlay,
    depending on the failure class). Fix it – it recovers automatically, without you needing to refresh manually. Vite
    may issue its own full reload to do so (the erroring module never registered an HMR accept handler), so this is not
    a zero-reload guarantee.
