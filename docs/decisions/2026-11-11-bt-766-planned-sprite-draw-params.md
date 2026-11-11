# Planned sprite draw params (named frames and raw numbers)

Moved on 2026-11-11 (BT-766) from the published `packages/blit386/docs/api-rendering.md` page, where it was a planned,
unshipped design in front of agents that read the docs verbatim. It records the rest of the unified `BT.drawSprite` v2
shape decided in BT-236 (revised 2026-10-04): overload 3 (named frames, BT-271) and overload 4 (raw numbers, BT-262).
The shipped part (overload 2 with `SpriteDrawParams`) is documented on the published page.

## Design

All transform features hang off one reusable params object. Separate methods stay separate:
[`BT.drawTile`](../../packages/blit386/docs/api-rendering.md#drawing-tiles) and
[`BT.drawNineSlice`](../../packages/blit386/docs/api-rendering.md#nine-slice-panels) are not further `drawSprite`
overloads. There is no `drawSpriteScaled`, no `tint`, and no arbitrary-angle `rotation` field in v1.

```ts
// 1. Shipped. Unchanged.
declare function drawSprite(sheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void;

// 2. Shipped (1.8.0).
declare function drawSprite(sheet: SpriteSheet, src: Rect2i, dest: Vector2i | Rect2i, params: SpriteDrawParams): void;

// 3. Planned named frame (BT-271). Always takes the params path, so `params` may be omitted.
declare function drawSprite(
  pack: SpritePack,
  frameName: string,
  dest: Vector2i | Rect2i,
  params?: SpriteDrawParams,
): void;

// 4. Reserved for BT-262 (milestone 2.0.0). Not added to the 1.8.0 types.
declare function drawSprite(
  sheet: SpriteSheet,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  destX: number,
  destY: number,
  paletteOffsetOrParams?: number | SpriteDrawParams,
): void;

interface SpriteDrawParams {
  flags?: number; // shipped
  pivot?: Vector2i | undefined; // shipped: source pixels, before flags; assign undefined to reset
  scale?: number | Vector2i; // shipped
  paletteOffset?: number; // shipped
}

// Planned (BT-271). Returned by SpritePack.frame(name).
interface SpriteFrame {
  readonly sheet: SpriteSheet; // the page this frame lives on
  readonly rect: Rect2i; // frozen
  readonly pivot?: Vector2i; // frozen; filled from Aseprite slice data by BT-364, never applied implicitly
}
```

`| undefined` on `pivot` is deliberate: a reused params object returns to the default pivot with
`params.pivot = undefined`, and that assignment must type-check under `exactOptionalPropertyTypes`.

### Planned dispatch

The shipped [dispatch](../../packages/blit386/docs/api-rendering.md#dispatch) extends as follows:

- `typeof src === 'string'`: overload 3. `typeof src === 'number'`: overload 4. Both throw until their tickets ship.
- Create a reused params object with every field present, so its shape never changes, annotated as `SpriteDrawParams`:
  `const params: SpriteDrawParams = { flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 }`.
- Overload 3 is `SpritePack.frame(name)` followed by overload 2 with `frame.sheet` and `frame.rect`. A missing name
  throws. `frame(name)` returns the same frozen `SpriteFrame` on every call, so a hot loop resolves it once and calls
  `BT.drawSprite(frame.sheet, frame.rect, dest)` (overload 1) or adds `params` (overload 2) - no per-draw string lookup.
  Carrying the sheet on the frame keeps multi-page packs correct and makes a rect from the wrong sheet impossible.
  `frame.pivot` is data only: pass `params.pivot = frame.pivot` to use it. There is no raw-number form for names.
- Overload 4, when it exists, cannot express a destination rectangle, so stretched draws (a `Rect2i` dest) use
  overload 2. Raw numbers occupy arguments 2-7; argument 8 is `paletteOffset` or `SpriteDrawParams`, same split as the
  fast path, so `flags`, integer `scale`, and `pivot` work as on overload 2 with a point dest.
- Planned transform order: flags, then integer scale, then placement. `scale` multiplies the post-flags footprint in
  screen axes, so `scale.x` is on-screen width even after a 90-degree turn. If a later ticket adds an arbitrary angle,
  the unit is degrees, and the software renderer throws until it can match pixel-for-pixel.

### Color

The only recolor control is `paletteOffset`, on the fast path or inside params, never both and never stacked. There is
no `tint` field. Older sketches that used `Color32` / `ColorArg` as a 4th argument are stale.

### Software-renderer parity

No accepted field degrades. The software blit is the pixel spec; WebGPU must match it (the general rules are in
[Draw order and backend parity](../../packages/blit386/docs/api-rendering.md#draw-order-and-backend-parity)). The 1:1
path stays today's `blitIndexedRect` / UV quad emission.

| Field | Parity |
| --- | --- |
| `paletteOffset` | Already matched. Same validation as today. |
| `flags` | Pixel-exact source-index remap via the orientation table, then the same transparency and palette rules. Not a shader-only effect. |
| `pivot` | Pixel-exact integer move of the footprint origin. Components copied into the queued command. |
| `scale` / `dest: Rect2i` | Pixel-exact nearest-neighbor using the stretch sampling formula above, on both backends. |
| `rotation` | Not accepted. A future software path throws rather than skipping the rotation. |
| Frame name | Resolved to a `SpriteFrame`, then the same path. No separate software behavior. |
| Nine-slice | Not a sprite-params field. Shipped as [BT.drawNineSlice](../../packages/blit386/docs/api-rendering.md#nine-slice-panels): stretched parts inherit the stretch sampling formula, tiled parts are 1:1 blits. |

GPU note for implementers: the vertex shader already passes UVs through. Flags and scale are CPU-side corner and UV
writes into the existing 5-value vertex, with the orientation table choosing which source corner goes to which quad
corner. Do not add a flags uniform on the 1:1 path.
