# User-Facing Voice Guide

## Why This Exists

Error messages, canvas banners, and console output that reach a developer or end user define the first impression of the
engine. BLIT386 targets two distinct audiences, and mixing their styles produces confusing output for both.

This guide defines the rules. Before writing any `throw`, `console.error`, `displayError`, or canvas-visible string,
read the relevant section below.

---

## Two Audience Tiers

### Tier 1 - User-facing (canvas-visible or public API errors)

Audience: demo authors using the `BT` namespace, beginners who may not know TypeScript internals.

Rules:

- Plain English. No jargon. No abbreviations.
- Explain what went wrong in one sentence.
- Give a concrete next action in the next sentence.
- No trailing period on thrown strings (thrown messages appear mid-sentence in stack traces).
- No emoji.
- No ALL_CAPS outside of identifiers quoted from source code.
- Consistent capitalization: sentence case, not title case.

Where it appears: `showBeginnerRuntimeError()`, `displayError()`, canvas banners, and `throw new Error()` on any public
API path (anything reachable from demo code via `BT.*` or a public constructor). All such messages must live in
`src/utils/errorMessages.ts`.

### Tier 2 - Internal invariants (developer-only)

Audience: engine contributors reading a stack trace.

Rules:

- Terse. Include the relevant values.
- No need to explain next steps - the reader can read the source.
- Still no emoji.

Where it appears: `throw new Error()` inside private engine methods, guard checks inside `src/core/`, `src/render/`, and
non-public `src/assets/` paths.

---

## Examples: Before and After

| Context                                | Before (avoid)                  | After (Tier 1 style)                                                                                                                                                   |
| -------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canvas not found                       | `Element not found`             | `Can't find the canvas on the page. Make sure your HTML has a <canvas id='${canvasID}'> element.`                                                                      |
| No active palette                      | `No palette`                    | `No palette set yet. Call BT.paletteSet(somePalette) before drawing or running palette effects.`                                                                       |
| Palette index out of range             | `Index out of bounds: ${index}` | `The color number ${index} is too big for this palette. The palette has ${size} colors, so use a number from 0 to ${size - 1}.`                                        |
| Sprite not indexized                   | `Sheet not indexized`           | `This sprite sheet hasn't been prepared yet. Use SpriteSheet.loadIndexed(...) for one-step setup, or call sheet.indexize(palette) after BT.paletteSet.`                |
| Sprite color missing from palette      | `Color not found`               | `The pixel at (${x}, ${y}) in ${src} has the color ${hex}, but that color isn't in your palette. Either add ${hex} to the palette, or change that pixel in the image.` |
| Wrong drawPixel arguments              | `TypeError: bad args`           | `drawPixel expects (x, y, paletteIndex) or (Vector2i, paletteIndex). Got: [${typeDetails}]`                                                                            |
| Missing await on async load            | `Promise passed to draw`        | `Did you forget to use 'await' before ${loadCall}?`                                                                                                                    |
| WebGPU adapter unavailable             | `WebGPU failed`                 | `Your computer's graphics card couldn't start WebGPU. Try updating your browser, or check that hardware acceleration is enabled.`                                      |
| HUD start slot below 1                 | `Invalid startSlot`             | `HUD preset slots start from 1 (slot 0 is always transparent). Got ${startSlot}.`                                                                                      |
| Tier 2 (internal) palette byte missing | _(fine as-is)_                  | `Palette byte ${index} is missing`                                                                                                                                     |

---

## Console Output Rules

- Prefix engine console output with `[BT]`: `console.error('[BT] Palette Error: ...')`.
- Use `console.error` for failures, `console.warn` for degraded-but-continuing states.
- Never use `console.log` in production code paths (benchmarks and debug utilities excepted).
- Canvas-visible errors (`displayError`) and console output must say the same thing. Do not show a terse console message
  and a friendly canvas message - they must match.

---

## Centralization

All Tier 1 message strings live in `src/utils/errorMessages.ts`. Every public-facing throw and every
`showBeginnerRuntimeError` call imports from there. This guarantees:

- Identical wording across every call site.
- A single place to audit and update the tone.
- Easy unit testing of message content.

Steps when adding a new Tier 1 message:

1. Add an exported function or constant to `src/utils/errorMessages.ts`.
2. Import and call it at the throw or display site.
3. Do not inline the string at the call site.

Tier 2 strings (internal invariants) may be inlined - they are never user-visible and do not need the same stability
guarantees.

---

## Quick Self-Check Before Committing a New Message

1. **Plain English?** Could a junior developer understand it without reading engine source?
2. **Next action?** Does it tell the reader what to do, not just what failed?
3. **No trailing period?** Thrown strings land mid-sentence in stack traces.
4. **No emoji?** Nowhere in the engine - not in throws, not in banners, not in console output.
5. **Sentence case?** "Slot 0 is always transparent" not "Slot 0 Is Always Transparent".
6. **Centralized?** Is the string in `errorMessages.ts`, or must it go there?
7. **Tier correct?** Is this reachable from demo code? If yes, it must be Tier 1.
