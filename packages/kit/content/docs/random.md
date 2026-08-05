# Random numbers and world generation

Games need surprise: which enemy appears, where the coin lands, how the ground is shaped. BLIT386 gives you two tools
for that, and picking the right one saves a lot of trouble.

- `BT.random` – a getter that returns a shared generator. Reading `BT.random` alone does nothing; call a method on it
  (`BT.random.int()`, `BT.random.float()`, ...) to draw the next value. Use it for dice rolls, picks, and shuffles.
- Noise and hashing – lookups by coordinate. Ask about the same spot twice, get the same answer twice. Use them for
  terrain, caves, and anything the player can walk away from and come back to.

## Rolling and picking

`BT.random` is a property, not a call – no parentheses on `BT.random` itself, only on the method after it.

```js
update() {
    const lane = BT.random.int(3); // 0, 1, or 2 - the top number is excluded
    const damage = BT.random.intInclusive(1, 6); // 1 to 6, like a die - both ends included
    const speed = BT.random.float(0.5, 2.0); // a decimal in between

    if (BT.random.bool(0.3)) {
        this.spawnEnemy(); // happens 30% of the time
    }

    const enemy = BT.random.pick(['bat', 'slime', 'ghost']); // one item from a list
    const deck = BT.random.shuffle(this.cards); // a new array, shuffled
    const drop = BT.random.weighted(['coin', 'gem', 'crown'], [70, 25, 5]); // rarer things, less often
}
```

`int` and `intInclusive` give whole numbers, so you can use them as screen coordinates directly. `float` gives decimals,
so round it with `Math.floor` before drawing anything with it.

Use `BT.random` instead of `Math.random()`. It does more, and unlike the built-in one it can be seeded – which is the
next section.

## Making a run repeat exactly

Normally every run differs, because the generator starts from the clock. Give it a seed and the same numbers come back
in the same order:

```js
async init() {
    BT.randomSeed(1234); // this run now plays out identically every time
    return true;
}
```

That is how daily challenges, shareable level codes, and reproducible bug reports work: store one number, rebuild the
same world from it.

`BT.random` is shared, so everything draws from the same sequence. If you want your level layout to stay identical no
matter how many shots the player fires, give it a private generator:

```js
import { Random } from 'blit386';

// in init():
this.levelRng = new Random(1234); // unaffected by anything else
```

## Terrain and patterns

For a world you generate rather than roll, use noise. It gives a smooth value that changes gradually across space, which
is what makes hills look like hills:

```js
import { PerlinNoise } from 'blit386';

// in init():
this.terrain = new PerlinNoise(9001);
for (let x = 0; x < 320; x++) {
  const n = this.terrain.noise2D(x * 0.02, 0); // about -1 to 1
  this.groundY.push(Math.floor(120 + n * 40)); // round: screen coordinates are whole numbers
}
```

The `0.02` controls the size of the features – smaller means broader, smoother hills. `ValueNoise` and `SimplexNoise`
are alternatives with slightly different looks.

When you want an unrelated yes-or-no answer per tile instead of a smooth slope, use a hash:

```js
import { hash2 } from 'blit386';

hasTreeAt(tileX, tileY) {
    return hash2(tileX, tileY, 9001) < 0.15; // 15% of tiles, always the same ones
}
```

Because the answer depends only on the coordinates and the seed, the trees are still there when the player walks back –
without you storing a single one of them.

Generate this kind of thing once, into an array, in `init()` or when the player enters a new area. Sampling noise for
every pixel on every frame is slow.

Next: `docs/basics.md` for the game loop, or `docs/drawing.md` for what you can draw with these numbers.
