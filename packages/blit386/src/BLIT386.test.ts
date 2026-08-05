// @vitest-environment happy-dom

/**
 * Unit tests for the public `BT` facade exported from `BLIT386.ts`.
 *
 * Covers delegation from top-level `BT.*` calls into `BTAPI.instance`,
 * default return behavior for hardware-dependent queries, and the warning
 * suppression behavior used by facade helpers.
 */

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

import { AssetLoader } from './assets/AssetLoader';
import type { AudioClip } from './assets/AudioClip';
import { blip, explosion, hit, jump, laser, pickup } from './assets/synth/synthPresets';
import type { BitmapFont, HardwareSettings } from './BLIT386';
import { BT, Palette, Random, Rect2i, SpriteSheet, Vector2i } from './BLIT386';
import { BTAPI } from './core/BTAPI';
import type { FaceButtonCode } from './input/defaultKeyboardMap';
import { SoftwareRenderer } from './render/SoftwareRenderer';
import { DEFAULT_CONTAINER_ID } from './utils/BootstrapHelpers';

const mockHardwareSettings = (displaySize = new Vector2i(320, 240), targetFPS = 60): HardwareSettings => ({
    displaySize,
    targetFPS,
});

function setupErrorContainer(): HTMLDivElement {
    const existingContainer = document.getElementById(DEFAULT_CONTAINER_ID);

    if (existingContainer instanceof HTMLDivElement) {
        existingContainer.textContent = '';
        return existingContainer;
    }

    const container = document.createElement('div');
    container.id = DEFAULT_CONTAINER_ID;
    document.body.appendChild(container);
    return container;
}

function clearErrorContainer(): void {
    const container = document.getElementById(DEFAULT_CONTAINER_ID);
    if (container?.parentElement) {
        container.parentElement.removeChild(container);
    }
}

async function withErrorContainer(callback: () => void | Promise<void>): Promise<void> {
    setupErrorContainer();
    try {
        await callback();
    } finally {
        clearErrorContainer();
    }
}

describe('BT.init', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.init and returns its result', async () => {
        const spy = vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(true);
        const demo = {
            configure: vi.fn(),
            init: vi.fn(),
            update: vi.fn(),
            render: vi.fn(),
        };
        const canvas = {} as HTMLCanvasElement;

        const result = await BT.init(demo, canvas);

        expect(spy).toHaveBeenCalledWith(demo, canvas);
        expect(result).toBe(true);
    });

    it('forwards a failure result from BTAPI', async () => {
        vi.spyOn(BTAPI.instance, 'init').mockResolvedValue(false);

        const demo = {
            configure: vi.fn(),
            init: vi.fn(),
            update: vi.fn(),
            render: vi.fn(),
        };

        const result = await BT.init(demo, {} as HTMLCanvasElement);

        expect(result).toBe(false);
    });
});

describe('BT.displaySize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns zero vector when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        const size = BT.displaySize;

        expect(size.x).toBe(0);
        expect(size.y).toBe(0);
    });

    it('returns a clone of displaySize from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(640, 480)));

        const size = BT.displaySize;

        expect(size.x).toBe(640);
        expect(size.y).toBe(480);
    });
});

describe('BT.drawingBufferSize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns null when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.drawingBufferSize).toBeNull();
    });

    it('returns null when drawingBufferSize was not configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings());

        expect(BT.drawingBufferSize).toBeNull();
    });

    it('returns a clone when drawingBufferSize is configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const size = BT.drawingBufferSize;

        expect(size?.x).toBe(640);
        expect(size?.y).toBe(480);
    });

    it('returns an independent clone per read', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const first = BT.drawingBufferSize;
        expect(first).toBeDefined();
        if (!first) {
            return;
        }

        first.x = 999;

        expect(BT.drawingBufferSize?.x).toBe(640);
    });
});

describe('BT.outputSize', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns zero vector when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        const size = BT.outputSize;

        expect(size.x).toBe(0);
        expect(size.y).toBe(0);
    });

    it('matches displaySize when drawingBufferSize is omitted', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(320, 240)));

        const size = BT.outputSize;

        expect(size.x).toBe(320);
        expect(size.y).toBe(240);
    });

    it('returns drawingBufferSize when configured', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue({
            ...mockHardwareSettings(new Vector2i(320, 240)),
            drawingBufferSize: new Vector2i(640, 480),
        });

        const size = BT.outputSize;

        expect(size.x).toBe(640);
        expect(size.y).toBe(480);
    });

    it('returns an independent clone per read', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(mockHardwareSettings(new Vector2i(320, 240)));

        const first = BT.outputSize;
        first.x = 999;

        expect(BT.outputSize.x).toBe(320);
    });
});

describe('BT.targetFPS', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 60 when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.targetFPS).toBe(60);
    });

    it('returns targetFPS from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 30),
        );

        expect(BT.targetFPS).toBe(30);
    });
});

describe('BT.deltaSeconds', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 1/60 when hardware settings are not available', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(null);

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });

    it('returns reciprocal of targetFPS from hardware settings', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 50),
        );

        expect(BT.deltaSeconds).toBeCloseTo(0.02);
    });

    it('falls back to 1/60 when targetFPS is non-positive', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 0),
        );

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });

    it('falls back to 1/60 when targetFPS is non-finite', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), Number.NaN),
        );

        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
    });
});

describe('BT.timeSeconds', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns ticks multiplied by deltaSeconds', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(90);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 30),
        );

        expect(BT.timeSeconds).toBeCloseTo(3);
    });

    it('uses fallback delta when targetFPS is non-positive, producing finite time', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), 0),
        );

        const time = BT.timeSeconds;
        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
        expect(Number.isFinite(time)).toBe(true);
        expect(time).toBeCloseTo(2);
    });

    it('uses fallback delta when targetFPS is non-finite, producing finite time', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(320, 240), Number.POSITIVE_INFINITY),
        );

        const time = BT.timeSeconds;
        expect(BT.deltaSeconds).toBeCloseTo(1 / 60);
        expect(Number.isFinite(time)).toBe(true);
        expect(time).toBeCloseTo(2);
    });
});

describe('BT.ticks', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getTicks', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(42);

        expect(BT.ticks).toBe(42);
    });
});

describe('BT.ticksReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.resetTicks', () => {
        const spy = vi.spyOn(BTAPI.instance, 'resetTicks').mockReturnValue(undefined);

        BT.ticksReset();

        expect(spy).toHaveBeenCalledOnce();
    });
});

describe('BT.renderAlpha', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getRenderAlpha', () => {
        vi.spyOn(BTAPI.instance, 'getRenderAlpha').mockReturnValue(0.42);

        expect(BT.renderAlpha).toBe(0.42);
    });
});

describe('BT.assignTag', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.assignTag', () => {
        const spy = vi.spyOn(BTAPI.instance, 'assignTag').mockReturnValue(undefined);

        BT.assignTag('Milestone');

        expect(spy).toHaveBeenCalledWith('Milestone');
    });
});

describe('BT.soundPlay', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.soundPlay', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const clip = {} as unknown as AudioClip;
        const spy = vi.spyOn(BTAPI.instance, 'soundPlay').mockReturnValue(ref);

        const result = BT.soundPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(clip, { volume: 0.5 });
        expect(result).toBe(ref);
    });
});

describe('BT.soundStop', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.soundStop, unpacking fadeOutMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundStop').mockReturnValue(undefined);

        BT.soundStop(ref, { fadeOutMs: 200 });

        expect(spy).toHaveBeenCalledWith(ref, 200);
    });

    it('passes undefined fadeOutMs when options are omitted', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundStop').mockReturnValue(undefined);

        BT.soundStop(ref);

        expect(spy).toHaveBeenCalledWith(ref, undefined);
    });
});

describe('BT.isSoundPlaying', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.isSoundPlaying', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'isSoundPlaying').mockReturnValue(true);

        expect(BT.isSoundPlaying(ref)).toBe(true);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundVolumeSet / BT.soundVolumeGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundVolumeSet delegates to BTAPI.instance.soundVolumeSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundVolumeSet').mockReturnValue(undefined);

        BT.soundVolumeSet(ref, 0.5, { fadeMs: 100 });

        expect(spy).toHaveBeenCalledWith(ref, 0.5, 100);
    });

    it('soundVolumeGet delegates to BTAPI.instance.soundVolumeGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundVolumeGet').mockReturnValue(0.5);

        expect(BT.soundVolumeGet(ref)).toBe(0.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundPitchSet / BT.soundPitchGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundPitchSet delegates to BTAPI.instance.soundPitchSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundPitchSet').mockReturnValue(undefined);

        BT.soundPitchSet(ref, 1.5, { fadeMs: 50 });

        expect(spy).toHaveBeenCalledWith(ref, 1.5, 50);
    });

    it('soundPitchGet delegates to BTAPI.instance.soundPitchGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundPitchGet').mockReturnValue(1.5);

        expect(BT.soundPitchGet(ref)).toBe(1.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.soundPanSet / BT.soundPanGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('soundPanSet delegates to BTAPI.instance.soundPanSet, unpacking fadeMs', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundPanSet').mockReturnValue(undefined);

        BT.soundPanSet(ref, -0.5, { fadeMs: 50 });

        expect(spy).toHaveBeenCalledWith(ref, -0.5, 50);
    });

    it('soundPanGet delegates to BTAPI.instance.soundPanGet', () => {
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(BTAPI.instance, 'soundPanGet').mockReturnValue(-0.5);

        expect(BT.soundPanGet(ref)).toBe(-0.5);
        expect(spy).toHaveBeenCalledWith(ref);
    });
});

describe('BT.musicPlay', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.musicPlay', () => {
        const clip = {} as unknown as AudioClip;
        const spy = vi.spyOn(BTAPI.instance, 'musicPlay').mockReturnValue(undefined);

        BT.musicPlay(clip, { volume: 0.5, fadeMs: 400 });

        expect(spy).toHaveBeenCalledWith(clip, { volume: 0.5, fadeMs: 400 });
    });
});

describe('BT.musicStop', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.musicStop, unpacking fadeMs', () => {
        const spy = vi.spyOn(BTAPI.instance, 'musicStop').mockReturnValue(undefined);

        BT.musicStop({ fadeMs: 500 });

        expect(spy).toHaveBeenCalledWith(500);
    });

    it('passes undefined fadeMs when options are omitted', () => {
        const spy = vi.spyOn(BTAPI.instance, 'musicStop').mockReturnValue(undefined);

        BT.musicStop();

        expect(spy).toHaveBeenCalledWith(undefined);
    });
});

describe('BT.isMusicPlaying', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.isMusicPlaying', () => {
        const spy = vi.spyOn(BTAPI.instance, 'isMusicPlaying').mockReturnValue(true);

        expect(BT.isMusicPlaying).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.isDevMode', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.isDevMode', () => {
        const spy = vi.spyOn(BTAPI.instance, 'isDevMode').mockReturnValue(true);

        expect(BT.isDevMode).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.musicVolumeSet / BT.musicVolumeGet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('musicVolumeSet delegates to BTAPI.instance.musicVolumeSet, unpacking fadeMs', () => {
        const spy = vi.spyOn(BTAPI.instance, 'musicVolumeSet').mockReturnValue(undefined);

        BT.musicVolumeSet(0.5, { fadeMs: 100 });

        expect(spy).toHaveBeenCalledWith(0.5, 100);
    });

    it('musicVolumeGet delegates to BTAPI.instance.musicVolumeGet', () => {
        const spy = vi.spyOn(BTAPI.instance, 'musicVolumeGet').mockReturnValue(0.5);

        expect(BT.musicVolumeGet()).toBe(0.5);
        expect(spy).toHaveBeenCalledWith();
    });
});

describe('BT.synthPreset', () => {
    it('exposes exactly the preset sound library factories', () => {
        expect(Object.keys(BT.synthPreset).sort()).toEqual(
            ['blip', 'explosion', 'hit', 'jump', 'laser', 'pickup'].sort(),
        );
    });

    it('delegates each preset to the same factory used by src/assets/synth/synthPresets.ts', () => {
        expect(BT.synthPreset.jump).toBe(jump);
        expect(BT.synthPreset.pickup).toBe(pickup);
        expect(BT.synthPreset.explosion).toBe(explosion);
        expect(BT.synthPreset.laser).toBe(laser);
        expect(BT.synthPreset.hit).toBe(hit);
        expect(BT.synthPreset.blip).toBe(blip);
    });

    it('every preset returns a SynthParams object usable by AudioClip.synth', () => {
        for (const factory of Object.values(BT.synthPreset)) {
            const params = factory();

            expect(params.waveform).toBeDefined();
            expect(params.frequency).toBeGreaterThan(0);
            expect(params.duration).toBeGreaterThan(0);
        }
    });
});

describe('BT.paletteCreate', () => {
    it('creates a palette with the requested size', () => {
        const palette = BT.paletteCreate(16);

        expect(palette).toBeInstanceOf(Palette);
        expect(palette.size).toBe(16);
    });
});

describe('BT.paletteSet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.setPalette', () => {
        const spy = vi.spyOn(BTAPI.instance, 'setPalette').mockReturnValue(undefined);
        const palette = new Palette(16);

        BT.paletteSet(palette);

        expect(spy).toHaveBeenCalledWith(palette);
    });

    it('shows a beginner-friendly error when passed undefined', async () => {
        await withErrorContainer(async () => {
            BT.paletteSet(undefined as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('BT.paletteSet expects a Palette');
        });
    });

    it('shows a beginner-friendly error when passed null', async () => {
        await withErrorContainer(async () => {
            BT.paletteSet(null as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('BT.paletteSet expects a Palette');
        });
    });
});

describe('BT.palette', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('returns palette when one is set', () => {
        const palette = new Palette(16);

        vi.spyOn(BTAPI.instance, 'getPalette').mockReturnValue(palette);

        expect(BT.palette).toBe(palette);
    });

    it('throws when no palette is set', () => {
        vi.spyOn(BTAPI.instance, 'getPalette').mockReturnValue(null);

        expect(() => BT.palette).toThrow('No palette set yet. Call BT.paletteSet');
    });
});

describe('BT.random', () => {
    it('returns the same live instance across reads', () => {
        expect(BT.random).toBeInstanceOf(Random);
        expect(BT.random).toBe(BT.random);
    });
});

describe('BT.randomSeed', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.randomSeed', () => {
        const spy = vi.spyOn(BTAPI.instance, 'randomSeed').mockReturnValue(undefined);

        BT.randomSeed(42);

        expect(spy).toHaveBeenCalledWith(42);
    });

    it('makes a fixed call sequence reproducible', () => {
        BT.randomSeed(1234);
        const first = [BT.random.next(), BT.random.int(10, 20), BT.random.float(0, 1)];

        BT.randomSeed(1234);
        const second = [BT.random.next(), BT.random.int(10, 20), BT.random.float(0, 1)];

        const expected = new Random(1234);
        const reference = [expected.next(), expected.int(10, 20), expected.float(0, 1)];

        expect(first).toEqual(reference);
        expect(second).toEqual(reference);
    });
});

describe('BT.clear', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.setClearColor', () => {
        const spy = vi.spyOn(BTAPI.instance, 'setClearColor').mockReturnValue(undefined);

        BT.clear(1);

        expect(spy).toHaveBeenCalledWith(1);
    });
});

describe('BT.clearRect', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.clearRect', () => {
        const spy = vi.spyOn(BTAPI.instance, 'clearRect').mockReturnValue(undefined);
        const rect = new Rect2i(0, 0, 100, 100);

        BT.clearRect(rect, 1);

        expect(spy).toHaveBeenCalledWith(rect, 1);
    });
});

describe('BT.drawPixel', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawPixel', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawPixel').mockReturnValue(undefined);
        const pos = new Vector2i(5, 10);

        BT.drawPixel(pos, 2);

        expect(spy).toHaveBeenCalledWith(pos, 2);
    });

    it('supports (x, y, color) arguments', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawPixel').mockReturnValue(undefined);

        BT.drawPixel(5, 10, 3);

        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ x: 5, y: 10 }), 3);
    });

    it('shows a beginner-friendly error when drawPixel arguments are invalid', async () => {
        await withErrorContainer(async () => {
            BT.drawPixel({} as never, 2 as never);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain('drawPixel expects (x, y, paletteIndex) or (Vector2i, paletteIndex).');
        });
    });
});

describe('BT.drawLine', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawLine', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawLine').mockReturnValue(undefined);
        const p0 = new Vector2i(0, 0);
        const p1 = new Vector2i(50, 50);

        BT.drawLine(p0, p1, 3);

        expect(spy).toHaveBeenCalledWith(p0, p1, 3);
    });
});

describe('BT.drawRect', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawRect', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawRect').mockReturnValue(undefined);
        const rect = new Rect2i(10, 10, 40, 30);

        BT.drawRect(rect, 4);

        expect(spy).toHaveBeenCalledWith(rect, 4);
    });
});

describe('BT.drawRectFill', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawRectFill', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawRectFill').mockReturnValue(undefined);
        const rect = new Rect2i(0, 0, 20, 20);

        BT.drawRectFill(rect, 8);

        expect(spy).toHaveBeenCalledWith(rect, 8);
    });
});

describe('BT.cameraSet', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.setCameraOffset', () => {
        const spy = vi.spyOn(BTAPI.instance, 'setCameraOffset').mockReturnValue(undefined);
        const offset = new Vector2i(100, 50);

        BT.cameraSet(offset);

        expect(spy).toHaveBeenCalledWith(offset);
    });
});

describe('BT.camera', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getCameraOffset and returns its result', () => {
        const expected = new Vector2i(64, 32);
        vi.spyOn(BTAPI.instance, 'getCameraOffset').mockReturnValue(expected);

        const result = BT.camera;

        expect(result).toBe(expected);
    });

    it('returns an independent clone per read', () => {
        const stored = new Vector2i(64, 32);
        vi.spyOn(BTAPI.instance, 'getCameraOffset').mockImplementation(() => stored.clone());

        const first = BT.camera;
        first.x = 999;

        expect(BT.camera.x).toBe(64);
    });
});

describe('BT.cameraClamp', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('clamps camera coordinates when viewSize is provided', () => {
        const clamped = BT.cameraClamp(new Vector2i(500, 300), new Vector2i(640, 480), new Vector2i(320, 240));

        expect(clamped.isEqualXY(320, 240)).toBe(true);
    });

    it('uses BT.displaySize when viewSize is omitted', () => {
        vi.spyOn(BTAPI.instance, 'getHardwareSettings').mockReturnValue(
            mockHardwareSettings(new Vector2i(200, 150), 60),
        );

        const clamped = BT.cameraClamp(new Vector2i(100, 100), new Vector2i(250, 200));

        expect(clamped.isEqualXY(50, 50)).toBe(true);
    });
});

describe('BT.cameraReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.resetCamera', () => {
        const spy = vi.spyOn(BTAPI.instance, 'resetCamera').mockReturnValue(undefined);

        BT.cameraReset();

        expect(spy).toHaveBeenCalledOnce();
    });
});

describe('BT.isDown', () => {
    beforeEach(() => {
        BT.inputMapReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        BT.inputMapReset();
    });

    it('returns false for face buttons when keyboard and gamepad are unavailable', () => {
        expect(BT.isDown(BT.BTN_A)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isDown(BT.BTN_START, 2)).toBe(false);
    });

    it('delegates pointer buttons to the pointer subsystem', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonDown: isDown } as never);

        expect(BT.isDown(BT.BTN_POINTER_A, 0)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(20, 0);
    });

    it('uses ANY semantics for combined button masks', () => {
        const isDown = vi.fn().mockImplementation((codes: readonly string[]) => codes.includes('KeyA'));
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyA');

        expect(BT.isDown(BT.BTN_A | BT.BTN_B, 0)).toBe(true);
    });

    it('returns false for pointer buttons when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.isDown(BT.BTN_POINTER_A)).toBe(false);
        expect(BT.isDown(BT.BTN_POINTER_D, 3)).toBe(false);
    });

    it('uses gamepad for player 2+ when keyboard maps are unavailable', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown } as never);

        expect(BT.isDown(BT.BTN_START, 2)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(BT.BTN_START, 2);
    });
});

describe('BT.isPressed', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for face buttons when keyboard and gamepad are unavailable', () => {
        expect(BT.isPressed(BT.BTN_B)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isPressed(BT.BTN_B, 1)).toBe(false);
    });

    it('delegates pointer buttons to the pointer subsystem', () => {
        const isButtonPressed = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonPressed } as never);

        expect(BT.isPressed(BT.BTN_POINTER_B, 0)).toBe(true);
        expect(isButtonPressed).toHaveBeenCalledWith(21, 0);
    });

    it('forwards repeatRate to keyboard/gamepad face-button queries', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        const isButtonPressedKeyboard = vi.fn().mockReturnValue(false);
        const isButtonPressedGamepad = vi.fn().mockReturnValue(true);
        const isButtonDownKeyboard = vi.fn().mockReturnValue(false);
        const isButtonDownGamepad = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: isButtonDownKeyboard,
            isButtonPressed: isButtonPressedKeyboard,
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: isButtonDownGamepad,
            isButtonPressed: isButtonPressedGamepad,
        } as never);

        BT.isPressed(BT.BTN_A, 0, 6);

        expect(isButtonPressedKeyboard).toHaveBeenCalledWith(expect.any(Array), 6, 120);
        expect(isButtonPressedGamepad).toHaveBeenCalledWith(BT.BTN_A, 0, 6, 120);
    });

    it('suppresses pressed edge when merged button was already down via keyboard', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(false),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(true),
        } as never);

        expect(BT.isPressed(BT.BTN_A, 0)).toBe(false);
    });

    it('allows repeat events during dual-source hold when repeatRate is enabled', () => {
        vi.spyOn(BTAPI.instance, 'getTicks').mockReturnValue(120);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(true),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonPressed: vi.fn().mockReturnValue(false),
        } as never);

        expect(BT.isPressed(BT.BTN_A, 0, 6)).toBe(true);
    });
});

describe('BT.isReleased', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false for face buttons when keyboard is unavailable', () => {
        expect(BT.isReleased(BT.BTN_X)).toBe(false);
    });

    it('accepts an optional player index without throwing', () => {
        expect(BT.isReleased(BT.BTN_X, 3)).toBe(false);
    });

    it('delegates pointer buttons to the pointer subsystem', () => {
        const isButtonReleased = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isButtonReleased } as never);

        expect(BT.isReleased(BT.BTN_POINTER_C, 2)).toBe(true);
        expect(isButtonReleased).toHaveBeenCalledWith(22, 2);
    });

    it('merges keyboard and gamepad for players 0 and 1', () => {
        const isButtonReleasedKeyboard = vi.fn().mockReturnValue(false);
        const isButtonReleased = vi.fn().mockReturnValue(true);
        const isButtonDownKeyboard = vi.fn().mockReturnValue(false);
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: isButtonDownKeyboard,
            isButtonReleased: isButtonReleasedKeyboard,
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ isButtonDown: isDown, isButtonReleased } as never);

        expect(BT.isReleased(BT.BTN_A, 1)).toBe(true);
        expect(isButtonReleased).toHaveBeenCalledWith(BT.BTN_A, 1);
    });

    it('suppresses released edge when merged button remains down via keyboard', () => {
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(true),
            isButtonReleased: vi.fn().mockReturnValue(false),
        } as never);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({
            isButtonDown: vi.fn().mockReturnValue(false),
            isButtonReleased: vi.fn().mockReturnValue(true),
        } as never);

        expect(BT.isReleased(BT.BTN_A, 0)).toBe(false);
    });
});

describe('BT.inputMap / BT.inputMapReset', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        BT.inputMapReset();
    });

    it('remaps player 0 face buttons through the keyboard subsystem', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyZ');

        expect(BT.isDown(BT.BTN_A, 0)).toBe(true);
        expect(isDown).toHaveBeenCalledWith(['KeyZ']);
    });

    it('remaps player 1 independently of player 0', () => {
        const isDown = vi.fn().mockImplementation((codes: readonly string[]) => codes.includes('Numpad9'));
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A, 'KeyX');
        BT.inputMap(1, BT.BTN_A, 'Numpad9');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenLastCalledWith(['KeyX']);

        BT.isDown(BT.BTN_A, 1);
        expect(isDown).toHaveBeenLastCalledWith(['Numpad9']);
    });

    it('passes multiple keys per button for OR semantics', () => {
        const isDown = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_UP, 'ArrowUp', 'KeyW');

        BT.isDown(BT.BTN_UP, 0);
        expect(isDown).toHaveBeenCalledWith(['ArrowUp', 'KeyW']);
    });

    it('restores default key lists for both keyboard players', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_UP, 'F1');
        BT.inputMap(1, BT.BTN_UP, 'F2');
        BT.inputMapReset();

        BT.isDown(BT.BTN_UP, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_UP as FaceButtonCode] ?? [])]);

        BT.isDown(BT.BTN_UP, 1);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER2[BT.BTN_UP as FaceButtonCode] ?? [])]);
    });

    it('ignores remap attempts for unsupported keyboard players', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(2, BT.BTN_A, 'KeyZ');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_A as FaceButtonCode] ?? [])]);
    });

    it('ignores remap attempts with out-of-range face button ids', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, 99, 'KeyZ');

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([...(BT.DEFAULT_KEYBOARD_PLAYER1[BT.BTN_A as FaceButtonCode] ?? [])]);
    });

    it('allows clearing keyboard bindings with an empty key list', () => {
        const isDown = vi.fn().mockReturnValue(false);
        vi.spyOn(BTAPI.instance, 'getKeyboard').mockReturnValue({ isButtonDown: isDown } as never);

        BT.inputMap(0, BT.BTN_A);

        BT.isDown(BT.BTN_A, 0);
        expect(isDown).toHaveBeenCalledWith([]);
    });
});

describe('BT.pointerPos', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns Vector2i.zero() when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const pos = BT.pointerPos();

        expect(pos.x).toBe(0);
        expect(pos.y).toBe(0);
    });

    it('delegates to the pointer subsystem with the supplied slot index', () => {
        const expected = new Vector2i(80, 60);
        const getPos = vi.fn().mockReturnValue(expected);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPos } as never);

        const pos = BT.pointerPos(2);

        expect(getPos).toHaveBeenCalledWith(2);
        expect(pos).toBe(expected);
    });

    it('defaults the pointer index to 0 (mouse)', () => {
        const getPos = vi.fn().mockReturnValue(new Vector2i());
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getPos } as never);

        BT.pointerPos();

        expect(getPos).toHaveBeenCalledWith(0);
    });
});

describe('BT.pointerDelta', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns Vector2i.zero() when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        const delta = BT.pointerDelta();

        expect(delta.x).toBe(0);
        expect(delta.y).toBe(0);
    });

    it('delegates to the pointer subsystem', () => {
        const expected = new Vector2i(5, -3);
        const getDelta = vi.fn().mockReturnValue(expected);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getDelta } as never);

        expect(BT.pointerDelta(1)).toBe(expected);
        expect(getDelta).toHaveBeenCalledWith(1);
    });
});

describe('BT.isPointerActive', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns false when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.isPointerActive()).toBe(false);
    });

    it('delegates to the pointer subsystem', () => {
        const isActive = vi.fn().mockReturnValue(true);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ isActive } as never);

        expect(BT.isPointerActive(0)).toBe(true);
        expect(isActive).toHaveBeenCalledWith(0);
    });
});

describe('BT.pointerScrollDelta', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns 0 when the engine is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue(null);

        expect(BT.pointerScrollDelta).toBe(0);
    });

    it('delegates to the pointer subsystem', () => {
        const getScrollDelta = vi.fn().mockReturnValue(42);
        vi.spyOn(BTAPI.instance, 'getPointer').mockReturnValue({ getScrollDelta } as never);

        expect(BT.pointerScrollDelta).toBe(42);
    });
});

describe('Pointer button constants', () => {
    it('exposes BTN_POINTER_A..D as bit flags', () => {
        expect(BT.BTN_POINTER_A).toBe(1 << 12);
        expect(BT.BTN_POINTER_B).toBe(1 << 13);
        expect(BT.BTN_POINTER_C).toBe(1 << 14);
        expect(BT.BTN_POINTER_D).toBe(1 << 15);
    });
});

describe('BT gamepad constants and APIs', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('exposes player constants', () => {
        expect(BT.PLAYER_ONE).toBe(0);
        expect(BT.PLAYER_TWO).toBe(1);
        expect(BT.PLAYER_THREE).toBe(2);
        expect(BT.PLAYER_FOUR).toBe(3);
    });

    it('exposes axis constants', () => {
        expect(BT.AXIS_LEFT_X).toBe(0);
        expect(BT.AXIS_LEFT_Y).toBe(1);
        expect(BT.AXIS_RIGHT_X).toBe(2);
        expect(BT.AXIS_RIGHT_Y).toBe(3);
        expect(BT.AXIS_TRIGGER_L).toBe(4);
        expect(BT.AXIS_TRIGGER_R).toBe(5);
    });

    it('exposes combo constants', () => {
        expect(BT.BTN_ABXY).toBe(BT.BTN_A | BT.BTN_B | BT.BTN_X | BT.BTN_Y);
        expect(BT.BTN_SHOULDER).toBe(BT.BTN_L | BT.BTN_R);
        expect(BT.BTN_POINTER_ANY).toBe(BT.BTN_POINTER_A | BT.BTN_POINTER_B | BT.BTN_POINTER_C | BT.BTN_POINTER_D);
    });

    it('delegates getAxis/isGamepadConnected/gamepadCount to gamepad subsystem', () => {
        const getAxis = vi.fn().mockReturnValue(0.25);
        const isConnected = vi.fn().mockReturnValue(true);
        const connectedCount = vi.fn().mockReturnValue(2);
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue({ getAxis, isConnected, connectedCount } as never);

        expect(BT.getAxis(BT.AXIS_LEFT_X, 1)).toBe(0.25);
        expect(getAxis).toHaveBeenCalledWith(BT.AXIS_LEFT_X, 1);
        expect(BT.isGamepadConnected(1)).toBe(true);
        expect(isConnected).toHaveBeenCalledWith(1);
        expect(BT.gamepadCount).toBe(2);
        expect(connectedCount).toHaveBeenCalledWith();
    });

    it('returns 0 from getAxis when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.getAxis(BT.AXIS_LEFT_X, 1)).toBe(0);
    });

    it('returns false from isGamepadConnected when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.isGamepadConnected(1)).toBe(false);
    });

    it('returns 0 from gamepadCount when the gamepad subsystem is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getGamepad').mockReturnValue(null);

        expect(BT.gamepadCount).toBe(0);
    });
});

describe('BT.isKeyDown', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyDown('Space')).toBe(false);
    });
});

describe('BT.isKeyPressed', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyPressed('ArrowUp')).toBe(false);
    });
});

describe('BT.isKeyReleased', () => {
    it('returns false when the engine is not initialized', () => {
        expect(BT.isKeyReleased('KeyA')).toBe(false);
    });
});

describe('BT.systemPrint', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawSystemText', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawSystemText').mockReturnValue(undefined);
        const pos = new Vector2i(10, 10);

        BT.systemPrint(pos, 8, 'Hello');

        expect(spy).toHaveBeenCalledWith(pos, 8, 'Hello');
    });
});

describe('BT.systemPrintMeasure', () => {
    it('returns zero vector when system font is not initialized', () => {
        vi.spyOn(BTAPI.instance, 'getSystemFont').mockReturnValue(null);

        const result = BT.systemPrintMeasure('any text');

        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
    });

    it('returns measured size when system font is available', () => {
        const mockFont = {
            measureTextSize: vi.fn().mockReturnValue({ width: 40, height: 8 }),
        };

        vi.spyOn(BTAPI.instance, 'getSystemFont').mockReturnValue(mockFont as unknown as BitmapFont);

        const result = BT.systemPrintMeasure('Hello');

        expect(result.x).toBe(40);
        expect(result.y).toBe(8);
        expect(mockFont.measureTextSize).toHaveBeenCalledWith('Hello');
    });
});

describe('BT.printFont', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawBitmapText', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawBitmapText').mockReturnValue(undefined);
        const font = {} as BitmapFont;
        const pos = new Vector2i(0, 0);
        const paletteOffset = 4;

        BT.printFont(font, pos, 'Hi', paletteOffset);

        expect(spy).toHaveBeenCalledWith(font, pos, 'Hi', paletteOffset);
    });

    it('forwards an undefined paletteOffset when omitted', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawBitmapText').mockReturnValue(undefined);
        const font = {} as BitmapFont;

        BT.printFont(font, new Vector2i(0, 0), 'Hi');

        expect(spy).toHaveBeenCalledWith(font, expect.anything(), 'Hi', undefined);
    });

    it('shows a missing await message for Promise font values', async () => {
        await withErrorContainer(async () => {
            BT.printFont(Promise.resolve({}) as unknown as BitmapFont, new Vector2i(0, 0), 'Hi');

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Did you forget to use 'await' before BitmapFont.load()?");
        });
    });
});

describe('BT.captureFrame', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.captureFrame and returns its result', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });
        const spy = vi.spyOn(BTAPI.instance, 'captureFrame').mockResolvedValue(mockBlob);

        const result = await BT.captureFrame();

        expect(spy).toHaveBeenCalledOnce();
        expect(result).toBe(mockBlob);
    });
});

describe('BT.downloadFrame', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('calls captureFrame, creates object URL, clicks anchor, and revokes URL', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });

        vi.spyOn(BTAPI.instance, 'captureFrame').mockResolvedValue(mockBlob);

        const mockUrl = 'blob:mock-url';
        const createObjectURL = vi.fn().mockReturnValue(mockUrl);
        const revokeObjectURL = vi.fn();

        vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

        const mockAnchor = { href: '', download: '', click: vi.fn() };

        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

        await BT.downloadFrame('screenshot.png');

        expect(createObjectURL).toHaveBeenCalledWith(mockBlob);
        expect(mockAnchor.href).toBe(mockUrl);
        expect(mockAnchor.download).toBe('screenshot.png');
        expect(mockAnchor.click).toHaveBeenCalledOnce();
        expect(revokeObjectURL).toHaveBeenCalledWith(mockUrl);
    });

    it('uses the default filename when none is provided', async () => {
        const mockBlob = new Blob(['test'], { type: 'image/png' });

        vi.spyOn(BTAPI.instance, 'captureFrame').mockResolvedValue(mockBlob);
        vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });

        const mockAnchor = { href: '', download: '', click: vi.fn() };

        vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);

        await BT.downloadFrame();

        expect(mockAnchor.download).toBe('blit386-capture.png');
    });
});

describe('BT.drawSprite', () => {
    const mockImage = { width: 64, height: 64 } as HTMLImageElement;

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
    });

    it('delegates to BTAPI.instance.drawSprite', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const srcRect = new Rect2i(0, 0, 16, 16);
        const destPos = new Vector2i(10, 20);

        BT.drawSprite(sheet, srcRect, destPos);

        expect(spy).toHaveBeenCalledOnce();
        expect(spy).toHaveBeenCalledWith(sheet, srcRect, destPos, undefined);
    });

    it('forwards the paletteOffset argument', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);
        const paletteOffset = 16;

        BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0), paletteOffset);

        expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), paletteOffset);
    });

    it('forwards undefined tint when omitted', () => {
        const spy = vi.spyOn(BTAPI.instance, 'drawSprite').mockReturnValue(undefined);
        const sheet = new SpriteSheet(mockImage);

        BT.drawSprite(sheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0));

        expect(spy).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), undefined);
    });

    it('does not throw when called multiple times', () => {
        vi.spyOn(BTAPI.instance, 'drawSprite').mockReturnValue(undefined);

        const sheet = new SpriteSheet(mockImage);

        expect(() => {
            BT.drawSprite(sheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BT.drawSprite(sheet, new Rect2i(16, 0, 16, 16), new Vector2i(20, 0));
        }).not.toThrow();
    });

    it('shows a missing await message for Promise sprite sheet values', async () => {
        await withErrorContainer(async () => {
            BT.drawSprite(Promise.resolve({}) as unknown as SpriteSheet, new Rect2i(0, 0, 8, 8), new Vector2i(0, 0), 0);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("Did you forget to use 'await' before SpriteSheet.load()?");
        });
    });

    it('shows engine-not-ready message when drawing before bootstrap completes', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.drawSprite(new SpriteSheet(mockImage), new Rect2i(0, 0, 8, 8), new Vector2i(0, 0), 0);

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });
});

describe('BT.effectAdd / BT.effectRemove / BT.effectClear', () => {
    function makeStubEffect() {
        return {
            tier: 'pixel' as const,
            init: vi.fn(),
            updateUniforms: vi.fn(),
            encodePass: vi.fn(),
            dispose: vi.fn(),
        };
    }

    /** Builds an initialized software renderer for effect-API facade tests. */
    async function makeSoftwareRenderer(): Promise<SoftwareRenderer> {
        const canvas = {
            width: 0,
            height: 0,
            style: { width: '', height: '' },
            getContext: () =>
                ({
                    imageSmoothingEnabled: false,
                    createImageData: (w: number, h: number) =>
                        ({
                            data: new Uint8ClampedArray(w * h * 4),
                            width: w,
                            height: h,
                        }) as ImageData,
                    putImageData: () => {},
                    clearRect: () => {},
                    drawImage: () => {},
                }) as unknown as CanvasRenderingContext2D,
            toBlob: (_cb: (blob: Blob | null) => void) => {},
        } as unknown as HTMLCanvasElement;
        const renderer = new SoftwareRenderer(canvas, new Vector2i(4, 4));
        await renderer.init();
        return renderer;
    }

    /**
     * Temporarily installs a software renderer on the BTAPI singleton so
     * {@link BT.effectAdd} / friends reach the real unsupported-effects path.
     */
    async function withSoftwareRenderer(callback: () => void | Promise<void>): Promise<void> {
        const renderer = await makeSoftwareRenderer();
        const api = BTAPI.instance as unknown as { renderer: SoftwareRenderer | null };
        const previous = api.renderer;
        api.renderer = renderer;

        try {
            await callback();
        } finally {
            api.renderer = previous;
        }
    }

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('effectAdd shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectAdd(makeStubEffect());

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectRemove shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectRemove(makeStubEffect());

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectClear shows engine-not-ready when called before bootstrap', async () => {
        await withErrorContainer(async () => {
            vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue(null);

            BT.effectClear();

            const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
            expect(text).toContain("The engine isn't ready yet.");
        });
    });

    it('effectAdd delegates to BTAPI.instance.effectAdd when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectAdd').mockReturnValue(undefined);
        const effect = makeStubEffect();

        BT.effectAdd(effect);

        expect(spy).toHaveBeenCalledWith(effect);
    });

    it('effectRemove delegates to BTAPI.instance.effectRemove when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectRemove').mockReturnValue(undefined);
        const effect = makeStubEffect();

        BT.effectRemove(effect);

        expect(spy).toHaveBeenCalledWith(effect);
    });

    it('effectClear delegates to BTAPI.instance.effectClear when renderer is ready', () => {
        vi.spyOn(BTAPI.instance, 'getRenderer').mockReturnValue({} as never);
        const spy = vi.spyOn(BTAPI.instance, 'effectClear').mockReturnValue(undefined);

        BT.effectClear();

        expect(spy).toHaveBeenCalled();
    });

    it('effectAdd shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectAdd(makeStubEffect());

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain("doesn't support fullscreen effects");
                expect(text).toContain("set backend to 'webgpu' in configure()");
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });

    it('effectRemove shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectRemove(makeStubEffect());

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });

    it('effectClear shows a clear software-renderer unsupported message', async () => {
        await withErrorContainer(async () => {
            await withSoftwareRenderer(() => {
                BT.effectClear();

                const text = document.getElementById(DEFAULT_CONTAINER_ID)?.textContent ?? '';
                expect(text).toContain(SoftwareRenderer.EFFECTS_UNSUPPORTED_MESSAGE);
            });
        });
    });
});

describe('BT.requestedBackend', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('is typed as Backend | null on the public facade', () => {
        expectTypeOf(BT.requestedBackend).toEqualTypeOf<'webgpu' | 'software' | null>();
    });

    it('delegates to BTAPI.instance.getRequestedBackend', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue('software');

        const result = BT.requestedBackend;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe('software');
    });

    it('returns null before initialization', () => {
        vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue(null);

        expect(BT.requestedBackend).toBeNull();
    });

    it('returns webgpu when BTAPI reports webgpu requested', () => {
        vi.spyOn(BTAPI.instance, 'getRequestedBackend').mockReturnValue('webgpu');

        expect(BT.requestedBackend).toBe('webgpu');
    });
});

describe('BT.activeBackend', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getActiveBackend', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue('webgpu');

        const result = BT.activeBackend;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe('webgpu');
    });

    it('returns null before initialization', () => {
        vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue(null);

        expect(BT.activeBackend).toBeNull();
    });

    it('returns software when BTAPI reports software backend active', () => {
        vi.spyOn(BTAPI.instance, 'getActiveBackend').mockReturnValue('software');

        expect(BT.activeBackend).toBe('software');
    });
});

describe('BT.loadingAssetsCount', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('delegates to BTAPI.instance.getLoadingAssetsCount', () => {
        const spy = vi.spyOn(BTAPI.instance, 'getLoadingAssetsCount').mockReturnValue(3);

        const result = BT.loadingAssetsCount;

        expect(spy).toHaveBeenCalled();
        expect(result).toBe(3);
    });

    it('returns 0 when nothing is loading', () => {
        vi.spyOn(BTAPI.instance, 'getLoadingAssetsCount').mockReturnValue(0);

        expect(BT.loadingAssetsCount).toBe(0);
    });

    it('reflects a real pending AssetLoader image load, without mocking BTAPI', async () => {
        /** Image stub whose `onload`/`onerror` must be fired manually, so the test controls timing. */
        class DeferredImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 10;
            height = 10;
            src = '';
        }

        const instances: DeferredImage[] = [];

        vi.stubGlobal(
            'Image',
            class extends DeferredImage {
                constructor() {
                    super();
                    instances.push(this);
                }
            },
        );

        try {
            expect(BT.loadingAssetsCount).toBe(0);

            const promise = AssetLoader.loadImage('pending-bt-aggregate.png');

            expect(BT.loadingAssetsCount).toBe(1);

            instances[0]?.onload?.();
            await promise;

            expect(BT.loadingAssetsCount).toBe(0);
        } finally {
            vi.unstubAllGlobals();
            AssetLoader.clear();
        }
    });
});
