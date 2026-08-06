# The BLIT386 Splash

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/guides/splash, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Every published BLIT386 game shows a short BLIT386 splash before it starts: a logo bitmap fading in on its own 16-step
gray ramp, holding, then fading out into the game's palette. Release builds play it by default and development builds
skip it by default - both are defaults you can override.

This guide covers when it plays and how to turn it off, the loading-screen behavior, the palette handoff, and the skip.
The getters themselves – `BT.splashState` and `BT.isSplashVisible` – are in [API: Core](api-core.md#splash-state), and
the three `configure()` fields are in the [hardware settings table](api-core.md#hardware-settings).

## When it plays

Three gating layers, resolved in order. The first match wins.

1. `HardwareSettings.isSplashEnabled` from your `configure()`. Explicit wins over everything.
2. The `?splash` and `?nosplash` URL flags. Both are valueless.
3. `BT.isDevMode` – on in release builds, off in development.

So with no configuration at all, a production build shows the splash and a dev server does not.

### Turning it off

```ts twoslash
import { type HardwareSettings, type IBTDemo } from 'blit386';
// ---cut---
class Game implements IBTDemo {
  configure(): Partial<HardwareSettings> {
    return { isSplashEnabled: false };
  }

  async init(): Promise<boolean> {
    return true;
  }

  update(): void {}

  render(): void {}
}
```

Because layer 1 beats everything below it, `isSplashEnabled: true` also forces the splash on in a dev build, and
`isSplashEnabled: false` cannot be overridden by a URL flag.

### The URL flags

`?nosplash` skips it once without touching your code. `?splash` forces it on, which is how you check the splash while
working in a dev server.

When both appear, `?nosplash` wins. An off switch should be unambiguous.

### Seeing it during development

A dev server reads as a development build, so `pnpm run dev` shows no splash. Either add `?splash` to the URL, or build
and preview for the real thing:

```bash
pnpm run build
pnpm run preview
```

## It doubles as a loading screen

Your `init()` runs concurrently with the splash rather than after it. The splash's hold has a minimum duration but no
maximum: it extends until `init()` settles, so a slow load costs close to zero extra perceived time, and a fast one
still gets the full animation.

That is what `BT.isSplashVisible` is for inside `init()` – if something is already covering the screen, optional work
can happen now instead of stuttering the first frames.

```ts twoslash
import { BT } from 'blit386';

declare function preloadOptionalAssets(): Promise<void>;
// ---cut---
async function init(): Promise<boolean> {
  if (BT.isSplashVisible) {
    await preloadOptionalAssets();
  }

  return true;
}
```

The hold also ends when `init()` _fails_, not only when it succeeds, so a rejected `init()` cannot leave the splash
holding forever.

Your `update()` and `render()` are suspended for the splash's whole duration. This is forced by palette ownership: the
game drawing indices through the splash's ramp would resolve every color wrong. The game loop is not merely paused – it
has not been constructed yet, so no splash time reaches its fixed-timestep accounting.

## The palette handoff

The splash owns the palette while it is on screen. That has one consequence worth knowing:

A `BT.paletteSet()` call inside `init()` does not apply immediately. The engine captures it and installs it at handoff,
already blackened, then brings it up with [`BT.paletteFadeExposure`](api-palette.md#exposure-fade). The splash fading
down and your game fading up are one continuous in-camera move rather than a cut, with highlights leading in and shadows
crushing last.

You do not have to do anything for this. `BT.palette` still reports your palette while the splash is up, so in-place
slot edits and `BT.spritesRefresh()` behave normally.

<Callout type="warn" title="Palette effects started in init() are dropped">

Palette _effects_ – `BT.paletteCycle`, `BT.paletteFade`, and friends – started inside `init()` while the splash is up
are discarded at handoff. They hold snapshots of a palette that is about to be replaced wholesale. Start them from your
first `update()` instead.

</Callout>

If your game never calls `BT.paletteSet()` during `init()`, the splash's own palette fades to black instead, so the
screen is black rather than showing stale splash grays.

## The skip

Any key, click, or tap skips.

Skip collapses the fade-in and the minimum hold, but it still waits on `init()`. When the splash is also the loading
screen, "skip" cannot mean "start now" if the assets are not ready. The fade-out then runs at its full duration, because
it is the handoff into your palette rather than decoration – cutting it would produce exactly the hard cut the exposure
fade exists to avoid.

The press that skipped is swallowed. The engine drains pending input edges at handoff, so your first `update()` sees no
press from it.

<Callout title="Held keys still read as held">

Swallowing consumes the press _edge_, not the key. A key still physically down at handoff reads as down from
`BT.isKeyDown` on the first frame, which is honest: the player really is holding it.

</Callout>

## Backends

Palette fades are the universal floor and run on both backends.

The pixelated dissolve that shears the logo through both fades is WebGPU-only. It is a pixel-tier post-process effect,
and the Canvas 2D software renderer does not support post-process, so `?backend=software` gets the plain fade in and
out. That is an accepted difference in fidelity, not a bug.

## Customizing the ramp

The splash's palette is a 16-step ramp between two endpoints, spaced evenly in encoded sRGB channel values – the same
numbers an image editor shows you. Quantization is therefore predictable: a tone you draw lands on the nearest step to
the value you drew it as, because the logo converter picks a step straight from each pixel's value. Both endpoints are
configurable:

```ts twoslash
import { Color32, type HardwareSettings } from 'blit386';
// ---cut---
function configure(): Partial<HardwareSettings> {
  return {
    splashColorDark: new Color32(6, 8, 12),
    splashColorLight: new Color32(220, 230, 245),
  };
}
```

Because the splash's palette and your game's palette never coexist, the splash's slot count costs your game nothing.

Sixteen steps split the distance between the two endpoints evenly, so with the default black and white the ramp lands on
multiples of 17 (`0`, `17`, `34`, … `255`) and any tone in the source art snaps to the nearest of those. Drawing the
artwork with the step values avoids the rounding entirely; custom endpoints shift the whole sequence, so read them off
the endpoints you configured rather than assuming multiples of 17.

The fades are unaffected by this spacing: `BT.paletteFadeExposure` converts to linear light itself, per channel, so it
behaves the same however the static steps are distributed.

## See also

<Cards>

<Card title="API: Core" href="/docs/api/core" description="BT.splashState, BT.isSplashVisible, and the HardwareSettings fields." />

<Card title="Palette" href="/docs/guides/palette" description="The palette-first workflow and palette effects, including the exposure fade the handoff uses." />

<Card title="Hot Reload" href="/docs/guides/hot-reload" description="Why the splash never appears during a hot swap." />

</Cards>
