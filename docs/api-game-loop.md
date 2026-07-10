# Game Loop

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/game-loop, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Fixed-timestep simulation timing, tick counters, and the `Timer` helper.

<ApiAvailability page="api/game-loop" />

BLIT386 runs two independent cadences:

| Concept         | Where                                                      | Meaning                                                        |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Simulation rate | `targetFPS`, `BT.targetFPS`, `BT.deltaSeconds`, `BT.ticks` | Fixed `update()` step; game logic and `Timer` use ticks        |
| Render rate     | Overlay `Present: N FPS`                                   | Measured `requestAnimationFrame` cadence; `render()` runs here |

`render()` may run more or fewer times per second than `update()` (for example 120 Hz display with `targetFPS: 60`). Use
tick-based timing for gameplay; use overlay present FPS only to spot GPU or draw-call bottlenecks.

```ts twoslash
import { BT } from 'blit386';
// ---cut---
BT.deltaSeconds; // seconds per fixed tick (1 / BT.targetFPS)
BT.timeSeconds; // elapsed seconds since init (ticks × deltaSeconds)
BT.ticks; // current tick counter (increments each update)
BT.ticksReset(); // reset tick counter to 0
BT.assignTag('Round start'); // timing chart event tag at current tick (requires isOverlayTimingChartEnabled)
```

<Since symbol="BT.deltaSeconds" />
<Since symbol="BT.timeSeconds" />
<Since symbol="BT.ticks" />
<Since symbol="BT.ticksReset" />
<Since symbol="BT.assignTag" />

<DemoEmbed demo="009-animation" title="BLIT386 animation and timing demo" />

## Multiple update() steps per render frame

The fixed step runs through an accumulator: each render frame adds the elapsed wall-clock time to a running total, then
drains as many `updateInterval`-sized (`1000 / targetFPS`) chunks as fit, capped at 8 steps per frame to avoid a
spiral-of-death catch-up burst after a long pause (a backgrounded tab, a breakpoint, a slow asset load). Ordinarily that
accumulator drains exactly one chunk per render frame, so `update()` and `render()` alternate 1:1.

When `render()` falls behind `targetFPS` – a throttled background tab, a slow device, or a browser power-saving cap on
`requestAnimationFrame` – the accumulator has more than one `updateInterval` worth of time to drain before the next
render, so multiple `update()` calls run in a row ahead of that single `render()` call. Game logic still advances at the
correct rate (`BT.ticks` still increments once per fixed step, `BT.deltaSeconds` is unchanged); only the render cadence
drops. The engine overlay's frame-metrics row surfaces this as an `xN` suffix on `update()` – see
[Top row 3 (left)](api-overlay.md#top-row-3-left) in the Overlay API docs.

A concrete real-world trigger: macOS Low Power Mode makes Safari/WebKit halve its `requestAnimationFrame` dispatch rate
to about `30 Hz`, unrelated to script performance or display refresh rate. See
[Safari render throttling](api-browser-support.md#safari-render-throttling-macos-low-power-mode) in Browser Support for
the WebKit reference and why other engines are unaffected.

## Render frames with zero update() steps

The opposite direction happens too: on a high refresh-rate display (120 Hz or higher) with `targetFPS: 60`,
`requestAnimationFrame` calls `render()` more often than the accumulator drains a full `updateInterval` chunk, so a
sizeable fraction of render frames have zero preceding `update()` calls that frame. This is normal, not a dropped frame
– `BT.ticks` and any state written during the last `update()` (including the camera offset from `BT.cameraSet()`, see
[API: Camera](api-camera.md#camera-persists-across-zero-update-frames)) still reflect the last completed tick, so
`render()` draws the same game state twice in a row rather than resetting to defaults.

## Timer

<Since symbol="Timer" />

`Timer` counts fixed update ticks, not render frames. Intervals are in ticks; convert to seconds with
`intervalTicks / BT.targetFPS`. Use it in `update()` for periodic events: particle spawns, score ticks, palette swaps.

```ts twoslash
import { Timer } from 'blit386';
declare function spawnEnemy(): void;
// ---cut---
const spawn = new Timer(180); // every 180 ticks (3 s when BT.targetFPS === 60)

// Inside update():
if (spawn.fireIfElapsed()) {
  spawnEnemy();
}

// Additional API:
spawn.reset(); // restart interval from now
spawn.elapsedTicks(); // ticks since last fire/reset
spawn.remainingTicks(); // ticks until next fire
spawn.intervalTicks; // readonly interval size
```

`Timer.fireIfElapsed()` advances the internal baseline on each true return. Pass `BT.ticks` explicitly only when you
need a specific snapshot; the default is the engine tick counter.

<PageChangelog page="api/game-loop" />

## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, default configuration.</Card>
  <Card title="API: Overlay" href="/docs/api/overlay">Present FPS, timing chart, event tags.</Card>
  <Card title="API: Camera" href="/docs/api/camera">Global pixel offset for draw calls.</Card>
  <Card title="Browser Support" href="/docs/api/browser-support">Safari's Low Power Mode requestAnimationFrame throttling.</Card>
</Cards>
