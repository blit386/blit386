# Twoslash in published docs

Condensed mirror of `.cursor/rules/twoslash-docs.mdc`.

All TypeScript code blocks in published docs (`docs/api-*.md`, `docs/guide-*.md`, `docs/performance-*.md`,
`docs/reference-*.md`) must use ` ```ts twoslash ` so the live site (blit386.dev) renders type-on-hover popups. Plain
` ```ts ` is never acceptable in published docs. This is non-negotiable.

Every block must be self-contained for TypeScript compilation. Two patterns:

**Self-contained block** (imports at the top, block compiles on its own — no cut needed):

```ts twoslash
import { BT, Color32, Palette } from 'blit386';
const palette = Palette.c64();
BT.paletteSet(palette);
```

**Fragment block** (shows a partial snippet, context variables assumed from prose — use a hidden preamble +
`// ---cut---`):

```ts twoslash
import { BT, Palette } from 'blit386';
const nightPalette = Palette.vga();
// ---cut---
BT.paletteFade(nightPalette, 2000, 'ease-in-out');
```

Everything above `// ---cut---` is compiled by TypeScript but hidden from the reader. Everything below is shown.

Preamble rules:

- Import all blit386 names used in the block from `'blit386'` in one line.
- Use `const x = new Type(...)` for constructible types (`Palette`, `Vector2i`, `Rect2i`, `Color32`).
- Use `declare const x: Type` for types that cannot be constructed with `new` (`SpriteSheet`, `BitmapFont`).
- For `indexed.sheet` / `indexed.srcRect` patterns: `declare const indexed: { sheet: SpriteSheet; srcRect: Rect2i };`
- Named palette variables (`nightPalette`, `dangerPalette`, etc.): `const nightPalette = Palette.vga();`
- Position/rect variables assumed from context: `const pos = new Vector2i(0, 0);`,
  `const rect = new Rect2i(0, 0, 320, 240);`

After adding or editing blocks, verify in `blit386-dev-fumapress`:

```bash
pnpm run sync:docs && pnpm run build
```

A Twoslash compilation error fails the build. Fix the preamble rather than adding `// @noErrors`.
