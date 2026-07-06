import { BarrelDistortion } from '../display/BarrelDistortion';
import { Bloom } from '../display/Bloom';
import { ChromaticAberration } from '../display/ChromaticAberration';
import { Flicker } from '../display/Flicker';
import { Interference } from '../display/Interference';
import { Noise } from '../display/Noise';
import { RGBMask } from '../display/RGBMask';
import { RollLine } from '../display/RollLine';
import { Scanlines } from '../display/Scanlines';
import type { Effect } from '../Effect';

/**
 * Preset bundle that recreates the original "PipBoy" CRT look using the
 * decomposed display-tier effects.
 *
 * Order matters: barrel curvature applies before scanlines/mask so the curve
 * carries the rest of the effects with it; bloom comes last so the phosphor
 * glow blends across the already-modulated output.
 *
 * The returned effects can be added in order to the engine's display chain.
 *
 * @since 1.0.3
 * @returns Array of pre-configured display-tier effects.
 *
 * @example
 * for (const fx of BT.preset.crtPipBoy()) {
 *     BT.effectAdd(fx);
 * }
 */
export function crtPipBoy(): Effect[] {
    const barrel = new BarrelDistortion();
    barrel.curvature = 0.05;

    const aberration = new ChromaticAberration();
    aberration.aberration = 1.0;

    const interference = new Interference();
    interference.amount = 0.06;

    const rollLine = new RollLine();
    rollLine.amount = 0.1;
    rollLine.speed = 1.0;

    const scanlines = new Scanlines();
    scanlines.amount = 0.55;
    scanlines.strength = -8.0;

    const mask = new RGBMask();
    mask.intensity = 0.18;
    mask.size = 6.0;
    mask.border = 0.5;

    const noise = new Noise();
    noise.amount = 0.025;

    const flicker = new Flicker();
    flicker.amount = 1.0;

    const bloom = new Bloom();
    bloom.spread = 3.0;
    bloom.glow = 0.18;

    return [barrel, aberration, interference, rollLine, scanlines, mask, noise, flicker, bloom];
}
