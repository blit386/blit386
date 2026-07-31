# Game Loop

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/guides/game-loop, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Fixed-step timing, tick counters, and `BT.renderAlpha` are documented in [API: Game Loop](api-game-loop.md). This guide
walks through the standard pattern for smoothing motion when `render()` doesn't land exactly on an `update()` step.

<ApiAvailability page="guides/game-loop" />

## Why motion can look stale or jittery

`update()` runs at a fixed rate (`targetFPS`); `render()` runs at whatever rate `requestAnimationFrame` delivers, which
rarely divides evenly into `targetFPS`. See
[Multiple update() steps per render frame](api-game-loop.md#multiple-update-steps-per-render-frame) and
[Render frames with zero update() steps](api-game-loop.md#render-frames-with-zero-update-steps) for the two ways that
mismatch shows up. A sprite that only ever draws at its last-computed `update()` position appears to hitch: it sits
still for a render frame with no update, then jumps its full per-tick distance on the next frame that has one.

## Smoothing motion between updates

The fix is to interpolate: keep both the previous and current tick's position, and blend them in `render()` using
`BT.renderAlpha` as the blend factor. Store the previous position at the start of `update()`, before moving:

```ts twoslash
import { BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';
declare const sheet: SpriteSheet;
const srcRect = new Rect2i(0, 0, 16, 16);
// ---cut---
class Player {
  position = new Vector2i(0, 0);
  previousPosition = new Vector2i(0, 0);
  velocity = new Vector2i(2, 0);

  update(): void {
    this.previousPosition = this.position.clone();
    this.position = this.position.add(this.velocity);
  }

  render(): void {
    const drawPos = Vector2i.lerp(this.previousPosition, this.position, BT.renderAlpha);

    BT.drawSprite(sheet, srcRect, drawPos);
  }
}
```

`Vector2i.lerp` truncates its result to integer pixels (see [API: Core Types](api-core-types.md#vector2i)), so this only
smooths motion that covers more than a pixel or two per tick - it doesn't add subpixel precision to a pixel-perfect
renderer. For a sprite moving `2` px/tick at `targetFPS: 60` on a `144` Hz display, it turns a visible 1-then-2-then-0
px stutter into a steadier progression across render frames.

<DemoEmbed demo="001-basics" title="BLIT386 basics demo" />

## Zero-allocation version

`update()`/`render()` run every frame, so the allocating version above (`clone()`, `add()`, `Vector2i.lerp()`) is fine
for prototyping but worth tightening in a shipping demo. Reuse fixed vectors with the in-place and `*To()` variants (see
[Performance Best Practices](performance-best-practices.md)):

```ts twoslash
import { BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';
declare const sheet: SpriteSheet;
const srcRect = new Rect2i(0, 0, 16, 16);
// ---cut---
class Player {
  position = new Vector2i(0, 0);
  previousPosition = new Vector2i(0, 0);
  velocity = new Vector2i(2, 0);
  private readonly drawPos = new Vector2i(0, 0);

  update(): void {
    this.previousPosition.copyFrom(this.position);
    this.position.addInPlace(this.velocity);
  }

  render(): void {
    Vector2i.lerpTo(this.previousPosition, this.position, BT.renderAlpha, this.drawPos);

    BT.drawSprite(sheet, srcRect, this.drawPos);
  }
}
```

Color transitions (palette flashes, tinted hit-feedback) can be interpolated the same way with `Color32.lerp` /
`Color32#lerp` - see [API: Core Types](api-core-types.md#color32).

<PageChangelog page="guides/game-loop" />

## See also

<Cards>
  <Card title="API: Game Loop" href="/docs/api/game-loop">Tick timing, renderAlpha, present FPS, Timer.</Card>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i.lerp, Color32.lerp, and the zero-allocation variants.</Card>
  <Card title="Performance Best Practices" href="/docs/performance/best-practices">Object allocation, batching, and hot-path guidance.</Card>
</Cards>
