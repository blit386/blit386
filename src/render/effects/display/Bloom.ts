import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Single-pass box-blur bloom.
 *
 * Samples a 5x5 neighborhood (25 taps) around each fragment, averages, then
 * mixes with the original color by {@link glow}. {@link spread} scales the
 * texel offset so the bloom radius can be tuned independently of the source
 * resolution.
 *
 * Display-tier: bloom mixes neighboring pixels into intermediate hues that
 * are not in the active palette. Running it in pixel space would violate the
 * palette-pixel aesthetic; running it on the upscaled output reads as the
 * warm phosphor glow of an old monitor instead.
 *
 * The implementation matches the original PipBoy bloom shader. A future
 * optimisation would be a two-pass separable Gaussian (5 + 5 = 10 taps); add
 * it once a GPU perf test demands it.
 *
 * @since 1.0.3
 */
export class Bloom extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /** Texel offset multiplier for the box-blur kernel. */
    public spread: number = 3.0;

    /** Mix factor between the original sample and the blurred neighborhood. */
    public glow: number = 0.18;

    protected readonly label = 'Bloom';

    /** vec2 resolution + spread + glow = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution, spread, and glow into the uniform block.
     * @param _deltaMs - Unused; effect reads public fields updated by demo code.
     * @param sourceSize - Chain attachment dimensions in pixels for this pass.
     */
    protected writeUniforms(_deltaMs: number, sourceSize: Vector2i): void {
        const u = this.uniformData;

        if (!u) {
            return;
        }

        u[0] = sourceSize.x;
        u[1] = sourceSize.y;
        u[2] = this.spread;
        u[3] = this.glow;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    spread: f32,
    glow: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let texelSize = vec2<f32>(1.0) / params.resolution;
    var sum = vec4<f32>(0.0);

    for (var x: i32 = -2; x <= 2; x = x + 1) {
        for (var y: i32 = -2; y <= 2; y = y + 1) {
            let offset = vec2<f32>(f32(x), f32(y)) * texelSize * params.spread;
            sum = sum + textureSample(src, samp, in.uv + offset);
        }
    }

    sum = sum / 25.0;

    let orig = textureSample(src, samp, in.uv);
    return orig + (sum - orig) * params.glow;
}
`;
