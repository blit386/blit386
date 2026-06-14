---
name: add-crt-effect
description:
  Stack fullscreen post-process effects (CRT curvature, scanlines, bloom, glitch) on top of the finished frame, which
  runs on WebGPU only. Use for a retro CRT look, screen glitches, bloom or glow, or any whole-screen filter.
---

# Add a CRT or post-process effect

Stack fullscreen effects (CRT curvature, scanlines, bloom, glitch) on top of the finished frame. These run on WebGPU
only.

## When to use

Use for a retro CRT look, screen glitches, bloom or glow, or any whole-screen filter.

## Step 1: a bigger output buffer

Display-tier effects (curvature, scanlines, mask, bloom) need an output buffer larger than the logical screen, set in
`configure()`:

```js
configure() {
    return {
        displaySize: new Vector2i(320, 240), // you draw here
        drawingBufferSize: new Vector2i(1280, 960), // effects render here (required)
    };
}
```

## Step 2: guard the software fallback, then add effects

Post-process throws on the Canvas 2D fallback, so check the active backend first:

```js
async init() {
    // ...palette and setup...
    if (BT.activeBackend === 'webgpu') {
        this.crt = BT.preset.crtPipBoy(); // a ready-made array of CRT effects
        for (const fx of this.crt) BT.effectAdd(fx);
    }
    return true;
}
```

Turn it off again:

```js
for (const fx of this.crt) BT.effectRemove(fx);
// or remove everything at once:
BT.effectClear();
```

## Key calls

- `BT.effectAdd(effect)` / `BT.effectRemove(effect)` / `BT.effectClear()` - methods.
- Presets (functions on `BT.preset`): `BT.preset.crtPipBoy()`, `BT.preset.amber()`, `BT.preset.green()` - each returns a
  fresh array of effects.
- Effect classes you can construct, tweak, then `effectAdd`: display-tier `Scanlines`, `BarrelDistortion`, `Bloom`,
  `Vignette`, `RGBMask`, `ChromaticAberration`, `Noise`, `Flicker`, `Interference`, `RollLine`; pixel-tier
  `PixelGlitch`, `PixelMosaic`.

```js
import { Scanlines } from 'blit-tech';
const lines = new Scanlines();
lines.strength = 0.4;
BT.effectAdd(lines);
```

## Notes

- Always gate effects behind `BT.activeBackend === 'webgpu'` so the game still runs on the software fallback. Keep
  starter games effect-free.
- Some effects animate from a `time` field - set `fx.time = BT.timeSeconds` each frame.
- Hold onto effect instances and reuse them; rebuilding every toggle re-allocates GPU pipelines.
- Full effect reference lives in the engine repo (linked from `AGENTS.md`); the local docs do not cover every effect.
