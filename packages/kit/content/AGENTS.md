# AGENTS.md – working on a BLIT386 game

<!-- blit-kit:managed:start -->
<!-- Everything between the managed markers is owned by @blit386/kit and will be rewritten by a future
     `npx blit agents sync`. Put your own notes in the "Your notes" section below the end marker. -->

This file is the home base for anyone (a person or an AI assistant) working on this game. It is short on purpose: it
tells you how a BLIT386 game is shaped, the rules to follow, and which doc to open when you need detail. Read the linked
doc only when the task needs it – do not load everything at once.

BLIT386 is a palette-first 2D pixel engine. You draw with small whole-number coordinates and numbered colors, and the
engine puts pixels on a `<canvas>`. It runs on WebGPU when available and falls back to plain Canvas 2D otherwise, so a
game always renders.

## The shape of every game

A game is one class with up to four methods, handed to `bootstrap()`:

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

class Game {
  // configure() {}              // optional; omit to use the default 320x240 screen at 60 FPS
  async init() {
    // runs once at startup; load assets and set up colors here
    return true; // return true when setup succeeded
  }
  update() {} // runs ~60 times a second; read input, move things, change state
  render() {} // runs ~60 times a second; draw the current frame
}

bootstrap(Game);
```

`update()` decides what happens; `render()` only draws. Keep them separate.

## Hard rules (do not break these)

- Whole numbers for positions and sizes. Use `Vector2i(x, y)` for points and `Rect2i(x, y, w, h)` for boxes. Never pass
  raw floats as screen coordinates.
- Use the `BT` namespace for everything the engine does (`BT.clear`, `BT.drawRectFill`, `BT.isDown`, ...). Do not reach
  for internal classes.
- Colors are palette slots. Create a palette, put colors in numbered slots (slot 0 is always transparent, so start at
  1), and draw with those numbers. See `docs/palette.md`.
- `await` async loads. Anything that loads (fonts, sprites) returns a promise; forgetting `await` is the most common
  beginner bug.
- No fullscreen post-process effects in a starter. Effects like CRT need WebGPU and do not run on the Canvas 2D
  fallback. Keep starters working everywhere.
- No emoji anywhere in code, comments, or text.

## When you need detail, open the right doc

| You want to...                                   | Read                            |
| ------------------------------------------------ | ------------------------------- |
| Install Node, run the game, edit your first line | `docs/getting-started.md`       |
| Understand init/update/render and timing         | `docs/basics.md`                |
| Clear the screen, draw rectangles, lines, text   | `docs/drawing.md`               |
| Read the keyboard, mouse, or a gamepad           | `docs/input.md`                 |
| Make and use colors (palette, slots)             | `docs/palette.md`               |
| Fix a blank screen, an error, a broken change    | `docs/when-something-breaks.md` |

The full engine reference lives at https://github.com/blit386/blit386 – only go there if these local docs do not answer
the question.

## Running the game

From the project folder:

- `npm run dev` (or `pnpm run dev`) – start the game and open it in your browser.
- `npx blit run` – the same thing, the friendly way.
- `npx blit doctor` – check your setup if something seems off.
- `npx blit upgrade` – update BLIT386 to the latest version (and offer to fix any renamed API names for you).
- `npx blit migrate` – update old BLIT386 names in your game to the current ones. Add `--write` to apply the changes.

The `blit` helper is installed inside the project (it ships with `/kit`), so it is not on the system PATH. Always invoke
it through `npx blit ...` (or `pnpm exec blit ...`); plain `blit` only works inside package scripts.

## Good habits

- Change one small thing, then look at the browser. Fast loops beat big rewrites.
- Keep `update()` cheap: it runs 60 times a second. Avoid creating lots of new objects every frame in hot paths.
- The starter game (`src/game.js`) is yours to change. Read its comments first; they explain every line.

## Working with an AI assistant

If you use Claude Code, open `CLAUDE.md` for the full project guide. Rules loaded automatically from `.claude/rules/`
tell Claude the engine's naming conventions. Skills in `.claude/skills/` are loaded on demand.

If you use Cursor, `.cursor/rules/` loads rules automatically when you open the project.

For other assistants (Zed, Copilot, Windsurf, and others), this file is your assistant's home base.

Did not set up an assistant when you started the game? Run `npx blit agents add claude` or `npx blit agents add cursor`
to add its files now.

Run `npx blit agents sync` after a kit update (`npx blit upgrade`) to refresh the assistant files.

<!-- blit-kit:managed:end -->

## Your notes

Everything below the managed end marker is yours. Write down decisions, todos, or project-specific rules here – for
yourself or for your AI assistant. Kit updates (`npx blit agents sync`) rewrite only the managed part above and never
touch this section.
