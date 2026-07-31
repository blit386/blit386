import { BarrelDistortion } from '../display/BarrelDistortion';
import { Bloom } from '../display/Bloom';
import { Flicker } from '../display/Flicker';
import { Noise } from '../display/Noise';
import { Scanlines } from '../display/Scanlines';
import { Vignette } from '../display/Vignette';
import type { Effect } from '../Effect';

/**
 * Green monochrome PC monitor look (think original IBM monochrome / VT100).
 *
 * Ships as a parameter-only set - see the {@link amber} preset for the
 * caveat about re-quantization. Same effect stack as `amber()`,
 * tuned slightly toward a cooler / more flickery aesthetic.
 *
 * @since 1.0.3
 * @returns Array of pre-configured display-tier effects.
 */
export function green(): Effect[] {
    const barrel = new BarrelDistortion();
    barrel.curvature = 0.04;

    const scanlines = new Scanlines();
    scanlines.amount = 0.55;
    scanlines.strength = -7.5;

    const vignette = new Vignette();
    vignette.amount = 0.35;

    const noise = new Noise();
    noise.amount = 0.018;

    const flicker = new Flicker();
    flicker.amount = 1.0;

    const bloom = new Bloom();
    bloom.spread = 3.0;
    bloom.glow = 0.16;

    return [barrel, scanlines, vignette, noise, flicker, bloom];
}
