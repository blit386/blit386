---
name: use-noise
description:
  Generate terrain, caves, clouds, and procedural textures with the seedable noise classes (`ValueNoise`, `PerlinNoise`,
  `SimplexNoise`) and the coordinate hash functions (`hash2i`, `hash2`) from blit386 1.5.0+. Use for procedurally
  generated levels, infinite or chunked worlds, height maps, cave layouts, cloud and water patterns, or scattering
  decoration that must stay put between visits.
---

# Use noise

Noise and coordinate hashing answer the question "what is at this spot in the world" without storing a map. Same
coordinates and same seed always give the same answer, so a world can be enormous, generated on demand, and still
identical every time the player walks back.

## When to use

Use for terrain height, cave layouts, clouds, water, procedural textures, tile variation, or scattering trees and rocks
across a world larger than memory.

This is the opposite tool to the `use-random` skill. `BT.random` gives you the _next_ value in a sequence, so calling it
twice gives two different answers. Noise and hashing are _stateless lookups_ by coordinate – ask for tile `(12, -3)` a
thousand times and you get the same answer a thousand times.

(Not to be confused with the `Noise` post-process effect from the `add-crt-effect` skill – that one is a fullscreen
grain filter on the GPU, nothing to do with world generation.)

## Yes or no per tile: coordinate hashing

Use a hash when you want a hard, unrelated answer per coordinate – is there a tree here, which tile variant is this.

```js
import { hash2 } from 'blit386';

const WORLD_SEED = 9001;

hasTreeAt(tileX, tileY) {
    return hash2(tileX, tileY, WORLD_SEED) < 0.15; // 15% of tiles, always the same ones
}
```

| Function | Gives you |
| --- | --- |
| `hash1(x, seed?)`, `hash2(x, y, seed?)`, `hash3(x, y, z, seed?)` | A decimal from 0 up to (not including) 1 |
| `hash1i(x, seed?)`, `hash2i(x, y, seed?)`, `hash3i(x, y, z, seed?)` | A big whole number – good with `%` to pick a variant |

```js
import { hash2i } from 'blit386';

const variant = hash2i(tileX, tileY, WORLD_SEED) % 4; // 0..3, stable per tile
```

## Smooth landscapes: noise

Hashing is jagged – neighboring tiles are unrelated. Noise is smooth, so neighbors resemble each other, which is what
makes hills look like hills.

```js
import { PerlinNoise } from 'blit386';

// in init():
this.terrain = new PerlinNoise(9001);

// anywhere:
const height = this.terrain.noise2D(x * 0.05, y * 0.05); // about -1..1
```

The multiplier is the important part. Coordinates go in raw and neighboring whole numbers would land on completely
different values, so scale them down: **smaller multiplier means larger, smoother features**. Start at `0.05` and adjust
– `0.01` gives broad continents, `0.2` gives tight ripples.

Turning the result into something you can draw. Sample once into an array, then draw from that array every frame:

```js
import { PerlinNoise, Vector2i } from 'blit386';

// in init(): work out the ground height for every screen column, one time only
this.terrain = new PerlinNoise(9001);
this.groundY = [];
for (let x = 0; x < 320; x++) {
    const n = this.terrain.noise2D(x * 0.02, 0); // -1..1
    this.groundY.push(Math.floor(120 + n * 40)); // round: screen coordinates are whole numbers
}

// in init() as well: two reusable points, so render() allocates nothing
this.top = new Vector2i();
this.bottom = new Vector2i();

// in render(): just read the array back
render() {
    for (let x = 0; x < 320; x++) {
        this.top.set(x, this.groundY[x]);
        this.bottom.set(x, 239);
        BT.drawLine(this.top, this.bottom, COLOR_DIRT);
    }
}
```

### Which class

| Class | Use it for |
| --- | --- |
| `ValueNoise` | Cheapest. Fine for clouds and soft blobs; can look blocky at large scales |
| `PerlinNoise` | The usual choice for terrain and height maps |
| `SimplexNoise` | Fewer square-grid artifacts; `noise2D` / `noise3D` only, no 1D |

All three take a seed in the constructor (`new PerlinNoise(9001)`) and have a `seed(n)` method to switch worlds later.
All return roughly `-1` to `1`.

### More detail with fbm

One noise call gives smooth rolling hills. `fbm` ("fractal Brownian motion") layers several calls at increasing
frequency to add roughness on top of the big shapes – this is what makes terrain look natural instead of like a duvet.

```js
const h = this.terrain.fbm2D(x * 0.02, y * 0.02); // 4 layers by default, still about -1..1
const rougher = this.terrain.fbm2D(x * 0.02, y * 0.02, 6); // more layers, more fine detail
```

Extra arguments are `(x, y, octaves, persistence, lacunarity)`, defaulting to `4`, `0.5`, and `2`. Raising `octaves`
adds detail and costs more; the other two are worth leaving alone until the shape is right.

## Notes

- Generate once, not every frame. Sampling noise for all 320x240 pixels every frame will drop your frame rate. Build the
  height map or tile map into an array in `init()` (or when the player enters a chunk) and draw from that – see the
  `keep-it-fast` skill.
- Keep one world seed in a constant and pass it to every hash call, so the whole world regenerates as a unit when you
  change it.
- Omit the seed (or pass `0`) and you get a fixed default world – handy while experimenting, but two different features
  will then share a pattern. Give each its own seed once the game is real.
- Noise returns decimals around `-1..1`. Screen coordinates are whole numbers, so `Math.floor` the result before
  drawing.
- Chunked worlds need no bookkeeping: because the answer depends only on coordinates and seed, a chunk regenerates
  identically when the player returns. Only store what the player _changed_.
- Needs blit386 `^1.5.0`.
