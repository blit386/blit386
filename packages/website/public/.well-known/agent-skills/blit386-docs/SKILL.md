---
name: blit386-docs
description:
  Navigate and query the BLIT386 documentation site at blit386.dev. Use when helping a developer learn the BLIT386
  JavaScript/TypeScript library, find API references, or locate guides.
---

# BLIT386 Documentation

## What is BLIT386?

BLIT386 is a palette-first WebGPU pixel engine for TypeScript, inspired by RetroBlit. It defaults to WebGPU with an
automatic Canvas 2D software fallback. All engine functionality is accessed through the static `BT` namespace.

## Key resources

| Resource | URL | Format |
| --- | --- | --- |
| Documentation home | https://blit386.dev/docs | HTML |
| Site summary for LLMs | https://blit386.dev/llms.txt | plain text |
| Full site content | https://blit386.dev/llms-full.txt | plain text |
| MCP server (`search_docs`, `get_doc_page`, `get_docs_summary`) | https://blit386.dev/mcp | JSON-RPC 2.0 |
| Sitemap | https://blit386.dev/sitemap.xml | XML |

## Navigating the docs

- `/docs` - Documentation hub (start here)
- `/docs/getting-started` - Scaffolding a new game (`npm create blit386@latest my-game`) or a manual install
- `/docs/build-a-game` - For building a game: the starter project, agent instructions, kit guides, skills, and complete
  examples
- `/docs/guides/...` - Task-oriented guides (palette, input, audio, effects, fonts, and more)

The API reference is split across 12 pages:

| Page | Covers |
| --- | --- |
| `/docs/api/core` | Bootstrap, initialization, and default configuration |
| `/docs/api/overlay` | Overlay HUD configure flags and style objects |
| `/docs/api/game-loop` | Fixed-timestep timing, tick counters, and `Timer` |
| `/docs/api/camera` | The camera offset and world-clamp helpers |
| `/docs/api/easing` | Easing curves and `interpolate()` |
| `/docs/api/random` | Seeded `Random`, coordinate hashes, and pattern noise |
| `/docs/api/core-types` | `Vector2i`, `Rect2i`, and `Color32` |
| `/docs/api/browser-support` | WebGPU support matrix, software fallback, and build toolchain |
| `/docs/api/rendering` | Primitives, sprites, text, post-process effects, and frame capture |
| `/docs/api/palette` | Palette setup, presets, serialization, and palette effects |
| `/docs/api/assets` | Sprite sheets, bitmap fonts, and asset loading |
| `/docs/api/audio` | Audio buses, sound effects, music, and the procedural synth |

Use the MCP server's `search_docs` tool to locate specific content:

```text
POST https://blit386.dev/mcp
Content-Type: application/json

{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "search_docs", "arguments": {"query": "palette animation"}}}
```

Returns matching pages with titles, absolute URLs, and content excerpts. Pass one of those URLs (or a site path such as
`/docs/guides/input`) to `get_doc_page` to read the whole page as markdown. `get_docs_summary` returns the `llms.txt`
summary. Call `tools/list` for the full tool schema.

## Core API concepts

Rendering coordinates are integers (`Vector2i`, `Rect2i`), and colors are palette slot numbers resolved through the
active palette. `BT.activeBackend` reports whether WebGPU or the Canvas 2D fallback is running. For anything more, read
the API pages above with `get_doc_page` rather than relying on this summary.

## Package

```shell
npm create blit386@latest my-game  # new game
npm install blit386                # existing project
```

Source: https://github.com/blit386/blit386
