# {{projectName}}

A little pixel game built with [Blit-Tech](https://www.npmjs.com/package/blit-tech).

## Run it

You need [Node.js](https://nodejs.org) installed once (download the big **LTS** button). Then, in this folder:

```bash
{{pmInstall}}
{{pmRunDev}}
```

A web address like `http://localhost:5173` appears. Open it in your browser to play. Use the left and right arrow keys
to move the paddle and catch the falling blocks.

## Change the game

Open `src/game.js`. Every line has a comment explaining what it does. Change a number or a color, save the file, and
your browser updates by itself. A few things to try:

- Make the blocks fall faster: find `ITEM_FALL_SPEED`.
- Make the paddle wider or narrower: `PADDLE_WIDTH`.
- Change the colors: the `palette.set(...)` lines in `init`.

## Helpful commands

- `blit run` - start the game (same as `{{pmRunDev}}`).
- `blit doctor` - check your setup if something seems off.
- `blit upgrade` - update Blit-Tech to the latest version.

Tip: press the `~` key while playing to peek at the engine overlay (frames per second and which renderer is active).

## Learn more

- `AGENTS.md` - a short home base for you or an AI assistant.
- `docs/` - friendly guides: getting started, the game loop, drawing, input, and colors.
