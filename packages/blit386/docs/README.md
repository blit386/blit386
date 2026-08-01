# BLIT386 Docs

The published version of these docs lives at [blit386.dev/docs](https://blit386.dev/docs).

Edit sources here first. `packages/website` mirrors the pages listed in `_sitemap.json` to the live site. Run
`pnpm run sync:doc-banners` after adding a doc to the sitemap. Contributor-only pages (not in the sitemap:
`developer-experience-guide.md`, `documentation-and-versioning-guide.md`, `voice.md`, `tooling.md`, `security/`) stay
plain Markdown and do not appear on the site.

For full descriptions of every page, see the [Documentation index](developer-experience-guide.md#documentation-index) in
Developer Experience.

## API

| Page | What it covers |
| --- | --- |
| [API: Core](api-core.md) | Bootstrap, initialization, and default configuration |
| [API: Overlay](api-overlay.md) | Engine overlay HUD configure flags, style objects, and worked examples |
| [API: Game Loop](api-game-loop.md) | Fixed-timestep simulation timing, tick counters, and the Timer helper |
| [API: Camera](api-camera.md) | The camera's global pixel offset and world-clamp helpers |
| [API: Easing](api-easing.md) | Named easing curves for palette fade effects via applyEasing |
| [API: Core Types](api-core-types.md) | The integer core types: Vector2i, Rect2i, and Color32 |
| [API: Browser Support](api-browser-support.md) | WebGPU support matrix, automatic software fallback, and build toolchain |
| [API: Rendering](api-rendering.md) | Primitives, sprites, text, post-process effects, and frame capture |
| [API: Palette](api-palette.md) | Palette setup, built-in presets, HUD preset, serialization, and palette effects |
| [API: Assets](api-assets.md) | Sprite sheets, bitmap fonts, and asset loading |
| [API: Audio](api-audio.md) | Audio buses, SFX voice pool, crossfading music, and procedural synthesis |

## Guides

| Page | What it covers |
| --- | --- |
| [Input Guide](guide-input.md) | Pointer, keyboard, gamepad, and text-accumulation input in BLIT386 |
| [Game Loop Guide](guide-game-loop.md) | Smoothing motion between fixed update() steps using BT.renderAlpha and Vector2i.lerp |
| [Palette Guide](guide-palette.md) | The palette-first rendering workflow: setup, slot offsets, and palette effects |
| [Palette Presets](guide-palette-presets.md) | Exact color data for the built-in Palette presets and the HUD preset |
| [Overlay Guide](guide-overlay.md) | The engine overlay HUD: metrics, timing chart, palette grid, toggle, and layout |
| [Post-Process Effects](guide-post-process-effects.md) | The two-tier post-process effect system, built-in effects, and CRT presets |
| [Bitmap Fonts](guide-bitmap-fonts.md) | The system font and custom .btfont bitmap fonts: format, loading, and BMFont conversion |
| [Audio Guide](guide-audio.md) | The audio subsystem layout, locked vs. unlocked gesture state, and web audio constraints |
| [Hot Reload](guide-hot-reload.md) | The three hot-reload swap tiers, onHotReload semantics, asset hot-replace, and the blit386/vite plugin |

## Performance and reference

| Page | What it covers |
| --- | --- |
| [Performance Best Practices](performance-best-practices.md) | When and how to optimize demos: object allocation, batching, and hot-path guidance |
| [Performance Testing](performance-testing.md) | CPU micro-benchmarks: when to use them, how to add one, and the CI benchmark gate |
| [Software Fallback Smoke Matrix](performance-smoke-matrix.md) | Manual smoke-test checklist for the Canvas 2D software renderer |
| [Deprecation Timeline](reference-deprecations.md) | Central tracker for public API compatibility aliases and planned removals |
| [Changelog](changelog.md) | Release history in Keep a Changelog style: what shipped, what broke, and when |
| [Testing](reference-testing.md) | Testing tiers (unit, integration, visual) plus CPU benchmarks and WebGPU mocks |
| [Authors](reference-authors.md) | Who made this. So far, just one person. |
