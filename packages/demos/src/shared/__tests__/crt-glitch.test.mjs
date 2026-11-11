/**
 * Unit tests for the shared CRT glitch constants: both glitch-type lists are built from the one
 * GLITCH_TYPE map, and every key has an on-screen label.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BarrelDistortion, Bloom, Flicker, Interference, Noise, RollLine, Scanlines } from 'blit386';
import { BT } from 'blit386';

import { GLITCH_LABELS, GLITCH_TYPE, GLITCH_TYPES_CHROMA, GLITCH_TYPES_VROLL } from '../crt-glitch.js';
import { isMotionEffect } from '../crt-glitch.js';
import { applyCrtChain, createPipboyChain, FLICKER_BASE, stepGlitchMachine } from '../crt-glitch.js';

// Replaces the given BT members for one test and restores them afterwards.
function patchBt(t, members) {
    for (const [key, value] of Object.entries(members)) {
        const original = Object.getOwnPropertyDescriptor(BT, key);

        Object.defineProperty(BT, key, { value, configurable: true, writable: true });
        t.after(() => Object.defineProperty(BT, key, original));
    }
}

describe('GLITCH_TYPE', () => {
    it('builds both type lists with the wire values demos already compare against', () => {
        assert.deepEqual(GLITCH_TYPES_CHROMA, ['hshift', 'chromasplit', 'noise', 'flicker', 'interference']);
        assert.deepEqual(GLITCH_TYPES_VROLL, ['hshift', 'noise', 'flicker', 'interference', 'vroll']);
    });

    it('gives every glitch type a label', () => {
        const missing = Object.values(GLITCH_TYPE).filter((type) => !Object.hasOwn(GLITCH_LABELS, type));

        assert.deepEqual(missing, []);
    });

    it('keeps the idle value out of both burst lists', () => {
        assert.equal(GLITCH_TYPES_CHROMA.includes(GLITCH_TYPE.NONE), false);
        assert.equal(GLITCH_TYPES_VROLL.includes(GLITCH_TYPE.NONE), false);
    });
});

describe('isMotionEffect', () => {
    it('picks out the effects that move or blink on their own, and nothing else', () => {
        const moving = [new Flicker(), new Interference(), new Noise(), new RollLine()];
        const still = [new BarrelDistortion(), new Bloom(), new Scanlines()];

        assert.deepEqual(moving.map(isMotionEffect), [true, true, true, true]);
        assert.deepEqual(still.map(isMotionEffect), [false, false, false]);
    });
});

describe('applyCrtChain', () => {
    it('re-adds every effect in order, and skips the moving ones under reduced motion', (t) => {
        const calls = [];
        const effects = createPipboyChain({}, 0.05, 240);

        patchBt(t, {
            effectAdd: (fx) => calls.push(['add', fx]),
            effectRemove: (fx) => calls.push(['remove', fx]),
            isReducedMotionPreferred: false,
        });
        applyCrtChain(effects);

        const added = calls.filter(([op]) => op === 'add').map(([, fx]) => fx);

        assert.equal(calls.filter(([op]) => op === 'remove').length, effects.length);
        assert.deepEqual(added, effects);

        calls.length = 0;
        BT.isReducedMotionPreferred = true;
        applyCrtChain(effects);

        const calm = calls.filter(([op]) => op === 'add').map(([, fx]) => fx);

        assert.deepEqual(
            calm,
            effects.filter((fx) => !isMotionEffect(fx)),
        );
    });
});

describe('stepGlitchMachine', () => {
    it('starts a burst when the cooldown runs out, then calms the uniforms when it ends', () => {
        const demo = { glitchCooldown: 1, glitchTicksLeft: 0, glitchDuration: 0, glitchPeak: 0 };

        createPipboyChain(demo, 0.05, 240);

        assert.equal(stepGlitchMachine(demo), true);
        assert.ok(demo.glitchTicksLeft > 0);

        while (demo.glitchTicksLeft > 0) {
            assert.equal(stepGlitchMachine(demo), false);
        }

        assert.equal(demo.pixelGlitch.intensity, 0);
        assert.equal(demo.flicker.amount, FLICKER_BASE);
        assert.equal(demo.interference.amount, 0);
        assert.ok(demo.glitchCooldown > 0);
    });
});
