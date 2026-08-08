import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Edge-darkening vignette: smooth radial fade from full brightness at the
 * center to black at the corners.
 *
 * Display-tier: applies to the whole simulated screen, not the underlying
 * pixel art.
 *
 * @since 1.0.3
 */
export class Vignette extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Vignette darkening exponent. Higher values produce a stronger vignette
     * with a sharper falloff. PipBoy reference: `0.2`. Set to `0` to disable.
     */
    public amount: number = 0.35;

    protected readonly label = 'Vignette';

    /** vec2 resolution + amount + 1 pad = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution and amount into the uniform block.
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

    if (params.amount <= 0.0) {
        return color;
    }

    let centered = in.uv * 2.0 - vec2<f32>(1.0);
    let edgeRaw = vec2<f32>(1.0) - centered * centered;
    let edge = max(edgeRaw, vec2<f32>(0.0));
    let weight = pow(edge.x * edge.y, params.amount);

    return vec4<f32>(color.rgb * weight, color.a);
}
`;
