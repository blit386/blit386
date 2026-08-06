// @vitest-environment happy-dom

/**
 * DOM tests for the splash's skip listeners.
 *
 * Separate from `Splash.test.ts` so the state-machine tests keep running in the
 * default node environment with no `happy-dom` opt-in.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Splash } from './Splash';

describe('Splash skip input', () => {
    let now = 0;
    let splash: Splash;
    let target: EventTarget;

    beforeEach(() => {
        now = 0;
        splash = new Splash({}, () => now);
        target = new EventTarget();
        splash.start();
    });

    it('skips on any keydown', () => {
        splash.attachSkipInput(target);
        target.dispatchEvent(new Event('keydown'));
        now += 1;
        splash.advance();

        expect(splash.state).toBe('shown');
    });

    it('skips on any pointerdown', () => {
        splash.attachSkipInput(target);
        target.dispatchEvent(new Event('pointerdown'));
        now += 1;
        splash.advance();

        expect(splash.state).toBe('shown');
    });

    it('stops responding once detached', () => {
        splash.attachSkipInput(target);
        splash.detachSkipInput();
        target.dispatchEvent(new Event('keydown'));
        now += 1;
        splash.advance();

        expect(splash.state).toBe('fadingIn');
    });

    it('registers its listeners in the capture phase', () => {
        const spy = vi.spyOn(target, 'addEventListener');

        splash.attachSkipInput(target);

        for (const call of spy.mock.calls) {
            expect(call[2]).toMatchObject({ capture: true });
        }

        expect(spy.mock.calls.map((call) => call[0]).sort()).toEqual(['keydown', 'pointerdown']);
    });

    it('detaching twice is a no-op', () => {
        splash.attachSkipInput(target);
        splash.detachSkipInput();

        expect(() => splash.detachSkipInput()).not.toThrow();
    });
});
