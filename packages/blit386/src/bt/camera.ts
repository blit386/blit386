/**
 * Camera: offset, clamp, and reset.
 *
 * Part of the `BT` namespace; `BLIT386.ts` merges every part into `BT`.
 */

import { BTAPI } from '../core/BTAPI';
import { clampCameraToWorld } from '../utils/CameraUtils';
import type { Vector2i } from '../utils/Vector2i';
import { settingsOrDefault } from './internal';

/** Camera members of `BT`. */
export const camera = {
    /**
     * Sets the global camera offset applied to subsequent draw calls.
     *
     * @since 0.1.0
     * @param offset - Camera translation in display pixels.
     */
    cameraSet: (offset: Vector2i): void => {
        BTAPI.instance.setCameraOffset(offset);
    },

    /**
     * Current global camera offset (clone; safe to mutate without affecting the engine).
     *
     * @since 1.0.4
     * @changed 1.8.1 Before initialization, returns a new `(0, 0)` instead of the frozen `Vector2i.zero()`.
     * @returns Camera translation in display pixels; `(0, 0)` before initialization.
     */
    get camera(): Vector2i {
        return BTAPI.instance.getCameraOffset();
    },

    /**
     * Clamps a camera origin so the viewport stays within world bounds.
     *
     * Uses integer clamping per axis: `[0, worldSize - viewSize]`.
     * If `viewSize` is omitted, the active {@link BT.displaySize} is used.
     *
     * @since 1.0.3
     * @param camera - Desired camera origin in world coordinates.
     * @param worldSize - Full world size in pixels.
     * @param viewSize - Viewport size in pixels (defaults to {@link BT.displaySize}).
     * @returns Clamped camera origin.
     */
    cameraClamp: (camera: Vector2i, worldSize: Vector2i, viewSize?: Vector2i): Vector2i => {
        return clampCameraToWorld(camera, worldSize, viewSize ?? settingsOrDefault().displaySize.clone());
    },

    /**
     * Resets the global camera offset to `(0, 0)`.
     *
     * @since 0.1.0
     * @changed 1.7.1 Now persists once nothing sets the camera again: previously, the offset
     *   the engine re-applies at frame start stayed at its pre-reset value forever, so a
     *   later frame that never calls `cameraSet` again still saw the old offset leak back in.
     */
    cameraReset: (): void => {
        BTAPI.instance.resetCamera();
    },
};
