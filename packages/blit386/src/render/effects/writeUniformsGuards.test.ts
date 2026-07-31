/**
 * Covers the defensive `writeUniforms` null-`uniformData` early return shared by
 * every concrete pixel and display effect. That branch is unreachable through
 * {@link FullscreenEffect.updateUniforms} / {@link FullscreenPixelEffect.updateUniforms}
 * (those methods return earlier), so it is exercised here via a protected-method cast.
 */

import { describe, expect, it } from 'vitest';

import { Vector2i } from '../../utils/Vector2i';
import { BarrelDistortion } from './display/BarrelDistortion';
import { Bloom } from './display/Bloom';
import { ChromaticAberration } from './display/ChromaticAberration';
import { Flicker } from './display/Flicker';
import { Interference } from './display/Interference';
import { Noise } from './display/Noise';
import { RGBMask } from './display/RGBMask';
import { RollLine } from './display/RollLine';
import { Scanlines } from './display/Scanlines';
import { Vignette } from './display/Vignette';
import type { Effect } from './Effect';
import { PixelGlitch } from './pixel/PixelGlitch';
import { PixelMosaic } from './pixel/PixelMosaic';

type WritableUniforms = Effect & {
    writeUniforms: (deltaMs: number, sourceSize: Vector2i) => void;
};

const SIZE = new Vector2i(320, 240);

const EFFECTS: Array<{ name: string; create: () => WritableUniforms }> = [
    { name: 'BarrelDistortion', create: () => new BarrelDistortion() as unknown as WritableUniforms },
    { name: 'Bloom', create: () => new Bloom() as unknown as WritableUniforms },
    { name: 'ChromaticAberration', create: () => new ChromaticAberration() as unknown as WritableUniforms },
    { name: 'Flicker', create: () => new Flicker() as unknown as WritableUniforms },
    { name: 'Interference', create: () => new Interference() as unknown as WritableUniforms },
    { name: 'Noise', create: () => new Noise() as unknown as WritableUniforms },
    { name: 'RGBMask', create: () => new RGBMask() as unknown as WritableUniforms },
    { name: 'RollLine', create: () => new RollLine() as unknown as WritableUniforms },
    { name: 'Scanlines', create: () => new Scanlines() as unknown as WritableUniforms },
    { name: 'Vignette', create: () => new Vignette() as unknown as WritableUniforms },
    { name: 'PixelGlitch', create: () => new PixelGlitch() as unknown as WritableUniforms },
    { name: 'PixelMosaic', create: () => new PixelMosaic() as unknown as WritableUniforms },
];

describe('concrete effect writeUniforms null guards', () => {
    it.each(EFFECTS)('$name writeUniforms no-ops when uniformData is null', ({ create }) => {
        const fx = create();

        expect(() => fx.writeUniforms(16, SIZE)).not.toThrow();
    });
});
