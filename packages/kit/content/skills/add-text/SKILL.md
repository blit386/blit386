---
name: add-text
description:
  Draw text with the built-in system font or a loaded .btfont bitmap font. Use for scores, labels, titles, dialog, a
  HUD, or any on-screen words, including centering or right-aligning text.
---

# Add text

Show text with the built-in font (no setup), or load a custom bitmap font.

## When to use

Use for scores, labels, titles, dialog, or any on-screen words.

## Built-in font (no file needed)

The order is position, color slot, text:

```js
render() {
    BT.systemPrint(new Vector2i(8, 8), 4, `Score: ${this.score}`);
}
```

Center or right-align by measuring first:

```js
const size = BT.systemPrintMeasure('Game Over'); // a Vector2i (width, height)
const x = Math.floor((BT.displaySize.x - size.x) / 2);
BT.systemPrint(new Vector2i(x, 100), 4, 'Game Over');
```

## Custom bitmap font

Load a `.btfont` file in `init()` (async), then draw with `printFont`:

```js
async init() {
    this.font = await BitmapFont.load('/fonts/pixel.btfont');
    return true;
}
render() {
    BT.printFont(this.font, new Vector2i(8, 8), 'HELLO');
}
```

## Missing characters (engine 1.5.0+)

The built-in font covers plain ASCII plus dashes, arrows, media icons, uppercase Greek, and a few symbols. Any character
it does not have draws as a fallback glyph, so you see a marker instead of the character quietly disappearing.

A custom `.btfont` only gets that safety net if it defines its own glyph keyed by `U+FFFD` (the Unicode replacement
character). Without one, a missing character is skipped and the pen does not move – so the next character draws on top
of the one before it, and the whole line looks scrambled rather than merely incomplete.

```js
if (!this.font.hasGlyph('é')) {
  // This character has no glyph of its own in the font.
}
```

`hasGlyph()` answers whether a character has its _own_ glyph, not whether the fallback would cover it. That is
deliberate – use it to check what a font really contains.

## Key calls

- `BT.systemPrint(pos, slot, text)` (method) – built-in 6x14 font.
- `BT.systemPrintMeasure(text)` (method) – returns a `Vector2i` size for centering.
- `BitmapFont.load(url)` (static, async) – load a `.btfont` file.
- `BT.printFont(font, pos, text, paletteOffset?)` (method) – draw with a loaded font; `paletteOffset` shifts the glyph
  colors.
- `font.hasGlyph(char)` (method) – true when the font has its own glyph for that character.

## Notes

- Positions are whole numbers (`Vector2i`).
- The color is a palette slot number (set up colors with the use-palette skill).
- `await` the font load – forgetting `await` is the most common beginner bug.

See `docs/drawing.md`.
