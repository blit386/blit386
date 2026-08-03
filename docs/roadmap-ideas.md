# BLIT386 Roadmap Ideas

Idea catalog from the 2026-07-06 brainstorm (demoscene track added 2026-07-07). Inputs: an audit of open issues on
blit386/blit386, the current API surface (docs/ + CLAUDE.md), and a comparative study of PICO-8, RetroBlit, HaxeFlixel,
and classic console hardware (NES, C64, Amiga, SNES, Game Boy, ZX Spectrum).

Scoping decisions locked during the session:

- Depth on the engine itself; companion libraries and tooling included as sketches, clearly separated (section 15).
- Audience: all of them – beginners/kids (create-blit386), game-jam/indie devs, demoscene/pixel artists.
- Platforms: browser first; Steam Deck is the first native-curious target (section 13).

## Conventions (promote-and-replace)

- Linear is source of truth for filed specs. Full bodies live on `BT-xxx` issues; this file keeps one-line stubs + links
  so nothing is duplicated.
- Unfiled sections (architecture, prioritization, open questions, and idea prose not yet promoted) stay as full text
  here only.
- `#NNN` may still name a GitHub issue; prefer `BT-xxx` Linear links once filed.
- Ideas marked (wild) are ambitious – included deliberately.
- This is an idea inventory, not a commitment.

Promotion pass 2026-07-24: Wave 1 hygiene + top-five bets + demoscene engine primitives (18.1, 18.2, 18.4).

## 1. Architecture position

The renderer stays free of scene graph, physics, and GUI. PICO-8 proves a fantasy console needs none of them; HaxeFlixel
shows the cost of a framework owning everything (great for beginners, but you can never not use FlxSprite). BLIT386
remains an immediate-mode renderer; retained structure belongs to separate ESM companion libraries.

The nuance: the engine must still ship the primitives those libraries need to exist.

- A scene library needs draw ordering (z) – section 5.1.
- A GUI library needs clipping (#249) and nine-slice (#206) – both already filed.
- A replay or netcode library needs a deterministic loop + input log + seeded RNG – section 6.2.
- Sprite animation as data (a frame sequencer with no parent/child tree) is renderer territory – it is a timing helper,
  not a scene graph – section 4.

Several ideas below look framework-ish at first glance but are really these enabling primitives.

The general rule, stated once: split by mechanism, not by audience. A feature goes in the engine when it needs the
renderer's internals (the `r8uint` attachment, the resolve pass, the game-loop clock) or when it is a primitive many
libraries will share; it goes in a companion library when it is workflow, authoring, or opinion built purely on public
`BT` APIs. Who the feature is FOR (beginners, game devs, sceners) never decides where it lives. Section 18.0 applies
this rule in full to the demoscene track.

## 2. Backlog hygiene findings

Promoted to Linear. Spec and checklist: [BT-358](https://linear.app/vancura/issue/BT-358) (stale-issue audit chore; use
`bt-issue-audit`). Structural meta-issues: Appendix A.

Related shipped notes:

- Transparent PNG capture (#279) – GitHub closed; md note only (no new ticket).
- Input stubs ([BT-122](https://linear.app/vancura/issue/BT-122)) – Done; audit confirms docs language.
- Post-process umbrella ([BT-127](https://linear.app/vancura/issue/BT-127)) – re-scope remaining gaps via BT-358.

## 3. Palette superpowers

Umbrella: [BT-359](https://linear.app/vancura/issue/BT-359). Open question 17.4 (LUT budget) applies.

### 3.1 Per-scanline palettes (copper bars)

Filed: [BT-362](https://linear.app/vancura/issue/BT-362).

### 3.2 Raster line effects (wild)

The sibling feature: per-scanline geometry, not color.

- Per-row horizontal offset: `BT.rasterOffset(row, dx)` or an array/callback form – wavy water, heat shimmer, Streets of
  Rage reflections, SNES-style line scroll, screen-wobble on hit.
- Per-row scale: fake perspective stripes, "floor" effects.
- Implementation: a per-row offset/scale buffer consumed by the resolve/upscale pass (pixel tier, palette-native). Zero
  cost when identity.
- API shape question: immediate per-frame (reset each frame like draw calls) vs retained until reset. Immediate matches
  the rest of the draw API.

### 3.3 Light tables / COLORMAP (Doom-style palette-space lighting)

Filed: [BT-360](https://linear.app/vancura/issue/BT-360).

### 3.4 Palette ramps as first-class objects

- Declare ramps on a palette: `palette.rampDefine('skin', [4, 5, 6, 7])`; query `palette.ramp('skin')`.
- Shading helpers step indices along a ramp: `ramp.darker(index)`, `ramp.lighter(index)`.
- Auto-generate ramps with hue-shifted shadows (the pixel-art way – shadows shift toward blue/purple, not black):
  `Palette.rampFrom(baseColor, steps, { hueShift })`.
- Feeds: light-table generation (3.3), outline color choice (#211), and editor tooling (15.2).

### 3.5 Dither fill patterns (PICO-8 `fillp()`)

Filed: [BT-361](https://linear.app/vancura/issue/BT-361). Near-miss (do not merge):
[BT-133](https://linear.app/vancura/issue/BT-133) paper Bayer dither is display-tier post-process.

### 3.6 Auto-quantize on load

`SpriteSheet.loadQuantized(url, palette, { dither: 'none' | 'bayer4' | 'bayer8' })` – map any RGBA PNG into the active
palette by nearest color, with optional ordered dithering.

- Beginners stop fighting "my PNG has 3000 colors"; demosceners get instant image conversion.
- Perceptual distance metric choice (plain RGB vs weighted) should be documented; keep deterministic.
- Complements, not replaces, `loadIndexed` (which registers the image's own colors).

### 3.7 Lospec loader and palette interchange

- `Palette.fromLospec('slso8')` – fetch + cache Lospec's palette JSON API; instant access to thousands of curated
  community palettes. Credit Lospec prominently.
- `Palette.toJSON()` / `Palette.fromJSON()` round-trip (also feeds save states and editors).
- Possibly `Palette.fromImage(url)` – extract the unique colors of a palette strip PNG (the standard interchange format
  pixel artists actually use).

### 3.8 Palette cycling preset gallery

`paletteCycle` exists; ship authored presets as data plus a guide: waterfall, fire, rain, plasma, glimmer – the Mark
Ferrari school of color cycling (credit him: https://www.markferrari.com/). Turns an existing primitive into a showcase
and a docs page that markets itself.

### 3.9 Smaller palette ideas

- Palette-weighted bloom: let `Bloom` weight by palette-slot luminance or an explicit per-slot glow mask ("slots 240–255
  are neon") – phosphor glow that only affects chosen colors. Display tier, but driven by palette metadata.
- Palette analysis in the overlay: usage tracking already exists; add "unused slots" and "duplicate colors" hints.
- `palette.remap(mapping: Uint8Array)` as a public one-shot index remap utility (the primitive under 3.3, useful alone).

## 4. Sprite animation v2 and the art pipeline

Umbrella: [BT-363](https://linear.app/vancura/issue/BT-363). Animation/pack reparented from
[BT-263](https://linear.app/vancura/issue/BT-263).

### 4.1 SpriteAnimation full spec

Filed: [BT-266](https://linear.app/vancura/issue/BT-266) (rewritten body; was thin #202).

### 4.2 Aseprite import

Filed: [BT-364](https://linear.app/vancura/issue/BT-364) (phase 1 JSON; phase 2 binary on checklist).

### 4.3 SpritePack synergies

Filed: [BT-271](https://linear.app/vancura/issue/BT-271) (rewritten; extends #207).

## 5. Rendering gaps no issue owns

### 5.1 Draw ordering / z-layers

Currently draw order = call order, forcing games to sort themselves. The single most important enabling primitive for
any future scene library.

- Per-draw `z` in `SpriteDrawParams` (Appendix A.1) and an optional z on primitives; stable sort within equal z
  (preserve call order) before batch flush.
- Or/and layer bracketing: `BT.layerSet(n)` ... draws ... `BT.layerSet(m)` – cheaper mental model, plays well with
  batching.
- A y-sort helper for top-down games: `z = destPos.y` convention documented, or `BT.drawSpriteYSorted(...)`.
- Design note: z-sorting interacts with the auto-batching by texture; sorting by (z, texture) is the standard answer and
  should be stated in the design.

### 5.2 Silhouette / stencil draw mode

Draw a sprite with every non-transparent texel forced to a single palette index.

- One shader flag (`SpriteDrawParams.silhouetteIndex?: number`).
- Uses: damage-flash white, drop shadows (silhouette + offset + light table = soft shadow), ghost/afterimage trails,
  outlines (silhouette at 4/8 offsets under the sprite – gives sprites what #211 gives text).

### 5.3 Bulk draw APIs

Amortized-validation fast paths so particle/starfield companion libraries can push tens of thousands of elements without
per-element call overhead.

- `BT.drawPixels(positions: Int32Array, index)` – packed x,y pairs.
- `BT.drawPixelsIndexed(positions: Int32Array, indices: Uint8Array)` – per-pixel color.
- `BT.drawSpriteBatch(sheet, items: SpriteBatchItem[])` or a packed-array form.
- Validation once per call, not per element; documented as the perf escape hatch in docs/performance-best-practices.md.

### 5.4 More primitives (rounds out #245–248)

- `drawPolygon` / `drawPolygonFill` (point list; scanline fill; document the fill rule together with #247).
- `drawArc` / `drawPie` – cooldown indicators, radar sweeps.
- Dashed/dotted line style for `drawLine` and `drawRect` (selection rectangles, paths).
- Flood fill `BT.fill(pos, index)` – honest and fast on an indexed framebuffer; paint demos, roguelike tooling.
- Bezier/spline stroke (wild, low priority) – demoscene curves, path previews.

### 5.5 Mode 7 affine layer (wild)

- Minimal: `BT.drawAffine(sheet, srcRect, matrix2x3)` – arbitrary affine blit of a sheet region (rotozoom).
- Full fantasy: per-scanline affine matrices for SNES-style perspective ground planes (F-Zero, Mario Kart). Combines
  with 3.1/3.2 raster machinery; palette-index native throughout.
- Nearest-neighbor sampling policy stated up front (chunky pixels are the point).

### 5.6 Screen transitions at the pixel tier

Palette-index-native wipes between scenes; digest confirms transitions are named nowhere in the backlog.

- `BT.transition(kind, durationMs, { onMidpoint, onComplete })` with kinds: `bayerDissolve`, `iris` (Zelda),
  `checkerboard`, `curtain`, `pixelate`, `swirl` (wild).
- `onMidpoint` is the hook where the game swaps scenes (screen fully covered).
- Implementation: pixel-tier effect with a progress uniform; Bayer dissolve is one threshold test against the 3.5
  pattern machinery.

### 5.7 Blend modes, honestly

Explicit non-goal worth writing down: RGBA alpha blending contradicts palette-first rendering. The honest equivalents –
remap tables (3.3), dither patterns (3.5), silhouette (5.2) – cover shadow/ghost/additive looks while staying indexed. A
docs page ("Why no alpha? Here is what to use instead") turns a limitation into a philosophy.

### 5.8 Clip stack (extends #249)

If clipping lands, GUI libraries will immediately want nesting: `BT.clipPush(rect)` / `clipPop()` with intersection
semantics, alongside the flat `clipSet/clipReset`. Also define clip space (screen vs world/camera) in #249 – currently
unspecified.

## 6. Capture, replay, and time control

Umbrella: [BT-365](https://linear.app/vancura/issue/BT-365).

### 6.1 Rolling GIF recorder

Filed: [BT-366](https://linear.app/vancura/issue/BT-366).

### 6.2 Deterministic session replay (wild, structural)

Filed: [BT-367](https://linear.app/vancura/issue/BT-367). Relates [BT-276](https://linear.app/vancura/issue/BT-276),
[BT-57](https://linear.app/vancura/issue/BT-57); carries open question 17.1.

### 6.3 Frame stepping and time scale

Filed: [BT-368](https://linear.app/vancura/issue/BT-368). Near-miss (do not merge):
[BT-68](https://linear.app/vancura/issue/BT-68) PresentDisable.

### 6.4 Dev-time asset hot reload

Shipped: [BT-303](https://linear.app/vancura/issue/BT-303) **Done**.

## 7. Fantasy-console constraints mode (wild)

`BT.constraints('nes' | 'c64' | 'gameboy' | 'spectrum' | 'pico8' | ConstraintSpec)` – opt-in simulation of real hardware
limits. Post-process presets (#217–219) make output LOOK old; constraints make the engine BEHAVE old.

- NES: 3+1 colors per 16×16 attribute region (attribute clash visualized or enforced), 8 sprites per scanline with
  authentic flicker (round-robin dropping), 64 sprite budget.
- C64: 40×25 color cells, limited per-cell color count, 8 hardware sprites + multiplexing flicker.
- ZX Spectrum: 8×8 attribute cells, 2 colors per cell (ink/paper), brightness bit – the attribute clash machine.
- Game Boy: 4 shades, 10 sprites per line, 8×8/8×16 sprite modes.
- PICO-8: 128×128, 16 colors.
- Custom `ConstraintSpec` for invented consoles ("design your own fantasy hardware" – educational gold).
- Implementation: a pixel-tier analysis/enforcement pass over the indexed framebuffer (attribute rules) plus draw-time
  sprite budgeting (scanline counters). Violations either enforced (authentic) or highlighted in the overlay
  (educational "clash debugger" mode).
- No engine has this. Demoscene, educators, and game-jam theme events ("NES-constraint jam") would all pick it up.

## 8. Text system extensions (beyond #210–214)

- Inline control codes, P8SCII-style: `[c=12]` color, `[shake]`, `[wave]`, `[font=big]` inline font switch,
  `[pause=500]` typewriter timing, `[marker=x]` gameplay hooks. Parser lives in the print path; codes escape-able.
- Typewriter reveal helper: a `TextReveal` object (chars/sec, punctuation pauses, `skipToEnd()`, `onChar` callback for
  blip sounds – direct synergy with the shipped synth presets).
- Per-glyph effects callback: `printFont(..., { glyphFx: (charIndex, basePos, out) => void })` – wavy, shaky, rainbow,
  drop-in text juice with zero new engine state.
- `BitmapFont` metrics: kerning pairs, tracking (letter-spacing), line-height control; inline font switching is
  mentioned in #210's preamble but never sub-issued.
- Ellipsis overflow mode for #212 (`TEXT_OVERFLOW_ELLIPSIS`) and an explicit wrap algorithm (word-break with char-break
  fallback; `\n` respected).
- i18n note (wild-ish): `.btfont` already supports 8192 glyphs; document a path for Latin-extended/CJK subsets and make
  `inputString` beyond-ASCII a conscious decision rather than an accident.

## 9. Audio extensions (beyond shipped system and #322–326)

### 9.1 Music transport completion (fold into #322 before implementation)

`BT.musicPause()` / `musicResume()`, `BT.musicPosition` getter (seconds into the current track) and
`musicSeek(seconds)`. Currently the spec can start, stop, and crossfade but never pause or tell you where it is.

### 9.2 Tracker module playback (wild)

MOD/XM playback via AudioWorklet. Tiny files (tens of KB for full songs), infinitely authentic, and the demoscene will
notice. Could be a companion package (`@blit386/tracker`) that feeds the music bus; the engine hook it needs is just a
worklet-friendly way to register a node into the `music` bus.

### 9.3 Step sequencer over the synth

A `MusicPattern`/`Sequencer`: 16/32-step grid, per-step synth params or preset refs, tempo, swing, pattern chaining.
PICO-8's music editor as a library – kids will make bangers. Natural home is a companion lib; the engine-level enabler
it needs is sample-accurate scheduling: `BT.soundPlayAt(clip, audioTime)` (AudioContext-clock start times). Ship the
enabler in-engine regardless.

### 9.4 Audio-reactive visuals

`BT.audioLevel(bus)` – expose the #324 analyzer publicly (peak/RMS per bus). VU-reactive demoscene visuals, rhythm
minigames, mouth-flap dialogue portraits.

### 9.5 Misc audio

- Per-sound low-pass "occlusion" option once #192's effect chain exists (`soundPlay(clip, { lowpass: 0.5 })`).
- Web MIDI input (wild): `BT` won't own it, but a demo + docs recipe (MIDI keyboard -> synth params) markets the synth
  engine.
- Audio export: render a `SynthParams` to WAV for download (sound-designer tooling hook, 15.2).

## 10. Tilemap additions (extend #193 when it gets rewritten)

The umbrella needs its API reconciliation first (section 2). These belong in the rewrite:

- Autotiling: Wang/blob (47-tile) and 16-tile bitmask autotilers – `mapAutotile(layer, region, ruleset)`. The feature
  that makes tilemaps pleasant to author programmatically.
- Animated tiles: tile-ID -> frame-sequence table stepped by the global clock (reuses 4.1 timing machinery).
- Tile queries for gameplay: `mapTileAt(worldPos)`, per-tile properties/flags (`solid`, `hazard`), and a rect-vs-map
  sweep helper – NOT physics, just the query primitives a collision companion lib needs.
- LDtk import alongside TMX: LDtk (https://ldtk.io by Sébastien Bénard) is JSON-native, modern, and far easier to
  support than full TMX; arguably support it FIRST.
- Iso/hex projections (wild): render-side projection support only (draw ordering + coordinate transforms), data model
  stays rectangular.
- Chunk streaming: pairs with `hash2i` (#297) for infinite procedural worlds; define chunk-eviction policy.

## 11. Input additions

- Input rebinding persistence: `BT.inputMap` exists but has no serialization – `inputMapSerialize(): string` /
  `inputMapLoad(json)` so games can persist remappings (demo 030 already wants this).
- Pointer lock / relative mouse: `BT.pointerLockRequest()`, `BT.pointerRelativeDelta` – needed for any mouselook-style
  or infinite-drag interaction.
- Gesture helpers: pinch (two-slot distance delta) and swipe (flick classification) computed from existing pointer slots
  – mobile games shouldn't hand-roll these; demo 027 (drag/flick) shows the demand.
- Gamepad rumble: `BT.gamepadRumble(player, { duration, weakMagnitude, strongMagnitude })` via `GamepadHapticActuator` –
  the sibling #284 explicitly skipped; Steam Deck has excellent haptics.
- Stylus fields: `tiltX/tiltY/twist` alongside #287's pressure (drawing-toy demos, art tools).
- Keyboard: an `anyInput()` "press anything to start" helper unifying #244's anyKey/anyButton with pointer taps – the
  actual use case behind both.

## 12. Overlay and dev tools

- `BT.watch(label, value)`: live variable watch rows in the overlay (call each frame; overlay renders last values). The
  cheapest high-value debug feature available.
- Frame stepping hotkeys – see 6.3.
- Live palette editor: the overlay palette grid already has hover/copy; add click-to-edit (RGB nudge) with "copy code"
  output – tune colors in-game, paste back into source.
- Input visualizer panel: live keyboard/gamepad/pointer state (demo 035 exists as a standalone; make it an overlay
  panel).
- Reframe #252 as an overlay panel (batches, vertices, texture switches, primitives-vs-sprites split) instead of a
  parallel `BT.batchDebug*` API.
- Memory row: JS heap (where available), GPU texture count/bytes tracked by the engine's own allocations.
- Asset panel: loaded assets, sizes, cache hits, load states (ties to #209).

## 13. Steam Deck and native-curious

### 13.1 Deck-first ship path

- A `blit package` command in @blit386/kit producing a Tauri wrapper (Rust WebView; ~5 MB vs Electron's ~150 MB) with
  icon, fullscreen default, and a Steam-ready layout; docs for "add as non-Steam game" and gamescope behavior.
- Verify WebGPU availability in the wrapper's WebView on SteamOS; document the fallback story (the software renderer
  suddenly earns its keep).
- Steamworks integration (wild): achievements/cloud saves via a Tauri plugin – ecosystem, not engine.

### 13.2 Controller glyph packs

Built-in indexed sprite packs of button glyphs: Steam Deck, Xbox, PlayStation, Switch, generic. Plus
`BT.gamepadKind(player): 'xbox' | 'playstation' | 'switch' | 'steamdeck' | 'generic'` sniffed from `Gamepad.id`, so
"Press [A]" renders the right glyph automatically. Small, universally needed, nobody ships it built-in. Pure
palette-indexed assets – they fit the engine's asset model perfectly.

### 13.3 Deck-specific ergonomics

- 16:10 awareness: Deck is 1280×800; letterboxing (#216) should document 16:10-native logical resolutions (400×250,
  320×200 – the DOS resolution!) as first-class choices.
- `targetFPS: 40`: the Deck's beloved 40 Hz mode; the fixed-timestep loop already supports arbitrary rates – bless it in
  docs with a battery-life note.
- Touch + gamepad simultaneously (Deck has both): already supported by the input model; add a docs recipe.

### 13.4 Other native curiosities (wild)

- Anbernic/Miyoo-class Linux handhelds: same Tauri story if the device runs a browser stack; document as
  community-supported.
- Raspberry Pi kiosk/arcade cabinet recipe: Chromium kiosk mode + gamepad; a docs page, not engine work.
- Playdate-style crank (wild): if a USB rotary encoder shows up as a gamepad axis, `BT.getAxis` already handles it; a
  demo would be a fun flex.

## 14. Web platform ideas

- OffscreenCanvas + worker rendering: run the whole engine in a Worker (input proxied via postMessage), main thread
  stays jank-free. WebGPU supports OffscreenCanvas; big architectural win, big lift – design doc first (wild).
- WebGPU compute (wild): compute-shader palette effects (full-screen index remaps, cellular automata demos, GPU particle
  updates feeding 5.3 bulk draws).
- PWA template: manifest + service worker + offline cache in create-blit386; installable games by default.
- Safe-area insets: expose `env(safe-area-inset-*)` so the virtual gamepad (#290) and HUDs avoid notches – worth a note
  inside #290 itself.
- Battery/thermal awareness: `navigator.getBattery` + `requestAnimationFrame` cadence watching to suggest 30 fps mode on
  throttling mobile GPUs (overlay hint, not automatic).
- WebCodecs (wild): exact-frame video export (beyond MediaRecorder's realtime capture) for trailer-quality clips.

## 15. Ecosystem sketches (separate ESM packages)

Per the architecture position (section 1), these are deliberately NOT engine features.

### 15.1 Companion libraries

- @blit386/scene: entities, z-ordered draw lists, lifecycle, groups. Consumes engine z (5.1) and animation (4.1).
- @blit386/ui: immediate-mode GUI – `ui.button(rect, 'Start')` returns clicked-this-frame. IMGUI style fits the renderer
  philosophy exactly (no retained widget tree; draws through BT every frame; needs only clipping #249 and nine-slice
  #206 from the engine). Retained-mode GUI can be a later, separate experiment.
- @blit386/motion: tweens, timelines, screen-shake recipes; re-exports engine `Easing`.
- @blit386/particles: emitters/forces over the bulk draw APIs (5.3).
- @blit386/collide: AABB/grid/swept collision helpers on `Rect2i`; platformer controller recipes. Physics-lite; real
  physics never enters the ecosystem's core.
- @blit386/dialogue: typewriter + portraits + choices over the text control codes (8).
- @blit386/save: versioned localStorage save slots with schema migration (PICO-8 cartdata analog).
- @blit386/tracker: MOD/XM playback into the music bus (9.2).
- @blit386/net-rollback (wildest library): rollback netcode over the determinism guarantees of 6.2. Only possible if
  17.1 is answered "yes" early.

### 15.2 Tooling (web apps)

- Synth sound designer: sliders over `SynthParams`, live preview, preset morphing, "copy code" button emitting the
  `AudioClip.synth({...})` call. Cheap to build (the synth shipped today), instantly loved, markets the audio system.
- .btfont editor: glyph grid editing, kerning-pair table, import from BMFont/image strips.
- Palette/ramp editor: build palettes, define ramps (3.4), generate light tables (3.3), import/export Lospec/JSON,
  preview cycling.
- Aseprite bridge CLI in the kit: `blit assets` – watch an art folder, run Aseprite exports, regenerate packs.
- BLIT386 Studio (wild): code + sprites + palette + sounds + instant run in one page – the PICO-8 cockpit experience,
  composed from the editors above around the existing Vite dev flow.

### 15.3 Cartridge format (wildest)

- `.b386` cart: a single zip (code + assets + manifest) with a hosted web player and iframe embed support – "share a
  cart, not a repo."
- PNG cartridge steganography, the beloved PICO-8 party trick: embed the cart bytes in a screenshot's low bits. The
  indexed output makes the cover image trivially authentic.
- Cart gallery on blit386.dev (BBS-lite); pairs with the demos site infrastructure that already exists.

### 15.4 Community

- awesome-blit386 growth: palettes, carts, effect presets, fonts.
- A recurring jam ("BLITJAM") with constraint themes powered by section 7.
- Effect/preset gallery page: every post-process preset and palette-cycling preset live, with copy-paste snippets.

## 16. Prioritization

Top five bets from the session (Linear links after 2026-07-24 promotion):

1. Sprite animation done fully (4.1) + Aseprite import (4.2) – [BT-363](https://linear.app/vancura/issue/BT-363) /
   [BT-266](https://linear.app/vancura/issue/BT-266) / [BT-364](https://linear.app/vancura/issue/BT-364).
2. Rolling GIF recorder (6.1) – [BT-366](https://linear.app/vancura/issue/BT-366).
3. Palette superpowers trio (3.1 / 3.3 / 3.5) – [BT-359](https://linear.app/vancura/issue/BT-359) /
   [BT-362](https://linear.app/vancura/issue/BT-362) / [BT-360](https://linear.app/vancura/issue/BT-360) /
   [BT-361](https://linear.app/vancura/issue/BT-361).
4. Determinism policy + replay foundation (6.2) – [BT-367](https://linear.app/vancura/issue/BT-367).
5. drawSprite v2 unification (Appendix A.1) – [BT-236](https://linear.app/vancura/issue/BT-236).

Suggested sequencing waves (each wave shippable independently):

- Wave 1 (unblock + hygiene): drawSprite v2 ([BT-236](https://linear.app/vancura/issue/BT-236)), ColorArg
  ([BT-235](https://linear.app/vancura/issue/BT-235)), orientation rename
  ([BT-234](https://linear.app/vancura/issue/BT-234) **Done**), stale-issue audit
  ([BT-358](https://linear.app/vancura/issue/BT-358)), #279 closed on GitHub.
- Wave 2 (identity): dither ([BT-361](https://linear.app/vancura/issue/BT-361)), light tables
  ([BT-360](https://linear.app/vancura/issue/BT-360)), per-scanline palettes
  ([BT-362](https://linear.app/vancura/issue/BT-362)); silhouette / Lospec still unfiled (parent checklist / §3.x).
- Wave 3 (pipeline): SpriteAnimation ([BT-266](https://linear.app/vancura/issue/BT-266)), Aseprite
  ([BT-364](https://linear.app/vancura/issue/BT-364)), SpritePack ([BT-271](https://linear.app/vancura/issue/BT-271));
  z-ordering still §5.1.
- Wave 4 (social/dev): GIF ([BT-366](https://linear.app/vancura/issue/BT-366)), timeScale
  ([BT-368](https://linear.app/vancura/issue/BT-368)); BT.watch still §12; hot reload
  ([BT-303](https://linear.app/vancura/issue/BT-303) **Done**).
- Wave 5 (structure): replay ([BT-367](https://linear.app/vancura/issue/BT-367)); bulk draws / transitions still §5.
- Demoscene engine hooks (parallel): [BT-70](https://linear.app/vancura/issue/BT-70) –
  [BT-67](https://linear.app/vancura/issue/BT-67) / [BT-115](https://linear.app/vancura/issue/BT-115) /
  [BT-289](https://linear.app/vancura/issue/BT-289) / [BT-369](https://linear.app/vancura/issue/BT-369) /
  [BT-370](https://linear.app/vancura/issue/BT-370).
- Ongoing: Steam Deck packaging in the kit, controller glyphs, ecosystem libraries as demand appears.

## 17. Open questions

1. Determinism: is replay/netcode-grade determinism a design goal baked into the random + loop design now, or a later
   best-effort concern? (Cheap now, miserable to retrofit. Affects #293–299 acceptance criteria.)
2. ColorArg resolution policy: when a beginner writes `'red'`, does it resolve to an exact palette match, nearest color,
   auto-registered new slot, or a helpful error? (Appendix A.2 lists the options.)
3. Arbitrary sprite rotation (#204): is non-90-degree rotation of pixel art something the engine should encourage at
   all, or should v1 ship flags-only (90-degree steps + flips) with arbitrary rotation deferred to `drawAffine` (5.5)?
4. Palette LUT budget: per-scanline palettes (3.1) and light tables (3.3) both grow the palette texture – decide the
   combined GPU memory/bind-group design once rather than per-feature.
5. Where does the sequencer live: engine (`MusicPattern`) or companion lib over `BT.soundPlayAt`? (9.3 recommends
   companion + in-engine scheduling enabler.)

## 18. Demoscene track

Added 2026-07-07. Goal: make BLIT386 the platform where people write demos and intros like it's the 90s again – with LLM
copilots in the loop. The demoscene audience wants almost the opposite of the game-dev audience: less abstraction, not
more. A game dev wants `drawSprite`; a scener wants the framebuffer, the palette registers, and a way to sync everything
to row 32 of pattern 4.

Engine hooks umbrella (extended, not duplicated): [BT-70](https://linear.app/vancura/issue/BT-70).

### 18.0 Where these features live (decided)

Split by mechanism, not by audience – the same rule that keeps scene graph/GUI/physics out of the engine, pointed the
other way:

- Engine: the six pipeline-touching primitives (18.1–18.2 plus `renderAt` in 18.4). A library physically cannot build
  them from outside – they need the `r8uint` logical attachment, the resolve/upscale pass, and the game-loop clock.
  Exposing enough internals for a library to implement them would mean designing the engine feature anyway, with a worse
  API and a stability contract on internals you would regret. And none are demoscene-only: games want feedback trails
  (bullet-hell effects), copper gradients (skies, water), index shaders (custom weather/lighting), and `renderAt`
  (trailer rendering, agent-driven testing) too. They have the same status as clipping (#249) or z-ordering (5.1):
  general primitives the demoscene happens to stress hardest.
- `@blit386/demo` companion: everything workflow-shaped (18.3, 18.6) – Rocket sync, tracker playback + row events,
  BPM/beat helpers, parts timeline, micro3d, scroller helpers. Consumes public `BT` APIs only, evolves at demotool speed
  (sceners will want to fork the Rocket editor – that churn must not live in the engine), keeps the engine's
  API/knip/test budget lean, and would bloat the `BT` surface for a minority audience if built in. Start as one umbrella
  package; split `@blit386/rocket` or `@blit386/tracker` out only if they grow real mass. Pin compatibility via
  `engineRange` like the kit does.
- Kit CLI: `blit bundle --single`, `blit shot` (18.4, 18.7).
- Failure mode to avoid: designing the engine hooks without the library in mind. Rocket needs to pause and scrub the
  clock – that is `renderAt` plus `timeScale` (6.3); if those land engine-side with the demo lib as a named consumer in
  their acceptance criteria, the split works. If not, the lib fills with monkey-patches. Co-design: ship each engine
  primitive with the demo lib as its first consumer.

### 18.1 The chunky framebuffer tier (engine)

Filed / rewritten (no parallel umbrella):

- `BT.frameLock` / `frameUnlock` – [BT-67](https://linear.app/vancura/issue/BT-67)
- Previous-frame feedback (`drawFrameLast` / drawCopy) – [BT-115](https://linear.app/vancura/issue/BT-115)
- Pixel-tier `indexShader` – [BT-289](https://linear.app/vancura/issue/BT-289) (under
  [BT-353](https://linear.app/vancura/issue/BT-353))
- Plasma demo consumer remains [BT-183](https://linear.app/vancura/issue/BT-183) (blocked by BT-67)

### 18.2 The Copper (engine)

Filed: [BT-369](https://linear.app/vancura/issue/BT-369). Relates palette
[BT-362](https://linear.app/vancura/issue/BT-362) / [BT-359](https://linear.app/vancura/issue/BT-359).

### 18.3 Sync – the actual soul of a demo (`@blit386/demo`)

A demo is music synchronization; everything else is decoration. Nothing in the backlog covers it:

- Rocket-style sync tracker: GNU Rocket is the de facto demotool standard – keyframe tracks (`camera.x`, `flash`,
  `partIndex`) edited in a tracker UI while the demo runs, values interpolated per row, driven by the music clock.
  Either speak the existing Rocket socket protocol (instant credibility; existing editors work) or ship a small web
  editor. Dev mode: live editing, scrub the music and the demo follows. Release mode: tracks baked to JSON. This is the
  feature that makes sceners take the platform seriously.
- Tracker music with row events: 9.2 (MOD/XM playback) has a stronger reason than nostalgia –
  `onRow((pattern, row) => ...)` is how demos synced for twenty years. Pattern position makes the music the timeline.
- BPM helpers for everyone else: `beatSet(bpm, offset)` then `beat` (float beats elapsed), `onBeat`, bar/phrase math;
  plus `BT.audioLevel(bus)` FFT bands (9.4) for flash-on-kick.
- Parts timeline: `demo.part('tunnel', from, to)` with transition effects (5.6) between parts – the boilerplate every
  intro rewrites.

### 18.4 Deterministic offline rendering (engine + kit)

Filed: [BT-370](https://linear.app/vancura/issue/BT-370). Relates [BT-367](https://linear.app/vancura/issue/BT-367) /
[BT-368](https://linear.app/vancura/issue/BT-368). Near-miss: [BT-68](https://linear.app/vancura/issue/BT-68).

### 18.5 Vibe-coding infrastructure (site + kit)

- `llms.txt` + `llms-full.txt` on blit386.dev, plus a single-page condensed API reference designed for pasting into a
  context window. The docs site already generates everything; this is an output format, not new content.
- A "demo dojo" docs section: classic effects as annotated recipes – fire, plasma, rotozoom, starfield, twister, sine
  scroller, metaballs – each roughly 30 lines against the framebuffer/copper APIs, math explained. Simultaneously
  documentation, marketing, and few-shot prompt material: someone (or their agent) copies the plasma recipe and mutates
  it. That copy-mutate loop is how the 90s scene learned – recreated.
- A demo-flavored agent preset in the kit: `blit agents` already generates assistant config for games; add a demo
  variant whose guidance says framebuffer loops are idiomatic here, target the copper and index-shader APIs, sync to the
  beat helpers.

### 18.6 Oldschool vocabulary helpers (`@blit386/demo`)

- micro3d: the engine stays integer-2D, correctly – but sceners expect dot balls, wireframes, and glenz vectors. A tiny
  module (Vec3, rotate, project to Vector2i) feeding `drawLine`/`drawPixels` covers dots and wireframes. The neat part:
  glenz (fake transparency on filled vectors) is literally polygon fill (5.4) + light-table remap (3.3) – the
  palette-first architecture makes the classic effect honest instead of hacked.
- Sine-scroller helper riding per-glyph effects (8) – the hello-world of demos deserves a two-liner.

### 18.7 Compo and community positioning

- Single-file HTML export: `blit bundle --single` – assets inlined as data URIs, one `.html` artifact. Compo-legal,
  Pouet-uploadable, works offline at the party; doubles as the shareable cart (15.3 builds on it).
- "Engine allowed" size category framing: publish the engine at a pinned CDN URL and define an intro entry as your JS
  only – the fantasy-console compo model (the runtime does not count against size, as with PICO-8). Then pitch a BLIT386
  category or theme night at Lovebyte/Inercia-style online parties. One compo appearance is worth a year of marketing to
  this crowd.
- Index-shader gallery on blit386.dev: Shadertoy's loop (see effect, view source, fork) but palette-native; pairs with
  the GIF recorder (6.1) for instant thumbnails.

### 18.8 The demoscene-critical three

1. Framebuffer lock + feedback buffer (18.1) – without per-pixel freedom, sceners will not come at all.
2. Rocket-style sync + tracker row events (18.3) – without sync, nothing they make will feel like a demo.
3. `renderAt` deterministic seek (18.4) – the multiplier behind compo delivery, sync editing, and agent-driven
   vibe-coding.

## Appendix A: Meta-issues (filed)

Full bodies live in Linear; drop local `issue-drafts/` paths.

- A.1 Unified `drawSprite` v2 signature – [BT-236](https://linear.app/vancura/issue/BT-236) (umbrella; blocks
  flip/rot/pivot/scale/raw-number children)
- A.2 `ColorArg` string color type – [BT-235](https://linear.app/vancura/issue/BT-235)
- A.3 Orientation naming collision – [BT-234](https://linear.app/vancura/issue/BT-234) **Done** (`screenOrientation`
  shipped)
