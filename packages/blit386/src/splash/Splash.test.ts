/**
 * Unit tests for the five-state splash machine.
 *
 * Node environment: the machine takes its clock through an injected provider, so
 * every transition is driven by stepping a fake clock rather than sleeping.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { FADE_IN_MS, FADE_OUT_MS, HOLD_MIN_MS, RAMP_PALETTE_SIZE } from './constants';
import { Splash } from './Splash';

describe('Splash state machine', () => {
    let now = 0;
    let splash: Splash;

    beforeEach(() => {
        now = 0;
        splash = new Splash({}, () => now);
    });

    /**
     * Advances the fake clock and steps the splash once.
     *
     * @param ms - Milliseconds to advance.
     */
    function step(ms: number): void {
        now += ms;
        splash.advance();
    }

    it('starts disabled before start() is called', () => {
        expect(splash.state).toBe('disabled');
        expect(splash.isVisible).toBe(false);
    });

    it('enters fadingIn on start()', () => {
        splash.start();

        expect(splash.state).toBe('fadingIn');
        expect(splash.isVisible).toBe(true);
    });

    it('advances fadingIn to shown after the fade-in duration', () => {
        splash.start();
        step(FADE_IN_MS - 1);

        expect(splash.state).toBe('fadingIn');

        step(2);

        expect(splash.state).toBe('shown');
    });

    it('holds in shown past the minimum while init() is still pending', () => {
        splash.start();
        step(FADE_IN_MS);
        step(HOLD_MIN_MS * 10);

        expect(splash.state).toBe('shown');
        expect(splash.isVisible).toBe(true);
    });

    it('leaves shown once the minimum has elapsed and init() has settled', () => {
        splash.start();
        step(FADE_IN_MS);
        splash.markInitSettled();
        step(HOLD_MIN_MS - 1);

        expect(splash.state).toBe('shown');

        step(2);

        expect(splash.state).toBe('fadingOut');
    });

    it('does not leave shown early when init() settles before the minimum', () => {
        splash.start();
        step(FADE_IN_MS);
        splash.markInitSettled();
        step(10);

        expect(splash.state).toBe('shown');
    });

    it('reaches done after the fade-out duration', () => {
        splash.start();
        step(FADE_IN_MS);
        splash.markInitSettled();
        step(HOLD_MIN_MS);
        step(FADE_OUT_MS - 1);

        expect(splash.state).toBe('fadingOut');
        expect(splash.isVisible).toBe(true);

        step(2);

        expect(splash.state).toBe('done');
        expect(splash.isVisible).toBe(false);
    });

    it('is not visible in either terminal state', () => {
        const fresh = new Splash({}, () => now);

        expect(fresh.isVisible).toBe(false);

        splash.start();
        splash.markInitSettled();
        step(FADE_IN_MS + HOLD_MIN_MS + FADE_OUT_MS);

        expect(splash.state).toBe('done');
        expect(splash.isVisible).toBe(false);
    });

    it('collapses the fade-in and the minimum hold on skip, but still waits on init()', () => {
        splash.start();
        step(10);
        splash.skip();
        step(1);

        expect(splash.state).toBe('shown');

        step(1000);

        expect(splash.state).toBe('shown');

        splash.markInitSettled();
        step(1);

        expect(splash.state).toBe('fadingOut');
    });

    it('runs the full fade-out after a skip', () => {
        splash.start();
        splash.skip();
        splash.markInitSettled();
        step(1);

        expect(splash.state).toBe('fadingOut');

        step(FADE_OUT_MS - 2);

        expect(splash.state).toBe('fadingOut');

        step(2);

        expect(splash.state).toBe('done');
    });

    it('ignores skip() once done', () => {
        splash.start();
        splash.markInitSettled();
        step(FADE_IN_MS + HOLD_MIN_MS + FADE_OUT_MS);
        splash.skip();
        step(1);

        expect(splash.state).toBe('done');
    });

    it('never rewinds once done, however many times advance() runs', () => {
        splash.start();
        splash.markInitSettled();
        step(FADE_IN_MS + HOLD_MIN_MS + FADE_OUT_MS);

        for (let i = 0; i < 20; i++) {
            step(16);
        }

        expect(splash.state).toBe('done');
    });

    it('exposes a palette sized for slot 0 plus the ramp', () => {
        splash.start();

        expect(splash.palette.size).toBe(RAMP_PALETTE_SIZE);
    });
});
