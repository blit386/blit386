# Random

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at <https://blit386.dev/docs/guides/random>, typeset like
> an actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

The full surface – every `Random` method, the `BT.random` engine default, coordinate hashes, and the noise classes –
lives in [API: Random](api-random.md). This guide walks through the ideas behind it: why the engine stays deterministic,
how a seed reproduces a whole run, when to split off an independent stream, and how to build worlds from coordinates
instead of a sequence.

<ApiAvailability page="guides/random" />

## Deterministic by default

The engine core makes zero `Math.random()` calls, so a run only varies where you introduce randomness. `BT.random` is
the one shared generator the engine exposes: a live `Random` instance, time-seeded from `Date.now()` when the engine
singleton is created. Read from it and every run differs, as you would expect.

The payoff is control. Call `BT.randomSeed(seed)` once at startup and the whole run becomes reproducible – the same
enemy waves, the same loot, the same particle scatter, every time. That is what makes seeded runs worth having:
regression tests that assert exact frames, replays that reconstruct a session from its seed and inputs, and
daily-challenge games where every player faces the identical board.

```ts twoslash
import { BT } from 'blit386';

// Time-seeded: different every run.
BT.random.int(0, 100);

// Reseed once and the run is reproducible from here on.
BT.randomSeed(1234);
BT.random.int(0, 100); // same value on every run seeded with 1234
```

Prefer `BT.random` for demo and game code. Reach for a standalone `new Random(seed)` only when you need a stream that is
independent of the shared engine one – see [Independent streams](#independent-streams).

## Same seed, same world

A seeded generator is a pure function of its seed and how many times it has been drawn. Two generators seeded alike
produce identical sequences; reseeding rewinds to the start. That is the whole contract behind "same seed = same world".

```ts twoslash
import { Random } from 'blit386';

const a = new Random(42);
const b = new Random(42);

a.int(0, 1000) === b.int(0, 1000); // true – identical streams
a.pick(['fire', 'water', 'earth']) === b.pick(['fire', 'water', 'earth']); // true

a.seed(42); // rewind a to the beginning
a.int(0, 1000); // same first value as before
```

The order of draws is part of the state. Adding a `rng.bool()` call between two `rng.int()` calls shifts every value
that follows, so a saved seed only reproduces a world when the code that consumes it is unchanged. Keep seed-consuming
setup (level generation, spawn tables) in a stable order, and pull incidental effects (a cosmetic sparkle color) from a
separate stream so tweaking them never disturbs the layout.

## Independent streams

`clone()` and `fork()` both branch a generator, for opposite reasons.

`clone()` copies the state, so the copy replays the parent's exact upcoming sequence – useful to preview draws without
consuming them, or to snapshot before a speculative rollback. `fork()` advances the parent once and seeds a child from
that draw, so the two streams diverge – the way to give a subsystem its own randomness without coupling it to the shared
engine stream.

```ts twoslash
import { Random } from 'blit386';

const world = new Random(7);
const particles = world.fork(); // independent stream; advances `world` once

// Drawing particles never disturbs world generation, and vice versa.
particles.float(-1, 1);
world.int(0, 320);
```

`getState()` / `setState()` are the lower-level primitives underneath: read the 32-bit state, draw ahead, then restore
it to replay. A deterministic replay records the seed plus the inputs and lets the same draws fall out; a rollback
netcode step snapshots the state, simulates forward, and rewinds when a prediction proves wrong.

```ts twoslash
import { Random } from 'blit386';

const rng = new Random(99);
const checkpoint = rng.getState();

rng.int(0, 6);
rng.int(0, 6); // advance

rng.setState(checkpoint); // rewind and replay the same draws
```

## Procedural patterns from coordinates

A `Random` is a sequence: draw after draw, order matters. For a world you explore out of order – chunks that load as the
camera moves, a tile you query long before its neighbors – you want the opposite: ask "what belongs at `(x, y)`?" and
get a stable answer with no stored state per cell. That is coordinate hashing.

`hash2i(x, y, seed?)` returns the same unsigned 32-bit value for the same inputs, every call, from anywhere. `hash2`
gives the `[0, 1)` float form for probabilities. Nothing is remembered between calls, so a 10,000-tile map costs no
per-tile RNG.

```ts twoslash
import { hash2 } from 'blit386';

const WORLD_SEED = 9001;

// Deterministic 12% treasure chance per tile, queried in any order.
function hasChest(tileX: number, tileY: number): boolean {
  return hash2(tileX, tileY, WORLD_SEED) < 0.12;
}

hasChest(4, 2);
hasChest(4, 2); // identical – no state, safe to re-ask
```

Hashing gives independent per-cell values; for fields that vary smoothly – terrain height, cloud cover, organic drift –
use the noise classes. `ValueNoise`, `PerlinNoise`, and `SimplexNoise` sample continuous space in approximately
`[-1, 1]`, and their `fbm*` methods layer octaves for natural detail.

```ts twoslash
import { PerlinNoise } from 'blit386';

const terrain = new PerlinNoise(9001);

// Smooth height in [0, 1] across a chunk; scale x/y to set the feature size.
function heightAt(x: number, y: number): number {
  return (terrain.fbm2D(x * 0.05, y * 0.05) + 1) * 0.5;
}

heightAt(12, 30);
```

Seed the noise (or pass `0` for a fixed default world) the same way you seed `hash2i`, so a world's terrain and its
hashed spawns line up under one seed. The [API: Random](api-random.md#pattern-noise) page covers the full noise surface
and credits the Perlin and simplex references.

## Migrating from `Math.random()`

Hand-rolled `randInt` / `randFloat` / `randPick` helpers map straight onto integer-first `Random` methods, and gain
determinism for free:

| Hand-rolled | `Random` |
| --- | --- |
| `Math.floor(Math.random() * n)` | `rng.int(n)` |
| `min + Math.random() * (max - min)` | `rng.float(min, max)` |
| `arr[Math.floor(Math.random() * arr.length)]` | `rng.pick(arr)` |
| `Math.random() < p` | `rng.bool(p)` |

```ts twoslash
import { BT } from 'blit386';

// Before: BT.random gives the same ergonomics, but a seeded run is reproducible.
BT.random.int(150, 420);
BT.random.pick(['glitch', 'noise', 'static']);
BT.random.bool(0.25);
```

<PageChangelog page="guides/random" />

## See also

<Cards>
  <Card title="API: Random" href="/docs/api/random">Every Random method, BT.random, coordinate hashes, and the noise classes.</Card>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i and Rect2i, drawn at random with insideRect and pointInRange.</Card>
  <Card title="Game Loop Guide" href="/docs/guides/game-loop">Fixed-step timing – the other half of a reproducible run.</Card>
  <Card title="Performance Best Practices" href="/docs/performance/best-practices">The zero-allocation *To(out) variants for update() and render().</Card>
</Cards>
