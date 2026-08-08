import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * CRT scanlines: alternating bright/dark horizontal bands aligned to the
 * source vertical resolution.
 *
 * Display-tier: at output resolution there is enough vertical pixels for
 * scanlines to read as alternating bright/dark bands. At logical 320x240 the
 * Gaussian weight quantizes to one of two values per source row and you lose
 * the smooth fade.
 *
 * @since 1.0.3
 */
export class Scanlines extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /** Scanline mix amount in `[0, 1]`. 0 disables. */
    public amount: number = 0.55;

    /**
     * Negative gaussian falloff parameter for scanline brightness. More
     * negative values produce sharper dark bands. PipBoy reference: `-8.0`.
     */
    public strength: number = -8.0;

    /**
     * Number of scanline cycles vertically. Should match the demo's logical
     * source vertical resolution so each "source pixel row" maps to one
     * scanline cycle. Defaults to `240`, the most common pixel-art height.
     *
     * Set to e.g. `200` for VGA-style 320x200 games or `144` for Game Boy
     * resolution.
     */
    public density: number = 240;

    protected readonly label = 'Scanlines';

    /** amount + strength + density + _pad = 4 floats / 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes amount, strength, and density into the uniform block.
     * @param _deltaMs – Unused; effect reads public fields updated by demo code.
     * @param sourceSize – Chain attachment dimensions in pixels for this pass.
     */
    protected writeUniforms(_deltaMs: number, sourceSize: Vector2i): void {
        const u = this.uniformData;

        if (!u) {
            return;
        }

        u[0] = this.amount;
        u[1] = this.strength;
        u[2] = this.density;
        u[3] = 0;
        // sourceSize unused: density is in source-pixel units, independent of chain size.
        void sourceSize;
    }
}

const FRAGMENT_WGSL = `
struct Params {
    amount: f32,
    strength: f32,
    density: f32,
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

    let y = in.uv.y * params.density;
    let phase = fract(y) - 0.5;
    let weight = exp2(params.strength * phase * phase);
    let scaled = mix(1.0, weight, params.amount);

    return vec4<f32>(color.rgb * scaled, color.a);
}
`;
