# Twoslash Fixture

Fragment-style twoslash block, the pattern documented in `packages/blit386/.claude/rules/twoslash-docs.md`: a hidden
preamble followed by `// ---cut---`, then the code the reader actually sees.

```ts twoslash
import { BT, Palette } from 'blit386';
const nightPalette = Palette.vga();
// ---cut---
BT.paletteFade(nightPalette, 2000, 'ease-in-out');
```
