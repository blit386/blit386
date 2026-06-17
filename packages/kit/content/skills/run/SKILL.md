---
name: run
description:
  Start the BLIT386 dev server and open the game in a browser. Use this whenever the user wants to run, start, launch,
  or preview the game, see what it looks like, or test a change live, even if they just say 'run the game', 'start the
  server', or 'show me'.
---

# Run the game

Start the BLIT386 dev server and open the game in a browser.

## When to use

Use this when you need to run the game to test a change, or when the user says "run the game", "start the server", or
"show me what this looks like."

## Steps

1. In the project folder, run `{{pmRunDev}}` (or `npx blit run`).
2. The browser opens automatically at `http://localhost:5173` (or the next free port).
3. The game live-reloads when you save a file. There is no need to restart the server after each edit.
4. To stop the server: press `Ctrl+C` in the terminal.

## Notes

- If the port is in use, read `docs/when-something-breaks.md` for the "port already in use" fix.
- If the browser does not open, navigate to `http://localhost:5173` manually.
- The game works without WebGPU (the engine falls back to Canvas 2D), so it runs in any modern browser.
