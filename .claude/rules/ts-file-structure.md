# TypeScript file structure

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (TypeScript file structure).

When adding or moving code in `src/`. Class member order is enforced by `perfectionist/sort-classes` (auto-fix with
`pnpm run lint:fix`); it uses `type: 'unsorted'`, enforcing only the group order below and preserving the hand-tuned
order within each group. Never use `// #region` / `// #endregion`.

File layout: module JSDoc → imports (`import type`, sorted by `simple-import-sort`) → leading module members (config
constants, validators, type aliases) → the primary class/interface/function → trailing module members (WGSL /
template-literal constants and pure helpers, exported before private).

Class member order:

1. Static fields (cached singletons, registries).
2. Instance fields – public → protected → private; `readonly` grouped; one JSDoc + blank line per field.
3. Constructor (parameter-properties carry inline JSDoc).
4. Accessors – static getters, then instance getters/setters.
5. Static methods – public before private.
6. Instance methods – public → protected → private; private helpers last.

Cross-cutting: deprecated aliases sit next to their canonical member; cluster method families (new-allocating → `*To` →
`*InPlace` → queries → `clone`/`toString`); one blank line between members; JSDoc on every member including private;
named exports only.

Cursor: `.cursor/rules/ts-file-structure.mdc` (glob-scoped to `src/**/*.ts` in this repo).
