---
name: use-palette
description:
  Set up and change colors with BLIT386's palette-first system of numbered color slots. Use whenever the user sets up
  colors, mentions colors, themes, or palettes, or wants to recolor things at runtime by changing a slot.
---

# Use the palette (colors)

BLIT386 is palette-first: fill numbered color slots once, then draw with the slot numbers. Change a slot and everything
drawn with it changes.

## When to use

Use whenever you set up colors, the user mentions colors or themes, or you need to recolor things at runtime.

## Make a palette in init()

```js
async init() {
    this.palette = BT.paletteCreate(16); // room for 16 colors; slot 0 is transparent

    this.palette.set(1, new Color32(230, 80, 60)); // each channel 0..255
    this.palette.set(2, new Color32(20, 24, 40)); // background
    this.palette.set(3, Color32.white); // named presets are getters (no parentheses)

    BT.paletteSet(this.palette); // from now on, draw with slot numbers
    return true;
}
```

## Change a color later (the palette is live)

```js
update() {
    if (this.hurt) {
        this.palette.set(1, new Color32(255, 255, 255)); // everything in slot 1 flashes white next frame
    }
}
```

## Key calls

- `BT.paletteCreate(size?)` (method) – new palette (default 256 slots).
- `palette.set(index, color)` / `palette.get(index)` (methods) – write / read a slot.
- `BT.paletteSet(palette)` (method) – make a palette active.
- `palette.applyHUD(startSlot?)` (method) – fill six ready-made HUD colors (white, background, label, header, dim, code)
  in one call.
- Built-in retro palettes: `Palette.vga()`, `Palette.cga()`, `Palette.c64()`, `Palette.nes()`, `Palette.gameboy()`,
  `Palette.pico8()`.
- `Color32` presets are getters (no parentheses): `Color32.white`, `Color32.black`, `Color32.red`, `Color32.green`,
  `Color32.blue`, `Color32.yellow`, `Color32.cyan`, `Color32.magenta`. Also `Color32.fromHex('#ff8800')` and named
  colors via `Color32.resolveNamedColor('cornflowerblue')`.

## Notes

- Slot 0 is always transparent – start visible colors at slot 1.
- `new Color32(r, g, b)` or `new Color32(r, g, b, a)` (alpha 0..255).
- Recoloring by changing slots is cheaper than redrawing. For animated color motion see the animate-the-palette skill.

See `docs/palette.md`.
