# Shipping to a compo

A demo party compo, a game jam page, or a USB stick wants one thing from you: a single file that runs. This page shows
how to turn your game into one HTML file and what to check before you hand it in.

## Make the file

From the game folder:

```bash
npx blit bundle --single
```

This writes `dist/bundle.html`. Everything the game needs is inside: your code, the engine, and every file in `public/`
(sprites, sounds, fonts). Open it by double-clicking - no server, no install, no network.

Two options make it compo-ready:

- `--out demo.html` names the file (`dist/demo.html`). It always goes in `dist/` and only ever replaces an earlier
  bundle, so it can never overwrite your own files or the ones `npm run build` made.
- `--title "My Demo"` sets the name shown on the browser tab.

```bash
npx blit bundle --single --out demo.html --title "My Demo"
```

## Engine inside, or engine from the web

Some compos have an "engine allowed" category: the runtime you build on does not count toward the size limit, only your
own work does - the way PICO-8 entries do not count PICO-8 itself. For that, use `--engine cdn`:

```bash
npx blit bundle --single --engine cdn
```

The file then holds only your game. It loads the engine from jsDelivr, pinned to the exact BLIT386 version your game has
installed, so it keeps working the way you tested it even after newer versions come out. The command prints two sizes:
your game alone, and your game plus the engine. It needs BLIT386 installed from npm: a linked engine (a copy you built
yourself) may be a version jsDelivr does not have, so the command refuses it.

Without a size category like that, keep the default. The engine-inside file is usually smaller than the game plus the
web engine, because the export leaves out the parts of the engine your game never uses, while the web copy is the whole
engine.

The trade-off: a file built with `--engine cdn` needs an internet connection to start. If the party machine is offline,
or the rules say "no network", leave the engine inside (the default, `--engine inline`). The engine-from-the-web setup
is the same one the [One HTML File, No Install](https://blit386.dev/docs/guides/single-file) guide uses.

## The BLIT386 splash

The bundled file plays the short BLIT386 logo before your game starts, the same as any finished BLIT386 game. I kept it
that way on purpose: the splash is how a BLIT386 game says where it comes from, and the choice belongs to your game's
own settings, not to the export command.

If the compo rules forbid an intro logo, or you want your demo to open on its first frame, turn it off in your game:

```ts
configure() {
    return { isSplashEnabled: false };
}
```

Do not rely on adding `?nosplash` to the address: the party machine opens your plain file.

## Check before you submit

- Double-click the file and play it start to finish in Chrome or Edge.
- For the default `--engine inline` file, turn your network off and try again. It should still work.
- Sound starts only after the first click or key press - browsers block sound on a page nobody has touched. Give the
  demo a "press any key" start, or tell the organizers.
- Check the compo's size limit against the size the command printed, and which number counts (the game alone, or the
  whole file).
- Every file in `public/` goes into the bundle, even unused ones. Delete files you do not need to make it smaller.

Something does not export? The command names what it cannot put in one file (for example a script loaded from another
website). The `share-the-game` skill lists all the limits.
