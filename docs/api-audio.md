# Audio

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/audio, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Bus volume, mute, and the browser autoplay-unlock state. For the higher-level subsystem walkthrough (bus graph layout,
locked vs. unlocked, and web autoplay constraints), see the [Audio Guide](guide-audio.md).

The audio graph has three buses: `'sfx'` and `'music'` feed into `'main'`, which feeds the browser's audio destination.
All three are independently controllable.

```text
sfx    ─┐
music  ─┼─► main ─► destination
```

`AudioBus` is the type of a bus name:

```ts twoslash
import { type AudioBus } from 'blit386';
// ---cut---
declare const bus: AudioBus; // 'main' | 'music' | 'sfx'
```

## Volume

`BT.audioVolumeSet` sets a bus's volume, optionally fading to it. `BT.audioVolumeGet` reads it back.

```ts twoslash
import { BT } from 'blit386';
// ---cut---
BT.audioVolumeSet('music', 0.5); // immediate change
BT.audioVolumeSet('sfx', 0, { fadeMs: 300 }); // linear fade to silence over 300 ms
BT.audioVolumeSet('main', 0.8, { fadeMs: 500, easing: 'ease-out' }); // eased fade

BT.audioVolumeGet('music'); // 0.5
```

`options` fields:

<TypeTable type={{
    fadeMs: { type: 'number', description: 'Fade duration in milliseconds. Omit for an immediate change.' },
    easing: { type: 'EasingFunction', default: "'linear'", description: 'Easing curve for the fade. Ignored when fadeMs is omitted.' },
  }} />

With no `fadeMs`, the bus gain changes immediately. With `fadeMs`, `'linear'` easing schedules a linear ramp; any other
[easing curve](api-easing.md) is sampled into a value curve so the fade follows that curve rather than a straight line.

## Mute

`BT.audioMuteSet` mutes or unmutes a bus without touching its configured volume. `BT.isAudioMuted` reports the current
mute state.

```ts twoslash
import { BT } from 'blit386';
// ---cut---
BT.audioVolumeSet('music', 0.75);

BT.audioMuteSet('music', true); // silences the bus immediately (no fade)
BT.isAudioMuted('music'); // true
BT.audioVolumeGet('music'); // still 0.75 - muting never overwrites the configured level

BT.audioMuteSet('music', false); // restores audio at 0.75
```

`BT.audioVolumeGet` always returns the logical (pre-mute) volume, so reading it while muted still reports the level you
configured, not `0`.

## Unlock state

Browsers block audio playback until a user gesture. `BT.isAudioUnlocked` is `false` until the first `pointerdown`,
`keydown`, or `touchstart` on the canvas successfully resumes the audio context, and stays `true` for the rest of the
session.

```ts twoslash
import { BT } from 'blit386';
// ---cut---
if (!BT.isAudioUnlocked) {
  // Show a "click or press a key to enable audio" prompt.
}
```

See [Web audio constraints](guide-audio.md#web-audio-constraints) for what happens to volume/mute calls made before the
gesture, and why no configure flag can skip this requirement.

## Loading

`AudioClip` decodes an audio file into a reusable `AudioBuffer`, exposing the winning source URL, duration, and sample
rate. Loading and decoding work even while the audio context is locked (suspended, pre-gesture) - only real-time
playback needs an unlocked context. See [Preloading audio clips](guide-audio.md#preloading-audio-clips).

```ts twoslash
import { AudioClip } from 'blit386';

// Load a single clip (cached by its resolved URL)
const theme = await AudioClip.load('audio/theme.mp3');

// Fallback list: tries each URL in order, resolving with the first that decodes
const hit = await AudioClip.load(['audio/hit.ogg', 'audio/hit.mp3']);

// Load multiple clips in parallel - each entry is a single URL or a fallback list
const clips = await AudioClip.loadAll(['audio/theme.mp3', ['audio/hit.ogg', 'audio/hit.mp3']]);

// Check cache before loading
if (AudioClip.isLoaded('audio/theme.mp3')) {
  // already cached
}
```

Pass `onProgress` to report phased load progress:

```ts twoslash
import { AudioClip } from 'blit386';
// ---cut---
await AudioClip.load('audio/theme.mp3', {
  onProgress: (progress) => {
    console.log(progress.phase, progress.ratio);
  },
});
```

<TypeTable type={{
    phase: { type: "'download' | 'decoding'", description: 'Which stage of the load this snapshot reports.' },
    ratio: { type: 'number | null', description: 'Fraction complete in [0, 1]. null when Content-Length is unknown, or during the single, atomic decode step.' },
  }} />

Release a clip's decoded buffer with `unload()` once you no longer need it:

```ts twoslash
import { AudioClip } from 'blit386';
declare const theme: AudioClip;
// ---cut---
theme.unload(); // releases the decoded buffer; safe to call more than once
```

- `AudioClip.load()` and `loadAll()` throw a beginner-friendly error covering network/CORS failures, HTTP status errors,
  unsupported container/codec decode failures, and loading before the engine has started.
- Prefer a fallback list (for example `['theme.ogg', 'theme.mp3']`) for any clip whose primary format might not decode
  in every browser - see [Audio formats](api-browser-support.md#audio-formats).
- Playing loaded clips back (SFX/music voices routed through the bus graph) is not implemented yet; this phase covers
  the bus graph, volume, mute, unlock tracking, and clip loading that a future playback API will build on.

## Hardware settings

`audioVoices` (default `16`, reserved for an upcoming SFX voice-limiting pass; not yet enforced) is documented in
[Hardware settings](api-core.md#hardware-settings).

## See also

<Cards>
  <Card title="Audio Guide" href="/docs/guides/audio">Subsystem layout, locked vs. unlocked, web audio constraints.</Card>
  <Card title="API: Easing" href="/docs/api/easing">Named easing curves used by fadeMs.</Card>
  <Card title="API: Core" href="/docs/api/core">Hardware settings, including audioVoices.</Card>
  <Card title="API: Browser Support" href="/docs/api/browser-support">Browser/build support matrix.</Card>
</Cards>
