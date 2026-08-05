---
name: use-random
description:
  Roll dice, pick from a list, shuffle, and scatter things with the engine's seedable random generator `BT.random`
  (engine 1.5.0+) instead of `Math.random()`. Use for enemy spawns, loot drops, damage rolls, screen shake, card
  shuffles, scattering stars or particles, or whenever the user wants a game that plays out the same way twice from a
  seed.
---

# Use random

`BT.random` is the engine's random number generator. It does everything `Math.random()` does, plus the things games
actually need – pick from a list, shuffle, weighted drops, a random direction – and it can be seeded so a run plays out
identically every time.

## When to use

Use for spawn positions, enemy choice, loot drops, damage rolls, screen shake, shuffling a deck, scattering stars, or
any "pick something at random". Also use when the user wants a daily challenge, a shareable level code, or a replay –
anything where the same seed must produce the same game.

For terrain, caves, clouds, or procedural textures, use the `use-noise` skill instead. That is a different tool: `noise`
answers "what is at this coordinate", `random` answers "give me the next value".

## How to do it

`BT.random` is a getter (no parentheses), and it is the same generator every time you read it.

```js
update() {
    // whole numbers, high end excluded: 0, 1, or 2
    const lane = BT.random.int(3);

    // whole numbers in a range, high end excluded: 10..319
    const x = BT.random.int(10, 320);

    // whole numbers, both ends included: 1..6, like a die
    const damage = BT.random.intInclusive(1, 6);

    // a decimal between two values
    const speed = BT.random.float(0.5, 2.0);

    // true 30% of the time
    if (BT.random.bool(0.3)) {
        this.spawnEnemy();
    }
}
```

`int` and `intInclusive` give you whole numbers already, so they are safe to use as screen coordinates directly. `float`
is not – round it with `Math.floor` before drawing.

## Picking and shuffling

```js
const enemy = BT.random.pick(['bat', 'slime', 'ghost']); // one item
const deck = BT.random.shuffle(this.cards); // a new shuffled array

// weights do not have to add up to anything in particular
const drop = BT.random.weighted(['coin', 'gem', 'crown'], [70, 25, 5]);
```

`pick` throws on an empty array, so check `length` first if the list can run out. `shuffle` returns a new array and
leaves the original alone; use `shuffleInPlace` only when you deliberately want the original changed.

## Scattering things around

```js
import { Rect2i, Vector2i } from 'blit386';

const spot = BT.random.insideRect(new Rect2i(0, 0, 320, 240)); // Vector2i
const step = BT.random.direction4(); // (1,0), (-1,0), (0,1), or (0,-1)
const drift = BT.random.direction8(); // the four above plus diagonals
const heading = BT.random.angle(); // 0..2*PI radians
const shake = BT.random.gaussian(0, 2); // clustered near 0, occasionally far
```

`gaussian` is the one to reach for when "mostly small, sometimes big" looks better than an even spread – screen shake,
scatter, enemy speed variation.

## Same seed, same game

By default the generator is seeded from the clock, so every run differs. Seed it yourself to make a run repeatable:

```js
async init() {
    BT.randomSeed(1234); // this level now generates identically every time
    // ...
    return true;
}
```

That is what makes daily challenges, level codes, and bug reports you can actually reproduce possible. Store the seed
with the save and you can rebuild the same world from a single number.

## Your own generator

`BT.random` is shared, so anything that draws from it shifts what everything else gets next. When you need one part of
the game to be reproducible on its own, give it a private generator:

```js
import { Random } from 'blit386';

// in init():
this.levelRng = new Random(1234); // level layout, unaffected by combat rolls
this.combatRng = new Random(99); // damage rolls, unaffected by layout
```

A `Random` instance has exactly the same methods as `BT.random`. Useful extras when you need them:

| Call | What it does |
| --- | --- |
| `rng.seed(n)` | Restart the sequence from seed `n` |
| `rng.getState()` | The current position, as a number you can save |
| `rng.setState(n)` | Jump back to a saved position and replay from there |
| `rng.clone()` | A copy that will produce the identical sequence from here |
| `rng.fork()` | A new independent stream (advances the parent once) |
| `rng.seedValue` | The seed it was last given (`undefined` after `setState` or `fork`) |

## Notes

- Prefer `BT.random` over `Math.random()` everywhere. Same convenience, plus seeding – there is no reason to keep the
  built-in one.
- `BT.random` is a getter with no parentheses; `BT.randomSeed(n)` is a method with them.
- Draw random values in `update()`, not `render()`. `render()` can run a different number of times per update, so
  rolling there makes things flicker and breaks reproducibility.
- In a per-frame loop over many items, `insideRectTo(rect, out)` and `pointInRangeTo(min, max, out)` write into a
  `Vector2i` you already own instead of making a new one each call – see the `keep-it-fast` skill.
- Ranges are half-open where you would expect: `int(1, 5)` never returns `5`. Use `intInclusive(1, 5)` when you want it
  to. Inverted or empty ranges throw rather than returning nonsense.
- Needs blit386 `^1.5.0`.
