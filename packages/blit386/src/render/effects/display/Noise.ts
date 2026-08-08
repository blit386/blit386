import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Additive per-pixel pseudo-random noise. Reseeds each frame from
 * {@link time} so the noise pattern animates.
 *
 * Display-tier.
 *
 * @since 1.0.3
 */
export class Noise extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Noise amplitude as a `[-amount, +amount]` additive perturbation on each
     * channel. Reasonable values are `0.005` to `0.05`. Set to `0` to disable.
     */
    public amount: number = 0.025;

    /** Wall-clock seconds; reseeds the noise each frame. */
    public time: number = 0;

    protected readonly label = 'Noise';

    /** vec2 resolution + amount + time = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution, amount, and time into the uniform block.
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
        u[2] = this.amount;
        u[3] = this.time;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    amount: f32,
    time: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

fn random(uv: vec2<f32>) -> f32 {
    return fract(cos(uv.x * 83.4827 + uv.y * 92.2842) * 43758.5453);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
    let color = textureSample(src, samp, in.uv);

    if (params.amount <= 0.0) {
        return color;
    }

    let n = (random(in.uv + vec2<f32>(fract(params.time))) - 0.5) * params.amount * 2.0;
    return vec4<f32>(color.rgb + vec3<f32>(n), color.a);
}
`;
