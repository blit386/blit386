import { describe, expect, it } from 'vitest';

import { clampCameraToWorld } from './CameraUtils';
import { Vector2i } from './Vector2i';

describe('clampCameraToWorld', () => {
    it('clamps camera inside positive world bounds', () => {
        const camera = new Vector2i(500, 300);
        const world = new Vector2i(640, 480);
        const view = new Vector2i(320, 240);

        const clamped = clampCameraToWorld(camera, world, view);

        expect(clamped.isEqualXY(320, 240)).toBe(true);
    });

    it('clamps negative camera coordinates to zero', () => {
        const camera = new Vector2i(-20, -10);
        const world = new Vector2i(1000, 1000);
        const view = new Vector2i(320, 240);

        const clamped = clampCameraToWorld(camera, world, view);

        expect(clamped.isEqualXY(0, 0)).toBe(true);
    });

    it('pins axis to zero when world is smaller than viewport', () => {
        const camera = new Vector2i(30, 40);
        const world = new Vector2i(200, 100);
        const view = new Vector2i(320, 240);

        const clamped = clampCameraToWorld(camera, world, view);

        expect(clamped.isEqualXY(0, 0)).toBe(true);
    });
});
