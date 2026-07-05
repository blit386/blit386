# Audio

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/guides/audio, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Bus volume, mute, and worked examples live in [API: Audio](api-audio.md). This guide maps the internal subsystem, the
locked/unlocked gesture state, and the web platform constraints that shape it.

## Subsystem layout

```text
src/audio/
  AudioManager.ts        # Web Audio context, bus graph, unlock state machine, mute/volume, SFX playback
  audioDecodeContext.ts  # Decode-context registry AudioClip reads from to decode
  VoicePool.ts           # Fixed-size SFX voice pool: allocation/stealing, generational refs, per-voice fades
src/assets/
  AudioClip.ts           # Decoded AudioBuffer asset: streamed fetch+decode, cache/dedup, fallback URL lists
```

`AudioManager` is owned by the internal `BTAPI` singleton (created and torn down alongside pointer, keyboard, and
gamepad input) and is never exposed to demo code directly - only through the `BT.audio*`/`BT.sound*` methods and the
`BT.isAudioUnlocked` getter documented in [API: Audio](api-audio.md). On `attach()`, `AudioManager` registers its Web
Audio context in `audioDecodeContext.ts`, a small bridge that `AudioClip` reads from to decode audio data without
needing a direct reference to `AudioManager` itself.

`AudioClip` (see [Loading](api-audio.md#loading)) lives alongside the other asset loaders in `src/assets/` and uses that
bridge to decode fetched audio bytes into a reusable `AudioBuffer`.

Tests mock the Web Audio API with `src/__test__/webaudio-mock.ts` (including a configurable `decodeAudioData` for
`AudioClip` tests), since neither Node.js nor happy-dom implement it.

## Locked vs. unlocked

| State                            | What that means                                                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Locked (default until a gesture) | `BT.isAudioUnlocked` is `false`. `audioVolumeSet`/`audioMuteSet` calls still update engine-side state, but the browser's audio context is suspended, so nothing is audible yet.                |
| Unlocked                         | `BT.isAudioUnlocked` is `true`. Set once `AudioContext.resume()` resolves after the first `pointerdown`, `keydown`, or `touchstart` on the canvas. Stays unlocked for the rest of the session. |

The engine listens for all three gesture types at once and removes the listeners as soon as one of them succeeds, so
whichever input method a player uses first (mouse, keyboard, or touch) unlocks audio.

## Usage example

```ts twoslash
import { BT, type IBTDemo, Vector2i } from 'blit386';

class Demo implements IBTDemo {
  async init() {
    BT.audioVolumeSet('music', 0.6);
    BT.audioVolumeSet('sfx', 0.9);

    return true;
  }

  update() {}

  render() {
    if (!BT.isAudioUnlocked) {
      BT.systemPrint(new Vector2i(8, 8), 2, 'Click or press a key to enable audio');
    }
  }
}
```

## Preloading audio clips

`AudioClip.load()` downloads and decodes audio even while the context is locked (suspended, pre-gesture) - decoding only
needs a registered context, not an unlocked one. That makes a title screen or a loading state a good place to preload
every clip a level needs, so they're ready the instant the player's first gesture unlocks audio.

```ts twoslash
import { AudioClip, type IBTDemo } from 'blit386';

class Demo implements IBTDemo {
  async init() {
    // Decodes now, even before the player's first gesture unlocks the context.
    await AudioClip.loadAll(['audio/theme.mp3', ['audio/hit.ogg', 'audio/hit.mp3']]);

    return true;
  }

  update() {}
  render() {}
}
```

Prefer a fallback list (for example `['theme.ogg', 'theme.mp3']`) for any clip whose primary format might not decode in
every browser - see [Audio formats](api-browser-support.md#audio-formats) for the current per-browser matrix.

## Web audio constraints

Every major browser enforces an autoplay policy: an `AudioContext` starts `'suspended'` and stays that way until a user
gesture calls `resume()`. This is a platform rule, not something BLIT386 can configure around - there is no flag to
start audio unlocked, and none is planned.

- Volume and mute calls made before the gesture are not lost; they update the engine's internal bus state and take
  effect immediately once the context resumes.
- The gesture requirement is independent of the render backend. Unlocking audio has nothing to do with
  `BT.activeBackend` or the WebGPU/Canvas 2D fallback described in [Browser Support](api-browser-support.md) - a demo
  can be fully unlocked on the software renderer, or fully locked on WebGPU.
- Loading and decoding clips is implemented via `AudioClip` (see [Loading](api-audio.md#loading)) and works regardless
  of lock state. `BT.soundPlay` (see [Playback (SFX)](api-audio.md#playback-sfx)) is gated on the same unlock gesture as
  bus volume/mute: a call made before unlock is dropped silently (no throw), exactly like a pre-unlock
  `BT.audioVolumeSet`.

## Playing SFX

`BT.soundPlay` routes every SFX voice through the `'sfx'` bus (see [Subsystem layout](#subsystem-layout) above), so
`BT.audioVolumeSet('sfx', ...)` and `BT.audioMuteSet('sfx', ...)` affect every currently-playing sound at once, on top
of each sound's own per-voice volume from `BT.soundVolumeSet`.

The pool itself (`src/audio/VoicePool.ts`) is a fixed-size array sized by `HardwareSettings.audioVoices` - it never
grows at runtime. Each `BT.soundPlay` call either claims a free slot or steals the lowest-priority active voice at or
below the incoming priority; see [Playback (SFX)](api-audio.md#playback-sfx) for the exact policy and a worked example.
This cap exists because each slot is a real `AudioBufferSourceNode -> GainNode -> StereoPannerNode` chain - letting the
pool grow unbounded would let a busy scene (an explosion with dozens of debris impacts, for example) spend unbounded CPU
on nodes the player can't meaningfully hear over each other anyway.

## See also

<Cards>
  <Card title="API: Audio" href="/docs/api/audio">Bus volume, mute, and the unlock getter.</Card>
  <Card title="API: Browser Support" href="/docs/api/browser-support">Browser/build support matrix.</Card>
  <Card title="Input Guide" href="/docs/guides/input">Pointer, keyboard, and gamepad input that can trigger unlock.</Card>
</Cards>
