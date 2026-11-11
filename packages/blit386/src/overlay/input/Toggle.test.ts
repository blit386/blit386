import { describe, expect, it } from 'vitest';

import { Rect2i } from '../../utils/Rect2i';
import { Toggle } from './Toggle';

describe('Toggle.handleInput', () => {
    it('toggles from a precomputed toggle-press edge', () => {
        const toggle = new Toggle(false, true);

        toggle.handleInput(null, true, new Rect2i(0, 0, 17, 13), false);

        expect(toggle.isBodyVisible).toBe(true);
    });

    it('forwards pointerPressConsumed flag to prevent pointer toggle', () => {
        const toggle = new Toggle(false, true);
        const pointer = {
            isButtonPressed: (): boolean => true,
            getPos: () => ({ x: 8, y: 8 }),
        };

        toggle.handleInput(pointer as never, false, new Rect2i(0, 0, 17, 13), true);

        expect(toggle.isBodyVisible).toBe(false);
    });
});
