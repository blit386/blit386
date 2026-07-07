import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Brightness multiplier - the simplest CRT animation knob.
 *
 * Demos drive {@link amount} per frame to simulate flicker (e.g. with
 * `0.95 + sin(t) * 0.05`). The effect is intentionally trivial so the demo
 * controls the pattern; for procedural noise-driven flicker, combine with
 * the {@link Noise} effect.
 *
 * Display-tier.
 *
 * @since 1.0.3
 */
export class Flicker extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Brightness multiplier. `1` is unmodulated; values below `1` darken the
     * frame. The demo typically updates this each frame from a sin wave or
     * random source.
     */
    public amount: number = 1.0;

    protected readonly label = 'Flicker';

    /** vec2 resolution + amount + 1 pad = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution and brightness amount into the uniform block.
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
        u[2] = this.amount;
        u[3] = 0;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    amount: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let color = textureSample(src, samp, in.uv);
    return vec4<f32>(color.rgb * params.amount, color.a);
}
`;
