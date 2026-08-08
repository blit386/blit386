# Camera

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/camera, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

The camera applies a global pixel offset to all subsequent draw calls. Integer only – pass `Vector2i`, never floats.

<Since symbol="BT.cameraSet" />
<Since symbol="BT.camera" />
<Since symbol="BT.cameraReset" />
<Since symbol="BT.cameraClamp" />

```ts twoslash
import { BT, Vector2i } from 'blit386';
declare const scrollX: number;
declare const scrollY: number;
declare const desired: Vector2i;
declare const worldSize: Vector2i;
// ---cut---
BT.cameraSet(new Vector2i(scrollX, scrollY)); // apply offset
BT.camera; // Vector2i – current offset
BT.cameraReset(); // set back to (0, 0)

// Clamp a camera origin so the viewport stays within a world:
const clamped = BT.cameraClamp(desired, worldSize);

// Optional third argument overrides the viewport size (default: BT.displaySize):
const clamped2 = BT.cameraClamp(desired, worldSize, new Vector2i(160, 120));
```

## Camera persists across zero-update frames

`BT.cameraSet()`'s offset persists across render frames automatically, including frames where `update()` does not run –
common on high refresh-rate displays where `render()` outpaces the fixed update rate (see
[Render frames with zero update() steps](api-game-loop.md#render-frames-with-zero-update-steps) in API: Game Loop). Call
`cameraSet()` once per `update()` tick and `cameraReset()` at the end of `render()` to switch to screen space for UI
overlays, as the demos below do; the engine re-applies the last offset before the next render pass begins, so the reset
never leaks into the following frame's world draw.

Standalone helper (same math as `BT.cameraClamp`):

<Since symbol="clampCameraToWorld" />

```ts twoslash
import { clampCameraToWorld, Vector2i } from 'blit386';
declare const desired: Vector2i;
declare const worldSize: Vector2i;
declare const viewSize: Vector2i;
// ---cut---
const clamped = clampCameraToWorld(desired, worldSize, viewSize);
```

<DemoEmbed demo="007-camera" title="BLIT386 camera demo" />

Two more camera-driven demos: parallax scrolling and a scrolling tile grid.

<DemoEmbed demo="011-starfield" title="BLIT386 starfield parallax demo" />

<DemoEmbed demo="012-tilemap" title="BLIT386 tilemap demo" />

## API history

<ApiAvailability page="api/camera" />

<PageChangelog page="api/camera" />

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, displaySize, default configuration.</Card>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i for offsets and sizes.</Card>
  <Card title="API: Rendering" href="/docs/api/rendering">Primitives, sprites, text the camera offsets.</Card>
</Cards>
