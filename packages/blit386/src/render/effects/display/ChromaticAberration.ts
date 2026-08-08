import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * RGB channel offset that simulates lens chromatic aberration: red samples
 * left of the fragment, blue samples right, green stays centered.
 *
 * Display-tier: spreads color along the lens axis. At logical resolution the
 * single-pixel offset is too coarse and reads as a glitch instead of a soft
 * fringe.
 *
 * @since 1.0.3
 */
export class ChromaticAberration extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Channel offset in display-chain (output) pixels. Reasonable values are `0.5` to `3.0`.
     * Set to `0` to disable.
     */
    public aberration: number = 1.0;

    protected readonly label = 'ChromaticAberration';

    /** vec2 resolution + aberration + 1 pad = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution and aberration offset into the uniform block.
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
        u[2] = this.aberration;
        u[3] = 0;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    aberration: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let off = vec2<f32>(params.aberration, 0.0) / params.resolution;
    let center = textureSample(src, samp, in.uv);
    let r = textureSample(src, samp, in.uv - off).r;
    let b = textureSample(src, samp, in.uv + off).b;
    return vec4<f32>(r, center.g, b, center.a);
}
`;
