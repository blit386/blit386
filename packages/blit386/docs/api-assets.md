# Assets

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/assets, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Sprite sheets, bitmap fonts, and asset loading.

Looking for audio assets? `AudioClip` loading is documented separately in [API: Audio](api-audio.md#loading).

## Asset size limits

Sprite sheets, font atlases, and raw indexed buffers share the same decoded-size policy as render configuration (`8192`
pixels per side, `16,777,216` total pixels). Limits are enforced before canvas readback, CPU buffer retention, GPU
texture creation, and software sprite loops.

| Limit | Default | Applies to |
| --- | --- | --- |
| Max width / height | `8192` | Decoded PNGs, font atlas textures, `fromIndexedPixels()` |
| Max total pixels | `16,777,216` (`4096 × 4096`) | Same sources |
| Max `.btfont` JSON size | `1,048,576` bytes (`1 MiB`) | `BitmapFont.load()` before `JSON.parse()` |
| Max embedded texture payload | `524,288` bytes (`512 KiB`) | Base64 data in `texture` when using `data:image/png;base64,...` |
| Max glyph count | `8192` | Glyph map entries in a `.btfont` file |
| Max software blit area | `16,777,216` pixels | Software renderer source rectangles (clipped to the sheet first) |

<Callout title="What happens on overflow">

When a limit is exceeded, loading throws an `AssetLimitError` with a beginner-friendly message. The software renderer
skips sprite blits whose source rectangle is empty, non-integer, fully outside the sheet, or still too large after
clipping.

</Callout>

- `.btfont` files may reference either a relative PNG path or an embedded PNG data URI.
- Embedded textures must use `data:image/png;base64,...` and stay within the embedded payload cap above.
- Other `data:` schemes (for example JPEG) are rejected before image decode.
- Decoded atlas dimensions use the same width, height, and pixel-area limits as sprite sheets.
- Prefer separate PNG files for large atlases so the JSON payload stays under the JSON size limit.

## Loading assets

<Since symbol="AssetLoader" />

`AssetLoader` caches images by URL so repeated loads share the same `HTMLImageElement`. Oversized images are rejected as
soon as the browser reports decoded dimensions.

```ts twoslash
import { AssetLoader } from 'blit386';

// Load a single image (cached by URL)
const image = await AssetLoader.loadImage('sprites.png');

// Load multiple images in parallel
const images = await AssetLoader.loadImages(['sprites.png', 'tiles.png']);

// Check cache before loading
if (AssetLoader.isLoaded('sprites.png')) {
  // already cached
}

// Drop a single URL's cache entry (manual reload or tests; blit386/vite watcher usually skips this)
AssetLoader.evict('sprites.png');

// Number of image loads currently in flight
AssetLoader.loadingCount;
```

`AssetLoader.evict()` is also the manual escape hatch for forcing a fresh load outside the `blit386/vite` plugin's
automatic asset watcher – see [Hot Reload](guide-hot-reload.md#asset-hot-replace-matrix).

<Since symbol="BT.loadingAssetsCount" />

For a loading-screen indicator that covers both images and audio clips, use `BT.loadingAssetsCount` - it sums
`AssetLoader.loadingCount` and `AudioClip.loadingCount` (see [API: Audio](api-audio.md#loading)) and drops back to `0`
once every in-flight load has settled:

```ts twoslash
import { BT } from 'blit386';
// ---cut---
if (BT.loadingAssetsCount > 0) {
  // show a spinner or progress bar
}
```

## Sprite setup – preferred path

<Since symbol="SpriteSheet" />
<Since symbol="IndexedSpriteLoadResult" />

Use `SpriteSheet.loadIndexed()` for all standard sprite setup. It combines color registration, image loading, and
palette indexization in one call.

```ts twoslash
import { BT, Palette, SpriteSheet, Vector2i } from 'blit386';

const palette = new Palette(256);

const indexed = await SpriteSheet.loadIndexed(
  'sprites/hero.png', // URL
  palette, // palette to populate
  10, // startSlot – first palette slot to write colors into
  { sort: 'luminance' }, // optional: color order in palette ('luminance' | 'none')
);

BT.paletteSet(palette); // activate AFTER loadIndexed returns

// Draw using the returned sheet and source rectangle:
BT.drawSprite(indexed.sheet, indexed.srcRect, new Vector2i(20, 20));

// indexed.colors – list of Color32 values registered into the palette
// indexed.srcRect – Rect2i spanning the full image
```

- Colors are sorted by perceived luminance (darkest-first) by default.
- Pass `{ sort: 'none' }` to preserve row-major scan order.
- Slot `0` is never touched – transparent pixels in the image map to slot 0 at draw time.

<DemoEmbed demo="008-sprites" title="BLIT386 sprites demo" />

## Sprite setup – manual path

Use this only when you need fine-grained control over the palette layout or want to load several sheets into the same
palette sequentially.

```ts twoslash
import { BT, Palette, SpriteSheet } from 'blit386';

const palette = new Palette(256);
```

<Steps>

<Step>

### Register colors into the palette

Each call appends the image's colors starting at the given slot; chain them with running offsets to pack several sheets
into one palette.

```ts twoslash
import { Palette, SpriteSheet } from 'blit386';
const palette = new Palette(256);
// ---cut---
const colors = await SpriteSheet.loadColorsIntoPalette('hero.png', palette, 10);
const tileColors = await SpriteSheet.loadColorsIntoPalette('tiles.png', palette, 10 + colors.length);
```

</Step>

<Step>

### Load the image into a sprite sheet

```ts twoslash
import { SpriteSheet } from 'blit386';
// ---cut---
const sheet = await SpriteSheet.load('hero.png');
```

</Step>

<Step>

### Convert RGBA pixels to palette indices

`indexize()` maps every pixel to its palette slot; activate the palette afterward.

```ts twoslash
import { BT, Palette, SpriteSheet } from 'blit386';
const palette = new Palette(256);
declare const sheet: SpriteSheet;
// ---cut---
sheet.indexize(palette);
BT.paletteSet(palette);
```

</Step>

</Steps>

To create a sheet from raw palette-indexed pixel data (advanced / test use):

```ts twoslash
import { SpriteSheet } from 'blit386';
declare const width: number;
declare const height: number;
declare const indexedPixels: Uint8Array<ArrayBuffer>;
// ---cut---
const sheet = SpriteSheet.fromIndexedPixels(width, height, indexedPixels);
```

## Palette offset

Pass a `paletteOffset` (per-draw shift, not an absolute slot) to `BT.drawSprite()` and `BT.printFont()` to remap stored
texel indices before palette lookup. Useful for team-color variations and damage flashes. Terminology and examples:
[Palette addressing](api-palette.md#palette-addressing). Draw semantics: [API: Rendering](api-rendering.md).

```ts twoslash
import { BT, Rect2i, SpriteSheet, Vector2i } from 'blit386';
declare const sheet: SpriteSheet;
const srcRect = new Rect2i(0, 0, 32, 32);
const pos = new Vector2i(0, 0);
// ---cut---
BT.drawSprite(sheet, srcRect, pos, 16); // render in "blue team" color range
```

## Bitmap fonts

<Since symbol="BitmapFont" />

Load `.btfont` files for proportional, palette-indexed bitmap fonts. After loading, register colors in the palette and
indexize the font's internal sprite sheet before drawing (same pattern as manual sprite setup).

```ts twoslash
import { BitmapFont, BT, Palette, Vector2i } from 'blit386';
declare const paletteOffset: number;
// ---cut---
const palette = new Palette(256);
const font = await BitmapFont.load('fonts/MyFont.btfont');
font.getSpriteSheet().indexize(palette);
BT.paletteSet(palette);

BT.printFont(font, new Vector2i(10, 10), 'Hello!');
BT.printFont(font, new Vector2i(10, 10), 'Hello!', paletteOffset); // per-draw index shift
```

- Font rendering goes through the same sprite pipeline as `BT.drawSprite()` and is auto-batched.
- SpriteSheet helpers (after indexize): `isIndexed()`, `getIndexedPixels()` (defensive copy), `getIndexedPixelsRef()`
  (no copy, for hot-path CPU blitting – do not mutate the returned array), `reindexize(palette)` when palette layout
  changes. `SpriteSheet.loadIndexed()` returns `IndexedSpriteLoadResult` (`{ sheet, srcRect, colors }`).
- See [Bitmap Fonts Guide](guide-bitmap-fonts.md) for the `.btfont` format specification and the BMFont conversion
  workflow (`pnpm run convert-font`).

<DemoEmbed demo="022-bitmap-font" title="BLIT386 bitmap font demo" />

## Hot-replacing assets

Under a Vite dev server with the `blit386/vite` plugin installed, editing a sprite sheet's source image or a `.btfont`
file under a watched asset directory (`public/` by default) updates the already-loaded asset in place – no page reload,
and demo-held references (a `SpriteSheet` or `BitmapFont` instance, or an `IndexedSpriteLoadResult.sheet`) stay valid. A
sprite sheet re-runs `indexize()` against the active palette when it was already indexized; a bitmap font rebuilds its
glyph tables and texture.

<Callout title="Demo-held srcRects and dimension changes">
  If the replacement image has different dimensions, the sheet's `size` updates to match, but any `Rect2i` a demo is
  holding onto as a `srcRect` into that sheet does not update itself – reconciling it is the demo's own
  responsibility. Keep sprite sheet dimensions stable during a hot-reload session, or recompute `srcRect`s from the
  sheet's current `width`/`height` when that matters.
</Callout>

Each `SpriteSheet` also exposes `status` (`'loading' | 'ready' | 'failed'`) and `progress` (`0` or `1`) tracking a
replacement fetch while it's in flight – useful for a per-sheet loading indicator, or combine with
[`BT.loadingAssetsCount`](#loading-assets) for a single engine-wide signal. A normally loaded sheet is always `'ready'`
with `progress: 1.0`, since its image has already resolved by the time the sheet is constructed.

```ts twoslash
import { SpriteSheet } from 'blit386';
declare const sheet: SpriteSheet;
// ---cut---
sheet.status; // 'loading' | 'ready' | 'failed'
sheet.progress; // 0 while loading, 1.0 once ready
```

<Callout title="Coarse-grained progress">
  `progress` is `0` or `1.0`, never a value in between - `HTMLImageElement` reports no byte-level download progress the
  way `AudioClip`'s `onProgress` callback does (see [API: Audio](api-audio.md#loading)). Use `status`/`progress` to show
  or hide a loading indicator, not to drive a percentage bar.
</Callout>

See [Hot Reload](guide-hot-reload.md#asset-hot-replace-matrix) for the full asset type matrix, including audio and the
fallback-to-full-reload behavior for unrecognized file types.

## System font

A built-in 6×14 monospace font covering printable ASCII (characters 32–126). No load step needed.

```ts twoslash
import { BT, Vector2i } from 'blit386';
declare const paletteIndex: number;
// ---cut---
BT.systemPrint(new Vector2i(10, 10), paletteIndex, 'Score: 100');
BT.systemPrintMeasure('Score: 100'); // → Vector2i (pixel width, height)
```

- Use `BT.systemPrint()` for demo-specific HUD panels and labels. Call `palette.applyHUD()` at init so overlay and demo
  HUD share the same label/header/dim slot conventions – see [API: Palette](api-palette.md) and
  [Palette Presets – HUD](guide-palette-presets.md#hud-preset).
- The engine draws its own overlay (present FPS, target FPS, draw calls, frame/update()/render() timings, backend,
  resolution, demo title) after each `render()` when `isOverlayEnabled` is true; see [Overlay Guide](guide-overlay.md).
- For styled variable-width text, use a bitmap font instead.

## API history

<ApiAvailability page="api/assets" />

<PageChangelog page="api/assets" />

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, default configuration.</Card>
  <Card title="API: Rendering" href="/docs/api/rendering">Primitives, sprites, text, post-process.</Card>
  <Card title="API: Palette" href="/docs/api/palette">Palette setup, presets, effects.</Card>
  <Card title="Palette Guide" href="/docs/guides/palette">Palette-first setup, offsets, refresh.</Card>
  <Card title="Palette Presets" href="/docs/guides/palette-presets">Built-in preset reference.</Card>
  <Card title="Bitmap Fonts" href="/docs/guides/bitmap-fonts">.btfont format, BMFont conversion.</Card>
  <Card title="Hot Reload Guide" href="/docs/guides/hot-reload">Asset hot-replace matrix and srcRect caveats.</Card>
  <Card title="Overlay Guide" href="/docs/guides/overlay">System font for HUD text.</Card>
  <Card title="Testing" href="/docs/reference/testing">SpriteSheet and BitmapFont tests.</Card>
</Cards>
