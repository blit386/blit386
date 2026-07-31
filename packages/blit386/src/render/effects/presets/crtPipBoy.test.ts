import { describe, expect, it } from 'vitest';

import { BarrelDistortion } from '../display/BarrelDistortion';
import { Bloom } from '../display/Bloom';
import { Scanlines } from '../display/Scanlines';
import { crtPipBoy } from './crtPipBoy';

describe('preset crtPipBoy', () => {
    it('returns an array of display-tier effects', () => {
        const stack = crtPipBoy();

        expect(stack.length).toBeGreaterThan(0);
        for (const fx of stack) {
            expect(fx.tier).toBe('display');
        }
    });

    it('starts with BarrelDistortion and ends with Bloom', () => {
        const stack = crtPipBoy();

        expect(stack[0]).toBeInstanceOf(BarrelDistortion);
        expect(stack.at(-1)).toBeInstanceOf(Bloom);
    });

    it('includes Scanlines (CRT signature element)', () => {
        const stack = crtPipBoy();

        expect(stack.some((fx) => fx instanceof Scanlines)).toBe(true);
    });

    it('returns fresh instances on each call (no shared state)', () => {
        const a = crtPipBoy();
        const b = crtPipBoy();

        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            expect(a[i]).not.toBe(b[i]);
        }
    });
});
