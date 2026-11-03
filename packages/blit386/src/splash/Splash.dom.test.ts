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

describe('Splash skip input and browser shortcuts', () => {
    let now = 0;
    let splash: Splash;
    let target: EventTarget;

    beforeEach(() => {
        now = 0;
        splash = new Splash({}, () => now);
        target = new EventTarget();
        splash.start();
        splash.attachSkipInput(target);
    });

    function press(event: Event): void {
        target.dispatchEvent(event);
        now += 1;
        splash.advance();
    }

    it('still prevents a plain cancelable keydown', () => {
        const event = new Event('keydown', { cancelable: true });

        press(event);

        expect(event.defaultPrevented).toBe(true);
        expect(splash.state).toBe('shown');
    });

    it('still prevents a plain KeyboardEvent such as Space', () => {
        const event = new KeyboardEvent('keydown', { key: ' ', cancelable: true });

        press(event);

        expect(event.defaultPrevented).toBe(true);
        expect(splash.state).toBe('shown');
    });

    it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('skips but does not prevent a keydown with %s', (modifier) => {
        const event = new KeyboardEvent('keydown', { key: 'r', cancelable: true, [modifier]: true });

        press(event);

        expect(event.defaultPrevented).toBe(false);
        expect(splash.state).toBe('shown');
    });

    it.each(['F1', 'F5', 'F11', 'F12'])('skips but does not prevent %s', (key) => {
        const event = new KeyboardEvent('keydown', { key, cancelable: true });

        press(event);

        expect(event.defaultPrevented).toBe(false);
        expect(splash.state).toBe('shown');
    });

    it('still prevents a pointerdown', () => {
        const event = new Event('pointerdown', { cancelable: true });

        press(event);

        expect(event.defaultPrevented).toBe(true);
        expect(splash.state).toBe('shown');
    });
});
