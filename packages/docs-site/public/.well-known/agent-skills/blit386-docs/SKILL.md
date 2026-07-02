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

| Resource              | URL                                         | Format     |
| --------------------- | ------------------------------------------- | ---------- |
| Documentation home    | https://blit386.dev/docs                    | HTML       |
| Site summary for LLMs | https://blit386.dev/llms.txt                | plain text |
| Full site content     | https://blit386.dev/llms-full.txt           | plain text |
| Search API            | https://blit386.dev/api/search?query=<term> | JSON array |
| Sitemap               | https://blit386.dev/sitemap.xml             | XML        |

## Navigating the docs

Main documentation sections:

- `/docs` – Documentation hub (start here)
- `/docs/guide/getting-started` – Installation and first steps
- `/docs/api/` – Full API reference for the `BT` namespace

Use the search API to locate specific content:

```
GET https://blit386.dev/api/search?query=palette+animation
```

Returns a JSON array of matching pages with titles, URLs, and content excerpts.

## Core API concepts

- `BT` – static namespace; the only public entry point from demo/application code
- `Vector2i` – integer 2D vector (all rendering coordinates are integers)
- `Rect2i` – integer rectangle
- `Color32` – 32-bit RGBA color (0–255 per channel)
- `Palette` – 256-entry indexed color palette
- `SpriteSheet` – GPU texture wrapper
- `BitmapFont` – bitmap font system

## Rendering backends

Select via `HardwareSettings.backend`:

- `'webgpu'` (default) – dual pipeline: primitives and sprites
- `'software'` – Canvas 2D fallback; automatic when WebGPU init fails

Query the active backend at runtime: `BT.activeBackend`

## Package

```
npm install blit386
```

Source: https://github.com/blit386/blit386
