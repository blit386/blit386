# Random

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/random, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Seeded, deterministic pseudo-random numbers for demos and games. The `Random` class uses a mulberry32 core so the same
seed always produces the same sequence across platforms.

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

## Generators

| Method                          | Range / behavior                                 |
| ------------------------------- | ------------------------------------------------ |
| `next()`                        | Float in `[0, 1)`                                |
| `float(min, max)`               | Float in `[min, max)`                            |
| `int(maxExclusive)`             | Integer in `[0, maxExclusive)`                   |
| `int(min, maxExclusive)`        | Integer in `[min, maxExclusive)`                 |
| `intInclusive(min, max)`        | Integer in `[min, max]`                          |
| `bool(probability?)`            | `true` with the given chance (default `0.5`)     |
| `sign()`                        | `-1` or `1`                                      |
| `pick(arr)`                     | One element from a non-empty array               |
| `shuffle(arr)`                  | New shuffled copy (Fisher-Yates)                 |
| `shuffleInPlace(arr)`           | Shuffle the array in place and return it         |
| `weighted(items, weights)`      | One item by relative non-negative weights        |
| `angle()`                       | Float in `[0, 2π)` radians                       |
| `gaussian(mean?, stddev?)`      | Approximate normal sample (Box-Muller, no spare) |
| `insideRect(rect)`              | Integer point in half-open `rect`                |
| `insideRectTo(rect, out)`       | Same as `insideRect`, writes into `out`          |
| `pointInRange(min, max)`        | Integer point; per-axis `[min, max)`             |
| `pointInRangeTo(min, max, out)` | Same as `pointInRange`, writes into `out`        |
| `direction4()`                  | One of four cardinal unit vectors (Y-down)       |
| `direction8()`                  | One of eight king-move unit vectors (Y-down)     |

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

| Method        | Behavior                                                            |
| ------------- | ------------------------------------------------------------------- |
| `seed(n)`     | Reseed; same `n` restarts the same sequence                         |
| `getState()`  | Current unsigned 32-bit state                                       |
| `setState(n)` | Restore a saved state                                               |
| `clone()`     | New instance with identical state (identical subsequent draws)      |
| `fork()`      | Advance this instance once; seed a child so the two streams diverge |

<PageChangelog page="api/random" />

## See also

<Cards>
  <Card title="API: Core Types" href="/docs/api/core-types">Vector2i, Rect2i, and Color32.</Card>
  <Card title="API: Audio" href="/docs/api/audio">Synth noise uses a related internal mulberry32 PRNG.</Card>
</Cards>
