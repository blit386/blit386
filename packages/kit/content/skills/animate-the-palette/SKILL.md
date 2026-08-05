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

// Fade the whole palette like a camera iris instead of a crossfade (blit386 1.5.0+).
// Bright slots come up first and hold on longest; dark slots arrive late and crush early.
BT.paletteFadeExposure(this.gamePalette, 1500); // target, durationMs, options?
BT.paletteFadeExposure(this.gamePalette, 1500, { highlightLead: 0.2, easing: 'ease-out' });

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
- `BT.paletteFadeExposure(targetPalette, durationMs, options?)` – engine 1.5.0+; options are `{ highlightLead, easing }`
- `BT.paletteFlash(color, durationMs)`
- `BT.paletteSwap(indexA, indexB)`
- `BT.paletteClearEffects()`
- Easing names: `'linear'`, `'ease-in'`, `'ease-out'`, `'ease-in-out'`, plus the full curve library on blit386 1.5.0+
  (`'sine-*'`, `'cubic-*'`, `'expo-*'`, `'bounce-*'`, and more – see the `move-and-time` skill).

## Which fade do I want?

`paletteFade` mixes the numbers a color is stored as. Every slot dims by the same share at the same moment, so the
picture sinks into gray together. That is a crossfade, and it is the right choice for a cross-dissolve between two
themes.

`paletteFadeExposure` dims light rather than stored numbers, and starts each slot on its own schedule based on how
bright it is. Bright slots come up first and hold on longest; dark slots arrive late and crush early. That is what a
camera closing its iris looks like, so reach for it on a title card, a fade up into the game, or a blackout.

`highlightLead` is the knob. `0` puts every slot on one schedule (a plain fade, still in light); the default `0.5` reads
as cinematic. Both fades land exactly on the target palette, so nothing is left one step off at the end.

One catch worth knowing: a palette fade works per slot, not per pixel. A dark object standing in a bright room fades on
the dark schedule no matter what is around it, because the engine only knows its slot number. Fading up from black or
down to black always looks right; in a busy scene, look at it before shipping it.

## Notes

- These animate the active palette; set one up first (use-palette skill).
- A fade target is a whole `Palette` – build the "night" palette once in `init()`.
- Slots past the end of the target palette are left alone. Hand `paletteFadeExposure` a small target palette and it only
  touches that many slots, which is how two different fades can run at once on one palette.
- If you change a sprite's colors as a full theme swap with `BT.paletteSet`, call `BT.spritesRefresh()` afterward so
  sprite sheets re-resolve against the new colors.

See `docs/palette.md`.
