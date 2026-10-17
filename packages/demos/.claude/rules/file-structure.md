# Demo file structure

Canonical reference: [CLAUDE.md](../../CLAUDE.md) (File Organization, Adding a New Demo).

When adding or moving code in a demo (`src/<topic>.js`, number-free kebab-case), keep the standard section order and the
lifecycle method order. Never use `// #region` / `// #endregion`.

File layout: header comment (one `/* ... */` block: `Demo Name: summary.` title line, **required** `@description`,
optional `@pageTitle` and `@ogScale`, `Part of the BLIT386 demo series.`, prerequisites, links, `---`, underlined
sections - see CLAUDE.md "Comment format") → imports → `@typedef` lines → configuration constants → module state →
helper functions → the `Demo` class → `bootstrap(Demo);` last. No JSDoc beyond `/** @type */` and `/** @typedef */`;
comments are `//` lines wrapped at 90 columns.

`@description` is one line of 60-104 characters ending in a period, and must sit within the first 2000 bytes of the file
\- it feeds the page's meta description and social card. `check:demo-registry` enforces all of that.

Demo class member order: instance fields → `configure()` (optional) → `init()` → `update()` → `render()` → helper
methods.

Cross-cutting: beginner-friendly comments on nearly every block; integer coordinates only; library public API names.
