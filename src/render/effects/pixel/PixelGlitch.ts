import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenPixelEffect } from '../FullscreenPixelEffect';

/**
 * Chunky pixel-aligned horizontal glitch: every Nth row of source pixels gets
 * a random horizontal shift. Shifts snap to integer source-pixel offsets so
 * palette indices move whole-texel (no RGB resampling).
 *
 * Pixel-tier: runs on the logical `r8uint` framebuffer (palette indices).
 *
 * @since 1.0.3
 */
export class PixelGlitch extends FullscreenPixelEffect {
    /**
     * Glitch strength in `[0, 1]`. Scales the per-band horizontal shift
     * magnitude. Bands are shifted when their hash exceeds ~0.85 (~15% of
     * bands). `0` disables.
     */
    public intensity: number = 0;

    /**
     * Height of each glitch band in source pixels. Each band gets a single
     * shift value, so larger bands produce chunkier glitches.
     */
    public bandHeight: number = 4;

    /**
     * Per-glitch random seed. Change between glitches to vary the band noise
     * pattern.
     */
    public seed: number = 0;

    protected readonly label = 'PixelGlitch';

    /** vec2 resolution + intensity + bandHeight + seed + 3 pads = 32 bytes. */
    protected readonly uniformBytes = 32;

    protected readonly fragmentShaderRgba = UNSUPPORTED_WGSL;

    protected readonly fragmentShaderUint = FRAGMENT_UINT_WGSL;

    /**
     * Writes resolution, intensity, bandHeight, and seed into the uniform block.
     *
     * @param _deltaMs - Unused.
     * @param sourceSize - Logical texture dimensions for this pass.
     */
    protected writeUniforms(_deltaMs: number, sourceSize: Vector2i): void {
        const u = this.uniformData;

        if (!u) {
            return;
        }

        u[0] = sourceSize.x;
        u[1] = sourceSize.y;
        u[2] = this.intensity;
        u[3] = this.bandHeight;
        u[4] = this.seed;
    }
}

/** Unused RGBA path retained only so {@link FullscreenPixelEffect} can compile both branches. */
const UNSUPPORTED_WGSL = `
struct Params {
    resolution: vec2<f32>,
    intensity: f32,
    bandHeight: f32,
    seed: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
}
`;

const FRAGMENT_UINT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    intensity: f32,
    bandHeight: f32,
    seed: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<u32>;

fn hash(n: f32) -> f32 {
    return fract(sin(n) * 43758.5453);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) u32 {
    let lw = max(i32(params.resolution.x), 1);
    let lh = max(i32(params.resolution.y), 1);
    let lwf = max(params.resolution.x, 1.0);
    let lhf = max(params.resolution.y, 1.0);

    let ix = clamp(i32(floor(in.uv.x * lwf)), 0, lw - 1);
    let iy = clamp(i32(floor(in.uv.y * lhf)), 0, lh - 1);

    if (params.intensity <= 0.0) {
        let idx = textureLoad(src, vec2<i32>(ix, iy), 0).r;
        return idx;
    }

    let bandHeight = max(params.bandHeight, 1.0);
    let band = floor(in.uv.y * params.resolution.y / bandHeight);
    let bandHash = hash(band * 43.758 + params.seed);

    var sx = ix;

    if (bandHash > 0.85) {
        let shiftPx = i32(floor((bandHash - 0.5) * params.intensity * params.resolution.x * 0.16));
        sx = clamp(ix + shiftPx, 0, lw - 1);
    }

    let idx = textureLoad(src, vec2<i32>(sx, iy), 0).r;
    return idx;
}
`;
