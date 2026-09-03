/**
 * Unit tests for the five-state splash machine.
 *
 * Node environment: the machine takes its clock through an injected provider, so
 * every transition is driven by stepping a fake clock rather than sleeping.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
    FADE_IN_MS,
    FADE_OUT_MS,
    GLITCH_MAX_INTENSITY,
    HOLD_MIN_MS,
    RAMP_LAST_SLOT,
    RAMP_PALETTE_SIZE,
} from './constants';
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
     * @param ms – Milliseconds to advance.
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

describe('Splash dissolve', () => {
    it('adds no effect until the dissolve is enabled', () => {
        const splash = new Splash({}, () => 0);

        expect(splash.dissolveEffect).toBeNull();
    });

    it('exposes a glitch effect once enabled', () => {
        const splash = new Splash({}, () => 0);

        splash.enableDissolve();

        expect(splash.dissolveEffect).not.toBeNull();
    });

    it('decays intensity from its peak during fadingIn and reaches zero in shown', () => {
        let now = 0;
        const splash = new Splash({}, () => now);

        splash.enableDissolve();
        splash.start();

        now += Math.floor(FADE_IN_MS / 2);
        splash.advance();

        // The dissolve peaks when the logo is least visible and resolves as it fades up,
        // so halfway through the fade-in it must sit strictly between zero and the peak.
        const midFade = splash.dissolveEffect?.intensity ?? 0;

        expect(midFade).toBeGreaterThan(0);
        expect(midFade).toBeLessThan(GLITCH_MAX_INTENSITY);

        now += FADE_IN_MS;
        splash.advance();

        expect(splash.dissolveEffect?.intensity).toBe(0);
    });

    it('drives intensity back up during fadingOut', () => {
        let now = 0;
        const splash = new Splash({}, () => now);

        splash.enableDissolve();
        splash.start();
        splash.markInitSettled();

        now += FADE_IN_MS + HOLD_MIN_MS;
        splash.advance();

        now += Math.floor(FADE_OUT_MS / 2);
        splash.advance();

        expect(splash.dissolveEffect?.intensity).toBeGreaterThan(0);
    });

    it('leaves intensity at zero when the dissolve was never enabled', () => {
        let now = 0;
        const splash = new Splash({}, () => now);

        splash.start();
        now += Math.floor(FADE_IN_MS / 2);

        expect(() => splash.advance()).not.toThrow();
        expect(splash.dissolveEffect).toBeNull();
    });
});

describe('Splash reduced motion', () => {
    let now = 0;
    let splash: Splash;

    beforeEach(() => {
        now = 0;
        splash = new Splash({}, () => now);
    });

    function step(ms: number): void {
        now += ms;
        splash.advance();
    }

    it('shows the fully lit ramp immediately, with no fade-in wait', () => {
        splash.start(true);
        step(1);

        expect(splash.state).toBe('shown');
        expect(splash.palette.get(RAMP_LAST_SLOT).r).toBe(255);
    });

    it('still waits on init() before collapsing the hold, same as a manual skip', () => {
        splash.start(true);
        step(1);
        step(HOLD_MIN_MS * 10);

        expect(splash.state).toBe('shown');
    });

    it('collapses straight to done once init settles, with an instant black palette swap', () => {
        splash.start(true);
        step(1);
        splash.markInitSettled();
        step(1);

        expect(splash.state).toBe('done');
        expect(splash.palette.get(RAMP_LAST_SLOT).r).toBe(0);
    });

    it('does not animate through the fade-out duration', () => {
        splash.start(true);
        step(1);
        splash.markInitSettled();

        // One tiny step is enough to reach done; a real fade would still be mid-transition
        // for FADE_OUT_MS-1 more milliseconds.
        step(1);

        expect(splash.state).toBe('done');
    });

    it('defaults to the animated path when start() is called with no argument', () => {
        splash.start();
        step(1);

        expect(splash.state).toBe('fadingIn');
    });
});
