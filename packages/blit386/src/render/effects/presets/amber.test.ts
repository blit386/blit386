import { describe, expect, it } from 'vitest';

import { amber } from './amber';

describe('preset amber', () => {
    it('returns display-tier effects', () => {
        const stack = amber();

        expect(stack.length).toBeGreaterThan(0);
        for (const fx of stack) {
            expect(fx.tier).toBe('display');
        }
    });

    it('returns fresh instances on each call', () => {
        const a = amber();
        const b = amber();

        for (let i = 0; i < a.length; i++) {
            // eslint-disable-next-line security/detect-object-injection
            expect(a[i]).not.toBe(b[i]);
        }
    });
});
