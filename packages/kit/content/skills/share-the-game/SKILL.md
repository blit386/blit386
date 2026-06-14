---
name: share-the-game
description:
  Build the finished game into a folder of plain files and put it online so other people can play. Use when the user
  wants to publish, deploy, or host the game, send a playable link to a friend, or asks 'how do I share my game', 'put
  my game on the internet', or 'make a real version people can play'.
---

# Share the game

`{{pmRunDev}}` runs the game on your own computer while you make it. To let other people play, you make a "production
build" - a folder of plain files - and upload that folder to a free hosting site. The game is just files, so there is no
server or database to set up.

## When to use

Use when the user wants to publish, deploy, or host the game, send a playable link to a friend, or asks "how do I put my
game online" or "make a real version".

## Step 1: build the game

```sh
{{pmRunBuild}}
```

This writes a `dist/` folder. Everything the game needs is inside it: the HTML page, the JavaScript, and your sprites
and fonts. That whole folder _is_ the game.

## Step 2: try the built game before sharing

The built game can behave a little differently from the dev server, so test it once first. Your project has a `preview`
script for this - run it the same way you run `dev` and `build` (for example `pnpm run preview` or `npm run preview`).
It serves the `dist/` folder at a local web address so you can click around and confirm everything still works.

## Step 3: put dist/ online

Upload the whole `dist/` folder to any free static host - it accepts plain files, no server needed. Good options for a
game are GitHub Pages, Netlify, Cloudflare Pages, or itch.io (drag-and-drop the folder). Each one gives you back a web
address you can share.

## Notes

- The game runs on WebGPU where it is available and falls back to plain Canvas 2D everywhere else, so friends can play
  in any modern browser with nothing extra installed. (Only fullscreen CRT or post-process effects need WebGPU - see the
  add-crt-effect skill.)
- Made a change you want to share? Run `{{pmRunBuild}}` again and re-upload `dist/`. The build does not update itself.
- Do not hand-edit files inside `dist/` - they are generated from your `src/` code. Change the source, then rebuild.
