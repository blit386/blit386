---
name: draw-shapes
description:
  Draw rectangles, lines, and single pixels and clear the screen using palette slots. Use whenever the user wants boxes,
  outlines, lines, dots, or a background color, or says 'draw a ...'.
---

# Draw shapes

Draw rectangles, lines, and pixels, and clear the screen - all with palette slot numbers, all inside `render()`.

## When to use

Use to put boxes, outlines, lines, single pixels, or a background on screen, or when the user says "draw a ...".

## How to do it

```js
render() {
    BT.clear(2); // fill the whole screen with slot 2

    BT.drawRectFill(new Rect2i(10, 20, 32, 32), 1); // solid box: x, y, width, height
    BT.drawRect(new Rect2i(10, 20, 32, 32), 3); // outline only
    BT.drawLine(new Vector2i(0, 0), new Vector2i(100, 60), 3);
    BT.drawPixel(new Vector2i(50, 50), 4); // one pixel

    BT.clearRect(new Rect2i(0, 0, 64, 16), 2); // repaint just one area
}
```

## Key calls (all methods)

- `BT.clear(slot)` - paint the whole frame. Call it first every frame, or last frame's drawing shows through.
- `BT.drawRectFill(rect, slot)` / `BT.drawRect(rect, slot)` - filled / outlined box.
- `BT.drawLine(p0, p1, slot)` - straight line between two points.
- `BT.drawPixel(pos, slot)` or `BT.drawPixel(x, y, slot)` - one pixel.
- `BT.clearRect(rect, slot)` - clear only a region.

## Notes

- Positions are `Vector2i(x, y)`; boxes are `Rect2i(x, y, width, height)`. Top-left is `(0, 0)` and `y` grows downward.
  Whole numbers only.
- The slot number is a palette index; set up colors first (see the use-palette skill). A `Color32` also works wherever a
  slot number does.
- `BT.displaySize` (a property, no parentheses) gives the screen size for centering and edges.

See `docs/drawing.md`.
