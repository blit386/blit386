---
name: use-dev-mode
description:
  Gate debug HUDs, cheat keys, verbose logging, and test fixtures on `BT.isDevMode` (engine 1.5.0+) instead of a
  hand-rolled flag. Use when the user asks how to tell a dev build from a release build, wants a feature to only run
  while developing, or wants something like a cheat key to disappear once the game ships.
---

# Use dev mode

`BT.isDevMode` tells you whether the game is running as a development build or a release build, so you do not have to
invent your own signal for it.

## When to use

Use when the user wants a debug HUD, cheat key, verbose console logging, or a test fixture (a level-select shortcut, a
god-mode toggle) to work while developing but disappear from a shipped build.

## How to do it

```js
update() {
    if (BT.isDevMode && BT.isKeyPressed('KeyG')) {
        this.godMode = !this.godMode; // dev-only cheat key
    }
}

render() {
    // ...
    if (BT.isDevMode) {
        console.log('player', this.player.x, this.player.y); // dev-only verbose logging
    }
}
```

`BT.isDevMode` is a getter (no parentheses) and needs no setup beyond having `blit386/vite` installed – every scaffold
has it already (see `use-hot-reload`). It reads `true` while `npm run dev` is running the game through that plugin, and
`false` in a built/shipped game (`npm run build`).

## Notes

- `BT.isDevMode` is tied to the dev server, not to `NODE_ENV` or any bundler define – there is nothing else to
  configure.
- It answers exactly one question: is this a dev build. It has nothing to do with your own game state (paused, in a
  menu, level number) – keep those as your own fields.
- The engine gates one thing on this by itself: the BLIT386 splash plays in a release build and not in a dev build. Add
  `?splash` to the URL to see it while developing, or turn it off for good with `isSplashEnabled: false` in
  `configure()`. See `docs/basics.md` (The splash).
- This is a convenience for you, the developer, not a security boundary. A player who really wants to could still flip
  it on in a shipped build; do not rely on it to hide content you actually need to protect.
- Needs blit386 `^1.5.0`.
