import { BarrelDistortion } from '../display/BarrelDistortion';
import { Bloom } from '../display/Bloom';
import { Flicker } from '../display/Flicker';
import { Noise } from '../display/Noise';
import { Scanlines } from '../display/Scanlines';
import { Vignette } from '../display/Vignette';
import type { Effect } from '../Effect';

/**
 * Amber monochrome PC monitor look (think IBM 5151 / Hercules).
 *
 * Ships as a parameter-only set – the underlying colors stay full-RGB until
 * the planned MonochromeQuantize effect lands.
 * For now this preset gives you the *feel* (CRT curvature + scanlines +
 * vignette + warm-tinted bloom) without the actual amber re-quantization.
 *
 * @since 1.0.3
 * @returns Array of pre-configured display-tier effects.
 */
export function amber(): Effect[] {
    const barrel = new BarrelDistortion();
    barrel.curvature = 0.04;

    const scanlines = new Scanlines();
    scanlines.amount = 0.5;
    scanlines.strength = -7;

    const vignette = new Vignette();
    vignette.amount = 0.4;

    const noise = new Noise();
    noise.amount = 0.012;

    const flicker = new Flicker();
    flicker.amount = 1.0;

    const bloom = new Bloom();
    bloom.spread = 3.5;
    bloom.glow = 0.2;

    return [barrel, scanlines, vignette, noise, flicker, bloom];
}
