---
name: animate-the-palette
description:
  Animate palette slots for motion and mood without redrawing anything, using cycling, fading, flashing, and swapping.
  Use for flowing water or fire, day-night transitions, hit flashes, theme switches, or any 'the whole screen shifts
  color' effect.
---

# Animate the palette

Create motion and mood without redrawing anything by animating palette slots: cycling, fading, flashing, swapping.

## When to use

Use for flowing water or fire, day-night transitions, hit flashes, theme switches, or any "the whole screen shifts
color" effect.

## The effects (call from update() or init())

```js
// Continuously rotate slots [start..end]. Great for waterfalls, lava, marquees.
BT.paletteCycle(1, 8, 0.5); // start, end, speed

// Smoothly fade the whole palette toward another palette over time.
BT.paletteFade(this.nightPalette, 2000, 'ease-in-out'); // target, durationMs, easing?

// Fade only a slice of slots toward a target palette.
BT.paletteFadeRange(1, 8, this.duskPalette, 1500);

// Flash all colored slots to one color, then restore. Good for damage or explosions.
BT.paletteFlash(new Color32(255, 255, 255), 120); // color, durationMs

// Instantly exchange two slots.
BT.paletteSwap(3, 4);

// Cancel every running palette effect.
BT.paletteClearEffects();
```

## Key calls (all methods)

- `BT.paletteCycle(start, end, speed)`
- `BT.paletteFade(targetPalette, durationMs, easing?)`
- `BT.paletteFadeRange(start, end, targetPalette, durationMs, easing?)`
- `BT.paletteFlash(color, durationMs)`
- `BT.paletteSwap(indexA, indexB)`
- `BT.paletteClearEffects()`
- Easing names: `'linear'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`.

## Notes

- These animate the active palette; set one up first (use-palette skill).
- A fade target is a whole `Palette` – build the "night" palette once in `init()`.
- If you change a sprite's colors as a full theme swap with `BT.paletteSet`, call `BT.spritesRefresh()` afterward so
  sprite sheets re-resolve against the new colors.

See `docs/palette.md`.
