// @vitest-environment happy-dom

/**
 * Unit tests for the `BT` members defined in `src/bt/camera.ts`: cameraSet, camera, cameraClamp, cameraReset.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockHardwareSettings } from '../__test__/btFacadeFixtures';
import { BT, Vector2i } from '../BLIT386';
import { BTAPI } from '../core/BTAPI';

describe('BT.cameraSet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.setCameraOffset', () => {
        const spy = vi.spyOn(BTAPI.instance, 'setCameraOffset').mockReturnValue(undefined);
        const offset = new Vector2i(100, 50);

        BT.cameraSet(offset);

        expect(spy).toHaveBeenCalledWith(offset);
    });
});

describe('BT.camera', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getCameraOffset and returns its result', () => {
        const expected = new Vector2i(64, 32);
        vi.spyOn(BTAPI.instance, 'getCameraOffset').mockReturnValue(expected);

        const result = BT.camera;

        expect(result).toBe(expected);
    });

    it('returns an independent clone per read', () => {
        const stored = new Vector2i(64, 32);
        vi.spyOn(BTAPI.instance, 'getCameraOffset').mockImplementation(() => stored.clone());

        const first = BT.camera;
        first.x = 999;

        expect(BT.camera.x).toBe(64);
    });
});

describe('BT.cameraClamp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('clamps camera coordinates when viewSize is provided', () => {
        const clamped = BT.cameraClamp(new Vector2i(500, 300), new Vector2i(640, 480), new Vector2i(320, 240));

        expect(clamped.isEqualXY(320, 240)).toBe(true);
    });

    it('uses BT.displaySize when viewSize is omitted', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(200, 150), 60),
        );

        const clamped = BT.cameraClamp(new Vector2i(100, 100), new Vector2i(250, 200));

        expect(clamped.isEqualXY(50, 50)).toBe(true);
    });
});

describe('BT.cameraReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.resetCamera', () => {
        const spy = vi.spyOn(BTAPI.instance, 'resetCamera').mockReturnValue(undefined);

        BT.cameraReset();

        expect(spy).toHaveBeenCalledOnce();
    });
});
