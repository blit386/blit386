// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/constants.ts`: the BTN_* bit flags and pointer button constants.
 */

import { describe, expect, it } from 'vitest';

import { BT } from '../BLIT386';

describe('BTN_* public values', () => {
    // Saved games and input maps store these numbers, so they must never move.
    it('keeps every BT.BTN_* at its published number', () => {
        expect({
            BTN_UP: BT.BTN_UP,
            BTN_DOWN: BT.BTN_DOWN,
            BTN_LEFT: BT.BTN_LEFT,
            BTN_RIGHT: BT.BTN_RIGHT,
            BTN_A: BT.BTN_A,
            BTN_B: BT.BTN_B,
            BTN_X: BT.BTN_X,
            BTN_Y: BT.BTN_Y,
            BTN_L: BT.BTN_L,
            BTN_R: BT.BTN_R,
            BTN_START: BT.BTN_START,
            BTN_SELECT: BT.BTN_SELECT,
            BTN_POINTER_A: BT.BTN_POINTER_A,
            BTN_POINTER_B: BT.BTN_POINTER_B,
            BTN_POINTER_C: BT.BTN_POINTER_C,
            BTN_POINTER_D: BT.BTN_POINTER_D,
            BTN_L2: BT.BTN_L2,
            BTN_R2: BT.BTN_R2,
            BTN_ABXY: BT.BTN_ABXY,
            BTN_SHOULDER: BT.BTN_SHOULDER,
            BTN_TRIGGER: BT.BTN_TRIGGER,
            BTN_POINTER_ANY: BT.BTN_POINTER_ANY,
        }).toEqual({
            BTN_UP: 1,
            BTN_DOWN: 2,
            BTN_LEFT: 4,
            BTN_RIGHT: 8,
            BTN_A: 16,
            BTN_B: 32,
            BTN_X: 64,
            BTN_Y: 128,
            BTN_L: 256,
            BTN_R: 512,
            BTN_START: 1024,
            BTN_SELECT: 2048,
            BTN_POINTER_A: 4096,
            BTN_POINTER_B: 8192,
            BTN_POINTER_C: 16384,
            BTN_POINTER_D: 32768,
            BTN_L2: 65536,
            BTN_R2: 131072,
            BTN_ABXY: 240,
            BTN_SHOULDER: 768,
            BTN_TRIGGER: 196608,
            BTN_POINTER_ANY: 61440,
        });
    });
});

describe('Pointer button constants', () => {
    it('exposes BTN_POINTER_A..D as bit flags', () => {
        expect(BT.BTN_POINTER_A).toBe(1 << 12);
        expect(BT.BTN_POINTER_B).toBe(1 << 13);
        expect(BT.BTN_POINTER_C).toBe(1 << 14);
        expect(BT.BTN_POINTER_D).toBe(1 << 15);
    });
});
