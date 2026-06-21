# {{projectName}}

A little pixel game built with [BLIT386](https://www.npmjs.com/package/blit386).

## Run it

You need [Node.js](https://nodejs.org) installed once (download the big **LTS** button). Then, in this folder:

```bash
{{pmInstall}}
{{pmRunDev}}
```

A web address like `http://localhost:5173` appears. Open it in your browser to play.

- **Phone or tablet:** tap or drag — the paddle follows your finger.
- **Computer:** move the mouse to steer the paddle, or use the left and right arrow keys as a fallback.

Catch the falling blocks before they reach the bottom.

## Change the game

Open `{{gameFile}}`. Every line has a comment explaining what it does. Change a number or a color, save the file, and
your browser updates by itself. A few things to try:

- Make the blocks fall faster: find `ITEM_FALL_SPEED`.
- Make the paddle wider or narrower: `PADDLE_WIDTH`.
- Change the colors: the `palette.set(...)` lines in `init`.

## Helpful commands

- `{{pmRunDev}}` - start the game (the everyday command).
- `npx blit run` - the same thing, the friendly way.
- `npx blit doctor` - check your setup if something seems off.
- `npx blit upgrade` - update BLIT386 to the latest version.

The `blit` helper is installed inside this project, not on your whole computer, so it needs `npx` in front (it means
"run the helper that lives in this project"). Typing plain `blit` would say "command not found."

## Peek behind the scenes

While the game runs, you can open the engine overlay - a small panel showing frames per second and which renderer is
active.

- **Keyboard:** press the key just below Esc, in the very top-left corner of your keyboard. On US keyboards it is
  printed with `` ` `` and `~`. Classic PC games like Quake used that exact key to open their command console, and
  BLIT386 keeps the tradition. The engine listens for the key's **position**, not the symbol printed on it - on some
  keyboard layouts the `~` symbol sits somewhere else entirely, but the overlay key is still the one below Esc.
- **No keyboard, or can't find the key?** Click or tap the bottom-left corner of the game screen instead. That works
  everywhere: phones, tablets, the Steam Deck.

## Share your game

When you want to show your game to a friend:

```bash
{{pmRunBuild}}
```

This packs everything into a `dist/` folder - a plain website, no server needed. Drag that folder onto a free static
host such as [Netlify Drop](https://app.netlify.com/drop) or [Cloudflare Pages](https://pages.cloudflare.com), and you
get a link anyone can open.

## When something breaks

It will - that is normal. Open `docs/when-something-breaks.md`. It explains how to read error messages and walks through
the usual suspects: blank screens, "command not found," forgotten `await`, and more.

## Learn more

- `AGENTS.md` - a short home base for you or an AI assistant.
- `docs/` - friendly guides: getting started, the game loop, drawing, input, colors, and fixing problems.
- [blit386.dev](https://blit386.dev) - the full BLIT386 documentation site.
