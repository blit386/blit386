import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Per-row horizontal jitter that simulates analog signal interference.
 *
 * Each output row gets a deterministic random horizontal offset seeded by
 * row index and time. Row offsets are stable for one frame and re-seed every
 * frame, producing a buzzing-noise feel.
 *
 * Display-tier. Drives jitter from {@link time}; demos typically pass
 * `BT.ticks / BT.targetFPS`.
 *
 * @since 1.0.3
 */
export class Interference extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /**
     * Maximum horizontal offset as a UV fraction (e.g. `0.06` shifts the row
     * by up to ~6% of the image width). Set to `0` to disable.
     */
    public amount: number = 0.06;

    /** Wall-clock seconds; reseeds the row offsets each frame. */
    public time: number = 0;

    protected readonly label = 'Interference';

    /** vec2 resolution + amount + time = 16 bytes. */
    protected readonly uniformBytes = 16;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution, amount, and time into the uniform block.
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
    if (params.amount <= 0.0) {
        return textureSample(src, samp, in.uv);
    }

    let row = floor(in.uv.y * params.resolution.y);
    let jitter = (random(vec2<f32>(row, fract(params.time))) - 0.5) * params.amount;
    let off = vec2<f32>(jitter, 0.0);

    return textureSample(src, samp, in.uv + off);
}
`;
