import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * Slowly scrolling vertical interference band that brightens a horizontal
 * stripe of the image. Combination of three cosines + smoothstep gives the
 * stripe a soft top/bottom edge.
 *
 * Display-tier. Demo drives {@link time} (typically `BT.ticks / BT.targetFPS`).
 *
 * @since 1.0.3
 */
export class RollLine extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /** Roll line amplitude (mix factor onto a brightness boost). */
    public amount: number = 0.1;

    /** Scroll speed multiplier; final scroll velocity = `time * speed`. */
    public speed: number = 1.0;

    /** Wall-clock seconds; demos typically drive this each frame. */
    public time: number = 0;

    protected readonly label = 'RollLine';

    /** vec2 resolution + amount + speed + time + 1 pad = 32 bytes. */
    protected readonly uniformBytes = 32;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution, amount, speed, and time into the uniform block.
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
        u[3] = this.speed;
        u[4] = this.time;
        // u[5..7] padding
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    amount: f32,
    speed: f32,
    time: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
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

    let x = in.uv.y * 3.0 - params.time * params.speed;
    let f = cos(x) * cos(x * 2.35 + 1.1) * cos(x * 4.45 + 2.3);
    let line = smoothstep(0.5, 0.9, f) * params.amount;

    return vec4<f32>(color.rgb * (1.0 + line * 1.5), color.a);
}
`;
