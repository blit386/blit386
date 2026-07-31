import { Vector2i } from './Vector2i';

/**
 * Clamps a camera origin so a viewport stays within world bounds.
 *
 * `camera` is interpreted as the viewport top-left in world coordinates.
 * The result is clamped to `[0, max(world - view)]` per axis. When the
 * world is smaller than the viewport on an axis, that axis clamps to `0`.
 *
 * @since 1.0.3
 * @param camera - Desired camera origin in world coordinates.
 * @param worldSize - Full world size in pixels.
 * @param viewSize - Viewport size in pixels.
 * @returns Clamped camera origin.
 */
export function clampCameraToWorld(camera: Vector2i, worldSize: Vector2i, viewSize: Vector2i): Vector2i {
    const maxX = Math.max(0, worldSize.x - viewSize.x);
    const maxY = Math.max(0, worldSize.y - viewSize.y);

    return Vector2i.fromXYUnchecked(Math.max(0, Math.min(maxX, camera.x)), Math.max(0, Math.min(maxY, camera.y)));
}
