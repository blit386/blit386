import { afterEach, describe, expect, it, vi } from 'vitest';

import { BTAPI } from '../core/BTAPI';
import { Timer } from './Timer';

describe('Timer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('constructor', () => {
        it('stores interval and seeds baseline from current tick', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(10);
            const timer = new Timer(30);

            expect(timer.intervalTicks).toBe(30);
            expect(timer.elapsedTicks(10)).toBe(0);
        });

        it('throws when interval is not a positive integer', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            expect(() => new Timer(0)).toThrow('positive integer');
            expect(() => new Timer(-5)).toThrow('positive integer');
            expect(() => new Timer(1.5)).toThrow('positive integer');
        });
    });

    describe('fireIfElapsed', () => {
        it('returns false before interval, true at interval, then resets baseline', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            const timer = new Timer(5);

            expect(timer.fireIfElapsed(4)).toBe(false);
            expect(timer.fireIfElapsed(5)).toBe(true);
            expect(timer.fireIfElapsed(9)).toBe(false);
            expect(timer.fireIfElapsed(10)).toBe(true);
        });

        it('fires once per call when large gaps pass', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            const timer = new Timer(5);

            expect(timer.fireIfElapsed(20)).toBe(true);
            expect(timer.fireIfElapsed(20)).toBe(false);
            expect(timer.elapsedTicks(23)).toBe(3);
        });

        it('uses engine ticks when current tick is omitted', () => {
            const spy = vi.spyOn(BTAPI.instance, 'getTicks');
            spy.mockReturnValue(0);
            const timer = new Timer(3);

            spy.mockReturnValue(2);
            expect(timer.fireIfElapsed()).toBe(false);

            spy.mockReturnValue(3);
            expect(timer.fireIfElapsed()).toBe(true);
        });

        it('does not lock when current tick rewinds shallowly', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            const timer = new Timer(5);

            expect(timer.fireIfElapsed(5)).toBe(true);
            expect(timer.elapsedTicks(3)).toBe(0);
            expect(timer.remainingTicks(3)).toBe(5);
            expect(timer.fireIfElapsed(10)).toBe(true);
        });

        it('resets baseline and does not lock after a hard tick rewind', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            const timer = new Timer(5);

            // Advance well past the interval so lastFiredTick is 1000.
            expect(timer.fireIfElapsed(1000)).toBe(true);

            // Hard rewind to 0 - without the guard the timer would lock until tick 1005.
            expect(timer.fireIfElapsed(0)).toBe(false); // rewind detected, baseline reset to 0

            // Should now fire exactly intervalTicks later.
            expect(timer.fireIfElapsed(4)).toBe(false);
            expect(timer.fireIfElapsed(5)).toBe(true);
        });
    });

    describe('reset and helpers', () => {
        it('resets baseline and reports elapsed and remaining ticks', () => {
            vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(0);
            const timer = new Timer(12);

            expect(timer.elapsedTicks(5)).toBe(5);
            expect(timer.remainingTicks(5)).toBe(7);

            timer.reset(4);

            expect(timer.elapsedTicks(10)).toBe(6);
            expect(timer.remainingTicks(10)).toBe(6);
            expect(timer.remainingTicks(20)).toBe(0);
        });
    });
});
