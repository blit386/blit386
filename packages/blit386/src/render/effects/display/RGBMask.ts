import type { Vector2i } from '../../../utils/Vector2i';
import { FullscreenEffect } from '../FullscreenEffect';

/**
 * CRT shadow mask: per-pixel R/G/B vertical-stripe pattern with darkened
 * cell borders, simulating the phosphor grille of an aperture-grille CRT.
 *
 * Display-tier: at output resolution there are enough output pixels per
 * mask cell to read as colored stripes. The cell pitch (in output pixels) is
 * the {@link size} parameter.
 *
 * Math is a direct WGSL port of the libretro `crt-lottes.glsl` mask code.
 *
 * @since 1.0.3
 */
export class RGBMask extends FullscreenEffect {
    public readonly tier = 'display' as const;

    /** Mask brightness mix amount in `[0, 1]`. 0 hides the mask. */
    public intensity: number = 0.18;

    /** Mask cell pitch in output (display-chain) pixels. Smaller = denser mask. */
    public size: number = 6.0;

    /** Border darkening within each mask cell. 0 disables, 1 strong. */
    public border: number = 0.5;

    protected readonly label = 'RGBMask';

    /** vec2 resolution + intensity + size + border + 1 pad = 32 bytes. */
    protected readonly uniformBytes = 32;

    protected readonly fragmentShader = FRAGMENT_WGSL;

    /**
     * Writes resolution, intensity, size, and border into the uniform block.
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
        u[2] = this.intensity;
        // Clamp away from 0 so the shader's `coord = pixel / size` stays defined.
        u[3] = Math.max(this.size, 0.001);
        u[4] = this.border;
        // u[5..7] padding
    }
}

const FRAGMENT_WGSL = `
struct Params {
    resolution: vec2<f32>,
    intensity: f32,
    size: f32,
    border: f32,
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

    if (params.intensity <= 0.0) {
        return color;
    }

    let pixel = in.uv * params.resolution;
    let coord = pixel / params.size;
    let subcoord = coord * vec2<f32>(3.0, 1.0);
    let cellOffset = vec2<f32>(0.0, fract(floor(coord.x) * 0.5));
    let subFloor = floor(subcoord.x);
    let ind = subFloor - 3.0 * floor(subFloor / 3.0);

    var maskColor = vec3<f32>(
        select(0.0, 1.0, ind < 0.5),
        select(0.0, 1.0, ind >= 0.5 && ind < 1.5),
        select(0.0, 1.0, ind >= 1.5),
    ) * 3.0;

    let cellUV = fract(subcoord + cellOffset) * 2.0 - vec2<f32>(1.0);
    let borderXY = vec2<f32>(1.0) - cellUV * cellUV * params.border;
    maskColor = maskColor * (borderXY.x * borderXY.y);

    let modulated = color.rgb * (1.0 + (maskColor - vec3<f32>(1.0)) * params.intensity);
    return vec4<f32>(modulated, color.a);
}
`;
