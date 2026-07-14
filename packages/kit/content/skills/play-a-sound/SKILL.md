---
name: play-a-sound
description:
  Play sound effects and background music, make retro sounds from nothing with the built-in synth presets, and set the
  volume of each bus. Use when the user wants a jump, pickup, explosion, laser, hit, or blip sound, wants music, asks
  about volume or muting, or asks why the game is silent.
---

# Play a sound

The engine has sound built in: short sound effects, looping music, and a synth that makes retro beeps out of thin air.
No sound files needed to start.

## When to use

Use when the user wants a jump, pickup, explosion, laser, hit, or blip sound, wants background music, wants to change or
mute the volume, or asks "why is my game silent".

## The fastest win: a made-up sound

`BT.synthPreset` has six ready-made retro sounds. You do not need any files – the engine builds the sound itself:
`jump`, `pickup`, `explosion`, `laser`, `hit`, `blip`.

```js
import { AudioClip, BT } from 'blit386';

async init() {
    // Each preset is a function that describes a sound. AudioClip.synth() turns
    // that description into a playable clip. Both need await.
    this.jumpSound = await AudioClip.synth(BT.synthPreset.jump());
    this.coinSound = await AudioClip.synth(BT.synthPreset.pickup());
    return true;
}

update() {
    if (BT.isPressed(BT.BTN_A, 0)) {
        BT.soundPlay(this.jumpSound); // play it once
    }
}
```

Each preset takes an optional number called a seed, so you can get a different-sounding jump without writing any new
code: `BT.synthPreset.jump(7)`. The same seed always makes the same sound.

## Play a sound file

Have a real `.wav`, `.mp3`, or `.ogg` in `public/`? Load it the same way:

```js
async init() {
    this.boom = await AudioClip.load('/sounds/boom.wav');
    return true;
}
```

## Sound effects: play, stop, check

`BT.soundPlay()` hands back a `SoundRef` – a little ticket for that one playing sound. Keep the ticket if you want to
stop it or ask about it later.

```js
this.engineHum = BT.soundPlay(this.humSound, { loop: true, volume: 0.5 });

if (BT.isSoundPlaying(this.engineHum)) {
  BT.soundStop(this.engineHum);
}
```

`BT.soundPlay(clip, options?)` options: `loop`, `volume` (0 to 1), `pitch` (1 is normal, 2 is an octave up), `pan` (-1
left, 0 middle, 1 right), `priority`, `fadeInMs`.

## Music

Music is separate from sound effects: only one music track plays at a time, and it loops by default.

```js
async init() {
    this.song = await AudioClip.load('/music/level1.mp3');
    BT.musicPlay(this.song, { fadeMs: 1000 }); // fade in over one second
    return true;
}

// later:
BT.musicStop({ fadeMs: 500 });
BT.musicVolumeSet(0.3); // quieter, so the sound effects can be heard
```

## Volume: the three buses

Sound travels through three "buses" (think of them as three volume knobs): `'sfx'` for sound effects, `'music'` for
music, and `'main'` for everything at once.

```js
BT.audioVolumeSet('main', 0.8); // the master knob
BT.audioVolumeSet('music', 0.4); // music only
BT.audioVolumeSet('sfx', 1); // sound effects only
```

## The silence rule (read this before you report a bug)

Browsers refuse to make any noise until the player has clicked, tapped, or pressed a key on the page. This is a rule of
the web, not a bug in your game, and every game on the internet lives with it.

What that means for you:

- `BT.soundPlay()` before the player interacts is thrown away silently. It does not queue up.
- `BT.musicPlay()` before the player interacts is remembered, and starts by itself the moment they touch anything.
- Loading (`AudioClip.load`) and building sounds (`AudioClip.synth`) work fine while everything is still silent, so
  `init()` is still the right place for them.
- `BT.isAudioUnlocked` tells you which side of the line you are on.

So if a title screen looks right but sounds like nothing, that is why. The usual fix is to make the first thing the
player does a keypress or a click ("Press Space to start"), and everything works from then on.

```js
render() {
    if (!BT.isAudioUnlocked) {
        BT.systemPrint(new Vector2i(80, 120), 4, 'PRESS SPACE TO START');
    }
}
```

## Key calls

- `AudioClip.load(url)` (static, async) – load a sound file. `AudioClip.synth(params)` (static, async) – build a sound
  from a description.
- `BT.synthPreset.jump()` / `.pickup()` / `.explosion()` / `.laser()` / `.hit()` / `.blip()` – the six ready-made
  sounds. Each takes an optional seed number.
- `BT.soundPlay(clip, options?)` (method) – returns a `SoundRef`. `BT.soundStop(ref, options?)`,
  `BT.isSoundPlaying(ref)`.
- `BT.soundVolumeSet(ref, value)` / `BT.soundPitchSet(ref, value)` / `BT.soundPanSet(ref, value)` – change one playing
  sound while it plays.
- `BT.musicPlay(clip, options?)` / `BT.musicStop(options?)` / `BT.musicVolumeSet(value)` – methods.
- `BT.audioVolumeSet(bus, value)` / `BT.audioVolumeGet(bus)` / `BT.audioMuteSet(bus, muted)` / `BT.isAudioMuted(bus)` –
  methods. Buses: `'main'`, `'music'`, `'sfx'`.
- `BT.isAudioUnlocked` / `BT.isMusicPlaying` – getters (no parentheses).

## Notes

- Load and synth in `init()` with `await`. Forgetting `await` gives you a promise instead of a clip, and nothing plays.
- Play sounds from `update()`, where the button presses are.
- Sound works on both renderers – WebGPU and the plain Canvas 2D fallback. Unlike CRT and post-process effects, it never
  needs a GPU, so every player hears it.
- Audio arrived in blit386 1.3.0. If `BT.soundPlay` says it is not a function, your engine is older than that: run
  `npx blit upgrade`.

See `docs/audio.md`.
