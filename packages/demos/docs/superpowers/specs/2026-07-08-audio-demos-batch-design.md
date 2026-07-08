# Audio demos batch - design

- Date: 2026-07-08
- Status: Approved (pending spec self-review)

## Context

BLIT386 engine issues #319 (context/mixer buses/autoplay unlock), #321 (sound playback), and #322 (music playback with
crossfade/loop points) are shipped. Three open blit386-demos issues become buildable now:

- [#90](https://github.com/blit386/blit386-demos/issues/90) - `037-music`
- [#91](https://github.com/blit386/blit386-demos/issues/91) - `038-audio-buses`
- [#96](https://github.com/blit386/blit386-demos/issues/96) - retrofit sound into existing demos (3 of 4 scope items:
  `029-snake-game`, `014-game-scene`, `027-pointer-drag-flick`; the `023-crt-pipboy` item stays blocked on engine issue
  #192, the audio effect chain)

Still blocked and out of scope for this batch: `039-positional-audio` (#92, needs engine #323), `040-speaker-presets`
(#93, needs engine #192), `042-adaptive-music` (#95, needs engine #326).

`036-audio-basics` and `041-synth-toy` already exist and cover `AudioClip.load()` / `AudioClip.synth()` /
`BT.soundPlay()` basics and the synth preset library - this batch does not repeat that ground.

The new `isOverlayAudioMetersEnabled` overlay flag (per-bus level bars + voice/steal/drop text readout) is unused by any
existing demo. Per user instruction, it is enabled ONLY on the two new demos (`037-music`, `038-audio-buses`) - not on
the three retrofits.

## 1. Audio asset generation

`BT.musicPlay()` requires a real decoded `AudioClip` (multi-second melodic content). `AudioClip.synth()` only renders a
single pitched note (one waveform + envelope + optional pitch sweep/vibrato/noise mix) - not a multi-note melody - so it
cannot produce music-track content. `public/audio/` currently has only two short one-shot SFX (`blip.wav`, `pop.wav`)
and no music.

New `scripts/generate-audio-loops.mjs` (Node, ES module, follows the existing `scripts/check-markdown-links.mjs`
convention - runnable via `node scripts/generate-audio-loops.mjs` and wired to a new `pnpm run generate:audio-loops`
script). No new npm dependency: the script computes 16-bit PCM samples directly and writes a standard 44-byte RIFF/WAVE
header by hand (mono, 44100 Hz).

Each loop is a layered square/triangle-wave arpeggio (lead voice) over a simple root-note bass voice, built from a short
note-sequence table (frequency + duration steps) repeated to fill the loop length, summed and normalized to avoid
clipping. Three output files:

- `public/audio/music-calm.wav` - slow tempo (~80 BPM), triangle-wave lead, mellow minor-key arpeggio. ~6-8 s loop.
- `public/audio/music-upbeat.wav` - faster tempo (~140 BPM), square-wave lead, energetic major-key arpeggio. ~4-6 s
  loop.
- `public/audio/music-intro-loop.wav` - a ~1.5 s distinct intro riser (ascending arpeggio, not part of the loop)
  followed by a ~4-6 s loop section in the same style as `music-calm`. The script records and prints the loop-region
  start/end offsets in seconds for use as `loopStart`/`loopEnd` in demo code (also embedded as a comment at the top of
  the generated file's companion `.json` sidecar - see below).

The script writes a small `public/audio/music-intro-loop.loop.json` sidecar
(`{ "loopStart": <seconds>, "loopEnd": <seconds> }`) so the exact values are computed once by the generator
(sample-accurate) and consumed as literal numbers in demo source, rather than duplicated/hand-guessed in `037-music.js`.
`014-game-scene.js` reads the same literals (copy the two numbers into a local constant with a comment pointing at the
sidecar - no runtime JSON fetch needed for a demo).

The three `.wav` files (and the `.loop.json` sidecar) are committed to the repo, matching the existing baked-asset
pattern for `blip.wav`/`pop.wav`.

Reuse across demos (per user decision - reuse over bespoke-per-demo):

| File                   | Used by                                                |
| ---------------------- | ------------------------------------------------------ |
| `music-calm.wav`       | 037 crossfade track A; 038 background/ducking track    |
| `music-upbeat.wav`     | 037 crossfade track B; 029-snake-game background music |
| `music-intro-loop.wav` | 037 loop-point track; 014-game-scene background music  |

## 2. `037-music` demo (issue #90)

Follows the established HUD-strip-plus-controls pattern (see `027-pointer-drag-flick.js`, `041-synth-toy.js`): title
bar, a row of pointer/keyboard-selectable buttons, status text.

- **Track A / Track B buttons**: swap between `music-calm` and `music-upbeat` via `BT.musicPlay`. Two distinct crossfade
  profiles so the difference is audible and visible in on-screen text:
  - A -> B: `{ fadeMs: 1200, overlap: 1, easeIn: 'ease-in-out', easeOut: 'ease-in-out' }` (simultaneous
    fade-in/fade-out).
  - B -> A: `{ fadeMs: 800, overlap: -1, easeIn: 'linear', easeOut: 'linear' }` (fade-out fully completes, brief gap,
    then fade-in - audibly different timing shape from A -> B).
- **Loop Demo button**: plays `music-intro-loop` with explicit `loopStart`/`loopEnd` (from the sidecar values) so the
  intro plays once and only the loop region repeats. On-screen text states the loop boundaries in seconds.
- `isOverlayAudioMetersEnabled: true` in `configure()`. No custom `overlayAudioMeterStyle` needed (defaults to overlay
  text/gap palette indices).
- Same `BT.isAudioUnlocked` first-gesture messaging pattern as `036-audio-basics`.
- Prerequisites listed in the header comment: `036-audio-basics`.

## 3. `038-audio-buses` demo (issue #91)

Same HUD pattern. No native HTML form controls (canvas-only demo, consistent with the rest of the series) - value bars
driven by keyboard/pointer, same technique `041-synth-toy.js` uses for its parameter panel.

- Three horizontal bar sliders for `main`/`music`/`sfx` bus volume via `BT.audioVolumeSet(bus, value, { fadeMs: 0 })` /
  `BT.audioVolumeGet(bus)`, adjustable with arrow keys (selected bus) or pointer drag.
- One mute toggle button per bus via `BT.audioMuteSet(bus, !BT.isAudioMuted(bus))`. On-screen proof text shows the
  stored volume value is unchanged while muted (reads `audioVolumeGet` alongside the mute state).
- `music-calm` loops in the background from `init()` (`BT.musicPlay`, `loop: true`).
- **Alert button**: plays a synth stinger (`BT.synthPreset` or a custom short `SynthParams` - reuse `synthPreset.hit()`
  is fine, it is not used elsewhere in this batch) via `BT.soundPlay`, while ducking the music bus:
  `BT.audioVolumeSet('music', duckedValue, { fadeMs: 150 })` immediately before, then restoring the prior volume with
  `{ fadeMs: 600 }` after a short delay (timer-based, matching the tick-based timer pattern used throughout the demo
  series, e.g. `Timer` usage in `014-game-scene.js`).
- `isOverlayAudioMetersEnabled: true` in `configure()`.
- Prerequisites: `036-audio-basics`, `037-music`.

## 4. Retrofit (issue #96, 3 of 4 items)

`023-crt-pipboy` stays out of scope (blocked on engine #192).

### `029-snake-game.js`

- `music-upbeat` loops from `init()` (`BT.musicPlay`, `loop: true`) - matches the fast-paced gameplay.
- Eat sound: `BT.synthPreset.pickup()` via `BT.soundPlay`, triggered at the existing food-eaten point in the step logic.
- Game-over sound: `BT.synthPreset.explosion()` via `BT.soundPlay`, triggered where `gameOver` currently flips true.
- No audio meter (retrofit, not a new demo).

### `014-game-scene.js`

- `music-intro-loop` loops from `init()` (`BT.musicPlay` with `loopStart`/`loopEnd` from the sidecar) - the capstone
  demo becomes the "loop points in a real game" reference, tying back to `037-music`.
- Day/night phase transition chime: a short custom `SynthParams` tone (sine, quick attack/decay, no sustain hold - not
  one of the six named presets, all of which are combat/UI-flavored) played via `BT.soundPlay` when
  `updateWorldPalette`'s phase computation crosses a dawn/day/dusk/night boundary (edge-detected against the previous
  tick's phase, same edge-detection idea already used elsewhere in the series for keyboard input).
- Capture-confirmation blip: `BT.synthPreset.blip()` via `BT.soundPlay`, played alongside the existing
  `lastCaptureMessage` success path in the Space-to-capture handler.
- Explicitly no per-particle sound (spawn rate would make it noisy and repetitive) and no audio meter.

### `027-pointer-drag-flick.js`

- Flick whoosh: custom `SynthParams` (`waveform: 'sine'`, short `pitchSweep` sweeping downward, light `noiseMix`,
  `duration` and `volume` scaled by clamped throw speed) via `BT.soundPlay`, triggered in `tryThrow()` using the same
  `speed` value already computed there for the launch clamp.
- Wall-bounce thud: custom `SynthParams` (`waveform: 'sine'`, low `frequency`, fast attack/decay, `sustain: 0`) via
  `BT.soundPlay`, triggered in `updateFreeBall()` at each of the four existing wall/floor bounce branches (skip
  triggering below `MIN_SPEED` to avoid a thud on a ball that is essentially at rest).
- No audio meter.

## 5. Documentation

- README `### Audio` section gains two new bullets for `037-music` and `038-audio-buses`, following the existing bullet
  format/style (see `036-audio-basics`/`041-synth-toy` entries).
- The existing README bullets for `029-snake-game`, `014-game-scene`, and `027-pointer-drag-flick` each get a short
  added clause noting the new sound integration (per issue #96's instruction to update descriptions where they change).
- No new demo-specific docs beyond the standard header-comment prerequisites/links convention.

## Testing / verification

This repo has no automated test suite (see `demos-test` skill) - verification is manual, per demo:

- Each of the 5 touched demos loads without console errors, the first-gesture unlock flow works, and every new
  sound/music trigger is audible with correct behavior (crossfade timing/profile difference, loop-point seam, bus mute
  preserving volume, ducking dip-and-recover, retrofit SFX firing at the right moments).
- `pnpm run preflight` (format, lint, spellcheck, knip, docs:links, build) must pass, including spellcheck on any new
  terms (e.g. "arpeggio", "chiptune" may need adding to `cspell.json`).

## Out of scope

- `039-positional-audio`, `040-speaker-presets`, `042-adaptive-music` (blocked on engine work).
- The `023-crt-pipboy` item from issue #96 (blocked on engine #192).
- Any change to the engine (`blit386`) itself - this batch only consumes the already-shipped public `BT` audio API.
