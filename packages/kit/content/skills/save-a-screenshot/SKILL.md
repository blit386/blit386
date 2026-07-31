---
name: save-a-screenshot
description:
  Capture the rendered frame as a PNG, either downloading it or getting a Blob. Use for a screenshot button, a 'share my
  creation' feature, or exporting generated pixel art.
---

# Save a screenshot

Capture the rendered frame as a PNG – download it, or get a Blob to use yourself.

## When to use

Use for a screenshot button, a "share my creation" feature, or exporting generated pixel art.

## Download a PNG

```js
async update() {
    if (BT.isKeyPressed('KeyP')) {
        await BT.downloadFrame('my-art.png'); // async; prompts a browser download; filename optional
    }
}
```

## Get a Blob (upload, preview, store)

```js
async takeShot() {
    const blob = await BT.captureFrame(); // a PNG Blob, after the next render
    const url = URL.createObjectURL(blob);
    this.previewUrl = url;
}
```

## Key calls

- `BT.downloadFrame(filename?)` (method, async) – capture and download.
- `BT.captureFrame()` (method, async) – resolve to a PNG `Blob`.

## Notes

- Both are async – `await` them, or call from an async handler.
- Capture happens after the next frame renders, so the latest draw is included.
- Works on both the WebGPU and software backends.
