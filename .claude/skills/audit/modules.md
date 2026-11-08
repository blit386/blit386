# Audit ledger

One row per audit unit. The `Unit`, `Kind` and `Paths` columns are derived from the tree by `scripts/audit-modules.mjs`
and rewritten by `pnpm run audit:modules`; never edit them by hand. `Last audited` and `Ticket` are written by
`pnpm run audit:modules -- --stamp <date> <ticket> <unit>...` when a module ticket is filed, or by hand.
`pnpm run audit:modules:check` (pre-push root pass and CI) fails when a unit has no row or a row has no unit, so a new
directory or demo cannot be forgotten. How the units are read: `SKILL.md` in this directory.

| Unit | Kind | Paths | Last audited | Ticket |
| --- | --- | --- | --- | --- |
| `engine-assets` | code | packages/blit386/src/assets, packages/blit386/assets | 2026-11-08 | BT-754 |
| `engine-audio` | code | packages/blit386/src/audio | 2026-11-08 | BT-753 |
| `engine-core` | code | packages/blit386/src/core | 2026-11-08 | BT-759 |
| `engine-hot` | code | packages/blit386/src/hot | 2026-11-08 | BT-760 |
| `engine-input` | code | packages/blit386/src/input | 2026-11-08 | BT-755 |
| `engine-overlay` | code | packages/blit386/src/overlay | 2026-11-08 | BT-758 |
| `engine-render` | code | packages/blit386/src/render | 2026-11-08 | BT-756 |
| `engine-splash` | code | packages/blit386/src/splash | 2026-11-08 | BT-760 |
| `engine-utils` | code | packages/blit386/src/utils | 2026-11-08 | BT-757 |
| `engine-vite` | code | packages/blit386/src/vite | 2026-11-08 | BT-760 |
| `engine-entry` | code | packages/blit386/src/BLIT386.ts | 2026-11-08 | BT-765 |
| `engine-scripts` | code | packages/blit386/scripts | 2026-11-08 | BT-763 |
| `engine-docs` | prose | packages/blit386/docs | 2026-11-08 | BT-766 |
| `demo:animation` | code | packages/demos/src/animation.js | 2026-11-08 | BT-770 |
| `demo:any-input` | code | packages/demos/src/any-input.js | 2026-11-08 | BT-768 |
| `demo:audio-basics` | code | packages/demos/src/audio-basics.js | 2026-11-08 | BT-769 |
| `demo:audio-buses` | code | packages/demos/src/audio-buses.js | 2026-11-08 | BT-769 |
| `demo:basics-enhanced` | code | packages/demos/src/basics-enhanced.js | 2026-11-08 | BT-769 |
| `demo:basics` | code | packages/demos/src/basics.js | 2026-11-08 | BT-769 |
| `demo:bitmap-font` | code | packages/demos/src/bitmap-font.js | 2026-11-08 | BT-770 |
| `demo:bunnymark` | code | packages/demos/src/bunnymark.js | 2026-11-08 | BT-771 |
| `demo:camera` | code | packages/demos/src/camera.js | 2026-11-08 | BT-771 |
| `demo:colors` | code | packages/demos/src/colors.js | 2026-11-08 | BT-767 |
| `demo:coordinate-patterns` | code | packages/demos/src/coordinate-patterns.js | 2026-11-08 | BT-769 |
| `demo:crt-pipboy` | code | packages/demos/src/crt-pipboy.js | 2026-11-08 | BT-767 |
| `demo:crt-toggle` | code | packages/demos/src/crt-toggle.js | 2026-11-08 | BT-767 |
| `demo:flurry` | code | packages/demos/src/flurry.js | 2026-11-08 | BT-771 |
| `demo:fonts` | code | packages/demos/src/fonts.js | 2026-11-08 | BT-770 |
| `demo:game-scene` | code | packages/demos/src/game-scene.js | 2026-11-08 | BT-771 |
| `demo:gamepad-input` | code | packages/demos/src/gamepad-input.js | 2026-11-08 | BT-768 |
| `demo:hello-world` | code | packages/demos/src/hello-world.js | 2026-11-08 | BT-769 |
| `demo:hypercube` | code | packages/demos/src/hypercube.js | 2026-11-08 | BT-771 |
| `demo:image-output` | code | packages/demos/src/image-output.js | 2026-11-08 | BT-770 |
| `demo:input-map-remapping` | code | packages/demos/src/input-map-remapping.js | 2026-11-08 | BT-768 |
| `demo:keyboard-diagnostic` | code | packages/demos/src/keyboard-diagnostic.js | 2026-11-08 | BT-768 |
| `demo:keyboard-input` | code | packages/demos/src/keyboard-input.js | 2026-11-08 | BT-768 |
| `demo:logo-lowres` | code | packages/demos/src/logo-lowres.js | 2026-11-08 | BT-767 |
| `demo:music` | code | packages/demos/src/music.js | 2026-11-08 | BT-769 |
| `demo:named-colors` | code | packages/demos/src/named-colors.js | 2026-11-08 | BT-767 |
| `demo:nine-slice-panels` | code | packages/demos/src/nine-slice-panels.js | 2026-11-08 | BT-770 |
| `demo:noise` | code | packages/demos/src/noise.js | 2026-11-08 | BT-771 |
| `demo:palette-animation` | code | packages/demos/src/palette-animation.js | 2026-11-08 | BT-767 |
| `demo:palette-cycling` | code | packages/demos/src/palette-cycling.js | 2026-11-08 | BT-767 |
| `demo:palette-exposure-fade` | code | packages/demos/src/palette-exposure-fade.js | 2026-11-08 | BT-767 |
| `demo:palette-fade` | code | packages/demos/src/palette-fade.js | 2026-11-08 | BT-767 |
| `demo:palette-presets` | code | packages/demos/src/palette-presets.js | 2026-11-08 | BT-767 |
| `demo:palette-swap` | code | packages/demos/src/palette-swap.js | 2026-11-08 | BT-767 |
| `demo:pattern-fill` | code | packages/demos/src/pattern-fill.js | 2026-11-08 | BT-769 |
| `demo:patterns` | code | packages/demos/src/patterns.js | 2026-11-08 | BT-769 |
| `demo:pixel-art` | code | packages/demos/src/pixel-art.js | 2026-11-08 | BT-770 |
| `demo:pointer-basics` | code | packages/demos/src/pointer-basics.js | 2026-11-08 | BT-768 |
| `demo:pointer-drag-flick` | code | packages/demos/src/pointer-drag-flick.js | 2026-11-08 | BT-768 |
| `demo:pointer-paint` | code | packages/demos/src/pointer-paint.js | 2026-11-08 | BT-768 |
| `demo:primitives` | code | packages/demos/src/primitives.js | 2026-11-08 | BT-769 |
| `demo:random-basics` | code | packages/demos/src/random-basics.js | 2026-11-08 | BT-769 |
| `demo:raycasting` | code | packages/demos/src/raycasting.js | 2026-11-08 | BT-771 |
| `demo:reduced-motion` | code | packages/demos/src/reduced-motion.js | 2026-11-08 | BT-768 |
| `demo:seeded-worlds` | code | packages/demos/src/seeded-worlds.js | 2026-11-08 | BT-771 |
| `demo:snake-game` | code | packages/demos/src/snake-game.js | 2026-11-08 | BT-771 |
| `demo:sprite-effects` | code | packages/demos/src/sprite-effects.js | 2026-11-08 | BT-770 |
| `demo:sprites` | code | packages/demos/src/sprites.js | 2026-11-08 | BT-770 |
| `demo:starfield` | code | packages/demos/src/starfield.js | 2026-11-08 | BT-771 |
| `demo:synth-toy` | code | packages/demos/src/synth-toy.js | 2026-11-08 | BT-769 |
| `demo:system-font-glyphs` | code | packages/demos/src/system-font-glyphs.js | 2026-11-08 | BT-770 |
| `demo:test-state` | code | packages/demos/src/test-state.js | 2026-11-08 | BT-768 |
| `demo:tilemap` | code | packages/demos/src/tilemap.js | 2026-11-08 | BT-770 |
| `demos-shared` | code | packages/demos/src/shared | 2026-11-08 | BT-764 |
| `demos-scripts` | code | packages/demos/scripts | 2026-11-08 | BT-761 |
| `demos-build` | code | packages/demos/plugins, packages/demos/_partials, packages/demos/_shots, packages/demos/styles | 2026-11-08 | BT-762 |
| `website-src` | code | packages/website/src | 2026-11-08 | BT-772 |
| `website-scripts` | code | packages/website/scripts | 2026-11-08 | BT-774 |
| `website-content` | prose | packages/website/content | 2026-11-08 | BT-773 |
| `kit-src` | code | packages/kit/src | 2026-11-08 | BT-776 |
| `kit-hooks` | code | packages/kit/content/hooks, packages/kit/content/hooks.manifest.json | 2026-11-08 | BT-775 |
| `kit-skills` | prose | packages/kit/content/skills | 2026-11-08 | BT-778 |
| `kit-content` | prose | packages/kit/content/docs, packages/kit/content/rules, packages/kit/content/templates, packages/kit/content/AGENTS.md | 2026-11-08 | BT-777 |
| `scaffolder` | code | packages/create-blit386/src, packages/create-blit386/templates | 2026-11-08 | BT-779 |
| `root-scripts` | code | scripts | 2026-11-08 | BT-780 |
| `maintainer-agents` | prose | .claude, packages/blit386/.claude, packages/demos/.claude, packages/create-blit386/.claude | 2026-11-08 | BT-781 |
| `repo-docs` | prose | AGENTS.md, CLAUDE.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md, README.md, SECURITY.md, docs, .github/copilot-instructions.md, .github/pull_request_template.md, packages/demos/docs, packages/blit386/AGENTS.md, packages/blit386/CLAUDE.md, packages/blit386/README.md, packages/demos/AGENTS.md, packages/demos/CLAUDE.md, packages/demos/README.md, packages/website/AGENTS.md, packages/website/CLAUDE.md, packages/website/README.md, packages/website/SECURITY.md, packages/kit/AGENTS.md, packages/kit/CLAUDE.md, packages/kit/README.md, packages/create-blit386/AGENTS.md, packages/create-blit386/CLAUDE.md, packages/create-blit386/CREATE_BLIT386_DESIGN.md, packages/create-blit386/PUBLISHING.md, packages/create-blit386/README.md | 2026-11-08 | BT-782 |
| `tooling-config` | code | .coderabbit.yaml, .editorconfig, .gitattributes, .gitignore, .lintstagedrc.json, .mcp.json, .node-version, .npmrc, .prettierignore, CODEOWNERS, LICENSE, biome.json, commitlint.config.js, cspell.json, knip.json, opencode.json, package.json, pnpm-lock.yaml, pnpm-workspace.yaml, prettier.config.js, renovate.json, tsconfig.base.json, .github/workflows, .github/actions, .github/ISSUE_TEMPLATE, .husky, .devcontainer, .cursor/hooks.json, .cursor/mcp.json, .zed, packages/blit386/eslint.config.js, packages/blit386/package.json, packages/blit386/playwright.config.ts, packages/blit386/tsconfig.json, packages/blit386/vite.config.test.ts, packages/blit386/vite.config.ts, packages/blit386/vite.node.config.ts, packages/blit386/vitest.config.ts, packages/demos/.gitignore, packages/demos/biome.json, packages/demos/eslint.config.js, packages/demos/jsconfig.json, packages/demos/package.json, packages/demos/postcss.config.js, packages/demos/vite.config.js, packages/demos/wrangler.jsonc, packages/website/.gitignore, packages/website/biome.json, packages/website/package.json, packages/website/press.config.tsx, packages/website/source.config.ts, packages/website/tsconfig.json, packages/website/vitest.config.ts, packages/website/waku.config.ts, packages/website/wrangler.jsonc, packages/kit/LICENSE, packages/kit/package.json, packages/kit/tsconfig.json, packages/kit/tsup.config.ts, packages/create-blit386/LICENSE, packages/create-blit386/package.json, packages/create-blit386/tsconfig.json, packages/create-blit386/tsup.config.ts | 2026-11-08 | BT-783 |
