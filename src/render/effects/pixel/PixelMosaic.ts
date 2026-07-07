import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenPixelEffect } from '../FullscreenPixelEffect';

/**
 * Block down-quantize: every {@link blockSize}x{@link blockSize} group of
 * source pixels is replaced with the palette index from the block's top-left,
 * producing chunky pixelation without RGB averaging drift.
 *
 * Pixel-tier: runs on the logical `r8uint` framebuffer (palette indices).
 *
 * @since 1.0.3
 */
export class PixelMosaic extends FullscreenPixelEffect {
    /**
     * Block side length in source pixels. `1` is a no-op; `2` halves
     * effective resolution; `8` produces very chunky blocks.
     */
    public blockSize: number = 4;

    protected readonly label = 'PixelMosaic';

    /** vec2 resolution + blockSize + 1 pad = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShaderRgba = UNSUPPORTED_WGSL;

    protected readonly fragmentShaderUint = FRAGMENT_UINT_WGSL;

    /**
     * Writes resolution and blockSize into the uniform block.
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
        u[2] = this.blockSize;
        u[3] = 0;
    }
}

const UNSUPPORTED_WGSL = `
struct Params {
    resolution: vec2<f32>,
    blockSize: f32,
    _pad: f32,
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
    blockSize: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<u32>;

@fragment
fn fs_main(in: VsOut) -> @location(0) u32 {
    let lw = max(i32(params.resolution.x), 1);
    let lh = max(i32(params.resolution.y), 1);
    let lwf = max(params.resolution.x, 1.0);
    let lhf = max(params.resolution.y, 1.0);

    let ix = clamp(i32(floor(in.uv.x * lwf)), 0, lw - 1);
    let iy = clamp(i32(floor(in.uv.y * lhf)), 0, lh - 1);

    let block = max(i32(params.blockSize), 1);
    let snappedX = (ix / block) * block;
    let snappedY = (iy / block) * block;
    let sx = clamp(snappedX, 0, lw - 1);
    let sy = clamp(snappedY, 0, lh - 1);

    let idx = textureLoad(src, vec2<i32>(sx, sy), 0).r;
    return idx;
}
`;
