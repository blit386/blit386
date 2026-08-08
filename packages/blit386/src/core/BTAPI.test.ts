/**
 * Unit tests for {@link BTAPI}.
 *
 * Covers the public engine facade exposed to demos:
 * - singleton lifecycle and version constants
 * - safe accessor behavior before initialization
 * - no-op drawing and camera APIs before renderer setup
 * - initialization failure cases for invalid hardware settings and WebGPU setup
 * - successful initialization, accessor population, and loop startup
 *
 * The suite isolates global browser and singleton state with WebGPU mocks,
 * stubbed animation-frame scheduling, and per-test singleton reset helpers.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockAudioBuffer } from '../__test__/webaudio-mock';
import {
    createMockGPUCanvasContext,
    createMockGPUDevice,
    installMockNavigatorGPU,
    uninstallMockNavigatorGPU,
} from '../__test__/webgpu-mock';
import { AssetLoader } from '../assets/AssetLoader';
import { AudioClip } from '../assets/AudioClip';
import type { BitmapFont } from '../assets/BitmapFont';
import { Palette } from '../assets/Palette';
import { PaletteEffectManager } from '../assets/PaletteEffect';
import type { SpriteSheet } from '../assets/SpriteSheet';
import { AudioManager } from '../audio/AudioManager';
import { INVALID_SOUND_REF } from '../audio/VoicePool';
import { BT } from '../BLIT386';
import { KeyboardInput } from '../input/KeyboardInput';
import type { OverlayDrawTarget } from '../overlay';
import { DEFAULT_IDX_TEXT, Overlay, paletteBandY } from '../overlay';
import { AUDIO_METER_BAR_GAP_PX, AUDIO_METER_BAR_WIDTH_PX } from '../overlay/audio-meter/constants';
import { OVERLAY_EDGE_MARGIN_PX } from '../overlay/layout/constants';
import {
    computeGrid,
    DEFAULT_PALETTE_SWATCH_SIZE,
    PALETTE_GRID_PADDING_PX,
    PALETTE_SWATCH_GAP_PX,
} from '../overlay/palette/PaletteView';
import type { Effect } from '../render/effects/Effect';
import { HANDOFF_FADE_MS, Splash } from '../splash';
import { RAMP_PALETTE_SIZE } from '../splash/constants';
import { Color32 } from '../utils/Color32';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { BTAPI } from './BTAPI';
import type { GameLoop } from './GameLoop';
import type { HardwareSettings, IBTDemo, OverlayRow } from './IBTDemo';
import { collectUsedIndices } from './RenderPaletteUsage';

function resetSingleton(): void {
    // BTAPI._instance is private; the cast is intentional – there is no public
    // reset API, and this is the least-invasive way to isolate singleton state
    // between tests without modifying production code.
    (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
}

function makeMockDemo(targetFPS = 60, initResult = true, audioVoices?: number): IBTDemo {
    return {
        configure: vi.fn().mockReturnValue({
            // These tests stub requestAnimationFrame with a no-op, so the splash's own
            // frame driver would never reach 'done' and init() would never resolve.
            // Splash behavior has its own suite below.
            isSplashEnabled: false,
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(640, 480),
            targetFPS,
            ...(audioVoices === undefined ? {} : { audioVoices }),
        }),
        init: vi.fn().mockResolvedValue(initResult),
        update: vi.fn(),
        render: vi.fn(),
    };
}

function makeMockCanvas(): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        style: {
            width: '',
            height: '',
            touchAction: '',
            setProperty: vi.fn(),
            getPropertyValue: vi.fn(() => ''),
        },
        getContext: (type: string) => (type === 'webgpu' ? createMockGPUCanvasContext() : null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
}

function makeMock2DCanvas(): HTMLCanvasElement {
    return {
        ...makeMockCanvas(),
        getContext: (type: string) => {
            if (type === '2d') {
                return {
                    imageSmoothingEnabled: false,
                    createImageData: (w: number, h: number) =>
                        ({
                            data: new Uint8ClampedArray(w * h * 4),
                            width: w,
                            height: h,
                        }) as ImageData,
                    putImageData: vi.fn(),
                    clearRect: vi.fn(),
                    drawImage: vi.fn(),
                };
            }
            return null;
        },
        toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['x'], { type: 'image/png' })),
    } as unknown as HTMLCanvasElement;
}

/** Minimal 2D context shape for {@link OffscreenCanvas#getContext} mocks; rejects non-`2d` types. */
type OffscreenCanvas2DMock = {
    imageSmoothingEnabled: boolean;
    createImageData: (w: number, h: number) => ImageData;
    putImageData: ReturnType<typeof vi.fn>;
};

function makeOffscreenCanvas2dContext(): OffscreenCanvas2DMock {
    return {
        imageSmoothingEnabled: false,
        createImageData: (w: number, h: number) =>
            ({
                data: new Uint8ClampedArray(w * h * 4),
                width: w,
                height: h,
            }) as ImageData,
        putImageData: vi.fn(),
    };
}

describe('sound playback passthroughs', () => {
    beforeEach(() => {
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
    });

    function setAudio(audio: AudioManager | null): void {
        // BTAPI's `audio` field is private; this cast is the same test-isolation technique
        // `resetSingleton()` above uses for `_instance` - it lets these tests inject a real
        // AudioManager without running a full init()/WebGPU/AudioContext mock setup, since none
        // of these passthroughs need a live renderer or context.
        (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;
    }

    it('soundPlay returns INVALID_SOUND_REF when the audio subsystem is not initialized', () => {
        const clip = { buffer: createMockAudioBuffer() } as unknown as AudioClip;

        expect(BTAPI.instance.soundPlay(clip)).toEqual(INVALID_SOUND_REF);
    });

    it('soundPlay returns INVALID_SOUND_REF when the clip buffer is null', () => {
        setAudio(new AudioManager());

        const clip = { buffer: null } as unknown as AudioClip;

        expect(BTAPI.instance.soundPlay(clip)).toEqual(INVALID_SOUND_REF);
    });

    it('soundPlay delegates to AudioManager.playSound with the clip buffer', () => {
        const audio = new AudioManager();
        const buffer = createMockAudioBuffer();
        const ref = { voiceIndex: 0, generation: 1 };
        const spy = vi.spyOn(audio, 'playSound').mockReturnValue(ref);

        setAudio(audio);

        const clip = { buffer } as unknown as AudioClip;
        const result = BTAPI.instance.soundPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(buffer, { volume: 0.5 });
        expect(result).toBe(ref);
    });

    it('soundStop delegates to AudioManager.soundStop', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'soundStop').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.soundStop(INVALID_SOUND_REF, 200);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 200);
    });

    it('soundStop is a no-op when the audio subsystem is not initialized', () => {
        expect(() => BTAPI.instance.soundStop(INVALID_SOUND_REF)).not.toThrow();
    });

    it('isSoundPlaying delegates to AudioManager.isSoundPlaying', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'isSoundPlaying').mockReturnValue(true);

        setAudio(audio);

        expect(BTAPI.instance.isSoundPlaying(INVALID_SOUND_REF)).toBe(true);
        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF);
    });

    it('isSoundPlaying returns false when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.isSoundPlaying(INVALID_SOUND_REF)).toBe(false);
    });

    it('soundVolumeSet delegates to AudioManager.soundVolumeSet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'soundVolumeSet').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.soundVolumeSet(INVALID_SOUND_REF, 0.5, 100);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 0.5, 100);
    });

    it('soundVolumeGet delegates to AudioManager.soundVolumeGet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'soundVolumeGet').mockReturnValue(0.75);

        setAudio(audio);

        expect(BTAPI.instance.soundVolumeGet(INVALID_SOUND_REF)).toBe(0.75);
        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF);
    });

    it('soundVolumeGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.soundVolumeGet(INVALID_SOUND_REF)).toBe(1);
    });

    it('soundPitchSet delegates to AudioManager.soundPitchSet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'soundPitchSet').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.soundPitchSet(INVALID_SOUND_REF, 1.5, 50);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, 1.5, 50);
    });

    it('soundPitchGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.soundPitchGet(INVALID_SOUND_REF)).toBe(1);
    });

    it('soundPanSet delegates to AudioManager.soundPanSet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'soundPanSet').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.soundPanSet(INVALID_SOUND_REF, -0.5, 50);

        expect(spy).toHaveBeenCalledWith(INVALID_SOUND_REF, -0.5, 50);
    });

    it('soundPanGet returns 0 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.soundPanGet(INVALID_SOUND_REF)).toBe(0);
    });
});

describe('music playback passthroughs', () => {
    beforeEach(() => {
        resetSingleton();
    });

    afterEach(() => {
        resetSingleton();
    });

    function setAudio(audio: AudioManager | null): void {
        // Same test-isolation technique as the "sound playback passthroughs" block above – see
        // its comment for why this cast is safe here.
        (BTAPI.instance as unknown as { audio: AudioManager | null }).audio = audio;
    }

    it('musicPlay is a no-op when the audio subsystem is not initialized', () => {
        const clip = { buffer: createMockAudioBuffer() } as unknown as AudioClip;

        expect(() => BTAPI.instance.musicPlay(clip)).not.toThrow();
    });

    it('musicPlay is a no-op when the clip buffer is null', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicPlay').mockReturnValue(undefined);

        setAudio(audio);

        const clip = { buffer: null } as unknown as AudioClip;

        BTAPI.instance.musicPlay(clip);

        expect(spy).not.toHaveBeenCalled();
    });

    it('musicPlay delegates to AudioManager.musicPlay with the clip buffer', () => {
        const audio = new AudioManager();
        const buffer = createMockAudioBuffer();
        const spy = vi.spyOn(audio, 'musicPlay').mockReturnValue(undefined);

        setAudio(audio);

        const clip = { buffer } as unknown as AudioClip;

        BTAPI.instance.musicPlay(clip, { volume: 0.5 });

        expect(spy).toHaveBeenCalledWith(buffer, { volume: 0.5 });
    });

    it('musicStop delegates to AudioManager.musicStop', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicStop').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.musicStop(200);

        expect(spy).toHaveBeenCalledWith(200);
    });

    it('musicStop is a no-op when the audio subsystem is not initialized', () => {
        expect(() => BTAPI.instance.musicStop()).not.toThrow();
    });

    it('isMusicPlaying delegates to AudioManager.isMusicPlaying', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'isMusicPlaying').mockReturnValue(true);

        setAudio(audio);

        expect(BTAPI.instance.isMusicPlaying()).toBe(true);
        expect(spy).toHaveBeenCalledWith();
    });

    it('isMusicPlaying returns false when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.isMusicPlaying()).toBe(false);
    });

    it('musicVolumeSet delegates to AudioManager.musicVolumeSet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicVolumeSet').mockReturnValue(undefined);

        setAudio(audio);
        BTAPI.instance.musicVolumeSet(0.4, 100);

        expect(spy).toHaveBeenCalledWith(0.4, 100);
    });

    it('musicVolumeGet delegates to AudioManager.musicVolumeGet', () => {
        const audio = new AudioManager();
        const spy = vi.spyOn(audio, 'musicVolumeGet').mockReturnValue(0.75);

        setAudio(audio);

        expect(BTAPI.instance.musicVolumeGet()).toBe(0.75);
        expect(spy).toHaveBeenCalledWith();
    });

    it('musicVolumeGet returns 1 when the audio subsystem is not initialized', () => {
        expect(BTAPI.instance.musicVolumeGet()).toBe(1);
    });
});

describe('BTAPI', () => {
    beforeEach(() => {
        resetSingleton();

        vi.resetAllMocks();
        vi.stubGlobal('requestAnimationFrame', vi.fn());

        installMockNavigatorGPU();
    });

    afterEach(() => {
        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.unstubAllGlobals();
    });

    describe('version constants', () => {
        it('should expose VERSION_MAJOR as a number', () => {
            expect(typeof BTAPI.VERSION_MAJOR).toBe('number');
        });

        it('should expose VERSION_MINOR as a number', () => {
            expect(typeof BTAPI.VERSION_MINOR).toBe('number');
        });

        it('should expose VERSION_PATCH as a number', () => {
            expect(typeof BTAPI.VERSION_PATCH).toBe('number');
        });

        it('should match package.json version', () => {
            const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
            const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
            const btapiVersion = `${BTAPI.VERSION_MAJOR}.${BTAPI.VERSION_MINOR}.${BTAPI.VERSION_PATCH}`;

            expect(btapiVersion).toBe(version);
        });
    });

    describe('singleton', () => {
        it('should return the same instance on multiple accesses', () => {
            const a = BTAPI.instance;
            const b = BTAPI.instance;

            expect(a).toBe(b);
        });

        it('should create a new instance after singleton reset', () => {
            const a = BTAPI.instance;

            resetSingleton();

            const b = BTAPI.instance;

            expect(a).not.toBe(b);
        });
    });

    describe('pre-initialization accessors', () => {
        it('getTicks should return 0 before init', () => {
            expect(BTAPI.instance.getTicks()).toBe(0);
        });

        it('resetTicks should not throw before init', () => {
            expect(() => BTAPI.instance.resetTicks()).not.toThrow();
        });

        it('getRenderAlpha should return 0 before init', () => {
            expect(BTAPI.instance.getRenderAlpha()).toBe(0);
        });

        it('getDevice should return null before init', () => {
            expect(BTAPI.instance.getDevice()).toBeNull();
        });

        it('getContext should return null before init', () => {
            expect(BTAPI.instance.getContext()).toBeNull();
        });

        it('getCanvas should return null before init', () => {
            expect(BTAPI.instance.getCanvas()).toBeNull();
        });

        it('getRenderer should return null before init', () => {
            expect(BTAPI.instance.getRenderer()).toBeNull();
        });

        it('getPointer should return null before init', () => {
            expect(BTAPI.instance.getPointer()).toBeNull();
        });

        it('getKeyboard should return null before init', () => {
            expect(BTAPI.instance.getKeyboard()).toBeNull();
        });

        it('getGamepad should return null before init', () => {
            expect(BTAPI.instance.getGamepad()).toBeNull();
        });

        it('getHardwareSettings should return null before init', () => {
            expect(BTAPI.instance.getHardwareSettings()).toBeNull();
        });

        it('getPalette should return null before palette is set', () => {
            expect(BTAPI.instance.getPalette()).toBeNull();
        });

        it('getCameraOffset should return a zero vector before init', () => {
            const offset = BTAPI.instance.getCameraOffset();

            expect(offset.x).toBe(0);
            expect(offset.y).toBe(0);
        });
    });

    describe('pre-initialization drawing no-ops', () => {
        it('stop should not throw before init', () => {
            expect(() => BTAPI.instance.stop()).not.toThrow();
        });

        it('setClearColor should not throw before init', () => {
            expect(() => BTAPI.instance.setClearColor(1)).not.toThrow();
        });

        it('clearRect should not throw before init', () => {
            expect(() => BTAPI.instance.clearRect(new Rect2i(0, 0, 10, 10), 1)).not.toThrow();
        });

        it('drawPixel should not throw before init', () => {
            expect(() => BTAPI.instance.drawPixel(new Vector2i(0, 0), 2)).not.toThrow();
        });

        it('drawLine should not throw before init', () => {
            expect(() => BTAPI.instance.drawLine(new Vector2i(0, 0), new Vector2i(10, 10), 3)).not.toThrow();
        });

        it('drawRect should not throw before init', () => {
            expect(() => BTAPI.instance.drawRect(new Rect2i(0, 0, 10, 10), 4)).not.toThrow();
        });

        it('drawRectFill should not throw before init', () => {
            expect(() => BTAPI.instance.drawRectFill(new Rect2i(0, 0, 10, 10), 5)).not.toThrow();
        });

        it('drawSystemText should not throw before init', () => {
            expect(() => BTAPI.instance.drawSystemText(new Vector2i(0, 0), 8, 'test')).not.toThrow();
        });

        it('drawSprite should not throw before init', () => {
            const mockSheet = { isIndexed: () => true } as unknown as SpriteSheet;
            expect(() =>
                BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0)),
            ).not.toThrow();
        });

        it('drawSprite should throw when sprite sheet is not indexized', () => {
            const mockSheet = { isIndexed: () => false } as unknown as SpriteSheet;
            expect(() => BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0))).toThrow(
                "This sprite sheet hasn't been prepared yet.",
            );
        });

        it('drawSprite should register the sheet for spritesRefresh tracking', () => {
            const palette = new Palette(16);
            const reindexize = vi.fn();
            const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;

            BTAPI.instance.setPalette(palette);
            BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.spritesRefresh();

            expect(reindexize).toHaveBeenCalledWith(palette);
        });

        it('drawBitmapText should not throw before init', () => {
            const mockSheet = { isIndexed: () => true } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            expect(() => BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi')).not.toThrow();
        });

        it('drawBitmapText should throw when font sprite sheet is not indexized', () => {
            const mockSheet = { isIndexed: () => false } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            expect(() => BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi')).toThrow(
                "This sprite sheet hasn't been prepared yet.",
            );
        });

        it('drawBitmapText should register the font sheet for spritesRefresh tracking', () => {
            const palette = new Palette(16);
            const reindexize = vi.fn();
            const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;

            BTAPI.instance.setPalette(palette);
            BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'hi');
            BTAPI.instance.spritesRefresh();

            expect(reindexize).toHaveBeenCalledWith(palette);
        });

        it('setCameraOffset should not throw before init', () => {
            expect(() => BTAPI.instance.setCameraOffset(new Vector2i(10, 20))).not.toThrow();
        });

        it('resetCamera should not throw before init', () => {
            expect(() => BTAPI.instance.resetCamera()).not.toThrow();
        });

        it('setPalette should store the provided palette before init', () => {
            const palette = new Palette(16);

            BTAPI.instance.setPalette(palette);

            expect(BTAPI.instance.getPalette()).toBe(palette);
        });
    });

    describe('init', () => {
        it('should return false for NaN targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(NaN), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for zero targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(0), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for negative targetFPS', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(-30), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for non-integer audioVoices', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 1.5), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for audioVoices below 1', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 0), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false for audioVoices above 64', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 65), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should accept the default audioVoices (16)', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(true);
        });

        it('should accept a valid custom audioVoices value', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, true, 32), makeMockCanvas());

            expect(result).toBe(true);
        });

        it('should accept the boundary audioVoices values 1 and 64', async () => {
            expect(await BTAPI.instance.init(makeMockDemo(60, true, 1), makeMockCanvas())).toBe(true);

            resetSingleton();

            expect(await BTAPI.instance.init(makeMockDemo(60, true, 64), makeMockCanvas())).toBe(true);
        });

        it('rejects invalid displaySize before layout or renderer setup', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: { x: 0, y: 240 } as Vector2i,
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(canvas.style.setProperty).not.toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects invalid software drawingBufferSize before software renderer allocation', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: { x: 8193, y: 480 } as Vector2i,
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(getContext).not.toHaveBeenCalled();
        });

        it('rejects invalid maxCanvasSize before layout or renderer setup', async () => {
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    maxCanvasSize: { x: Number.NaN, y: 720 } as Vector2i,
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(canvas.style.setProperty).not.toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU dimensions above adapter texture limits before canvas allocation', async () => {
            const requestDevice = vi.fn(async () => createMockGPUDevice());
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(2048, 1024),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU drawingBufferSize above adapter texture limits before canvas allocation', async () => {
            const requestDevice = vi.fn(async () => createMockGPUDevice());
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 1024 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(2048, 1024),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMockCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).not.toHaveBeenCalled();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('rejects WebGPU dimensions above device texture limits without software fallback', async () => {
            const requestDevice = vi.fn(async () => ({
                ...createMockGPUDevice(),
                limits: { maxTextureDimension2D: 512 } as GPUSupportedLimits,
            }));
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice,
                            features: new Set(),
                            limits: { maxTextureDimension2D: 2048 } as GPUSupportedLimits,
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });
            const demo: IBTDemo = {
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(1024, 768),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();
            const getContext = vi.fn(canvas.getContext.bind(canvas));
            (canvas as unknown as { getContext: typeof getContext }).getContext = getContext;

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(false);
            expect(canvas.width).toBe(0);
            expect(canvas.height).toBe(0);
            expect(requestDevice).toHaveBeenCalled();
            expect(getContext).not.toHaveBeenCalledWith('2d');
            expect(BTAPI.instance.getActiveBackend()).toBeNull();
            expect(demo.init).not.toHaveBeenCalled();
        });

        it('returns false when both WebGPU and software renderer init fail', async () => {
            uninstallMockNavigatorGPU();

            // makeMockCanvas() returns null for getContext('2d'), so the auto-fallback
            // SoftwareRenderer also fails to initialize.
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('initializes successfully in software mode when WebGPU is unavailable', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).toBeNull();
            expect(BTAPI.instance.getContext()).toBeNull();
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
        });

        it('URL override ?backend=software wins over configure().backend=webgpu', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getHardwareSettings()?.backend).toBe('software');
            expect(BTAPI.instance.getRequestedBackend()).toBe('software');
            expect(BTAPI.instance.getActiveBackend()).toBe('software');
            expect(BTAPI.instance.getDevice()).toBeNull();
        });

        it('ignores unknown backend query values and keeps configure backend', async () => {
            vi.stubGlobal('location', { search: '?backend=banana' });

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);
            expect(BTAPI.instance.getHardwareSettings()?.backend).toBe('webgpu');
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getDevice()).not.toBeNull();
        });

        it('falls back to software (and fails cleanly) when WebGPU adapter is unavailable', async () => {
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => null,
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });

            // BTAPI catches the adapter throw and falls back to software.
            // makeMockCanvas() has no 2D context, so software init also fails -> false.
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false when renderer initialization fails', async () => {
            // Provide an adapter that returns a device broken for shader compilation.
            Object.defineProperty(globalThis, 'navigator', {
                value: {
                    gpu: {
                        requestAdapter: async () => ({
                            requestDevice: async () => ({
                                createShaderModule: () => {
                                    throw new Error("GPU isn't available");
                                },
                            }),
                        }),
                        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
                    },
                    userAgent: 'test',
                },
                writable: true,
                configurable: true,
            });

            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return false when demo.init() returns false', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(60, false), makeMockCanvas());

            expect(result).toBe(false);
        });

        it('should return true and populate accessors on success', async () => {
            const canvas = makeMockCanvas();
            const result = await BTAPI.instance.init(makeMockDemo(), canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).not.toBeNull();
            expect(BTAPI.instance.getContext()).not.toBeNull();
            expect(BTAPI.instance.getCanvas()).toBe(canvas);
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
            expect(BTAPI.instance.getHardwareSettings()).not.toBeNull();
            expect(BTAPI.instance.getPointer()).not.toBeNull();
            expect(BTAPI.instance.getKeyboard()).not.toBeNull();
            expect(BTAPI.instance.getGamepad()).not.toBeNull();
        });

        it('should merge partial configure with defaultConfig', async () => {
            const demo: IBTDemo = {
                configure: () => ({ isSplashEnabled: false, targetFPS: 30 }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);

            const hw = BTAPI.instance.getHardwareSettings();

            expect(hw).not.toBeNull();
            expect(hw?.displaySize.x).toBe(320);
            expect(hw?.drawingBufferSize?.x).toBe(640);
            expect(hw?.targetFPS).toBe(30);
        });

        it('should use defaultConfig when configure is omitted', async () => {
            const demo: IBTDemo = {
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            // This demo has no configure() to opt out of the splash with, so gate it
            // off the way a development build does. Splash behavior has its own suite.
            globalThis.__BLIT386_DEV__ = true;

            const result = await BTAPI.instance.init(demo, makeMockCanvas());

            expect(result).toBe(true);

            const hw = BTAPI.instance.getHardwareSettings();

            expect(hw).not.toBeNull();
            expect(hw?.displaySize.x).toBe(320);
            expect(hw?.displaySize.y).toBe(240);
            expect(hw?.drawingBufferSize?.x).toBe(640);
            expect(hw?.drawingBufferSize?.y).toBe(480);
            expect(hw?.outputUpscaleFilter).toBe('nearest');
            expect(hw?.targetFPS).toBe(60);

            Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
        });

        it('stop detaches pointer and keyboard input so subsequent accessors return null', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(BTAPI.instance.getPointer()).not.toBeNull();
            expect(BTAPI.instance.getKeyboard()).not.toBeNull();
            expect(BTAPI.instance.getGamepad()).not.toBeNull();

            BTAPI.instance.stop();

            expect(BTAPI.instance.getPointer()).toBeNull();
            expect(BTAPI.instance.getKeyboard()).toBeNull();
            expect(BTAPI.instance.getGamepad()).toBeNull();
        });

        it('double init without stop detaches prior pointer and keyboard before reattaching', async () => {
            const canvas = makeMockCanvas();

            await BTAPI.instance.init(makeMockDemo(), canvas);

            const pointerBefore = BTAPI.instance.getPointer();
            const keyboardBefore = BTAPI.instance.getKeyboard();

            expect(pointerBefore).not.toBeNull();
            expect(keyboardBefore).not.toBeNull();

            vi.mocked(canvas.removeEventListener).mockClear();

            await BTAPI.instance.init(makeMockDemo(), canvas);

            expect(BTAPI.instance.getPointer()).not.toBe(pointerBefore);
            expect(BTAPI.instance.getKeyboard()).not.toBe(keyboardBefore);

            const removedKinds = vi.mocked(canvas.removeEventListener).mock.calls.map((call) => call[0]);

            expect(removedKinds).toContain('pointermove');
            expect(removedKinds).toContain('keydown');
        });

        it('should start the game loop on success', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(requestAnimationFrame).toHaveBeenCalled();
        });

        it('forwards overlayRows from the demo into Overlay.updateAndRender', async () => {
            const customRows: OverlayRow[] = [{ leftText: 'Position: 1, 2' }];
            const demo: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: true,
                }),
                overlayRows: vi.fn().mockReturnValue(customRows),
            };
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations before overlay render.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (overlaySpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(demo.overlayRows).toHaveBeenCalled();
            expect(overlaySpy).toHaveBeenCalled();
            const lastCall = overlaySpy.mock.calls.at(-1);
            const getCustomRows = lastCall?.[5] as (() => typeof customRows) | undefined;
            const timing = lastCall?.[6] as
                | {
                      frameMs: number;
                      updateMs: number;
                      renderMs: number;
                      updateSteps: number;
                      drawCalls: number;
                      droppedFrames: number;
                      primitiveOverflowCount: number;
                      spriteOverflowCount: number;
                      primitiveSubmittedVertices: number;
                      spriteSubmittedVertices: number;
                  }
                | undefined;

            expect(getCustomRows).toBeDefined();

            if (!getCustomRows) {
                return;
            }

            expect(getCustomRows()).toBe(customRows);

            expect(timing).toBeDefined();

            if (!timing) {
                return;
            }

            expect(timing.frameMs).toBeGreaterThanOrEqual(0);
            expect(timing.updateMs).toBeGreaterThanOrEqual(0);
            expect(timing.renderMs).toBeGreaterThanOrEqual(0);
            expect(timing.updateSteps).toBeGreaterThanOrEqual(0);
            expect(timing.drawCalls).toBeGreaterThanOrEqual(0);
            expect(timing.droppedFrames).toBeGreaterThanOrEqual(0);
            expect(timing.primitiveOverflowCount).toBeGreaterThanOrEqual(0);
            expect(timing.spriteOverflowCount).toBeGreaterThanOrEqual(0);
            expect(timing.primitiveSubmittedVertices).toBeGreaterThanOrEqual(0);
            expect(timing.spriteSubmittedVertices).toBeGreaterThanOrEqual(0);
        });

        it('calls gamepad.endFrame during render-phase input flush', async () => {
            const rafCallbacks: FrameRequestCallback[] = [];
            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const gamepad = BTAPI.instance.getGamepad();
            expect(gamepad).not.toBeNull();
            BTAPI.instance.setPalette(new Palette(16));

            const endFrameSpy = vi.spyOn(gamepad as NonNullable<typeof gamepad>, 'endFrame');
            // GameLoop.start uses a double-rAF bootstrap before the first tick.
            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error(
                        'Exceeded max rAF callback drain iterations before gamepad.endFrame was called; possible loop stall.',
                    );
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (endFrameSpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(endFrameSpy).toHaveBeenCalled();
        });

        it('stop should not throw after successful initialization', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(() => BTAPI.instance.stop()).not.toThrow();
        });

        it('captureFrame returns a blob after successful initialization', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const mockBlob = new Blob(['test'], { type: 'image/png' });

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'captureFrame').mockResolvedValue(mockBlob);

            const result = await BTAPI.instance.captureFrame();

            expect(result).toBe(mockBlob);
        });

        it('captureFrame works in software mode after a rendered frame', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    backend: 'software',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const canvas = makeMock2DCanvas();

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.setPalette(new Palette(16));

            const capturePromise = BTAPI.instance.captureFrame();
            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            renderer?.beginFrame();
            renderer?.endFrame();

            const blob = await capturePromise;
            expect(blob.type).toBe('image/png');
        });

        it('auto-falls back to software when WebGPU is unavailable and 2D canvas is available', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    // No backend field – defaults to 'webgpu', should auto-fallback
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };
            const canvas = makeMock2DCanvas();

            const result = await BTAPI.instance.init(demo, canvas);

            expect(result).toBe(true);
            expect(BTAPI.instance.getDevice()).toBeNull();
            expect(BTAPI.instance.getContext()).toBeNull();
            expect(BTAPI.instance.getRenderer()).not.toBeNull();
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getActiveBackend()).toBe('software');
        });

        it('reports webgpu as active backend when WebGPU succeeds', async () => {
            const result = await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(result).toBe(true);
            expect(BTAPI.instance.getRequestedBackend()).toBe('webgpu');
            expect(BTAPI.instance.getActiveBackend()).toBe('webgpu');
        });

        it('reports null requested and active backends before init', () => {
            expect(BTAPI.instance.getRequestedBackend()).toBeNull();
            expect(BTAPI.instance.getActiveBackend()).toBeNull();
        });

        it('exposes requested and active backends on BT after URL override', async () => {
            vi.stubGlobal('location', { search: '?backend=software' });
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );
            uninstallMockNavigatorGPU();

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    backend: 'webgpu',
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BT.init(demo, makeMock2DCanvas());

            expect(result).toBe(true);
            expect(BT.requestedBackend).toBe('software');
            expect(BT.activeBackend).toBe('software');
        });

        it('keeps BT.requestedBackend webgpu when BT.activeBackend is software after fallback', async () => {
            uninstallMockNavigatorGPU();
            vi.stubGlobal(
                'OffscreenCanvas',
                class MockOffscreenCanvas {
                    constructor(
                        public width: number,
                        public height: number,
                    ) {}
                    getContext(contextType?: string): OffscreenCanvas2DMock | null {
                        return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                    }
                },
            );

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const result = await BT.init(demo, makeMock2DCanvas());

            expect(result).toBe(true);
            expect(BT.requestedBackend).toBe('webgpu');
            expect(BT.activeBackend).toBe('software');
        });
    });

    describe('wake lock', () => {
        afterEach(() => {
            Reflect.deleteProperty(globalThis.navigator, 'wakeLock');
        });

        function createFakeSentinel(): WakeLockSentinel {
            const target = new EventTarget();

            const sentinel = {
                onrelease: null,
                released: false,
                type: 'screen' as const,
                release: vi.fn(async () => {
                    sentinel.released = true;
                    target.dispatchEvent(new Event('release'));
                }),
                addEventListener: target.addEventListener.bind(target),
                removeEventListener: target.removeEventListener.bind(target),
                dispatchEvent: target.dispatchEvent.bind(target),
            };

            return sentinel as unknown as WakeLockSentinel;
        }

        function installMockWakeLock(request: (type?: WakeLockType) => Promise<WakeLockSentinel>): {
            request: ReturnType<typeof vi.fn>;
        } {
            const mockWakeLock = { request: vi.fn(request) };

            Object.defineProperty(globalThis, 'navigator', {
                value: { ...globalThis.navigator, wakeLock: mockWakeLock },
                configurable: true,
            });

            return mockWakeLock;
        }

        function makeWakeLockDemo(isWakeLockEnabled: boolean): IBTDemo {
            return {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    isWakeLockEnabled,
                }),
            };
        }

        it('requests a screen wake lock on successful init when isWakeLockEnabled is true', async () => {
            const sentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => sentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledWith('screen');
            });
        });

        it('does not touch navigator.wakeLock when isWakeLockEnabled is omitted', async () => {
            const mockWakeLock = installMockWakeLock(async () => createFakeSentinel());

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(mockWakeLock.request).not.toHaveBeenCalled();
        });

        it('releases the wake lock on stop', async () => {
            const sentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => sentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalled();
            });

            BTAPI.instance.stop();

            expect(sentinel.release).toHaveBeenCalled();
        });

        it('detaches the previous wake lock before attaching a new one on re-init', async () => {
            const firstSentinel = createFakeSentinel();
            const secondSentinel = createFakeSentinel();
            const mockWakeLock = installMockWakeLock(async () => firstSentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledTimes(1);
            });

            mockWakeLock.request.mockImplementation(async () => secondSentinel);

            await BTAPI.instance.init(makeWakeLockDemo(true), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mockWakeLock.request).toHaveBeenCalledTimes(2);
            });

            expect(firstSentinel.release).toHaveBeenCalled();
            expect(secondSentinel.release).not.toHaveBeenCalled();
        });
    });

    describe('screen orientation', () => {
        type FakeOrientation = {
            type: string;
            lock: ReturnType<typeof vi.fn>;
            unlock: ReturnType<typeof vi.fn>;
            addEventListener: ReturnType<typeof vi.fn>;
            removeEventListener: ReturnType<typeof vi.fn>;
            dispatchEvent: (event: Event) => boolean;
        };

        let mockOrientation: FakeOrientation | null = null;

        afterEach(() => {
            mockOrientation = null;
            Reflect.deleteProperty(globalThis, 'screen');
        });

        function installMockOrientation(type = 'landscape-primary'): FakeOrientation {
            const target = new EventTarget();

            mockOrientation = {
                type,
                lock: vi.fn(async () => undefined),
                unlock: vi.fn(),
                addEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.addEventListener(event, listener);
                }),
                removeEventListener: vi.fn((event: string, listener: EventListener) => {
                    target.removeEventListener(event, listener);
                }),
                dispatchEvent: (event: Event) => target.dispatchEvent(event),
            };

            Object.defineProperty(globalThis, 'screen', {
                configurable: true,
                value: { orientation: mockOrientation },
            });

            return mockOrientation;
        }

        function makeOrientationDemo(
            preferredOrientation: 'landscape' | 'portrait' | 'any',
            onOrientationChange?: (type: string) => void,
        ): IBTDemo {
            const demo: IBTDemo = {
                ...makeMockDemo(),
                configure: vi.fn().mockReturnValue({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    drawingBufferSize: new Vector2i(640, 480),
                    targetFPS: 60,
                    preferredOrientation,
                }),
            };

            if (onOrientationChange !== undefined) {
                demo.onOrientationChange = onOrientationChange;
            }

            return demo;
        }

        it('exposes the current screen orientation via getScreenOrientation', () => {
            installMockOrientation('portrait-secondary');

            expect(BTAPI.instance.getScreenOrientation()).toBe('portrait-secondary');
            expect(BT.screenOrientation).toBe('portrait-secondary');
        });

        it('requests an orientation lock on successful init when preferredOrientation is set', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('landscape'), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mock.lock).toHaveBeenCalledWith('landscape');
            });
        });

        it('does not lock when preferredOrientation is any', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('any'), makeMockCanvas());

            expect(mock.lock).not.toHaveBeenCalled();
        });

        it('forwards orientation change events to demo.onOrientationChange', async () => {
            const mock = installMockOrientation('landscape-primary');
            const onOrientationChange = vi.fn();

            await BTAPI.instance.init(makeOrientationDemo('any', onOrientationChange), makeMockCanvas());

            mock.type = 'portrait-primary';
            mock.dispatchEvent(new Event('change'));

            expect(onOrientationChange).toHaveBeenCalledWith('portrait-primary');
        });

        it('removes the orientation listener on stop', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('landscape'), makeMockCanvas());

            await vi.waitFor(() => {
                expect(mock.lock).toHaveBeenCalledWith('landscape');
            });

            BTAPI.instance.stop();

            expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mock.unlock).toHaveBeenCalled();
        });

        it('does not unlock on stop when preferredOrientation is any', async () => {
            const mock = installMockOrientation();

            await BTAPI.instance.init(makeOrientationDemo('any'), makeMockCanvas());

            BTAPI.instance.stop();

            expect(mock.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
            expect(mock.unlock).not.toHaveBeenCalled();
        });
    });

    describe('assignTag', () => {
        it('forwards tags to Overlay when the timing chart is enabled', async () => {
            const assignSpy = vi.spyOn(Overlay.prototype, 'assignTag');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.assignTag('Checkpoint');

            expect(assignSpy).toHaveBeenCalledWith('Checkpoint', expect.any(Number));
        });

        it('does not store tags when isOverlayTimingChartEnabled is disabled', async () => {
            const { TimingChart } = await import('../overlay/timing-chart/TimingChart');
            const assignSpy = vi.spyOn(TimingChart.prototype, 'assignTag');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.assignTag('Ignored');

            expect(assignSpy).not.toHaveBeenCalled();
        });
    });

    describe('renderer diagnostics in overlay timing snapshot', () => {
        /**
         * Runs game-loop ticks using a stubbed rAF queue seeded before init.
         *
         * @param demo – Demo passed to {@link BTAPI.init}.
         * @param stopWhen – Stop draining once this returns true.
         * @returns Overlay spy from the initialized instance.
         */
        async function initAndDrainUntil(
            demo: IBTDemo,
            stopWhen: (overlaySpy: ReturnType<typeof vi.spyOn>) => boolean,
        ): Promise<ReturnType<typeof vi.spyOn>> {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);

                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;

                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16 * iterations);
                }

                if (stopWhen(overlaySpy)) {
                    break;
                }
            }

            return overlaySpy;
        }

        it('calls getFrameDiagnostics when isOverlayTimingChartEnabled is enabled', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).toHaveBeenCalled();
        });

        it('does not call getFrameDiagnostics when isOverlayTimingChartEnabled is disabled', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                    isOverlayRendererDiagnosticsBarEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).not.toHaveBeenCalled();
        });

        it('calls getFrameDiagnostics when isOverlayRendererDiagnosticsBarEnabled is enabled without chart', async () => {
            const diagnosticsSpy = vi.spyOn(
                (await import('../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            );
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: false,
                    isOverlayRendererDiagnosticsBarEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await initAndDrainUntil(demo, (overlaySpy) => overlaySpy.mock.calls.length > 0);

            expect(diagnosticsSpy).toHaveBeenCalled();
        });

        it('copies captured diagnostics into the timing snapshot on frame rollover', async () => {
            const mockDiagnostics = {
                primitiveOverflowCount: 3,
                spriteOverflowCount: 2,
                primitiveSubmittedVertices: 6000,
                spriteSubmittedVertices: 1200,
            };

            vi.spyOn(
                (await import('../render/WebGPURenderer')).WebGPURenderer.prototype,
                'getFrameDiagnostics',
            ).mockReturnValue(mockDiagnostics);

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayTimingChartEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length >= 2);

            const secondTiming = overlaySpy.mock.calls[1]?.[6] as {
                primitiveOverflowCount: number;
                spriteOverflowCount: number;
                primitiveSubmittedVertices: number;
                spriteSubmittedVertices: number;
            };

            expect(secondTiming).toMatchObject(mockDiagnostics);
        });
    });

    describe('audio meter bus metering', () => {
        it('calls enableBusMetering when isOverlayAudioMetersEnabled is enabled', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(meteringSpy).toHaveBeenCalled();
        });

        it('does not call enableBusMetering when isOverlayAudioMetersEnabled is disabled (default)', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');

            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            expect(meteringSpy).not.toHaveBeenCalled();
        });

        it('does not call enableBusMetering when isOverlayEnabled is false even if isOverlayAudioMetersEnabled is true', async () => {
            const meteringSpy = vi.spyOn(AudioManager.prototype, 'enableBusMetering');
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayEnabled: false,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());

            expect(meteringSpy).not.toHaveBeenCalled();
        });
    });

    describe('audio diagnostics in overlay audio snapshot', () => {
        /**
         * Runs game-loop ticks using a stubbed rAF queue seeded before init.
         *
         * @param demo – Demo passed to {@link BTAPI.init}.
         * @param stopWhen – Stop draining once this returns true.
         * @returns Overlay spy from the initialized instance.
         */
        async function initAndDrainUntil(
            demo: IBTDemo,
            stopWhen: (overlaySpy: ReturnType<typeof vi.spyOn>) => boolean,
        ): Promise<ReturnType<typeof vi.spyOn>> {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);

                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;

                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16 * iterations);
                }

                if (stopWhen(overlaySpy)) {
                    break;
                }
            }

            return overlaySpy;
        }

        it('passes an audio snapshot into updateAndRender when isOverlayAudioMetersEnabled is enabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length > 0);

            const snapshot = overlaySpy.mock.calls[0]?.[9] as
                | { levels: { main: number; music: number; sfx: number }; totalVoices: number }
                | undefined;

            expect(snapshot).toBeDefined();
            expect(snapshot?.levels).toEqual({ main: 0, music: 0, sfx: 0 });
            expect(snapshot?.totalVoices).toBeGreaterThan(0);
        });

        it('reflects voice and level counters from AudioManager on frame rollover', async () => {
            vi.spyOn(AudioManager.prototype, 'getActiveVoiceCount').mockReturnValue(3);
            vi.spyOn(AudioManager.prototype, 'getVoiceCount').mockReturnValue(16);
            vi.spyOn(AudioManager.prototype, 'getVoiceStealCount').mockReturnValue(2);
            vi.spyOn(AudioManager.prototype, 'getVoiceDropCount').mockReturnValue(1);
            vi.spyOn(AudioManager.prototype, 'getDroppedSfxCount').mockReturnValue(4);
            vi.spyOn(AudioManager.prototype, 'getBusLevels').mockReturnValue({ main: 0.5, music: 0.25, sfx: 0.1 });

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const overlaySpy = await initAndDrainUntil(demo, (spy) => spy.mock.calls.length >= 2);

            const secondSnapshot = overlaySpy.mock.calls[1]?.[9];

            expect(secondSnapshot).toMatchObject({
                activeVoices: 3,
                totalVoices: 16,
                voiceStealCount: 2,
                voiceDropCount: 1,
                preUnlockDropCount: 4,
                levels: { main: 0.5, music: 0.25, sfx: 0.1 },
            });
        });

        it('does not read audio diagnostics when isOverlayAudioMetersEnabled is disabled', async () => {
            const levelsSpy = vi.spyOn(AudioManager.prototype, 'getBusLevels');

            await initAndDrainUntil(makeMockDemo(), (spy) => spy.mock.calls.length > 0);

            expect(levelsSpy).not.toHaveBeenCalled();
        });
    });

    describe('audio meter overlay rendering', () => {
        /**
         * Drains the stubbed rAF queue until `stopWhen` returns true, spying on real renderer bar fills.
         *
         * @param demo – Demo passed to {@link BTAPI.init}.
         * @returns Collected bar fills in draw order.
         */
        async function drainAndCollectBarFills(demo: IBTDemo): Promise<{ index: number; rect: Rect2i }[]> {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);

                    return rafCallbacks.length;
                }),
            );

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));

            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            const barFills: { index: number; rect: Rect2i }[] = [];

            vi.spyOn(renderer as NonNullable<typeof renderer> & OverlayDrawTarget, 'drawBarFill').mockImplementation(
                (rect: Rect2i, index: number) => {
                    barFills.push({ index, rect: new Rect2i(rect.x, rect.y, rect.width, rect.height) });
                },
            );

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;

                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations before overlay render.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (overlaySpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(overlaySpy).toHaveBeenCalled();

            return barFills;
        }

        /**
         * The three bus bar left-edge X positions {@link AudioMeter} draws at, computed the same
         * way as `busBarX()` in `src/overlay/audio-meter/AudioMeter.ts` (band left edge at `x: 0`).
         */
        const expectedAudioMeterBarXs = [0, 1, 2].map(
            (busIndex) => OVERLAY_EDGE_MARGIN_PX + busIndex * (AUDIO_METER_BAR_WIDTH_PX + AUDIO_METER_BAR_GAP_PX),
        );

        /**
         * Matches a bar fill against the audio meter's known bar geometry (width and left-edge X),
         * not width alone – width-only matching risks false positives from unrelated same-width bars.
         *
         * @param fill – Collected bar fill from {@link drainAndCollectBarFills}.
         * @param fill.rect – Filled rectangle in display coordinates.
         * @returns `true` when the fill's rect matches one of the three bus bar positions.
         */
        function isAudioMeterBar(fill: { rect: Rect2i }): boolean {
            return fill.rect.width === AUDIO_METER_BAR_WIDTH_PX && expectedAudioMeterBarXs.includes(fill.rect.x);
        }

        it('draws audio meter bars when isOverlayAudioMetersEnabled and the overlay body are enabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayAudioMetersEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const barFills = await drainAndCollectBarFills(demo);
            const meterBarXs = new Set(barFills.filter(isAudioMeterBar).map((fill) => fill.rect.x));

            expect([...meterBarXs].sort((a, b) => a - b)).toEqual(expectedAudioMeterBarXs);
        });

        it('does not draw audio meter bars when isOverlayAudioMetersEnabled is disabled', async () => {
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            const barFills = await drainAndCollectBarFills(demo);
            const meterBars = barFills.filter(isAudioMeterBar);

            expect(meterBars.length).toBe(0);
        });
    });

    describe('palette usage tracking', () => {
        function getOverlay(): Overlay | null {
            return (BTAPI.instance as unknown as { overlay: Overlay | null }).overlay;
        }

        function makeIndexizedSpriteSheet(markSpy: ReturnType<typeof vi.fn>): SpriteSheet {
            return {
                isIndexed: () => true,
                markPaletteIndicesInRect: markSpy,
            } as unknown as SpriteSheet;
        }

        function stubRendererDrawCalls(): void {
            const renderer = BTAPI.instance.getRenderer();

            expect(renderer).not.toBeNull();

            vi.spyOn(renderer as NonNullable<typeof renderer>, 'drawSprite').mockImplementation(() => {});
            vi.spyOn(renderer as NonNullable<typeof renderer>, 'drawBitmapText').mockImplementation(() => {});
        }

        it('skips sprite and bitmap-text palette scans when isOverlayPaletteEnabled is false', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = { getSpriteSheet: () => mockSheet } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'ab');

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('scans sprite and bitmap-text palette usage when isOverlayPaletteEnabled is true and overlay body is visible', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = {
                getSpriteSheet: () => mockSheet,
                getGlyph: () => ({ rect: new Rect2i(0, 0, 8, 8) }),
            } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));
            BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'a');

            expect(markSpy).toHaveBeenCalledTimes(2);
        });

        it('skips palette scans when the palette grid is enabled but the overlay body is hidden', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(false);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('skips palette scans when the overlay body is hidden even if the toggle hint is visible', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayToggleHintVisible: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(false);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            BTAPI.instance.drawSprite(mockSheet, new Rect2i(0, 0, 16, 16), new Vector2i(0, 0));

            expect(markSpy).not.toHaveBeenCalled();
        });

        it('wires demo render palette usage through the game loop into overlay grid swatches', async () => {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            const palette = Palette.cga();
            const usedSlots = [5, 6] as const;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(() => {
                    BTAPI.instance.drawPixel(new Vector2i(4, 4), usedSlots[0]);
                    BTAPI.instance.drawPixel(new Vector2i(5, 5), usedSlots[1]);
                }),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(palette);

            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            const swatchFills: { index: number; rect: Rect2i }[] = [];

            vi.spyOn(renderer as NonNullable<typeof renderer> & OverlayDrawTarget, 'drawBarFill').mockImplementation(
                (rect: Rect2i, index: number) => {
                    swatchFills.push({ index, rect: new Rect2i(rect.x, rect.y, rect.width, rect.height) });
                },
            );

            const maxIterations = 1000;
            let iterations = 0;

            while (rafCallbacks.length > 0) {
                iterations++;
                if (iterations > maxIterations) {
                    throw new Error('Exceeded max rAF callback drain iterations before overlay render.');
                }

                const cb = rafCallbacks.shift();

                if (cb) {
                    cb(16);
                }

                if (overlaySpy.mock.calls.length > 0) {
                    break;
                }
            }

            expect(demo.render).toHaveBeenCalled();
            expect(overlaySpy).toHaveBeenCalled();

            const lastCall = overlaySpy.mock.calls.at(-1);
            const usedMask = lastCall?.[8] as Uint8Array | undefined;
            const maskScratch: number[] = [];

            expect(usedMask).toBeDefined();
            expect(collectUsedIndices(usedMask as Uint8Array, palette.size, maskScratch)).toEqual([5, 6]);

            const grid = computeGrid(320, DEFAULT_PALETTE_SWATCH_SIZE, palette.size, PALETTE_SWATCH_GAP_PX);
            const paletteBandTop = paletteBandY(240, grid.totalHeight);
            const { cols, swatchSize, gap } = grid;

            for (const slot of usedSlots) {
                const col = slot % cols;
                const row = Math.floor(slot / cols);
                const x = OVERLAY_EDGE_MARGIN_PX + col * (swatchSize + gap);
                const y = paletteBandTop + PALETTE_GRID_PADDING_PX + row * (swatchSize + gap);

                expect(
                    swatchFills.some(
                        (fill) =>
                            fill.index === slot &&
                            fill.rect.x === x &&
                            fill.rect.y === y &&
                            fill.rect.width === swatchSize &&
                            fill.rect.height === swatchSize,
                    ),
                ).toBe(true);
            }

            const unusedSlot = 3;
            const unusedCol = unusedSlot % cols;
            const unusedRow = Math.floor(unusedSlot / cols);
            const unusedX = OVERLAY_EDGE_MARGIN_PX + unusedCol * (swatchSize + gap);
            const unusedY = paletteBandTop + PALETTE_GRID_PADDING_PX + unusedRow * (swatchSize + gap);

            expect(
                swatchFills.some(
                    (fill) =>
                        fill.index === DEFAULT_IDX_TEXT &&
                        fill.rect.x === unusedX + 2 &&
                        fill.rect.y === unusedY + 2 &&
                        fill.rect.width === 3 &&
                        fill.rect.height === 3,
                ),
            ).toBe(true);
            expect(
                swatchFills.some(
                    (fill) =>
                        fill.index === unusedSlot &&
                        fill.rect.x === unusedX &&
                        fill.rect.y === unusedY &&
                        fill.rect.width === swatchSize,
                ),
            ).toBe(false);
        });

        it('drawSystemText marks only the text palette index and does not scan glyph rects', async () => {
            const glyphScanSpy = vi.fn();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            const systemFont = BTAPI.instance.getSystemFont();
            expect(systemFont).not.toBeNull();
            if (!systemFont) {
                return;
            }

            vi.spyOn(systemFont.getSpriteSheet(), 'markPaletteIndicesInRect').mockImplementation(glyphScanSpy);

            const textPaletteIndex = 8;

            BTAPI.instance.drawSystemText(new Vector2i(0, 0), textPaletteIndex, 'hello');

            expect(glyphScanSpy).not.toHaveBeenCalled();

            const usageMask = (BTAPI.instance as unknown as { framePaletteUsageMask: Uint8Array })
                .framePaletteUsageMask;
            const scratch: number[] = [];

            expect(collectUsedIndices(usageMask, 16, scratch)).toEqual([textPaletteIndex]);
        });

        it('drawBitmapText scans glyph rects when palette tracking is enabled', async () => {
            const markSpy = vi.fn();
            const mockSheet = makeIndexizedSpriteSheet(markSpy);
            const mockFont = {
                getSpriteSheet: () => mockSheet,
                getGlyph: (char: string) => ({ rect: new Rect2i(0, 0, 8, 8), char }),
            } as unknown as BitmapFont;
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));
            stubRendererDrawCalls();

            BTAPI.instance.drawBitmapText(mockFont, new Vector2i(0, 0), 'ab');

            expect(markSpy).toHaveBeenCalledTimes(2);
        });

        it('clears stale palette usage after overlay hide and re-show', async () => {
            const overlaySpy = vi.spyOn(Overlay.prototype, 'updateAndRender');
            const rafCallbacks: FrameRequestCallback[] = [];

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((callback: FrameRequestCallback) => {
                    rafCallbacks.push(callback);
                    return rafCallbacks.length;
                }),
            );

            const render = vi.fn(() => {
                const renderCall = render.mock.calls.length;

                if (renderCall === 1) {
                    BTAPI.instance.drawPixel(new Vector2i(0, 0), 9);
                    return;
                }

                if (renderCall >= 3) {
                    BTAPI.instance.drawPixel(new Vector2i(0, 0), 7);
                }
            });

            const drainRafUntilRenderCount = (target: number): void => {
                let guard = 0;

                while (render.mock.calls.length < target) {
                    if (guard++ > 1000 || rafCallbacks.length === 0) {
                        throw new Error(`Timed out waiting for render call ${target}`);
                    }

                    const cb = rafCallbacks.shift();

                    if (cb) {
                        cb(16);
                    }
                }
            };

            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayPaletteEnabled: true,
                    isOverlayVisibleAtStart: true,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render,
            };

            await BTAPI.instance.init(demo, makeMockCanvas());
            BTAPI.instance.setPalette(new Palette(16));

            const overlay = getOverlay();
            expect(overlay).not.toBeNull();
            expect(overlay?.isBodyVisible).toBe(true);

            drainRafUntilRenderCount(1);

            overlay?.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 1);
            expect(overlay?.isTrackingPaletteUsage).toBe(false);

            drainRafUntilRenderCount(2);

            overlay?.handleToggle(null, { isKeyPressed: (key: string) => key === 'Backquote' } as never, 2);
            expect(overlay?.isTrackingPaletteUsage).toBe(true);

            overlaySpy.mockClear();
            drainRafUntilRenderCount(3);

            const usedMask = overlaySpy.mock.calls.at(-1)?.[8] as Uint8Array | undefined;
            const scratch: number[] = [];

            expect(collectUsedIndices(usedMask as Uint8Array, 16, scratch)).toEqual([7]);
        });
    });

    describe('overlay Backquote toggle timing', () => {
        it('registers a Backquote press consumed by the same fixed-update tick', async () => {
            const canvas = makeMockCanvas();
            const demo: IBTDemo = {
                configure: () => ({
                    isSplashEnabled: false,
                    displaySize: new Vector2i(320, 240),
                    targetFPS: 60,
                    isOverlayVisibleAtStart: false,
                }),
                init: vi.fn().mockResolvedValue(true),
                update: vi.fn(),
                render: vi.fn(),
            };

            await BTAPI.instance.init(demo, canvas);
            BTAPI.instance.setPalette(new Palette(16));

            const overlay = (BTAPI.instance as unknown as { overlay: Overlay | null }).overlay;

            expect(overlay?.isBodyVisible).toBe(false);

            const keydownCall = (canvas.addEventListener as ReturnType<typeof vi.fn>).mock.calls.find(
                ([type]) => type === 'keydown',
            );
            const keydownHandler = keydownCall?.[1] as ((event: { code: string }) => void) | undefined;

            expect(keydownHandler).toBeDefined();

            keydownHandler?.({ code: 'Backquote' });

            // Drive one fixed-update step and the following render in a single
            // GameLoop.tick() call, matching what a real rAF frame does: the update
            // phase (which clears the keyboard's press edge) always runs before the
            // render phase (where the overlay's toggle check lives).
            const loop = (
                BTAPI.instance as unknown as {
                    loop: { lastUpdateTime: number; tick: (currentTime: number) => void } | null;
                }
            ).loop;

            loop?.tick(20);

            expect(overlay?.isBodyVisible).toBe(true);
        });
    });

    describe('assertPaletteIndex', () => {
        it('throws when index is negative (no palette set)', () => {
            expect(() => BTAPI.instance.drawPixel(new Vector2i(0, 0), -1)).toThrow('0 or higher');
        });

        it('throws when index is out of range for the active palette', () => {
            const palette = new Palette(16);

            BTAPI.instance.setPalette(palette);

            expect(() => BTAPI.instance.drawPixel(new Vector2i(0, 0), 20)).toThrow('The color number 20 is too big');
        });
    });

    describe('post-process effects', () => {
        function makeStubEffect(): Effect {
            return {
                tier: 'pixel',
                init: vi.fn(),
                updateUniforms: vi.fn(),
                encodePass: vi.fn(),
                dispose: vi.fn(),
            };
        }

        it('effectAdd throws before init', () => {
            expect(() => BTAPI.instance.effectAdd(makeStubEffect())).toThrow('renderer not initialized');
        });

        it('effectRemove throws before init', () => {
            expect(() => BTAPI.instance.effectRemove(makeStubEffect())).toThrow('renderer not initialized');
        });

        it('effectClear throws before init', () => {
            expect(() => BTAPI.instance.effectClear()).toThrow('renderer not initialized');
        });

        it('effectAdd / effectClear delegate to the renderer after init', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();
            expect(renderer).not.toBeNull();

            const addSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'addEffect');
            const clearSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'clearEffects');

            const effect = makeStubEffect();
            BTAPI.instance.effectAdd(effect);

            expect(addSpy).toHaveBeenCalledWith(effect);

            BTAPI.instance.effectClear();

            expect(clearSpy).toHaveBeenCalled();
        });

        it('effectRemove delegates to the renderer after init', async () => {
            await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

            const renderer = BTAPI.instance.getRenderer();
            const removeSpy = vi.spyOn(renderer as NonNullable<typeof renderer>, 'removeEffect');

            const effect = makeStubEffect();
            BTAPI.instance.effectAdd(effect);
            BTAPI.instance.effectRemove(effect);

            expect(removeSpy).toHaveBeenCalledWith(effect);
        });
    });

    describe('getLoadingAssetsCount', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('returns 0 when nothing is loading', () => {
            expect(BTAPI.instance.getLoadingAssetsCount()).toBe(0);
        });

        it('sums the AssetLoader and AudioClip in-flight counts', () => {
            vi.spyOn(AssetLoader, 'loadingCount', 'get').mockReturnValue(2);
            vi.spyOn(AudioClip, 'loadingCount', 'get').mockReturnValue(3);

            expect(BTAPI.instance.getLoadingAssetsCount()).toBe(5);
        });
    });

    describe('hot reload', () => {
        describe('getDemo', () => {
            it('returns null before initialization', () => {
                expect(BTAPI.instance.getDemo()).toBeNull();
            });

            it('returns the active demo instance after initialization', async () => {
                const demo = makeMockDemo();

                await BTAPI.instance.init(demo, makeMockCanvas());

                expect(BTAPI.instance.getDemo()).toBe(demo);
            });
        });

        describe('isInitialized', () => {
            it('returns false before initialization', () => {
                expect(BTAPI.instance.isInitialized()).toBe(false);
            });

            it('returns true after a successful initialization', async () => {
                await BTAPI.instance.init(makeMockDemo(), makeMockCanvas());

                expect(BTAPI.instance.isInitialized()).toBe(true);
            });
        });

        describe('isDevMode', () => {
            afterEach(() => {
                Reflect.deleteProperty(globalThis, '__BLIT386_DEV__');
            });

            it('delegates to devMode.isDevMode', () => {
                expect(BTAPI.instance.isDevMode()).toBe(false);

                globalThis.__BLIT386_DEV__ = true;

                expect(BTAPI.instance.isDevMode()).toBe(true);
            });
        });

        describe('hotReplaceDemo', () => {
            afterEach(() => {
                Reflect.deleteProperty(globalThis, 'screen');
            });

            it('swaps in the new demo and returns true when init() succeeds', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = makeMockDemo();
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(true);
                expect(BTAPI.instance.getDemo()).toBe(newDemo);
            });

            it('keeps the previous demo and returns false when init() returns false', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = makeMockDemo(60, false);
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('keeps the previous demo and returns false when init() throws', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newDemo = { ...makeMockDemo(), init: vi.fn().mockRejectedValue(new Error('boom')) };
                const result = await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('never touches input/audio subsystems on failure (unlike cold-boot init failure)', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const clearSpy = vi.spyOn(
                    BTAPI.instance as unknown as { clearInputSubsystems: () => void },
                    'clearInputSubsystems',
                );

                const newDemo = makeMockDemo(60, false);
                await BTAPI.instance.hotReplaceDemo(newDemo);

                expect(clearSpy).not.toHaveBeenCalled();
            });

            it('returns false without swapping when the candidate is missing update()/render()', async () => {
                const oldDemo = makeMockDemo();
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const broken = { ...makeMockDemo(), update: undefined } as unknown as IBTDemo;
                const result = await BTAPI.instance.hotReplaceDemo(broken);

                expect(result).toBe(false);
                expect(BTAPI.instance.getDemo()).toBe(oldDemo);
            });

            it('rebinds orientation change events to the new demo after a successful swap', async () => {
                const target = new EventTarget();
                const mockOrientation = {
                    type: 'landscape-primary',
                    lock: vi.fn(async () => undefined),
                    unlock: vi.fn(),
                    addEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.addEventListener(event, listener),
                    ),
                    removeEventListener: vi.fn((event: string, listener: EventListener) =>
                        target.removeEventListener(event, listener),
                    ),
                    dispatchEvent: (event: Event) => target.dispatchEvent(event),
                };

                Object.defineProperty(globalThis, 'screen', {
                    configurable: true,
                    value: { orientation: mockOrientation },
                });

                const oldOnOrientationChange = vi.fn();
                const oldDemo = { ...makeMockDemo(), onOrientationChange: oldOnOrientationChange };
                await BTAPI.instance.init(oldDemo, makeMockCanvas());

                const newOnOrientationChange = vi.fn();
                const newDemo = { ...makeMockDemo(), onOrientationChange: newOnOrientationChange };
                await BTAPI.instance.hotReplaceDemo(newDemo);

                mockOrientation.type = 'portrait-primary';
                mockOrientation.dispatchEvent(new Event('change'));

                expect(newOnOrientationChange).toHaveBeenCalledWith('portrait-primary');
                expect(oldOnOrientationChange).not.toHaveBeenCalled();
            });
        });
    });
});

describe('BTAPI.paletteFadeExposure', () => {
    /**
     * Reads the private effect manager's active count.
     *
     * @returns Number of palette effects currently registered.
     */
    function activeEffectCount(): number {
        return (BTAPI.instance as unknown as { paletteEffects: { activeCount: number } }).paletteEffects.activeCount;
    }

    afterEach(() => {
        BTAPI.instance.paletteClearEffects();
    });

    it('registers an effect when a palette is active', () => {
        BTAPI.instance.setPalette(new Palette(16));
        BTAPI.instance.paletteClearEffects();

        BTAPI.instance.paletteFadeExposure(new Palette(16), 500);

        expect(activeEffectCount()).toBe(1);
    });

    it('accepts a highlight lead and easing curve', () => {
        BTAPI.instance.setPalette(new Palette(16));
        BTAPI.instance.paletteClearEffects();

        expect(() =>
            BTAPI.instance.paletteFadeExposure(new Palette(16), 500, { highlightLead: 0.75, easing: 'ease-out' }),
        ).not.toThrow();
    });

    it('throws for a non-finite duration', () => {
        BTAPI.instance.setPalette(new Palette(16));

        expect(() => BTAPI.instance.paletteFadeExposure(new Palette(16), NaN)).toThrow(/paletteFadeExposure/);
    });
});

describe('BTAPI splash palette capture', () => {
    let now = 0;

    /**
     * Replaces the private effect manager with one on a fake clock, and installs
     * a palette as if the splash owned it.
     *
     * @param splashPalette – Palette standing in for the splash's own ramp.
     */
    function armWithSplashPalette(splashPalette: Palette): void {
        now = 0;

        (BTAPI.instance as unknown as { paletteEffects: PaletteEffectManager }).paletteEffects =
            new PaletteEffectManager(() => now);
        (BTAPI.instance as unknown as { palette: Palette | null }).palette = splashPalette;

        BTAPI.instance.beginPaletteCapture();
    }

    /**
     * Reads the palette the renderer would resolve indices through.
     *
     * @returns The engine's active palette, bypassing the capture indirection.
     */
    function renderPalette(): Palette | null {
        return (BTAPI.instance as unknown as { palette: Palette | null }).palette;
    }

    /**
     * Reads the private effect manager's active count.
     *
     * @returns Number of palette effects currently registered.
     */
    function activeEffectCount(): number {
        return (BTAPI.instance as unknown as { paletteEffects: { activeCount: number } }).paletteEffects.activeCount;
    }

    /**
     * Runs the effect manager forward on the fake clock.
     *
     * The manager reports a zero delta on its first update after an idle gap, so
     * this primes it before stepping.
     *
     * @param ms – Milliseconds to advance.
     */
    function advanceEffects(ms: number): void {
        const manager = (BTAPI.instance as unknown as { paletteEffects: PaletteEffectManager }).paletteEffects;
        const palette = renderPalette();

        if (!palette) {
            return;
        }

        now += 1;
        manager.update(palette);

        now += ms;
        manager.update(palette);
    }

    afterEach(() => {
        BTAPI.instance.paletteClearEffects();
        (BTAPI.instance as unknown as { isCapturingPalette: boolean }).isCapturingPalette = false;
        (BTAPI.instance as unknown as { pendingPalette: Palette | null }).pendingPalette = null;
    });

    it('defers a paletteSet made while capture is armed', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);

        armWithSplashPalette(splashPalette);

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.red);

        BTAPI.instance.setPalette(gamePalette);

        expect(renderPalette()).toBe(splashPalette);
    });

    it('shows the game its own palette while capture is armed', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        expect(BTAPI.instance.getPalette()).toBeNull();

        const gamePalette = new Palette(16);

        BTAPI.instance.setPalette(gamePalette);

        expect(BTAPI.instance.getPalette()).toBe(gamePalette);
    });

    it('installs the captured palette blackened at handoff', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);

        BTAPI.instance.setPalette(gamePalette);
        BTAPI.instance.endPaletteCapture();

        const live = renderPalette();

        expect(live).toBe(gamePalette);
        expect(live?.get(1).r).toBe(0);
    });

    it('lands exactly on the captured colors once the handoff fade completes', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);
        gamePalette.set(2, new Color32(40, 60, 80));

        BTAPI.instance.setPalette(gamePalette);
        BTAPI.instance.endPaletteCapture();

        advanceEffects(HANDOFF_FADE_MS);

        expect([gamePalette.get(1).r, gamePalette.get(1).g, gamePalette.get(1).b]).toEqual([255, 255, 255]);
        expect([gamePalette.get(2).r, gamePalette.get(2).g, gamePalette.get(2).b]).toEqual([40, 60, 80]);
    });

    it('applies paletteSet immediately again after handoff', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        BTAPI.instance.setPalette(new Palette(16));
        BTAPI.instance.endPaletteCapture();

        const later = new Palette(16);

        BTAPI.instance.setPalette(later);

        expect(renderPalette()).toBe(later);
    });

    it('fades the splash palette to black when the game never set one', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);
        splashPalette.set(16, Color32.white);

        armWithSplashPalette(splashPalette);

        BTAPI.instance.endPaletteCapture();

        advanceEffects(HANDOFF_FADE_MS);

        expect(splashPalette.get(16).r).toBe(0);
    });

    it('reindexes sprites against the captured game palette, not the splash ramp', () => {
        const splashPalette = new Palette(RAMP_PALETTE_SIZE);

        armWithSplashPalette(splashPalette);

        const gamePalette = new Palette(16);
        const reindexize = vi.fn();
        const mockSheet = { isIndexed: () => true, reindexize } as unknown as SpriteSheet;

        BTAPI.instance.setPalette(gamePalette);
        (BTAPI.instance as unknown as { spriteSheets: Set<SpriteSheet> }).spriteSheets.add(mockSheet);
        BTAPI.instance.spritesRefresh();

        expect(reindexize).toHaveBeenCalledWith(gamePalette);
        expect(reindexize).not.toHaveBeenCalledWith(splashPalette);
    });

    it('drops palette effects started during capture', () => {
        armWithSplashPalette(new Palette(RAMP_PALETTE_SIZE));

        const gamePalette = new Palette(16);
        gamePalette.set(1, Color32.white);

        BTAPI.instance.setPalette(gamePalette);
        BTAPI.instance.paletteFade(new Palette(16), 1000);
        BTAPI.instance.endPaletteCapture();

        // Only the handoff fade survives.
        expect(activeEffectCount()).toBe(1);
    });
});

describe('BTAPI splash lifecycle in init', () => {
    /** Timer handles for frames scheduled by the fake requestAnimationFrame. */
    const pendingFrames: ReturnType<typeof setTimeout>[] = [];

    /**
     * Builds a demo whose `configure()` returns `settings` and whose `init()` runs
     * `initBody` before resolving.
     *
     * @param settings – Extra hardware settings merged over the display defaults.
     * @param initBody – Optional body run inside `init()`.
     * @param initResult – Value `init()` resolves to.
     * @returns A demo suitable for `BTAPI.init`.
     */
    function makeSplashDemo(
        settings: Partial<HardwareSettings>,
        initBody?: () => void | Promise<void>,
        initResult = true,
    ): IBTDemo {
        return {
            configure: vi.fn().mockReturnValue({
                displaySize: new Vector2i(320, 240),
                drawingBufferSize: new Vector2i(640, 480),
                targetFPS: 60,
                ...settings,
            }),
            init: vi.fn(async () => {
                await initBody?.();

                return initResult;
            }),
            update: vi.fn(),
            render: vi.fn(),
        };
    }

    /**
     * Stubs `requestAnimationFrame` and `performance.now` with a fake frame clock,
     * so the splash's own driver runs to completion without sleeping in real time.
     *
     * @param stepMs – Milliseconds each frame advances the clock.
     */
    function driveAnimationFrames(stepMs = 16): void {
        let clock = 0;

        vi.spyOn(performance, 'now').mockImplementation(() => clock);
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                pendingFrames.push(
                    setTimeout(() => {
                        clock += stepMs;
                        callback(clock);
                    }, 0),
                );

                return pendingFrames.length;
            }),
        );
    }

    /**
     * Reads the palette the renderer would resolve indices through.
     *
     * @returns The engine's active palette.
     */
    function renderPalette(): Palette | null {
        return (BTAPI.instance as unknown as { palette: Palette | null }).palette;
    }

    beforeEach(() => {
        resetSingleton();

        pendingFrames.length = 0;

        vi.resetAllMocks();
        installMockNavigatorGPU();
        driveAnimationFrames();
    });

    afterEach(() => {
        // These tests give requestAnimationFrame a real implementation, so unlike the
        // rest of the suite the game loop actually runs. Stop it and drop any frame
        // still queued before the stub goes away: GameLoop.start() nests a second
        // requestAnimationFrame inside the first without rechecking isRunning, so an
        // in-flight outer frame would reach for a global that no longer exists.
        (BTAPI.instance as unknown as { loop: GameLoop | null }).loop?.stop();

        for (const handle of pendingFrames) {
            clearTimeout(handle);
        }

        pendingFrames.length = 0;

        resetSingleton();

        uninstallMockNavigatorGPU();

        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('reports disabled when gating turns the splash off', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: false }), makeMockCanvas());

        expect(BTAPI.instance.getSplashState()).toBe('disabled');
        expect(BTAPI.instance.isSplashVisible()).toBe(false);
    });

    it('lets the game observe fadingIn from its own init()', async () => {
        let observed: string | null = null;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                observed = BTAPI.instance.getSplashState();
            }),
            makeMockCanvas(),
        );

        expect(observed).toBe('fadingIn');
    });

    it('reports done once init() returns', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(BTAPI.instance.isSplashVisible()).toBe(false);
    });

    it('does not start the game loop until the splash is done', async () => {
        let loopExistedDuringInit = true;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                loopExistedDuringInit = BTAPI.instance.isInitialized();
            }),
            makeMockCanvas(),
        );

        expect(loopExistedDuringInit).toBe(false);
    });

    it('extends the hold until a slow init() resolves', async () => {
        let initFinishedAt = -1;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, async () => {
                await new Promise((resolve) => {
                    setTimeout(resolve, 50);
                });

                initFinishedAt = performance.now();
            }),
            makeMockCanvas(),
        );

        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(initFinishedAt).toBeGreaterThan(0);
    });

    it('reaches done even when init() fails', async () => {
        const ok = await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, undefined, false),
            makeMockCanvas(),
        );

        expect(ok).toBe(false);
        expect(BTAPI.instance.getSplashState()).toBe('done');
    });

    it('keeps the splash done and applies paletteSet immediately across a hot re-init', async () => {
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        const replacement = new Palette(16);
        const swapped = await BTAPI.instance.hotReplaceDemo(
            makeSplashDemo({}, () => {
                BTAPI.instance.setPalette(replacement);
            }),
        );

        expect(swapped).toBe(true);
        expect(BTAPI.instance.getSplashState()).toBe('done');
        expect(renderPalette()).toBe(replacement);
    });

    it('runs the splash on the software backend with no dissolve and no thrown error', async () => {
        uninstallMockNavigatorGPU();
        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                constructor(
                    public width: number,
                    public height: number,
                ) {}
                getContext(contextType?: string): OffscreenCanvas2DMock | null {
                    return contextType === '2d' ? makeOffscreenCanvas2dContext() : null;
                }
            },
        );

        // The dissolve is pixel-tier post-process, which the Canvas 2D renderer throws
        // on. Software must get the palette fades alone rather than an exception.
        const ok = await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMock2DCanvas());

        expect(ok).toBe(true);
        expect(BTAPI.instance.getActiveBackend()).toBe('software');
        expect(BTAPI.instance.getSplashState()).toBe('done');
    });

    it('does not tear down the capture until a slow init() settles, even if the splash throws', async () => {
        let resolveInit: (() => void) | undefined;
        const gamePalette = new Palette(16);
        let capturedWhileInitRan: Palette | null | undefined;

        let splashThrew = false;

        // Make the very first splash frame throw, so runSplash rejects long before init().
        vi.spyOn(Splash.prototype, 'advance').mockImplementation(() => {
            splashThrew = true;

            throw new Error('splash frame exploded');
        });

        const demo = makeSplashDemo({ isSplashEnabled: true }, async () => {
            await new Promise<void>((resolve) => {
                resolveInit = resolve;
            });

            // Runs after the splash has already failed. Capture must still be armed,
            // so this is held for the handoff rather than applied straight to screen.
            BTAPI.instance.setPalette(gamePalette);
            capturedWhileInitRan = (BTAPI.instance as unknown as { pendingPalette: Palette | null }).pendingPalette;
        });

        const initPromise = BTAPI.instance.init(demo, makeMockCanvas());

        const tick = async (): Promise<void> => {
            await new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        };

        // Wait until init() reached the demo body AND the splash has already thrown.
        for (let i = 0; i < 500 && !(resolveInit && splashThrew); i++) {
            await tick();
        }

        // Give the rejection time to propagate. This is the window the bug lived in:
        // Promise.all settled here and ran teardown while init() was still pending.
        for (let i = 0; i < 5; i++) {
            await tick();
        }

        resolveInit?.();

        await expect(initPromise).rejects.toThrow('splash frame exploded');

        expect(capturedWhileInitRan).toBe(gamePalette);
        expect((BTAPI.instance as unknown as { isCapturingPalette: boolean }).isCapturingPalette).toBe(false);
    });

    it('keeps the active palette in step with the splash when init() sets none', async () => {
        const activePalette = (): Palette | null => (BTAPI.instance as unknown as { palette: Palette | null }).palette;
        let paletteDuringInit: Palette | null | undefined;

        await BTAPI.instance.init(
            makeSplashDemo({ isSplashEnabled: true }, () => {
                paletteDuringInit = activePalette();
            }),
            makeMockCanvas(),
        );

        // Without this the engine palette stays null while the renderer draws the ramp,
        // and the handoff has nothing to fade down. Assert the size, not just non-null:
        // the point is that it is the splash's own ramp, not merely some palette.
        expect(paletteDuringInit?.size).toBe(RAMP_PALETTE_SIZE);
        expect(activePalette()).not.toBeNull();
        expect(activePalette()?.size).toBe(RAMP_PALETTE_SIZE);
    });

    it('drains input edges at handoff so the skip press never reaches the first update', async () => {
        const endUpdate = vi.spyOn(KeyboardInput.prototype, 'endUpdate');

        // The skip listeners themselves are covered in Splash.dom.test.ts; this asserts
        // the other half of the swallow – that BTAPI consumes the pending edges before
        // the game's first update() can observe them.
        await BTAPI.instance.init(makeSplashDemo({ isSplashEnabled: true }), makeMockCanvas());

        expect(endUpdate).toHaveBeenCalled();
    });
});
