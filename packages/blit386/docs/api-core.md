# Core

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/core, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Bootstrap, initialization, and default configuration.

The rest of the core API surface lives in dedicated pages: [Overlay](api-overlay.md) (HUD configure flags and style),
[Game Loop](api-game-loop.md) (tick timing, `Timer`, and the `BT.renderAlpha` render-interpolation factor),
[Camera](api-camera.md), [Easing](api-easing.md), [Core Types](api-core-types.md) (`Vector2i`, `Rect2i`, `Color32`),
[Audio](api-audio.md) (bus volume, mute, unlock state), and [Browser Support](api-browser-support.md).

<Callout title="Starting a new project?">
  The quickest path is the scaffolder: `npm create blit386@latest my-game` (works with npm, pnpm, yarn, or bun).
  It generates a ready-to-run Vite project with the engine installed, a starter game, and local docs.
  See [create-blit386](https://github.com/blit386/blit386/tree/main/packages/create-blit386). The rest of this page
  documents the `bootstrap()`
  API for hand-wired or existing projects.
</Callout>

## Bootstrap

<Since symbol="bootstrap" />
<Since symbol="BootstrapOptions" />

The `bootstrap()` function is the recommended entry point. It handles DOM ready, canvas lookup, backend selection
(WebGPU or software fallback), and error display automatically. It returns a `Promise<boolean>`: `true` on a successful
cold start or hot swap, `false` when init fails or a second call is rejected without a hot-reload context.

```ts twoslash
import { bootstrap, type IBTDemo, type BootstrapOptions } from 'blit386';
declare const MyDemo: new () => IBTDemo;
declare function trackError(err: Error): void;
// ---cut---
// One-liner – canvas id defaults to 'blit386-canvas', container to 'canvas-container'
const started = await bootstrap(MyDemo);

// With options
await bootstrap(MyDemo, {
  canvasID: 'my-canvas',
  containerID: 'error-wrapper',
  onSuccess: () => console.log('started'),
  onError: (err) => trackError(err),
  isWaitingForDOMReady: true, // default true; set false in Electron after DOMContentLoaded
  exposeGlobal: undefined, // default: BT.isDevMode – window.BT for console debugging
});
```

`BootstrapOptions` fields:

<TypeTable type={{
    canvasID: { type: 'string', default: "'blit386-canvas'", description: 'Canvas element id' },
    containerID: { type: 'string', default: "'canvas-container'", description: 'Container id for error display' },
    onSuccess: { type: '() => void', description: 'Called after successful init' },
    onError: { type: '(error: Error) => void', description: 'Called on any init failure' },
    isWaitingForDOMReady: { type: 'boolean', default: 'true', description: 'Wait for DOMContentLoaded' },
    exposeGlobal: { type: 'boolean', default: 'BT.isDevMode', description: 'Assign BT to window.BT for console debugging' },
  }} />

`exposeGlobal` lets you debug from the browser console (`window.BT.captureFrame()`). Unset, it follows `BT.isDevMode` –
on in development, off in a consumer's production build. Set `true` to force it on in release too, or `false` to disable
it even in development. The assignment only runs when a `window` is actually present, so importing the engine in Node or
another non-browser context never throws.

Manual utilities (for custom initialization flows):

<Since symbol="getCanvas" />
<Since symbol="displayError" />

```ts twoslash
import { displayError, getCanvas } from 'blit386';

const canvas = getCanvas('my-canvas'); // returns null on missing element
displayError('Init Failed', 'WebGPU unavailable.', 'my-container');
```

- `bootstrap()` applies canvas layout CSS custom properties via `CanvasLayoutStyles` (logical size, CSS cap, pixelated
  scaling). Custom hosts can reuse the same helper when not using `bootstrap()`.

### Hot reload

<Since symbol="registerHotReload" />
<Since symbol="HotContext" />
<Since symbol="HotReloadContext" />

Under a Vite dev server with the `blit386/vite` plugin installed, calling `bootstrap()` again after the engine is
already initialized – exactly what happens on every hot-reloaded save – routes to a hot swap instead of starting a
second, unstoppable game loop. `registerHotReload(hot)` registers the active `import.meta.hot` context so the engine
knows a swap is possible; the plugin injects the call to it automatically into the demo/game's entry module, so you
never call it by hand.

`HotContext` is the structural type for that `hot` argument: the subset of Vite's `import.meta.hot` the engine depends
on (`data`, `on`, `invalidate`, `accept`). It is kept structural on purpose so the published engine never imports from
the `vite` package.

Depending on what changed, the swap is a prototype-only method swap, a full re-init, or a full page reload – see
[Hot Reload](guide-hot-reload.md) for the three tiers with worked examples. `IBTDemo` has an optional
`onHotReload(context: HotReloadContext)` hook for reacting to a swap:

```ts twoslash
import { type IBTDemo, type HotReloadContext } from 'blit386';

class Demo implements IBTDemo {
  onHotReload(context: HotReloadContext): void {
    console.log(`hot reload #${context.generation} (${context.reason})`);
  }

  async init(): Promise<boolean> {
    return true;
  }

  update(): void {}
  render(): void {}
}
```

<TypeTable type={{
    reason: { type: "'methods' | 'reinit'", description: "Which swap tier ran: 'methods' swapped the prototype in place, 'reinit' re-ran init() on a fresh instance" },
    generation: { type: 'number', description: 'Hot-swap generation number, incremented on every successful swap since page load' },
    snapshot: { type: 'Record<string, unknown>', description: "Previous instance's own enumerable fields, captured just before init() ran on the new one. Present only when reason is 'reinit'" },
  }} />

`onHotReload` never fires for a hardware-settings change – that always triggers a full page reload instead. Without a
registered hot-reload context (no `blit386/vite` plugin, or a second `bootstrap()` call outside a Vite HMR session), a
second call while already initialized logs an error and returns `false`. That guard is new in 1.4.0; before then a
second call silently started another unstoppable `GameLoop`.

## Initialization

<Since symbol="BT.init" />

<DemoEmbed demo="001-basics" title="BLIT386 basics demo" />

```ts twoslash
import { BT, type IBTDemo } from 'blit386';
declare const demo: IBTDemo;
declare const canvas: HTMLCanvasElement;
// ---cut---
const ok = await BT.init(demo, canvas); // low-level init; prefer bootstrap()
BT.displaySize; // Vector2i – configured logical resolution (clone per read)
BT.drawingBufferSize; // Vector2i | null – output buffer when set in configure()
BT.outputSize; // Vector2i – effective drawing-buffer size (clone per read)
BT.targetFPS; // number – fixed update() rate (simulation), not measured present FPS
BT.requestedBackend; // 'webgpu' | 'software' | null – resolved request (see below)
BT.activeBackend; // 'webgpu' | 'software' | null – backend that actually started
BT.screenOrientation; // 'landscape-primary' | … | null – Screen Orientation API type
BT.loadingAssetsCount; // number – in-flight image + audio loads (see API: Assets)
```

- `BT.init()` selects WebGPU or falls back to the Canvas 2D software renderer automatically.
- When not using `bootstrap()`, set `canvas.tabIndex = 0` and call `canvas.focus()` so keyboard events reach the canvas.

### Resolution model

<Since symbol="BT.displaySize" />
<Since symbol="BT.drawingBufferSize" />
<Since symbol="BT.outputSize" />

BLIT386 tracks several related pixel dimensions. Public configure/getter names (`displaySize`, `drawingBufferSize`,
`maxCanvasSize`) map to the layers below; display-tier is a separate post-process term.

| Term | What it is | Configure field | `BT` getter |
| --- | --- | --- | --- |
| Logical | Game/simulation coordinate space; where `render()` draws palette-indexed pixels | `displaySize` | `BT.displaySize` |
| Drawing buffer | GPU/canvas backing-store resolution; upscale target and display-tier post-process resolution | `drawingBufferSize` | `BT.drawingBufferSize` |
| _(derived)_ | Effective drawing-buffer size (`drawingBufferSize` when set, otherwise logical 1:1) | – | `BT.outputSize` |
| CSS cap | Maximum on-screen canvas size in CSS pixels (layout scales to the viewport, not beyond this) | `maxCanvasSize` | _(no getter)_ |
| Effect tier | Post-process chain stage: pixel tier at logical resolution; display tier at drawing buffer | _(requires drawing buffer)_ | _(see post-process docs)_ |

Typical WebGPU flow at default `320×240` logical with `640×480` drawing buffer:

```text
render() @ logical (320×240)
  → pixel-tier effects @ logical
  → palette resolve + upscale @ drawing buffer (640×480)  ← BT.outputSize
  → display-tier effects @ drawing buffer
  → swap chain → browser scales canvas (up to CSS cap 960×720)
```

<Callout title="Which size for CRT?">

CRT-style effects (scanlines, barrel distortion, RGB mask, bloom) are display-tier. They run at the drawing buffer – use
`BT.outputSize`, not `BT.displaySize`. Set `drawingBufferSize` larger than `displaySize` (for example `320×240` logical
and `1280×960` buffer) so curvature and scanlines are not quantized onto the logical pixel grid. Display-tier
registration throws when `drawingBufferSize` is unset. Pixel-native effects (`PixelGlitch`, `PixelMosaic`) are
pixel-tier and run at `BT.displaySize` (logical).

</Callout>

<Callout title="What is `BT.outputSize`?">

The effective drawing-buffer width and height in pixels: `drawingBufferSize ?? displaySize`. Palette resolve/upscale and
the display-tier chain both operate at this size. When `drawingBufferSize` is omitted, logical and drawing buffer match
(1:1). Each read returns a clone. There is no `HardwareSettings.outputSize` field – only the runtime getter.

See [Post-Process Effects](guide-post-process-effects.md) for tier routing and presets.

</Callout>

### Hardware settings

<Since symbol="HardwareSettings" />

Resolved after `configure()`; the hook may return a partial object.

- `configure()` may return only the fields you want to override.
- The engine merges them with `defaultConfig()` via `mergeHardwareSettings()` (also exported).
- Omit `displaySize` to inherit the full default resolution and `640×480` output buffer.
- Include `displaySize` when you want a custom logical size; optional fields you omit then stay unset (for example no
  `drawingBufferSize` means a 1:1 drawing buffer).

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `displaySize` | `Vector2i` | `320×240` | Logical render resolution |
| `drawingBufferSize` | `Vector2i` | `640×480` | Drawing buffer size; enables display-tier effects when set |
| `maxCanvasSize` | `Vector2i` | `960×720` | CSS cap – maximum on-screen canvas size |
| `targetFPS` | `number` | `60` | Fixed `update()` rate (simulation ticks per second) |
| `backend` | `'webgpu' \| 'software'` | `'webgpu'` | Force rendering backend |
| `audioVoices` | `number` | `16` | Max simultaneous SFX voices, `1`-`64`; sizes the fixed SFX voice pool (when full, a new sound steals an eligible voice, or is dropped when no eligible voice exists) |
| `outputUpscaleFilter` | `'nearest' \| 'linear'` | `'nearest'` | Upscale filter |
| `isDetectingDroppedFrames` | `boolean` | `false` | Log a console warning on missed vsync |
| `isCapturingPointerScroll` | `boolean` | `false` | Opt into canvas wheel `preventDefault` and `BT.pointerScrollDelta`; also gates `touch-action` (`none` when capturing, `pan-y` otherwise) so touch tap-hold-scroll follows the same opt-in (page scrolls over the canvas when off). The overlay palette band can also force capture (and `touch-action: none`) while a pointer is over it, even when this flag is `false` |
| `isCapturingKeyboardScroll` | `boolean` | `false` | Opt into canvas `keydown` `preventDefault` for arrow keys, Space, PageUp/PageDown, Home, and End (page scrolls when off) |
| `isWakeLockEnabled` | `boolean` | `false` | Request a screen wake lock after init to prevent mobile screen dimming/locking during gameplay (silent no-op if unsupported) |
| `preferredOrientation` | `PreferredOrientation` | `'any'` | Attempt `screen.orientation.lock()` after init (`'landscape'` / `'portrait'`); `'any'` skips the lock (silent no-op if unsupported) |
| `isSplashEnabled` | `boolean` | _unset_ | Play the BLIT386 splash before the game starts. Unset means shown in release builds, hidden in development. See [the splash guide](guide-splash.md) |
| `splashColorDark` | `Color32` | `Color32.black` | Dark endpoint of the splash's 16-step gray ramp |
| `splashColorLight` | `Color32` | `Color32.white` | Light endpoint of the splash's 16-step gray ramp |
| `isOverlayEnabled` | `boolean` | `true` | Engine overlay HUD after each `render()` |
| `isOverlayVisibleAtStart` | `boolean` | `false` | Show overlay body (metrics/palette/custom rows) on first frame |
| `isOverlayToggleHintVisible` | `boolean` | `true` | Draw toggle hint icon while overlay body is hidden |
| `isOverlayToggleEnabled` | `boolean` | `true` | Enable Backquote and bottom-left corner toggle input |
| `isOverlayToggleHitDebugVisible` | `boolean` | `false` | Draw a 1 px outline of the bottom-left `17×13` toggle hit region (for hit-zone tuning) |
| `isOverlayPaletteEnabled` | `boolean` | `false` | Live palette swatch grid in the overlay bottom band (opt-in) |
| `overlayPaletteColumns` | `number` | _unset_ | Max palette swatches per grid row (default: widest fit) |
| `overlayPaletteRowsVisible` | `number` | _unset_ | Max visible palette grid rows (default: all rows; band height capped) |
| `overlayStyle` | `OverlayStyle` | _unset_ | Optional bar/text/gap palette indices for overlay |
| `isOverlayTimingChartEnabled` | `boolean` | `false` | Scrolling update/render timing chart between title and metrics rows |
| `overlayTimingChartHeight` | `number` | `22` | Timing chart band height in pixels when the chart is enabled |
| `overlayTimingChartStyle` | `OverlayTimingChartStyle` | _unset_ | Optional timing chart palette indices (defaults to overlay bar/text) |
| `overlayTimingChartDiagnostics` | `false \| 'minimal' \| 'rich'` | _unset_ | Renderer diagnostic visualization on the timing chart (`'minimal'` when chart enabled and omitted) |
| `isOverlayRendererDiagnosticsBarEnabled` | `boolean` | `false` | Optional GPU diagnostics text row below frame timing metrics |
| `isOverlayAudioMetersEnabled` | `boolean` | `false` | Per-bus level bars and voices/steal/drop text readout band |
| `overlayAudioMeterHeight` | `number` | `13` | Audio meter band height in pixels when audio meters are enabled |
| `overlayAudioMeterStyle` | `OverlayAudioMeterStyle` | _unset_ | Optional audio meter palette indices (defaults to overlay text/gap) |

- `displaySize`, `drawingBufferSize`, and `maxCanvasSize` must be positive whole-number pixel dimensions.
- Each size is capped at `8192×8192` per axis and `16,777,216` total pixels (`4096×4096`).
- Invalid sizes make initialization fail before the engine applies canvas layout, sets canvas backing dimensions, or
  allocates renderer buffers.
- `BT.init()` returns `false` and logs a specific `[BT]` message to the browser console (press F12); the on-canvas
  bootstrap error stays a generic init failure message.
- In WebGPU mode, the requested logical and output sizes must also fit the active adapter/device `maxTextureDimension2D`
  limit.
- GPU limit failures do not fall back to the software renderer.

The overlay-related fields above (`isOverlay*`, `overlay*`) are documented in detail in [Overlay](api-overlay.md).

### Getters vs. configuration fields

<Since symbol="BT.targetFPS" />

| Kind | `BT` getter | `HardwareSettings` field |
| --- | --- | --- |
| Mirror | `displaySize`, `drawingBufferSize`, `targetFPS` | same names |
| Mirror | `requestedBackend` | `backend` |
| Derived | `outputSize` (`drawingBufferSize ?? displaySize`) | _(none)_ |

- `activeBackend` is runtime state (what actually started; may differ from `requestedBackend` after WebGPU fallback).
  See [Resolution model](#resolution-model) for drawing-buffer vocabulary.
- `isAudioUnlocked` is runtime state too: `false` until a user gesture resumes the audio context, `true` for the rest of
  the session afterward. See [API: Audio](api-audio.md#unlock-state).
- `screenOrientation` is runtime state from the Screen Orientation API (`null` when unavailable). See
  [Screen orientation](api-browser-support.md#screen-orientation).
- `isReducedMotionPreferred` is runtime state too: resolves `prefers-reduced-motion` (or a `?reducedmotion` /
  `?noreducedmotion` URL override). See [Reduced motion](#reduced-motion).
- `BT.random` is runtime state too: a live, always-present `Random` instance (time-seeded at engine start). Reseed with
  `BT.randomSeed(seed)` for reproducible runs. See [API: Random](api-random.md#engine-default-btrandom).

### Screen orientation

<Since symbol="BT.screenOrientation" />
<Since symbol="PreferredOrientation" />

`BT.screenOrientation` reads the current `screen.orientation.type` string (for example `'landscape-primary'` or
`'portrait-secondary'`), or `null` when the API is missing. After a successful `init()`, the engine also:

- Listens for orientation `change` and calls optional `IBTDemo.onOrientationChange(type)` when the demo implements it.
- Attempts `screen.orientation.lock()` when `HardwareSettings.preferredOrientation` is `'landscape'` or `'portrait'`
  (default `'any'` skips the lock). Lock failures are silent no-ops and never fail `init()`.

Showing a "please rotate your device" prompt is a demo concern – the engine only supplies the getter, the change hook,
and the optional lock. Browser support details live in [Screen orientation](api-browser-support.md#screen-orientation).

```ts twoslash
import { BT, type HardwareSettings, type IBTDemo } from 'blit386';

class Demo implements IBTDemo {
  configure(): Partial<HardwareSettings> {
    return { preferredOrientation: 'landscape' };
  }

  onOrientationChange(type: string): void {
    console.log('orientation:', type, BT.screenOrientation);
  }

  async init(): Promise<boolean> {
    return true;
  }

  update(): void {}

  render(): void {}
}
```

### Reduced motion

<Since symbol="BT.isReducedMotionPreferred" />
<Since symbol="IBTDemo.onReducedMotionChange" />

`BT.isReducedMotionPreferred` reads the browser's `prefers-reduced-motion` setting. After a successful `init()`, the
engine also listens for changes and calls optional `IBTDemo.onReducedMotionChange(prefersReduced)` when the demo
implements it – the preference can change while your game is running, the same way orientation can.

Reducing your own animation fidelity, screen-shake, or particle counts is a demo concern – the engine only supplies the
getter and the change hook. The built-in splash does respect it; see
[The splash and reduced motion](guide-splash.md#reduced-motion).

```ts twoslash
import { BT, type HardwareSettings, type IBTDemo } from 'blit386';

class Demo implements IBTDemo {
  onReducedMotionChange(prefersReduced: boolean): void {
    console.log('reduced motion:', prefersReduced, BT.isReducedMotionPreferred);
  }

  async init(): Promise<boolean> {
    return true;
  }

  update(): void {}

  render(): void {}
}
```

`?reducedmotion` and `?noreducedmotion` are valueless URL flags for testing either state without changing OS settings or
devtools media emulation; `?noreducedmotion` wins when both are present.

### Requested vs. active backend

<Since symbol="BT.requestedBackend" />
<Since symbol="BT.activeBackend" />

Two getters disambiguate what you asked for from what is running:

| Getter | When set | Meaning |
| --- | --- | --- |
| `BT.requestedBackend` | After hardware settings load (`configure()` merge + URL override), before or after renderer init | Backend the engine will try / tried to start (`'webgpu'` default when omitted) |
| `BT.activeBackend` | After successful renderer init only | Backend that actually started (`null` before init or on init failure) |

`configure().backend` and `BT.requestedBackend` both describe the request, but only the getter reflects post-merge
resolution:

- `demo.configure()` may return a partial object; the engine merges it with `defaultConfig()`.
- `?backend=software` mutates the resolved `HardwareSettings.backend` before `initRenderer()` runs (during
  `loadHardwareSettings()`). A page opened as `/demos/023-crt-pipboy.html?backend=software` therefore reports
  `BT.requestedBackend === 'software'` even when `configure()` asked for WebGPU.

Fallback: When `requestedBackend` is `'webgpu'` (explicit or default) and WebGPU init fails, the engine logs a warning
and starts the software renderer. Then `activeBackend === 'software'` while `requestedBackend` stays `'webgpu'`.

The WebGPU renderer module is loaded lazily during init (only after a successful adapter/device setup). Browsers without
WebGPU globals (for example Firefox on Linux without Nightly) can therefore start the software backend or auto-fallback
without hitting module-load errors from WebGPU-only code.

### Runtime checks (post-process, capture, etc.)

Use `activeBackend`, not `requestedBackend`:

```ts twoslash
import { BT } from 'blit386';
// ---cut---
// Correct: gate on the backend that actually started; BT.effectAdd takes one effect
if (BT.activeBackend === 'webgpu') {
  for (const fx of BT.preset.crtPipBoy()) {
    BT.effectAdd(fx);
  }
}

// Misleading after fallback: requestedBackend may still be 'webgpu'
if (BT.requestedBackend === 'webgpu') {
  for (const fx of BT.preset.crtPipBoy()) {
    BT.effectAdd(fx); // throws once activeBackend is software
  }
}
```

Forcing software up front avoids the fallback path entirely:

```ts twoslash
import { type HardwareSettings } from 'blit386';
// ---cut---
function configure(): Partial<HardwareSettings> {
  return { backend: 'software' /* ... */ };
}
// requestedBackend === activeBackend === 'software' after init
```

### Dev vs. release mode

<Since symbol="BT.isDevMode" />

`BT.isDevMode` answers one question: is this a development build. Games and demos can gate debug HUDs, cheat keys,
verbose logging, or test fixtures on it instead of inventing a build-mode signal of their own.

```ts twoslash
import { BT, type IBTDemo } from 'blit386';

class Demo implements IBTDemo {
  async init(): Promise<boolean> {
    return true;
  }

  update(): void {
    if (BT.isDevMode) {
      console.log('dev build – verbose logging enabled');
    }
  }

  render(): void {}
}
```

Resolution order, first match wins:

1. `globalThis.__BLIT386_DEV__`, set at runtime by the
   [`blit386/vite` plugin](guide-hot-reload.md#the-blit386vite-plugin)'s injected snippet. A runtime assignment, not a
   bundler define, so it works regardless of how the engine itself was built or bundled.
2. A live Vite HMR context, as a late fallback (see [Hot Reload](guide-hot-reload.md)).
3. Otherwise, release.

The underlying resolver also accepts an explicit override that always wins over both signals above; nothing in the
public `BT` surface offers one today, so this only matters if you call the internal resolver directly.

Neither `import.meta.env.DEV` nor a bundler `define` can back this getter: the engine ships both ESM and CJS builds and
is pre-built into `dist` before a consumer's bundler ever sees it, so a define declared in the consumer's config does
not reliably reach a pre-bundled dependency.

<Callout title="This is DX gating, not DRM">

Any consumer can flip `globalThis.__BLIT386_DEV__` by hand. `BT.isDevMode` exists to make ordinary dev-vs-release
decisions easy, not to make release builds tamper-proof.

</Callout>

<Callout type="warn" title="Read it from update()/render(), not module scope">

The `blit386/vite` plugin's snippet is appended after the rest of the entry module, so it runs after that module's own
top-level code but before `update()`/`render()` ever run. A module-scope `BT.isDevMode` read (for example a
`const isDev = BT.isDevMode;` at the top of a file the entry module imports) can observe `false` even in a dev build.
Read it inside a lifecycle method instead.

</Callout>

A consumer who skips the `blit386/vite` plugin reads as release everywhere the plugin's marker would otherwise apply –
see [The `blit386/vite` plugin](guide-hot-reload.md#the-blit386vite-plugin) for what installing it actually does.

### Splash state

<Since symbol="BT.isSplashVisible" />

`BT.isSplashVisible` is the one-term query game code should use: `true` while the BLIT386 splash is on screen, `false`
otherwise. The useful thing it buys an `init()` is knowing that something is covering for it, so slow optional work can
happen while the splash holds rather than after the first frame.

```ts twoslash
import { BT } from 'blit386';

declare function preloadOptionalAssets(): Promise<void>;
// ---cut---
async function init(): Promise<boolean> {
  if (BT.isSplashVisible) {
    // Something is covering for us – use the time to preload extras.
    await preloadOptionalAssets();
  }

  return true;
}
```

<Since symbol="BT.splashState" />

`BT.splashState` is the raw lifecycle state: `'disabled' | 'fadingIn' | 'shown' | 'fadingOut' | 'done'`. Both terminal
values mean the same thing to a consumer – not on screen, never will be again – so code written as
`state !== 'disabled' && state !== 'done'` is really asking `isSplashVisible`. Reach for the raw state only when the
distinction genuinely matters, such as debugging or the engine overlay.

Which states game code can actually see depends on whether the splash is playing. With it disabled, `'disabled'` is the
only value it will ever read. With it enabled, an `init()` observes `'fadingIn'` and – if it stays alive long enough,
which an `await` makes easy – `'shown'`; its first `update()` after handoff reads `'done'`. `'fadingOut'` is engine
internal: `update()` and `render()` are suspended for the splash's whole duration, so nothing outside the engine runs
while it is the current state.

One error-handling note: ordinary initialization failures make `BT.init()` resolve to `false`, but a splash frame that
throws rejects the returned promise instead – nothing else can settle it, and reporting `false` would hide a renderer
fault. `bootstrap()` catches it and routes it to `onError` like any other init error.

Full behavior – the three gating layers, the loading-screen hold, the palette handoff, and the swallowed skip – is in
[the splash guide](guide-splash.md).

## Default configuration

<Since symbol="defaultConfig" />
<Since symbol="mergeHardwareSettings" />

Import `mergeHardwareSettings` when building custom configure flows outside `bootstrap()` – it merges its argument with
`defaultConfig()` internally, so a partial override is enough to get a full settings object back:

```ts twoslash
import { mergeHardwareSettings } from 'blit386';

const settings = mergeHardwareSettings({ targetFPS: 30 });
```

`defaultConfig()` returns a full `HardwareSettings` object (`320×240` logical, `640×480` drawing buffer, overlay
enabled, WebGPU backend, `16` SFX voices, and other defaults documented in the table above).

## Putting it together

<DemoEmbed demo="014-game-scene" title="BLIT386 game scene capstone demo" />

## API history

<ApiAvailability page="api/core" />

<PageChangelog page="api/core" />

## See also

<Cards>
  <Card title="API: Overlay" href="/docs/api/overlay">Engine HUD configure flags, style objects, layout math.</Card>
  <Card title="API: Game Loop" href="/docs/api/game-loop">Tick timing, present FPS, Timer.</Card>
  <Card title="API: Camera" href="/docs/api/camera">Global pixel offset for draw calls.</Card>
  <Card title="API: Easing" href="/docs/api/easing">Named easing curves for palette fades.</Card>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i, Rect2i, Color32.</Card>
  <Card title="API: Browser Support" href="/docs/api/browser-support">WebGPU support matrix and fallback.</Card>
  <Card title="API: Rendering" href="/docs/api/rendering">Primitives, sprites, text, post-process, frame capture.</Card>
  <Card title="API: Palette" href="/docs/api/palette">Palette setup, presets, effects.</Card>
  <Card title="API: Assets" href="/docs/api/assets">Sprite sheets, bitmap fonts, asset loading.</Card>
  <Card title="API: Audio" href="/docs/api/audio">Bus volume, mute, and the unlock getter.</Card>
  <Card title="Overlay Guide" href="/docs/guides/overlay">Engine HUD subsystem, toggle, layout.</Card>
  <Card title="Post-Process Effects" href="/docs/guides/post-process-effects">Effect chain and tiers.</Card>
  <Card title="Hot Reload Guide" href="/docs/guides/hot-reload">Swap tiers, onHotReload, asset hot-replace, blit386/vite.</Card>
  <Card title="Deprecation Timeline" href="/docs/reference/deprecations">Renamed configure flags and getters.</Card>
</Cards>
