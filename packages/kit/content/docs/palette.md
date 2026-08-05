# Colors and the palette

BLIT386 is "palette-first". Instead of drawing with a color directly, you fill a small set of numbered slots with colors
once, then draw using the slot numbers. This is how old game consoles worked, and it unlocks tricks like recoloring the
whole screen by changing one slot.

## Make a palette in init()

```js
async init() {
    // A palette with room for 16 colors. Slot 0 is always transparent, so use 1 and up.
    this.palette = BT.paletteCreate(16);

    // Put colors in slots. Color32(red, green, blue) with each value from 0 to 255.
    this.palette.set(1, new Color32(230, 80, 60));   // a warm red
    this.palette.set(2, new Color32(20, 24, 40));    // a dark blue background
    this.palette.set(3, new Color32(120, 200, 120)); // a soft green
    this.palette.set(4, new Color32(240, 240, 255)); // near-white for text

    // Hand the palette to the engine. From now on, drawing uses slot numbers.
    BT.paletteSet(this.palette);

    return true;
}
```

## Draw with slot numbers

```js
render() {
    BT.clear(2);                                       // slot 2 = background
    BT.drawRectFill(new Rect2i(10, 10, 32, 32), 1);    // slot 1 = red
    BT.systemPrint(new Vector2i(8, 8), 4, 'Hi');       // slot 4 = near-white
}
```

## Color32 quick reference

- `new Color32(r, g, b)` – red, green, blue, each 0 to 255.
- `new Color32(r, g, b, a)` – add alpha (0 transparent, 255 solid).
- Handy presets are properties, not calls: `Color32.white`, `Color32.black`, `Color32.red`, `Color32.green`,
  `Color32.blue` (no parentheses).
- `color.luminance` – how bright a color looks, 0 to 255. Use it instead of writing the brightness formula yourself.
- `color.toLinear()` / `color.toSrgb()` – switch between the numbers a color is stored as and actual light (blit386
  1.5.0+). Only needed if you are doing your own brightness math; the palette effects already do this for you.

## The transparent slot

Slot 0 is always see-through. Drawing with slot 0 draws nothing, which is occasionally useful, but for visible colors
start at slot 1.

## Changing a color later

The palette is live. Change a slot during the game and everything drawn with that slot changes on the next frame:

```js
update() {
    if (this.hurt) {
        this.palette.set(1, new Color32(255, 255, 255)); // flash the player white
    }
}
```

## Fading the whole screen

Two fades, same start and end, different middle:

```js
// A crossfade: every slot dims by the same share at the same time.
BT.paletteFade(this.nightPalette, 2000, 'ease-in-out');

// A camera fade: bright slots come up first and hold on longest, dark slots
// arrive late and crush early (blit386 1.5.0+).
BT.paletteFadeExposure(this.gamePalette, 2000);
```

Use the first for a cross-dissolve between themes, the second for a title card or a fade up into the game. The
`animate-the-palette` skill covers cycling, flashing, and swapping too.

Next: `docs/drawing.md` for the full list of things you can draw.
