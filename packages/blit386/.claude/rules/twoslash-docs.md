---
paths: [docs/api-*.md, docs/guide-*.md, docs/performance-*.md, docs/reference-*.md]
---

# Twoslash in published docs

All TypeScript code blocks in published docs (`docs/api-*.md`, `docs/guide-*.md`, `docs/performance-*.md`,
`docs/reference-*.md`) must use ` ```ts twoslash ` so the live site (blit386.dev) renders type-on-hover popups. Plain
` ```ts ` is never acceptable in published docs. This is non-negotiable.

Every block must be self-contained for TypeScript compilation. Two patterns:

**Self-contained block** (imports at the top, block compiles on its own – no cut needed):

```ts twoslash
import { BT, Color32, Palette } from 'blit386';
const palette = Palette.c64();
BT.paletteSet(palette);
```

**Fragment block** (shows a partial snippet, context variables assumed from prose – use a hidden preamble +
`// ---cut---`):

```ts twoslash
import { BT, Palette } from 'blit386';
const nightPalette = Palette.vga();
// ---cut---
BT.paletteFade(nightPalette, 2000, 'ease-in-out');
```

Everything above `// ---cut---` is compiled by TypeScript but hidden from the reader. Everything below is shown.

**Multi-file block** (the visible code imports a relative module that does not exist – a test file importing its
subject, a benchmark importing the type it measures – use hidden `// @filename:` stubs before the cut):

```ts twoslash
// @filename: MyType.ts
export declare class MyType {
  newMethod(): void;
}
// @filename: MyType.bench.ts
// ---cut---
import { bench, describe } from 'vitest';

import { MyType } from './MyType';

describe('MyType hot paths', () => {
  const instance = new MyType();

  bench('newMethod()', () => {
    instance.newMethod();
  });
});
```

Each `// @filename:` opens a virtual file; the last one holds the visible code, and its path has to sit at the depth the
relative import expects (`../__test__/webgpu-mock` needs the visible file one directory down, e.g.
`render/SpritePipeline.test.ts`). Stub the imported module with `export declare class` / `export declare function` –
signatures only, no bodies. Real packages (`vitest`) resolve from `packages/website/node_modules` and need no stub;
`declare module 'vitest'` in a block that has imports is a module _augmentation_ and fails instead.

Preamble rules:

- Import all blit386 names used in the block from `'blit386'` in one line.
- Use `const x = new Type(...)` for constructible types (`Palette`, `Vector2i`, `Rect2i`, `Color32`).
- Use `declare const x: Type` for types that cannot be constructed with `new` (`SpriteSheet`, `BitmapFont`).
- For `indexed.sheet` / `indexed.srcRect` patterns: `declare const indexed: { sheet: SpriteSheet; srcRect: Rect2i };`
- Named palette variables (`nightPalette`, `dangerPalette`, etc.): `const nightPalette = Palette.vga();`
- Position/rect variables assumed from context: `const pos = new Vector2i(0, 0);`,
  `const rect = new Rect2i(0, 0, 320, 240);`

After adding or editing blocks, verify from `packages/website`:

```bash
pnpm run sync:docs && pnpm run sync:docs:check && pnpm run build
```

A Twoslash compilation error fails the build. Fix the preamble rather than adding `// @noErrors`.
