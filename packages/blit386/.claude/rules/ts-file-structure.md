---
paths: [src/**/*.ts]
---

# TypeScript file structure

This file is the full policy for TypeScript file structure; [CLAUDE.md](../../CLAUDE.md) carries only a short summary
and points here. See also `docs/developer-experience-guide.md` (File structure and member order).

When adding or moving code in library TypeScript (`src/`). **Class member order is enforced by
`perfectionist/sort-classes`** (auto-fix with `pnpm run lint:fix`); it uses `type: 'unsorted'`, so it enforces only the
**group order** below and keeps the hand-tuned order **within** each group. Follow this layout. **Never use `// #region`
/ `// #endregion`.** Region markers are banned everywhere.

## File layout (top to bottom)

1. **Module JSDoc** – `/** … */` describing the file's purpose.
2. **Imports** – `import type` for type-only imports; inline `type` in mixed imports. Order is auto-fixed by
   `pnpm run lint:fix` (`simple-import-sort`).
3. **Leading module members** – config/input constants (`MAX_VERTICES`, `INV_255`), validators/lookup tables, and type
   aliases (`type EffectTier`, `type Resolve`). Module-level init loops live here too.
4. **Primary export** – the class / interface / function the file is named for.
5. **Trailing module members** – large WGSL/template-literal constants (`const FRAGMENT_WGSL`) and pure helper functions
   **after** the class. Exported helpers before private ones.

## Class member order

1. **Static fields** – cached singletons (`_zero`, `_white`), registries (`namedColors`).
2. **Instance fields** – public → protected → private (`#field` / `private`). Group `readonly` together. One JSDoc and a
   blank line per field (no packed field blocks).
3. **Constructor** – parameter-properties carry inline `/** … */` JSDoc.
4. **Accessors** – static getters first, then instance getters/setters.
5. **Static methods** – public before private.
6. **Instance methods** – public → protected → private. Private helpers (`cleanup`, `getOrCreateBindGroup`) last.

## Cross-cutting

- Keep a **deprecated alias adjacent to its canonical member** (`equals` after `isEqual`; `handleToggle` after
  `handleInput`).
- Cluster method families deliberately: new-allocating (`add`) → `*To` zero-alloc → `*InPlace` → queries (`isEqual`) →
  `clone` / `toString` last.
- One blank line between members; a blank line before `return` and between logical blocks inside method bodies.
- JSDoc on every member, including private ones. Named exports only; no default exports.
