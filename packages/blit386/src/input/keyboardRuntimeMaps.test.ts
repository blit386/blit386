/* eslint-disable security/detect-object-injection -- indexes are FACE_BUTTON_FLAGS / fixed bit-flag constants, not external input */

/**
 * Unit tests for the runtime keyboard maps shared by `BT` and `BTAPI`.
 *
 * Covers seeding from each `keyboardLayout`, that a reset honors the active layout, and
 * that runtime edits never write through to the exported default tables.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
    createDefaultKeyboardRuntimeMaps,
    DEFAULT_KEYBOARD_PLAYER1,
    DEFAULT_KEYBOARD_PLAYER2,
    DEFAULT_KEYBOARD_SINGLE_PLAYER1,
    DEFAULT_KEYBOARD_SINGLE_PLAYER2,
    FACE_BUTTON_FLAGS,
} from './defaultKeyboardMap';
import {
    getKeyboardFaceButtonKeys,
    resetKeyboardFaceButtonMaps,
    setKeyboardFaceButtonKeys,
    setKeyboardLayout,
} from './keyboardRuntimeMaps';

const BTN_UP = 1 << 0;
const BTN_LEFT = 1 << 2;
const BTN_A = 1 << 4;

describe('keyboard default tables', () => {
    it('puts WASD and the arrow keys on player 0 in the single layout', () => {
        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER1[BTN_LEFT]).toEqual(['KeyA', 'ArrowLeft']);
        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER1[BTN_UP]).toEqual(['KeyW', 'ArrowUp']);
    });

    it('moves player 1 to IJKL in the single layout', () => {
        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER2[BTN_UP]).toEqual(['KeyI']);
        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER2[BTN_LEFT]).toEqual(['KeyJ']);
    });

    it('keeps face and system buttons identical across layouts', () => {
        for (const button of FACE_BUTTON_FLAGS.slice(4)) {
            expect(DEFAULT_KEYBOARD_SINGLE_PLAYER1[button]).toEqual(DEFAULT_KEYBOARD_PLAYER1[button]);
            expect(DEFAULT_KEYBOARD_SINGLE_PLAYER2[button]).toEqual(DEFAULT_KEYBOARD_PLAYER2[button]);
        }
    });

    it('never binds one key to both players in either layout', () => {
        for (const [p0, p1] of [
            [DEFAULT_KEYBOARD_PLAYER1, DEFAULT_KEYBOARD_PLAYER2],
            [DEFAULT_KEYBOARD_SINGLE_PLAYER1, DEFAULT_KEYBOARD_SINGLE_PLAYER2],
        ] as const) {
            const p0Keys = new Set(FACE_BUTTON_FLAGS.flatMap((button) => [...(p0[button] ?? [])]));
            const shared = FACE_BUTTON_FLAGS.flatMap((button) => [...(p1[button] ?? [])]).filter((key) =>
                p0Keys.has(key),
            );

            expect(shared).toEqual([]);
        }
    });

    it('creates versus maps by default', () => {
        const [p0, p1] = createDefaultKeyboardRuntimeMaps();

        expect(p0.get(BTN_LEFT)).toEqual(['KeyA']);
        expect(p1.get(BTN_LEFT)).toEqual(['ArrowLeft']);
    });
});

describe('keyboard runtime maps', () => {
    afterEach(() => {
        setKeyboardLayout('versus');
    });

    it('starts from the versus layout before any configure() is applied', () => {
        resetKeyboardFaceButtonMaps();

        expect(getKeyboardFaceButtonKeys(0, BTN_LEFT)).toEqual(['KeyA']);
        expect(getKeyboardFaceButtonKeys(1, BTN_LEFT)).toEqual(['ArrowLeft']);
    });

    it('reseeds both players from the single layout', () => {
        setKeyboardLayout('single');

        expect(getKeyboardFaceButtonKeys(0, BTN_LEFT)).toEqual(['KeyA', 'ArrowLeft']);
        expect(getKeyboardFaceButtonKeys(1, BTN_LEFT)).toEqual(['KeyJ']);
    });

    it('resets to the active layout, discarding runtime remaps', () => {
        setKeyboardLayout('single');
        setKeyboardFaceButtonKeys(0, BTN_LEFT, ['KeyQ']);
        setKeyboardFaceButtonKeys(1, BTN_LEFT, ['KeyZ']);

        resetKeyboardFaceButtonMaps();

        expect(getKeyboardFaceButtonKeys(0, BTN_LEFT)).toEqual(['KeyA', 'ArrowLeft']);
        expect(getKeyboardFaceButtonKeys(1, BTN_LEFT)).toEqual(['KeyJ']);
    });

    it('never writes runtime remaps through to the exported tables', () => {
        setKeyboardLayout('single');
        (getKeyboardFaceButtonKeys(0, BTN_A) as string[]).push('KeyQ');
        setKeyboardFaceButtonKeys(0, BTN_UP, ['KeyZ']);

        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER1[BTN_A]).toEqual(['Space', 'KeyB']);
        expect(DEFAULT_KEYBOARD_SINGLE_PLAYER1[BTN_UP]).toEqual(['KeyW', 'ArrowUp']);
    });

    it('has no keyboard map for players 2 and 3', () => {
        setKeyboardFaceButtonKeys(2, BTN_A, ['KeyZ']);

        expect(getKeyboardFaceButtonKeys(2, BTN_A)).toBeNull();
        expect(getKeyboardFaceButtonKeys(3, BTN_A)).toBeNull();
    });
});
