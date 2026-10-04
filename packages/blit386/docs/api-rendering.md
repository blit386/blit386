# Rendering

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/rendering, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Primitives, sprites, text, post-process effects, and frame capture.

All draw calls require a palette to be active (`BT.paletteSet(palette)` before the first `BT.drawSprite`,
`BT.drawRectFill`, etc.). All coordinates are integer pixels - use `Vector2i` and `Rect2i`, never floats.

Palette addressing: primitives and `BT.systemPrint` use an absolute `paletteIndex`. Sprites and `BT.printFont` use an
optional `paletteOffset` added to stored texel indices. See [Palette addressing](api-palette.md#palette-addressing).

## Primitives

<Since symbol="BT.clear" />
<Since symbol="BT.clearRect" />
<Since symbol="BT.drawPixel" />
<Since symbol="BT.drawLine" />
<Since symbol="BT.drawRect" />
<Since symbol="BT.drawRectFill" />

```ts twoslash
import { BT, Rect2i, Vector2i } from 'blit386';
declare const paletteIndex: number;
const rect = new Rect2i(0, 0, 320, 240);
const pos = new Vector2i(0, 0);
declare const x: number;
declare const y: number;
const p0 = new Vector2i(0, 0);
const p1 = new Vector2i(100, 100);
// ---cut---
BT.clear(paletteIndex); // fill entire display
BT.clearRect(rect, paletteIndex); // fill rectangular region

BT.drawPixel(pos, paletteIndex); // Vector2i overload
BT.drawPixel(x, y, paletteIndex); // numeric overload

BT.drawLine(p0, p1, paletteIndex); // pixel-perfect, no antialiasing
BT.drawRect(rect, paletteIndex); // outline only
BT.drawRectFill(rect, paletteIndex); // filled
```

All primitives write palette indices, not RGBA - the active palette resolves colors at frame end.

<DemoEmbed demo="002-primitives" title="BLIT386 primitives demo" />

Two more primitive-drawing demos: pixel art from number grids, and animated mathematical patterns.

<DemoEmbed demo="005-pixel-art" title="BLIT386 pixel art demo" />

<DemoEmbed demo="006-patterns" title="BLIT386 patterns demo" />

## Sprites

### Drawing

<Since symbol="BT.drawSprite" />

```ts twoslash
import { BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';
declare const sheet: SpriteSheet;
const srcRect = new Rect2i(0, 0, 32, 32);
const destPos = new Vector2i(0, 0);
declare const paletteOffset: number;
// ---cut---
BT.drawSprite(sheet, srcRect, destPos);
BT.drawSprite(sheet, srcRect, destPos, paletteOffset);
```

- `sheet` - an indexed `SpriteSheet` (must have been prepared via `loadIndexed` or `indexize`).
- `srcRect` - source region within the sheet in pixels.
- `destPos` - top-left destination in display coordinates.
- `paletteOffset` - shift added to every stored pixel index before palette lookup (default `0`).

<DemoEmbed demo="008-sprites" title="BLIT386 sprites demo" />

Palette offset semantics

Stored sprite indices start at `1`; index `0` is always transparent and discarded. The offset shifts every stored index
before the palette lookup, so a pixel stored at index `i` renders as `palette[i + paletteOffset]`:

| Stored index | `paletteOffset = 0` | `paletteOffset = N` |
| --- | --- | --- |
| `1` | `palette[1]` | `palette[1 + N]` |
| `2` | `palette[2]` | `palette[2 + N]` |

This drives palette-swap effects such as team colors or damage flashes - point the same sprite at a different band of
the palette without re-uploading texels.

- Validation: `paletteOffset` must be a non-negative integer below the active palette size, or the draw throws.
- Clamping: the WebGPU sprite shader computes `combined = storedIndex + paletteOffset` and clamps with
  `index = min(combined, 255u)`, so any sum past `255` maps to palette slot `255`.

```ts twoslash
import { BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';
declare const sheet: SpriteSheet;
const srcRect = new Rect2i(0, 0, 32, 32);
// ---cut---
BT.drawSprite(sheet, srcRect, new Vector2i(10, 10)); // normal
BT.drawSprite(sheet, srcRect, new Vector2i(10, 10), 16); // blue-team shift
```

Draws are auto-batched by texture. Group draws from the same sheet to minimize GPU state changes.

<DemoEmbed demo="010-sprite-effects" title="BLIT386 sprite effects demo" />

### Sprite transform constants

<Since symbol="BT.FLIP_H" />
<Since symbol="BT.FLIP_V" />
<Since symbol="BT.ROT_90_CW" />
<Since symbol="BT.ROT_180_CW" />
<Since symbol="BT.ROT_270_CW" />

The following flags are defined for future use. They are not yet accepted by `BT.drawSprite()` - see
[Planned: sprite draw params](#planned-sprite-draw-params) for the contract that will accept them:

```ts twoslash
import { BT } from 'blit386';
// ---cut---
BT.FLIP_H; // horizontal flip
BT.FLIP_V; // vertical flip
BT.ROT_90_CW; // rotate 90° clockwise
BT.ROT_180_CW; // rotate 180°
BT.ROT_270_CW; // rotate 270° clockwise
```

### Planned: sprite draw params

<Callout title="Planned - not shipped">

This section locks the unified `BT.drawSprite` v2 shape decided in BT-236 (revised 2026-10-04). No runtime overload,
`SpriteDrawParams`, `SpritePack`, or `SpriteFrame` type, and no transform behavior has shipped yet. The existing
`BT.drawSprite(sheet, srcRect, destPos, paletteOffset?)` call stays the allocation-free fast path.

</Callout>

All transform features hang off one reusable params object. Separate methods stay separate: `BT.drawTile` (BT-265) and
`BT.drawNineSlice` (BT-270) are not further `drawSprite` overloads. There is no `drawSpriteScaled`, no `tint`, and no
arbitrary-angle `rotation` field in v1.

```ts
// 1. Shipped. Unchanged.
drawSprite(sheet: SpriteSheet, srcRect: Rect2i, destPos: Vector2i, paletteOffset?: number): void;

// 2. Planned params object. `params` is required here: without it, a call is overload 1.
drawSprite(sheet: SpriteSheet, src: Rect2i, dest: Vector2i | Rect2i, params: SpriteDrawParams): void;

// 3. Planned named frame (BT-271). Always takes the params path, so `params` may be omitted.
drawSprite(pack: SpritePack, frameName: string, dest: Vector2i | Rect2i, params?: SpriteDrawParams): void;

// 4. Reserved for BT-262 (milestone 2.0.0). Not added to the 1.8.0 types.
drawSprite(
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
    flags?: number; // any combination of BT.FLIP_* / BT.ROT_* bits
    pivot?: Vector2i | undefined; // source pixels, before flags; assign undefined to reset
    scale?: number | Vector2i; // positive integers, screen axes, after flags
    paletteOffset?: number; // same meaning as the fast-path 4th argument
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

#### Dispatch

Overload order is significant. Declare the shipped fast path first. Runtime dispatch reads argument 2, then argument 4:

1. `typeof src === 'object'` (a `Rect2i`): overloads 1 and 2.
   - `typeof arg4 === 'object'` is `SpriteDrawParams` (overload 2). `null` and arrays throw.
   - Otherwise (`number` or `undefined`, defaulting to `0`) it is `paletteOffset` and the fast path (overload 1). `dest`
     is read as a point (`x`, `y` only).
2. `typeof src === 'string'`: overload 3.
3. `typeof src === 'number'`: overload 4. Until BT-262 ships, this throws.

The release-build fast path costs two `typeof` checks and no `instanceof`.

- `drawSprite(sheet, src, destRect)` and `drawSprite(sheet, src, destRect, 0)` are type errors, because overload 1 only
  takes a `Vector2i` and overload 2 requires `params`. Write `drawSprite(sheet, src, destRect, {})`. Untyped callers
  would otherwise get a silent unscaled draw at the rectangle's top-left, so the fast path asserts
  `!(dest instanceof Rect2i)` in dev mode only and throws a message pointing at `{}`. Read the dev-mode flag once, not
  per draw: `isDevMode()` resolves several signals on every call.
- The params object is read, never mutated or retained. The engine copies the numbers it needs before returning, so a
  hot loop can allocate `params` once and write fields between draws. On the software backend that copy is mandatory:
  commands are replayed later.
- Create a reused params object with every field present, so its shape never changes:
  `{ flags: 0, pivot: undefined, scale: 1, paletteOffset: 0 }`.
- On the params path, `dest instanceof Rect2i` is the stretch footprint; `dest instanceof Vector2i` is a point. Anything
  else throws. Do not use `'width' in dest` - `Vector2i.width` aliases `x`.
- Overload 3 is `SpritePack.frame(name)` followed by overload 2 with `frame.sheet` and `frame.rect`. A missing name
  throws. `frame(name)` returns the same frozen `SpriteFrame` on every call, so a hot loop resolves it once and calls
  `BT.drawSprite(frame.sheet, frame.rect, dest)` (overload 1) or adds `params` (overload 2) - no per-draw string lookup.
  Carrying the sheet on the frame keeps multi-page packs correct and makes a rect from the wrong sheet impossible.
  `frame.pivot` is data only: pass `params.pivot = frame.pivot` to use it. There is no raw-number form for names.
- Overload 4, when it exists, cannot express a destination rectangle. Scaled draws use overload 2. Raw numbers occupy
  arguments 2-7; argument 8 is `paletteOffset` or `SpriteDrawParams`, same split as the fast path.

#### Transform order and flags

Order: flags, then integer scale, then placement.

- `params.flags` uses the existing `BT.FLIP_*` / `BT.ROT_*` bits (values unchanged since 0.1.0). Booleans are not
  accepted.
- Every combination inside `0x1f` is valid and composes in one fixed order: `FLIP_H`, then `FLIP_V`, then clockwise
  quarter turns, counting `ROT_90_CW` as 1, `ROT_180_CW` as 2, and `ROT_270_CW` as 3, summed modulo 4. So
  `ROT_90_CW | ROT_180_CW` is `ROT_270_CW`, and `ROT_180_CW | FLIP_H | FLIP_V` is the identity. Only bits outside `0x1f`
  throw, naming the constants.
- The 32 possible masks reduce to the 8 orientations below. Implement this as one 32-entry lookup from mask to
  orientation (`0`-`7`), computed once. Every backend step - software texel remap, GPU UV corner order, pivot mapping,
  footprint size - reads the same per-orientation table. Do not hand-write separate tables per step.
- `scale` multiplies the post-flags footprint in screen axes, so `scale.x` is on-screen width even after a 90-degree
  turn.
- Arbitrary-angle rotation is out of v1. There is no `rotation` field, so a leftover `rotation` on an object literal is
  a type error rather than a silent no-op. If a later ticket adds an angle, the unit is degrees, and the software
  renderer throws until it can match pixel-for-pixel.

The 8 orientations for a 3x2 source `ABC / DEF` (`sw = 3`, `sh = 2`). "Point map" sends a point `(x, y)` in
`[0, sw] x [0, sh]` to the post-flags footprint:

| Orientation | Shortest flags | Also spelled | Result | Footprint | Point map |
| --- | --- | --- | --- | --- | --- |
| 0 | `0` | `ROT_180_CW \| FLIP_H \| FLIP_V` | `ABC / DEF` | `sw x sh` | `(x, y)` |
| 1 | `FLIP_H` | `ROT_180_CW \| FLIP_V` | `CBA / FED` | `sw x sh` | `(sw - x, y)` |
| 2 | `FLIP_V` | `ROT_180_CW \| FLIP_H` | `DEF / ABC` | `sw x sh` | `(x, sh - y)` |
| 3 | `ROT_180_CW` | `FLIP_H \| FLIP_V` | `FED / CBA` | `sw x sh` | `(sw - x, sh - y)` |
| 4 | `ROT_90_CW` | `ROT_270_CW \| FLIP_H \| FLIP_V` | `DA / EB / FC` | `sh x sw` | `(sh - y, x)` |
| 5 | `ROT_90_CW \| FLIP_H` | `ROT_270_CW \| FLIP_V` | `FC / EB / DA` | `sh x sw` | `(sh - y, sw - x)` |
| 6 | `ROT_90_CW \| FLIP_V` | `ROT_270_CW \| FLIP_H` | `AD / BE / CF` | `sh x sw` | `(y, x)` |
| 7 | `ROT_270_CW` | `ROT_90_CW \| FLIP_H \| FLIP_V` | `CF / BE / AD` | `sh x sw` | `(y, sw - x)` |

Texel remap uses the same point map on the texel center: source texel `(i, j)` lands on footprint texel
`map(i + 0.5, j + 0.5) - (0.5, 0.5)`, which is the point map with `sw - 1` and `sh - 1` in place of `sw` and `sh`. For
example, `FLIP_H` sends column `0` to column `sw - 1`.

#### Placement, pivot, and scale

- With a `Vector2i` dest and no pivot, `dest` is the top-left of the post-flags, post-scale footprint. A 16x32 sprite
  with `ROT_90_CW` occupies 32x16 growing down and right from `dest`.
- With a `Rect2i` dest, the rectangle is that footprint already: flags only remap texels into it, they do not resize it.
  With a `Rect2i` dest, a defined `pivot` throws, and so does any `scale` other than `undefined`, `1`, or `(1, 1)`; each
  check stands alone, because the rect already fixes the box. The neutral `scale: 1` keeps one reused params object
  valid for both dest kinds.
- An `undefined` `pivot` pins the footprint's top-left (the rule above). An explicit `pivot` is a point in source pixels
  relative to the source rect's top-left, sent through the point map, then multiplied by scale. That point sits on
  `dest`. Explicit `(0, 0)` is the source origin, which moves under flips and 90/270, so it is not the same as no pivot.
  To return a reused params object to the default, assign `params.pivot = undefined`. Values outside the sprite are
  legal.
- `scale` is a positive integer (`number` or `Vector2i`). `scale: 2` and `scale: new Vector2i(2, 2)` match. `0`,
  negatives, and non-integers throw; the error points at a `Rect2i` dest for uneven sizes.

#### Stretch sampling

Nearest-neighbor for a post-flags footprint `(fw, fh)` stretched into `(dw, dh)` samples each destination pixel at its
center, with exact ties rounding down. All operands are non-negative integers, so the division truncates:

```ts
footprintX = Math.floor(((2 * dx + 1) * fw - 1) / (2 * dw));
footprintY = Math.floor(((2 * dy + 1) * fh - 1) / (2 * dh));
```

The footprint texel then maps back to a source texel through the orientation's texel remap.

- For `dw = fw` and for every integer scale (`dw = fw * scale`) this gives `floor(dx * fw / dw)`, so 1:1 and
  integer-scale output equal the plain block copy. Only uneven `Rect2i` stretches depend on the center rule.
- A GPU samples at pixel centers too, but in float32 an exact tie can land on either texel. The WebGPU path removes that
  risk without shader changes: shift both footprint-space UV edges by `-1 / (4 * dw)` texels on x (and `-1 / (4 * dh)`
  on y) before sending them through the orientation's point map. Every non-tie sample sits at least `1 / (2 * dw)`
  texels from a texel edge, so the shift moves ties down and leaves other samples on their texel.
- A float32 simulation of that shifted interpolation, using normalized UVs on a 1024-wide sheet, matched the formula on
  964,800 of 964,800 cases (source widths 1-48, destination widths 1-200). Center sampling without the shift missed
  7,466 of them. The simulation is not a GPU run: BT-269 must add a visual-regression case with uneven stretches on both
  backends.
- The 1:1 fast path keeps today's UV and blit math. Scaled and stretched quads use a separate emission path so 1:1
  vertices stay identical.

#### Color

The only recolor control is `paletteOffset`, on the fast path or inside params, never both and never stacked. There is
no `tint` field. Older sketches that used `Color32` / `ColorArg` as a 4th argument are stale.

#### Software-renderer parity

No accepted field degrades. The software blit is the pixel spec; WebGPU must match it. The 1:1 path stays today's
`blitIndexedRect` / UV quad emission.

| Field | Parity |
| --- | --- |
| `paletteOffset` | Already matched. Same validation as today. |
| `flags` | Pixel-exact source-index remap via the orientation table, then the same transparency and palette rules. Not a shader-only effect. |
| `pivot` | Pixel-exact integer move of the footprint origin. Components copied into the queued command. |
| `scale` / `dest: Rect2i` | Pixel-exact nearest-neighbor using the stretch sampling formula above, on both backends. |
| `rotation` | Not accepted. A future software path throws rather than skipping the rotation. |
| Frame name | Resolved to a `SpriteFrame`, then the same path. No separate software behavior. |
| Nine-slice | Not a sprite-params field. Own `BT.drawNineSlice(nineSlice, destRect, paletteOffset?)`, which inherits the stretch sampling formula. |

GPU note for implementers: the vertex shader already passes UVs through. Flags and scale are CPU-side corner and UV
writes into the existing 5-value vertex, with the orientation table choosing which source corner goes to which quad
corner. Do not add a flags uniform on the 1:1 path.

### Refreshing after a palette-layout swap

<Since symbol="BT.spritesRefresh" />

```ts twoslash
import { BT, Palette } from 'blit386';
const newLayoutPalette = Palette.vga();
// ---cut---
BT.paletteSet(newLayoutPalette);
BT.spritesRefresh(); // re-maps all tracked sheets to the new slot positions
```

<Callout type="warn" title="Layout swap only">

Call `spritesRefresh()` only after a palette-layout swap - when the same colors have moved to different slot indices. Do
NOT call it after a palette-value swap (when you changed what color a slot holds). In the value-swap case the fragment
shader picks up the new color automatically; calling `spritesRefresh()` is wasteful and will fail reindexing if original
RGBA values are gone.

</Callout>

## Text

### System font

<Since symbol="BT.systemPrint" />
<Since symbol="BT.systemPrintMeasure" />
<Since symbol="BT.systemFont" />

Built-in 6×14 monospace font covering printable ASCII (characters 32-126) plus a set of extra glyphs (dashes, accented
Latin punctuation, media icons, arrows, Greek capitals, and more) - see `scripts/system-font-extra-chars.mjs` for the
full list.

`BT.systemFont` returns the same `BitmapFont` instance `BT.systemPrint` draws with, as a live reference. Read
`codePoints` on it to see every Unicode code point it covers, or pass it to `BT.printFont` directly.

```ts twoslash
import { BT, Vector2i } from 'blit386';
const pos = new Vector2i(0, 0);
declare const paletteIndex: number;
declare const text: string;
// ---cut---
BT.systemPrint(pos, paletteIndex, text); // draw text at pos
BT.systemPrintMeasure(text); // → Vector2i (pixel width × height)
BT.systemFont.codePoints.length; // how many characters the system font covers
BT.systemFont.hasGlyph('é'); // test one character before drawing it
```

<DemoEmbed demo="004-fonts" title="BLIT386 fonts demo" />

### Bitmap fonts

<Since symbol="BT.printFont" />

Variable-width fonts from `.btfont` files. The font's sprite sheet must be indexized before use.

```ts twoslash
import { BitmapFont, BT, Vector2i } from 'blit386';
const pos = new Vector2i(0, 0);
declare const text: string;
declare const paletteOffset: number;
// ---cut---
const font = await BitmapFont.load('fonts/MyFont.btfont');
BT.printFont(font, pos, text);
BT.printFont(font, pos, text, paletteOffset); // palette-swap variant
```

See [Bitmap Fonts Guide](guide-bitmap-fonts.md) for the `.btfont` format spec and BMFont conversion.

## Post-process effects

Two-tier fullscreen effect pipeline - a pixel tier and a display tier - running between scene render and swap-chain
present, with a palette-resolve-and-upscale step bridging the two:

1. Pixel tier - operates on the logical `r8uint` framebuffer (one palette index per pixel). Effects here stay
   palette-native (chunky glitch, mosaic).
2. Palette resolve + upscale - `PaletteResolveUpscalePass` converts indices to RGBA through the active palette LUT and
   upscales to `drawingBufferSize`.
3. Display tier - operates on the RGBA output image. Hosts CRT scanlines, barrel distortion, bloom, etc. Requires
   `drawingBufferSize` in hardware settings.

Both chains add zero cost when empty.

<Callout type="warn" title="WebGPU only">

Post-process is unsupported by the Canvas 2D software backend - calling `effectAdd` in software mode throws a clear
error. Gate effect registration on `BT.activeBackend === 'webgpu'`.

</Callout>

<Since symbol="BT.effectAdd" />
<Since symbol="BT.effectRemove" />
<Since symbol="BT.effectClear" />
<Since symbol="BT.preset" />
<Since symbol="crtPipBoy" />
<Since symbol="amber" />
<Since symbol="green" />

```ts twoslash
import { BT, BarrelDistortion, Scanlines, Bloom, PixelGlitch, type Effect } from 'blit386';
declare const effect: Effect;
// ---cut---
// Add effect - routed to pixel or display chain by Effect.tier automatically
BT.effectAdd(new BarrelDistortion());
BT.effectAdd(new Scanlines());
BT.effectAdd(new Bloom());
BT.effectAdd(new PixelGlitch()); // pixel-tier effect

// Remove or clear
BT.effectRemove(effect); // remove one; no-op if not found
BT.effectClear(); // remove all from both chains

// One-line presets (return arrays of Effect)
for (const fx of BT.preset.crtPipBoy()) BT.effectAdd(fx);
for (const fx of BT.preset.amber()) BT.effectAdd(fx);
for (const fx of BT.preset.green()) BT.effectAdd(fx);

// Equivalent standalone imports also work:
import { crtPipBoy, amber, green } from 'blit386';
for (const fx of crtPipBoy()) BT.effectAdd(fx);
```

<DemoEmbed demo="023-crt-pipboy" title="BLIT386 PipBoy CRT demo" />

Built-in effects:

| Tier | Classes |
| --- | --- |
| Pixel | `PixelGlitch`, `PixelMosaic` |
| Display | `BarrelDistortion`, `Scanlines`, `RGBMask`, `Vignette`, `ChromaticAberration`, `Flicker`, `RollLine`, `Interference`, `Noise`, `Bloom` |

All effect classes are exported from `'blit386'`. Each instance owns its own GPU resources and may be mutated each frame
from demo code.

See [Post-Process Effects Guide](guide-post-process-effects.md) for parameter reference, the `Effect` interface,
`EffectTier`, the `FullscreenEffect` base class, and how to write a custom effect.

## Frame capture

<Since symbol="BT.captureFrame" />
<Since symbol="BT.downloadFrame" />
<Since symbol="FrameCaptureOptions" />
<Since symbol="FrameCaptureSize" />

Capture the current rendered frame as a PNG.

```ts twoslash
import { BT } from 'blit386';
// ---cut---
// Resolves after the next render pass completes
const blob = await BT.captureFrame();
const url = URL.createObjectURL(blob);

// Convenience: capture and trigger a browser download
await BT.downloadFrame();
await BT.downloadFrame('screenshot-001.png'); // custom filename

// Exact game pixels: one PNG pixel per logical pixel, at BT.displaySize
const exact = await BT.captureFrame({ size: 'display' });
await BT.downloadFrame('exact.png', { size: 'display' });
```

### Which size?

`FrameCaptureOptions.size` picks the resolution, and with it what the PNG contains:

| `size` | PNG dimensions | Contains | Use for |
| --- | --- | --- | --- |
| `'output'` (default) | `BT.outputSize` (`drawingBufferSize ?? displaySize`) | Upscaled frame plus display-tier post-process effects (scanlines, vignette, bloom, ...) | What the player sees: screenshot buttons, sharing |
| `'display'` | `BT.displaySize` | Logical frame resolved straight from the palette-indexed scene buffer: no upscale, no display-tier effects (pixel-tier effects such as `PixelGlitch` are included) | Tests, agents, image diffs, pixel art export |

A game with no `configure()` inherits the default `640×480` drawing buffer for a `320×240` logical display, so
`BT.captureFrame()` returns a `640×480` PNG where every game pixel is a 2×2 block. `{ size: 'display' }` returns the
`320×240` original. Neither size is affected by how the browser scales the canvas on screen.

The display-size capture has its own pending slot on the renderer, separate from the F9 / Shift+F9 dev shortcuts, so an
agent's capture and a keypress in the same frame both resolve. Two `{ size: 'display' }` requests in the same frame
still reject the earlier one, as two `BT.captureFrame()` calls always have.

<DemoEmbed demo="013-image-output" title="BLIT386 image output demo" />

<Callout title="Internal implementation note">

`BT.captureFrame()` uses the internal `FrameCapture` class (`src/utils/FrameCapture.ts`), which is not exported from
`'blit386'`. Demos should use `BT.captureFrame()` and `BT.downloadFrame()` only.

</Callout>

The F9 / Shift+F9 dev-mode capture shortcuts use the same logical-size path as `{ size: 'display' }`, from their own
pending slot - see the resolution model in [Core](api-core.md#resolution-model) for details.

## API history

<ApiAvailability page="api/rendering" />

<PageChangelog page="api/rendering" />

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, camera, core types.</Card>
  <Card title="API: Palette" href="/docs/api/palette">Palette setup, presets, effects.</Card>
  <Card title="Palette Guide" href="/docs/guides/palette">Palette-first workflow and offset patterns.</Card>
  <Card title="API: Assets" href="/docs/api/assets">Sprite sheets, bitmap fonts, asset loading.</Card>
  <Card title="Post-Process Effects" href="/docs/guides/post-process-effects">Effect chain, custom effects.</Card>
  <Card title="Bitmap Fonts" href="/docs/guides/bitmap-fonts">.btfont format, BMFont conversion.</Card>
  <Card title="Testing" href="/docs/reference/testing">Visual regression for rendering.</Card>
  <Card title="Performance Best Practices" href="/docs/performance/best-practices">Batching and draw-call performance.</Card>
</Cards>
