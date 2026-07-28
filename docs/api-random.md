# Random

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/random, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Seeded, deterministic pseudo-random numbers for demos and games. The `Random` class uses a mulberry32 core so the same
seed always produces the same sequence across platforms. Stateless `hash1i` / `hash2i` / `hash3i` (and float forms) give
per-coordinate randomness for chunked worlds without storing an RNG per cell. `ValueNoise`, `PerlinNoise`, and
`SimplexNoise` add smooth pattern-based fields for terrain, clouds, and organic motion.

<ApiAvailability page="api/random" />

<Since symbol="Random" />

```ts twoslash
import { Random } from 'blit386';

const rng = new Random(1234);

rng.next(); // [0, 1)
rng.float(0, 10); // [0, 10)
rng.int(6); // [0, 6)
rng.int(10, 20); // [10, 20)
rng.intInclusive(1, 6); // [1, 6]
rng.bool(0.25); // true ~25% of the time
rng.sign(); // -1 or 1
rng.pick(['a', 'b', 'c']);
rng.shuffle([1, 2, 3, 4]);
rng.angle(); // [0, 2π) radians
rng.gaussian(0, 1); // Box-Muller sample
rng.direction4(); // cardinal unit vector
```

Omit the constructor seed to time-seed from `Date.now()` (lower 32 bits). Call `seed(n)` later to restart from a known
value.

## Engine default (`BT.random`)

<Since symbol="BT.random" />

<Since symbol="BT.randomSeed" />

The engine keeps one shared `Random` instance on the `BT` facade. `BT.random` is a live reference (same instance across
reads, like `BT.palette`). It is time-seeded when the engine singleton is created; call `BT.randomSeed(seed)` to make a
run reproducible.

```ts twoslash
import { BT } from 'blit386';

BT.randomSeed(42);
BT.random.int(150, 420);
BT.random.pick(['glitch', 'noise', 'static']);
BT.random.float(0.3, 0.95);
```

Prefer `BT.random` for demo and game code. Construct a separate `new Random(seed)` when you need an independent stream
(for example a local procedural subsystem that should not advance the shared engine RNG).

## Generators

| Method | Range / behavior |
| --- | --- |
| `next()` | Float in `[0, 1)` |
| `float(min, max)` | Float in `[min, max)` |
| `int(maxExclusive)` | Integer in `[0, maxExclusive)` |
| `int(min, maxExclusive)` | Integer in `[min, maxExclusive)` |
| `intInclusive(min, max)` | Integer in `[min, max]` |
| `bool(probability?)` | `true` with the given chance (default `0.5`) |
| `sign()` | `-1` or `1` |
| `pick(arr)` | One element from a non-empty array |
| `shuffle(arr)` | New shuffled copy (Fisher-Yates) |
| `shuffleInPlace(arr)` | Shuffle the array in place and return it |
| `weighted(items, weights)` | One item by relative non-negative weights |
| `angle()` | Float in `[0, 2π)` radians |
| `gaussian(mean?, stddev?)` | Approximate normal sample (Box-Muller, no spare) |
| `insideRect(rect)` | Integer point in half-open `rect` |
| `insideRectTo(rect, out)` | Same as `insideRect`, writes into `out` |
| `pointInRange(min, max)` | Integer point; per-axis `[min, max)` |
| `pointInRangeTo(min, max, out)` | Same as `pointInRange`, writes into `out` |
| `direction4()` | One of four cardinal unit vectors (Y-down) |
| `direction8()` | One of eight king-move unit vectors (Y-down) |

Integer helpers return true integers (`| 0` truncation), matching the engine's `Vector2i` philosophy. Half-open `int`
ranges match the demo helpers (`randInt` / `randFloat`).

## Spatial helpers

`insideRect` / `insideRectTo` sample the same half-open region as `Rect2i.isContaining`: `x` in `[rect.x, rect.right)`,
`y` in `[rect.y, rect.bottom)`. `pointInRange` / `pointInRangeTo` use `int` per axis (`[min.x, max.x)` and
`[min.y, max.y)`). Empty or inverted ranges throw the same `RangeError` as `int`. Prefer the `*To(out)` variants in
`update()` / `render()` loops to avoid per-frame allocation.

```ts twoslash
import { Random, Rect2i, Vector2i } from 'blit386';

const rng = new Random(7);
const rect = new Rect2i(0, 0, 320, 240);
const out = new Vector2i();

rng.insideRect(rect);
rng.insideRectTo(rect, out);
rng.pointInRange(new Vector2i(10, 10), new Vector2i(20, 30));
rng.direction4(); // (1,0) | (-1,0) | (0,1) | (0,-1)
rng.direction8(); // cardinals plus diagonals
```

## Coordinate hashing

Stateless spatial lookups for chunked and procedural worlds. Same coordinates and seed always return the same value - no
stored RNG state, so you do not need an instance per chunk. Complements `Random` (a sequence generator).

<Since symbol="hash1i" />

<Since symbol="hash2i" />

<Since symbol="hash3i" />

<Since symbol="hash1" />

<Since symbol="hash2" />

<Since symbol="hash3" />

| Function | Range |
| --- | --- |
| `hash1i(x, seed?)` | Unsigned 32-bit in `[0, 2^32)` |
| `hash2i(x, y, seed?)` | Unsigned 32-bit in `[0, 2^32)` |
| `hash3i(x, y, z, seed?)` | Unsigned 32-bit in `[0, 2^32)` |
| `hash1(x, seed?)` | Float in `[0, 1)` |
| `hash2(x, y, seed?)` | Float in `[0, 1)` |
| `hash3(x, y, z, seed?)` | Float in `[0, 1)` |

Coordinates are truncated toward zero with `| 0`. Omit `seed` (or pass `0`) for a fixed default world seed. Float forms
are the matching `hashNi` value scaled by `1 / 2^32`.

```ts twoslash
import { hash2, hash2i } from 'blit386';

const tile = hash2i(12, -3, 9001); // uint32, same every call
const chance = hash2(12, -3, 9001); // [0, 1)
const shouldSpawn = chance < 0.15;
```

## Pattern noise

Smooth, seedable spatial noise for terrain, clouds, organic motion, and procedural textures. Lattice corners use the
coordinate hashes above. Every sample is in approximately `[-1, 1]` (the same signed range as trig helpers). These
classes are distinct from the post-process `Noise` display effect (GPU grain).

<Since symbol="ValueNoise" />

<Since symbol="PerlinNoise" />

<Since symbol="SimplexNoise" />

| Class | Methods |
| --- | --- |
| `ValueNoise` | `noise1D` / `noise2D` / `noise3D`, `fbm1D` / `fbm2D` / `fbm3D` |
| `PerlinNoise` | Same surface as `ValueNoise` (gradient Perlin) |
| `SimplexNoise` | `noise2D` / `noise3D`, `fbm2D` / `fbm3D` (no 1D) |

Omit the constructor seed (or pass `0`) for a fixed default world seed - same convention as `hash2i`. Call `seed(n)` to
switch fields. fBm defaults: `octaves = 4`, `persistence = 0.5`, `lacunarity = 2`. Octave amplitudes are normalized so
fBm stays in approximately `[-1, 1]`.

```ts twoslash
import { PerlinNoise, SimplexNoise, ValueNoise } from 'blit386';

const value = new ValueNoise(9001);
const perlin = new PerlinNoise(9001);
const simplex = new SimplexNoise(9001);

value.noise2D(12.5, -3.25); // [-1, 1]
perlin.fbm2D(0.1, 0.2); // multi-octave, still ~[-1, 1]
simplex.noise3D(1, 2, 3);
```

Value noise interpolates hashed corner values (smooth but can look blocky at low frequency). Perlin uses lattice
gradients ([Ken Perlin, SIGGRAPH 2002](https://mrl.cs.nyu.edu/~perlin/paper445.pdf)). Simplex reduces directional
artifacts on square grids
([Stefan Gustavson](https://web.archive.org/web/20200929015611/http://weber.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf)).

## State and streams

```ts twoslash
import { Random } from 'blit386';

const rng = new Random(99);
rng.next();
rng.next();

const saved = rng.getState();
const clone = rng.clone(); // same stream from this point
const child = rng.fork(); // independent sub-stream; advances `rng` once

rng.setState(saved); // restore and replay
```

| Method | Behavior |
| --- | --- |
| `seed(n)` | Reseed; same `n` restarts the same sequence |
| `getState()` | Current unsigned 32-bit state |
| `setState(n)` | Restore a saved state |
| `clone()` | New instance with identical state (identical subsequent draws) |
| `fork()` | Advance this instance once; seed a child so the two streams diverge |

<PageChangelog page="api/random" />

## See also

<Cards>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i, Rect2i, and Color32.</Card>
  <Card title="API: Audio" href="/docs/api/audio">Synth noise uses a related internal mulberry32 PRNG.</Card>
</Cards>
