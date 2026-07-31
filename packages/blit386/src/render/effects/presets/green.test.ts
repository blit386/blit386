import { describe, expect, it } from 'vitest';

import { green } from './green';

describe('preset green', () => {
    it('returns display-tier effects', () => {
        const stack = green();

        expect(stack.length).toBeGreaterThan(0);
        for (const fx of stack) {
            expect(fx.tier).toBe('display');
        }
    });

    it('returns fresh instances on each call', () => {
        const a = green();
        const b = green();

        expect(a.length).toBe(b.length);
        for (let i = 0; i < a.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            expect(a[i]).not.toBe(b[i]);
        }
    });
});
