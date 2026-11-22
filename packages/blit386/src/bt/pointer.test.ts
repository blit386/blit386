// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/pointer.ts`: pointer position, delta, scroll and activity.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { BT, Vector2i } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';

describe('BT.pointerPos', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns Vector2i.zero() when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const pos = BT.pointerPos();

        expect(pos.x).toBe(0);
        expect(pos.y).toBe(0);
    });

    it('delegates to the pointer subsystem with the supplied slot index', () => {
        const expected = new Vector2i(80, 60);
        const getPos = vi.fn().mockReturnValue(expected);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPos } as never);

        const pos = BT.pointerPos(2);

        expect(getPos).toHaveBeenCalledWith(2);
        expect(pos).toBe(expected);
    });

    it('defaults the pointer index to 0 (mouse)', () => {
        const getPos = vi.fn().mockReturnValue(new Vector2i());
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPos } as never);

        BT.pointerPos();

        expect(getPos).toHaveBeenCalledWith(0);
    });
});

describe('BT.pointerDelta', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns Vector2i.zero() when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const delta = BT.pointerDelta();

        expect(delta.x).toBe(0);
        expect(delta.y).toBe(0);
    });

    it('delegates to the pointer subsystem', () => {
        const expected = new Vector2i(5, -3);
        const getDelta = vi.fn().mockReturnValue(expected);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getDelta } as never);

        expect(BT.pointerDelta(1)).toBe(expected);
        expect(getDelta).toHaveBeenCalledWith(1, 'frame');
    });

    it('reads the update clock inside update()', () => {
        const getDelta = vi.fn().mockReturnValue(new Vector2i(1, 2));
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getDelta } as never);
        vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(true);

        BT.pointerDelta(1);

        expect(getDelta).toHaveBeenCalledWith(1, 'update');
    });
});

describe('BT.nativeScreenToDisplayPos', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    function stubGeometry(rect: Partial<DOMRect>, displaySize: Vector2i | null): void {
        const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480, ...rect }) };

        vi.spyOn(BTAPI.instance, 'getCanvas').mockReturnValue(canvas as never);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            displaySize === null ? null : ({ displaySize } as never),
        );
    }

    it('returns null when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getCanvas').mockReturnValue(null);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.nativeScreenToDisplayPos(10, 10)).toBeNull();
    });

    it('returns null when the canvas has zero size', () => {
        stubGeometry({ width: 0 }, new Vector2i(320, 240));

        expect(BT.nativeScreenToDisplayPos(10, 10)).toBeNull();
    });

    it('converts client coordinates using the canvas rect and display size', () => {
        stubGeometry({ left: 100, top: 50 }, new Vector2i(320, 240));

        expect(BT.nativeScreenToDisplayPos(100 + 321, 50 + 201)).toEqual(new Vector2i(160, 100));
    });

    it('clamps coordinates outside the canvas to the edge pixels', () => {
        stubGeometry({}, new Vector2i(320, 240));

        expect(BT.nativeScreenToDisplayPos(-10, -10)).toEqual(new Vector2i(0, 0));
        expect(BT.nativeScreenToDisplayPos(5000, 5000)).toEqual(new Vector2i(319, 239));
    });

    it('returns a fresh vector on every call', () => {
        stubGeometry({}, new Vector2i(320, 240));

        expect(BT.nativeScreenToDisplayPos(10, 10)).not.toBe(BT.nativeScreenToDisplayPos(10, 10));
    });
});

describe('BT.pointerPosTo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes (0, 0) into out when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const out = new Vector2i(9, 9);
        const result = BT.pointerPosTo(out);

        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        expect(result).toBe(out);
    });

    it('delegates to the pointer subsystem with out and the supplied slot index', () => {
        const out = new Vector2i();
        const getPosTo = vi.fn().mockReturnValue(out);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPosTo } as never);

        const result = BT.pointerPosTo(out, 2);

        expect(getPosTo).toHaveBeenCalledWith(2, out);
        expect(result).toBe(out);
    });

    it('defaults the pointer index to 0 (mouse)', () => {
        const out = new Vector2i();
        const getPosTo = vi.fn().mockReturnValue(out);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPosTo } as never);

        BT.pointerPosTo(out);

        expect(getPosTo).toHaveBeenCalledWith(0, out);
    });
});

describe('BT.pointerDeltaTo', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('writes (0, 0) into out when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const out = new Vector2i(9, 9);
        const result = BT.pointerDeltaTo(out);

        expect(out.x).toBe(0);
        expect(out.y).toBe(0);
        expect(result).toBe(out);
    });

    it('delegates to the pointer subsystem with out and the supplied slot index', () => {
        const out = new Vector2i();
        const getDeltaTo = vi.fn().mockReturnValue(out);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getDeltaTo } as never);

        const result = BT.pointerDeltaTo(out, 1);

        expect(getDeltaTo).toHaveBeenCalledWith(1, out, 'frame');
        expect(result).toBe(out);
    });

    it('reads the update clock inside update()', () => {
        const out = new Vector2i();
        const getDeltaTo = vi.fn().mockReturnValue(out);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getDeltaTo } as never);
        vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(true);

        BT.pointerDeltaTo(out, 1);

        expect(getDeltaTo).toHaveBeenCalledWith(1, out, 'update');
    });
});

describe('BT.isPointerActive', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.isPointerActive()).toBe(false);
    });

    it('delegates to the pointer subsystem', () => {
        const isActive = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isActive } as never);

        expect(BT.isPointerActive(0)).toBe(true);
        expect(isActive).toHaveBeenCalledWith(0);
    });
});

describe('BT.pointerScrollDelta', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.pointerScrollDelta).toBe(0);
    });

    it('delegates to the pointer subsystem', () => {
        const getScrollDelta = vi.fn().mockReturnValue(42);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getScrollDelta } as never);

        expect(BT.pointerScrollDelta).toBe(42);
    });

    it('reads the update clock inside update() and the frame clock outside it', () => {
        const getScrollDelta = vi.fn().mockReturnValue(0);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getScrollDelta } as never);
        const isUpdating = vi.spyOn(BTAPI.instance, 'isUpdating', 'get').mockReturnValue(true);

        void BT.pointerScrollDelta;

        expect(getScrollDelta).toHaveBeenLastCalledWith('update');

        isUpdating.mockReturnValue(false);
        void BT.pointerScrollDelta;

        expect(getScrollDelta).toHaveBeenLastCalledWith('frame');
    });
});
