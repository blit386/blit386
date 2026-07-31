---
name: design-a-sound
description:
  Build a custom sound from scratch with AudioClip.synth and the synth knobs (waveform, envelope, pitch sweep, vibrato,
  noise, duty cycle) when the six ready-made presets are not what you want. Use when the user wants their own sound
  effect, wants to tweak or tune a preset, says a sound is too long, too high, too harsh, or too boring, or asks how to
  make a sound without a sound file.
---

# Design your own sound

The engine can build a sound out of nothing – no files, no recording. The six presets in `BT.synthPreset` are the quick
way (see the `play-a-sound` skill). This skill is the slow way: describing a sound yourself, knob by knob, with
`AudioClip.synth()`.

## When to use

Use when the presets are close but not right, when the user wants a sound of their own, when a sound is too long, too
high, too harsh, or too plain, or when they ask how to make a sound effect without a sound file.

## The four things every sound needs

```js
import { AudioClip, BT } from 'blit386';

async init() {
    this.zap = await AudioClip.synth({
        waveform: 'square', // the shape of the sound: its character
        frequency: 440,     // how high it is, in hertz. 440 is the A above middle C
        duration: 0.2,      // how long it lasts, in seconds
        seed: 1,            // any number - see "the seed" below
    });
    return true;
}

update() {
    if (BT.isPressed(BT.BTN_A, 0)) {
        BT.soundPlay(this.zap);
    }
}
```

Those four are required. Everything below is optional, and each one is a knob you can leave alone.

## The knobs

**`waveform`** – the personality of the sound. `'square'` is the classic 8-bit buzz. `'sine'` is soft and pure, like a
whistle. `'triangle'` is soft but with a bit of an edge. `'sawtooth'` is bright and rasping. `'noise'` is a hiss, with
no pitch at all – it is what explosions and footsteps are made of.

**`envelope`** – the shape of the sound over time, in four parts. Imagine plucking a guitar string versus slowly pushing
an organ key:

```js
envelope: {
    attack: 0.01,  // seconds to fade in. Small = a sharp hit. Large = a slow swell.
    decay: 0.1,    // seconds to fall from the peak down to the sustain level.
    sustain: 0.7,  // the level it holds at, from 0 to 1.
    release: 0.1,  // seconds to fade out at the end.
}
```

Those are also the defaults, so leaving `envelope` out gives you exactly that. For a percussive hit, use a tiny `attack`
and a low `sustain`. For a soft pad, use a big `attack`.

**`pitchSweep`** – makes the pitch slide while the sound plays. Sliding **up** reads as a jump or a power-up. Sliding
**down** reads as falling, or dying.

```js
frequency: 200,
pitchSweep: { toFrequency: 800 }, // starts at 200 Hz, ends at 800 Hz: a rising bounce
```

Leaving `pitchSweep` out means "stay at one pitch the whole time".

**`vibrato`** – a wobble in the pitch, like an opera singer. `rate` is how fast it wobbles (default 5 per second),
`depth` is how far (default 0, meaning off).

**`noiseMix`** – stirs hiss into a pitched sound, from 0 (none) to 1 (all hiss). A little bit adds grit and dirt. This
is how you get an engine rumble rather than a clean tone.

**`dutyCycle`** – only matters for `'square'`. It is the "thickness" of the buzz, from 0 to 1, default 0.5. Move it
towards 0.1 and the square wave gets thin and nasal, which is a very NES sound.

**`volume`** – 0 to 1, default 1.

## A worked example: a laser that is yours

Start from a shape you understand, then turn one knob at a time and listen.

```js
this.laser = await AudioClip.synth({
  waveform: 'sawtooth', // bright and rasping
  frequency: 900, // starts high...
  pitchSweep: { toFrequency: 120 }, // ...and dives, which reads as "firing"
  duration: 0.25,
  envelope: { attack: 0.001, decay: 0.05, sustain: 0.3, release: 0.15 },
  noiseMix: 0.15, // a little grit so it is not too clean
  seed: 3,
});
```

## The seed

`seed` is required, and it is not a volume or a pitch – it is the number the engine uses to make its random choices. The
same parameters plus the same seed always produce exactly the same sound, every run, on every machine. Pick any number
and forget about it.

Careful: `seed` means something slightly different in the two places you will see it.

- In `AudioClip.synth({ ... seed: 1 })` it is **required**, and it just makes the sound repeatable.
- In `BT.synthPreset.jump(7)` it is **optional**, and it nudges a couple of the preset's values a little, so repeated
  jumps do not sound robotically identical.

## Key calls

- `AudioClip.synth(params)` (static, async) – turns a description into a playable clip. Needs `await`.
- Required fields: `waveform`, `frequency`, `duration`, `seed`.
- Optional fields: `volume`, `envelope` (`attack`, `decay`, `sustain`, `release`), `pitchSweep` (`toFrequency`),
  `vibrato` (`rate`, `depth`), `noiseMix`, `dutyCycle`.
- Waveforms: `'sine'`, `'square'`, `'triangle'`, `'sawtooth'`, `'noise'`.
- `BT.soundPlay(clip, options?)` (method) – play the clip you built. See the `play-a-sound` skill.

## Notes

- Build sounds in `init()` with `await`, not in `update()`. Synthesizing takes real work, and doing it mid-game will
  hitch the frame.
- The description is plain data – numbers, strings, and small objects. That means a sound can live in a data file and be
  loaded like a level, instead of being written into your code.
- One knob at a time. Change `waveform`, listen, then change `envelope`, listen. Changing four things at once and
  disliking the result tells you nothing.
- A synthesized sound still will not play before the player's first click or key press. That is a browser rule, not a
  bug – the `play-a-sound` skill explains it.

See `docs/audio.md`.
