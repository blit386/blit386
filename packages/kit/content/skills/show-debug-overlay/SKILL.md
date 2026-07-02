---
name: show-debug-overlay
description:
  Turn on and feed the engine's built-in debug overlay (FPS, backend, resolution, your own rows, palette grid, timing
  chart). Use to see FPS and timings, show live game values while developing, or add a palette or timing inspector.
---

# Show the debug overlay

The engine draws a built-in overlay (FPS, backend, resolution, and your own rows). Turn parts on in `configure()` and
feed it rows from your game.

## When to use

Use to see FPS and timings, show live game values while developing, or add a palette or timing inspector.

## Turn it on in configure()

```js
configure() {
    return {
        isOverlayEnabled: true, // master switch (on by default)
        isOverlayVisibleAtStart: true, // show the body on frame 1 (default: hidden until toggled)
        isOverlayPaletteEnabled: true, // live palette swatch grid
        isOverlayTimingChartEnabled: true, // scrolling update/render timing chart
    };
}
```

The body toggles with the Backquote key or the bottom-left corner. Hide the hint icon with
`isOverlayToggleHintVisible: false`; lock visibility with `isOverlayToggleEnabled: false`; turn the whole overlay off
with `isOverlayEnabled: false`.

## Add your own rows

```js
overlayRows() {
    return [
        { leftText: 'Score', rightText: String(this.score) },
        { leftText: 'Lives', rightText: String(this.lives) },
    ];
}
```

## Mark events on the timing chart

```js
update() {
    // Drop the marker once, the moment the level starts - not every frame, or you stack duplicates.
    if (this.levelStarted && !this.levelTagged) {
        BT.assignTag('Level 2'); // a labeled marker on the chart
        this.levelTagged = true;
    }
}
```

## Key calls

- Configure flags (all `is*`): `isOverlayEnabled`, `isOverlayVisibleAtStart`, `isOverlayToggleHintVisible`,
  `isOverlayToggleEnabled`, `isOverlayPaletteEnabled`, `isOverlayTimingChartEnabled`.
- `overlayRows()` – optional method on your game class returning `{ leftText, rightText? }[]`.
- `BT.assignTag(label?)` (method) – drop a labeled marker (needs the timing chart enabled).

## Notes

- The overlay draws after your `render()`, so leave a little space at top and bottom, or disable it for immersive
  scenes.
- Rebuild the rows array cheaply; `overlayRows()` runs every frame.
