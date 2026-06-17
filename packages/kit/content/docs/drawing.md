# Drawing

All drawing happens inside `render()`. You draw with **palette slot numbers** (see `docs/palette.md`); a `Color32` also
works anywhere a slot number does.

Positions are `Vector2i(x, y)` and boxes are `Rect2i(x, y, width, height)`. The top-left corner is `(0, 0)` and `y`
grows downward.

## Clear the screen first

Start every frame by painting over the last one:

```js
render() {
    BT.clear(2); // fill the whole screen with palette slot 2
    // ...draw everything else on top...
}
```

Without `clear()`, last frame's drawing stays behind the new one.

## Rectangles

```js
// Filled box: Rect2i(x, y, width, height), then the color slot.
BT.drawRectFill(new Rect2i(10, 20, 32, 32), 1);

// Outline only.
BT.drawRect(new Rect2i(10, 20, 32, 32), 1);
```

## Lines and pixels

```js
BT.drawLine(new Vector2i(0, 0), new Vector2i(100, 60), 3); // from point A to point B
BT.drawPixel(new Vector2i(50, 50), 4); // a single pixel
```

## Text (no font file needed)

BLIT386 has a small built-in font, so you can show text with no setup. The order is **position, color slot, text**:

```js
BT.systemPrint(new Vector2i(8, 8), 4, `Score: ${this.score}`);
```

To center or right-align text, measure it first:

```js
const size = BT.systemPrintMeasure('Game Over'); // a Vector2i (width, height)
const x = (BT.displaySize.x - size.x) / 2;
BT.systemPrint(new Vector2i(Math.floor(x), 100), 4, 'Game Over');
```

`BT.displaySize` is the screen size as a `Vector2i` (a property, so no parentheses).

## A complete render

```js
render() {
    BT.clear(2);                                            // background
    BT.drawRectFill(new Rect2i(this.x, 210, 48, 8), 1);     // a paddle
    BT.systemPrint(new Vector2i(8, 8), 4, `Score: ${this.score}`);
}
```

Next: `docs/input.md` to make things move, `docs/palette.md` to choose the colors behind those slot numbers.
