---
description: Integer coordinates for all BLIT386 rendering
alwaysApply: true
---

# Integer coordinates

All screen positions and sizes must be whole numbers. The engine works in a pixel grid; fractions do not make sense and
cause off-by-one rendering glitches.

## Use Vector2i for points

```js
import { Vector2i } from 'blit386';

const pos = new Vector2i(10, 20); // correct - integer point
const pos = { x: 10.5, y: 20.7 }; // wrong   - plain object with floats
```

`Vector2i` auto-floors its inputs, so `new Vector2i(10.9, 20.1)` becomes `(10, 20)`.

## Use Rect2i for rectangles

```js
import { Rect2i } from 'blit386';

const r = new Rect2i(x, y, width, height); // correct
```

## Convert floats before use

When you compute a position from a float (like a physics result or `Math.sin`), floor it before passing to the engine.

```js
const px = Math.floor(someFloat);
BT.drawPixel(new Vector2i(px, py), COLOR);
```

## BT getters already return integers

`BT.displaySize`, `BT.pointerPos(0)`, and `BT.camera` all return `Vector2i` - no conversion needed. So do the grid
helpers `sheet.tileRect(...)` and `Rect2i.fromTile(col, row, tileSize)` (engine 1.8.0+).

## Sprite sizes are whole numbers too

`SpriteDrawParams.scale` takes a positive integer (or a `Vector2i` of them), `tileSize` a positive integer per axis, and
a stretched sprite or nine-slice fills a `Rect2i`. There is no fractional scale; for an in-between size, pass a `Rect2i`
destination.
