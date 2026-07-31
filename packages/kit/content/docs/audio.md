# Sound and music

BLIT386 can make noise. It plays sound files, it loops background music, and – the fun part – it can build little retro
sounds out of nothing, so you can have a jump sound before you have found a single `.wav` file.

## The six ready-made sounds

`BT.synthPreset` holds six classic arcade sounds the engine builds by itself: `jump`, `pickup`, `explosion`, `laser`,
`hit`, `blip`. Each one is a recipe; `AudioClip.synth()` cooks the recipe into a clip you can play.

```js
import { AudioClip, BT } from 'blit386';

async init() {
    // Both of these load things, so both need await (see docs/basics.md).
    this.jumpSound = await AudioClip.synth(BT.synthPreset.jump());
    this.coinSound = await AudioClip.synth(BT.synthPreset.pickup());

    return true;
}

update() {
    if (BT.isPressed(BT.BTN_A, 0)) {
        BT.soundPlay(this.jumpSound);
    }
}
```

Bored of that exact jump? Every preset takes an optional number, called a seed: `BT.synthPreset.jump(3)` gives a
different jump. The same number always gives the same sound, so once you like one, write the number down.

## Playing a real sound file

Put the file in `public/` and load it by its address:

```js
this.boom = await AudioClip.load('/sounds/boom.wav');
```

`.wav`, `.mp3`, and `.ogg` all work. After that it plays exactly like a synth sound.

## Playing, stopping, and asking

`BT.soundPlay()` gives you back a `SoundRef` – think of it as a cloakroom ticket for that one sound. You only need to
keep the ticket if you plan to stop the sound or ask about it later.

```js
// A looping engine hum, at half volume.
this.hum = BT.soundPlay(this.humSound, { loop: true, volume: 0.5 });

if (BT.isSoundPlaying(this.hum)) {
  BT.soundStop(this.hum);
}
```

The options you can pass to `BT.soundPlay(clip, options)`:

- `loop` – repeat forever (default: false).
- `volume` – 0 (silent) to 1 (full).
- `pitch` – 1 is normal, 2 is twice as high, 0.5 is an octave down.
- `pan` – where it sits between your ears: -1 left, 0 middle, 1 right.
- `fadeInMs` – slide the volume up over this many milliseconds instead of starting abruptly.
- `priority` – a hint for which sound to drop first when too many are playing at once.

## Music

Music is its own thing. Only one music track plays at a time, and it loops unless you say otherwise.

```js
this.song = await AudioClip.load('/music/level1.mp3');

BT.musicPlay(this.song, { fadeMs: 1000 }); // fade in over one second
BT.musicVolumeSet(0.3); // keep it under the sound effects
BT.musicStop({ fadeMs: 500 }); // fade out when the level ends
```

`BT.isMusicPlaying` is a property (no parentheses) that tells you whether anything is playing right now.

## Three volume knobs

Every sound travels through a "bus" on its way to the speakers, and each bus has its own volume knob:

- `'sfx'` – all your sound effects.
- `'music'` – the music track.
- `'main'` – everything, the master knob.

```js
BT.audioVolumeSet('main', 0.8);
BT.audioVolumeSet('music', 0.4);
BT.audioMuteSet('sfx', true); // silence the effects without changing their volume
```

`BT.audioVolumeGet(bus)` and `BT.isAudioMuted(bus)` read them back.

## Why the game starts silent (this is normal)

Browsers do not let a web page make noise until the person has clicked, tapped, or pressed a key on it. This stops
websites from blaring at you the moment you open them, and it applies to every game on the web, including yours.

So until the player touches something:

- `BT.soundPlay()` is quietly thrown away. It is not saved for later.
- `BT.musicPlay()` _is_ remembered, and starts on its own the instant the player interacts.
- Loading and synthesizing still work, so `init()` is still the right place to prepare your sounds.

`BT.isAudioUnlocked` tells you whether the player has already interacted:

```js
render() {
    if (!BT.isAudioUnlocked) {
        BT.systemPrint(new Vector2i(80, 120), 4, 'PRESS SPACE TO START');
    }
}
```

That single line turns "my game is broken, there is no sound" into "the game is waiting for me". A title screen the
player has to dismiss with a key or a click is the usual answer, and it fixes the problem for the rest of the session.

## Making your own sound from scratch

The six presets are shortcuts. Underneath, each one is just a description of a sound, and you can write your own
description instead and hand it to the same `AudioClip.synth()`:

```js
this.zap = await AudioClip.synth({
  waveform: 'square', // the character: sine, square, triangle, sawtooth, or noise
  frequency: 440, // how high, in hertz
  duration: 0.2, // how long, in seconds
  seed: 1, // any number; the same seed always makes the same sound
});
```

Those four are required. The optional ones are the interesting ones: `envelope` shapes the sound over time (how fast it
fades in, how fast it dies away), `pitchSweep` slides the pitch while it plays (sliding up reads as a jump, sliding down
reads as falling), `vibrato` adds a wobble to the pitch, `noiseMix` stirs in hiss for grit, `dutyCycle` thins out a
square wave into that nasal NES buzz, and `volume` (0 to 1, default 1) sets the clip's own level.

Build sounds in `init()`, never in `update()` – synthesizing takes real work and will hitch the frame mid-game.

## Notes

- Sound works on both renderers – WebGPU and the plain Canvas 2D fallback. Unlike CRT and post-process effects, it never
  touches the graphics card, so every player hears it.
- Sound arrived in blit386 1.3.0. If `BT.soundPlay` is not a function, you have an older engine – run
  `npx blit upgrade`.
- Need a loading screen while clips load? Poll `BT.loadingAssetsCount` (engine 1.4.0) – see `docs/basics.md` and the
  show-a-loading-screen skill.

Next: `docs/input.md` for the button presses that trigger your sounds, `docs/when-something-breaks.md` when things go
quiet in a way this page did not explain.
