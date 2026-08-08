import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Barrel distortion that warps UVs outward from the screen center.
 *
 * Display-tier: operates on the upscaled output. Applying this in the pixel
 * tier (logical 320x240) discretizes the curve onto the source texel grid,
 * which CSS upscale then magnifies into visible step artifacts. At output
 * resolution the curve has enough resolution to express smoothly.
 *
 * The math comes from Timothy Lottes's public-domain `crt-lottes.glsl`:
 * `warp(uv) = uv + delta * d2 * curvature` where `delta = uv - 0.5` and
 * `d2 = dot(delta, delta)`.
 *
 * @since 1.0.3
 */
export class BarrelDistortion extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Curvature strength. Typical values:
     *
     * - `0.02` - subtle, like a flat-screen monitor.
     * - `0.05` - moderate desktop CRT.
     * - `0.10` - heavy small CRT or pocket TV.
     */
    public curvature: number = 0.05;

    protected readonly label = 'BarrelDistortion';

    /** vec2 resolution + curvature + 1 padding f32 = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution and curvature into the uniform block.
     * @param _deltaMs – Unused; effect reads public fields updated by demo code.
     * @param sourceSize – Chain attachment dimensions in pixels for this pass.
     */
    protected writeUniforms(_deltaMs: number, sourceSize: Vector2i): void {
        const u = this.uniformData;

        if (!u) {
            return;
        }

        u[0] = sourceSize.x;
        u[1] = sourceSize.y;
        u[2] = this.curvature;
        u[3] = 0;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    curvature: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

fn warp(uv: vec2<f32>) -> vec2<f32> {
    let delta = uv - vec2<f32>(0.5);
    let d2 = dot(delta, delta);
    return uv + delta * d2 * params.curvature;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let warped = warp(in.uv);

    // Sample first (uniform control flow), then mask out-of-bounds. WGSL
    // forbids textureSample inside data-dependent branches because of mip
    // derivatives; textureSampleLevel sidesteps that, but fetching at LOD 0
    // also avoids any sampler derivative work entirely.
    let sampled = textureSampleLevel(src, samp, warped, 0.0);

    let inBounds = warped.x >= 0.0 && warped.x <= 1.0 && warped.y >= 0.0 && warped.y <= 1.0;
    return select(vec4<f32>(0.0, 0.0, 0.0, 1.0), sampled, inBounds);
}
`;
