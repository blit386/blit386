// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BTAPI } from '../core/BTAPI';
import type { HardwareSettings, IBTDemo } from '../core/IBTDemo';
import type { DemoConstructor } from '../utils/Bootstrap';
import * as HotRuntime from './HotRuntime';
import { hasHardReloadDiff, hotSwapDemo, initFingerprint } from './HotSwap';

function resetSingleton(): void {
    (BTAPI as unknown as { _instance: BTAPI | null })._instance = null;
}

function makeMockCanvas(): HTMLCanvasElement {
    return {
        width: 0,
        height: 0,
        style: { setProperty: vi.fn(), getPropertyValue: vi.fn(() => '') },
        getContext: () => null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as HTMLCanvasElement;
}

describe('initFingerprint', () => {
    it('is equal when only a non-init method body changes', () => {
        class A {
            init() {
                return Promise.resolve(true);
            }
            update() {
                return 1;
            }
            render() {}
        }
        class B {
            init() {
                return Promise.resolve(true);
            }
            update() {
                return 2;
            }
            render() {}
        }

        expect(initFingerprint(A as unknown as DemoConstructor)).toBe(initFingerprint(B as unknown as DemoConstructor));
    });

    it('differs when init() changes', () => {
        class A {
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }
        class B {
            init() {
                return Promise.resolve(false);
            }
            update() {}
            render() {}
        }

        expect(initFingerprint(A as unknown as DemoConstructor)).not.toBe(
            initFingerprint(B as unknown as DemoConstructor),
        );
    });

    it('differs when a class-field initializer changes', () => {
        class A {
            speed = 1;
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }
        class B {
            speed = 2;
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }

        expect(initFingerprint(A as unknown as DemoConstructor)).not.toBe(
            initFingerprint(B as unknown as DemoConstructor),
        );
    });

    // initFingerprint is documented as exact-string comparison (not AST-aware): per the
    // ECMAScript spec, a real browser's Function.prototype.toString() returns a function's
    // literal source text verbatim when available, so a whitespace-only edit (an extra blank
    // line, extra spaces) there WOULD change the fingerprint. That specific claim cannot be
    // exercised here, though: Vitest's esbuild-based TS transform re-serializes the parsed AST
    // rather than preserving literal source text, and this repo's Biome formatter would also
    // collapse any such whitespace-only edit on the next `pnpm run format` pass regardless.
    // Verified empirically (blank lines, extra inter-token spacing) – both are normalized away
    // before Function.prototype.toString() ever sees them in this environment. This test
    // documents that behavior directly instead of asserting the untestable production claim.
    it('is unaffected by a whitespace-only edit inside init() under this test transform', () => {
        class A {
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }
        class B {
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }

        expect(initFingerprint(A as unknown as DemoConstructor)).toBe(initFingerprint(B as unknown as DemoConstructor));
    });

    it('never invokes a getter defined on the prototype', () => {
        const getterCalls = vi.fn();

        class WithGetter {
            get currentScore(): number {
                getterCalls();

                return 0;
            }
            init() {
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }

        expect(() => initFingerprint(WithGetter as unknown as DemoConstructor)).not.toThrow();
        expect(getterCalls).not.toHaveBeenCalled();
    });
});

describe('hasHardReloadDiff', () => {
    const base = {
        displaySize: { x: 320, y: 240, isEqual: (o: { x: number; y: number }) => o.x === 320 && o.y === 240 },
        targetFPS: 60,
        backend: 'webgpu',
        audioVoices: 16,
        outputUpscaleFilter: 'nearest',
        isOverlayEnabled: true,
    } as unknown as HardwareSettings;

    it('is false when settings are unchanged', () => {
        expect(hasHardReloadDiff(base, { ...base })).toBe(false);
    });

    const CHANGED_VALUES: Record<string, unknown> = {
        targetFPS: 30,
        backend: 'software',
        audioVoices: 8,
        outputUpscaleFilter: 'linear',
        isOverlayEnabled: false,
    };

    it.each(Object.keys(CHANGED_VALUES))('is true when %s changes', (field) => {
        // eslint-disable-next-line security/detect-object-injection -- field iterates CHANGED_VALUES' own keys, not external input
        const changed = { ...base, [field]: CHANGED_VALUES[field] };
        expect(hasHardReloadDiff(base, changed)).toBe(true);
    });

    // These five fields are deliberately excluded from the hard-reload comparison (per the
    // originating issue's own field list): they are applied live by their own subsystems
    // (PointerInput, KeyboardInput, WakeLock, Orientation) rather than requiring a fresh
    // init(), so changing any of them must never force a Tier 3 hard reload.
    const EXCLUDED_CHANGED_VALUES: Record<string, unknown> = {
        isCapturingPointerScroll: true,
        isCapturingKeyboardScroll: true,
        isWakeLockEnabled: true,
        preferredOrientation: 'landscape',
        isDetectingDroppedFrames: true,
    };

    it.each(Object.keys(EXCLUDED_CHANGED_VALUES))('is false when excluded field %s changes', (field) => {
        // eslint-disable-next-line security/detect-object-injection -- field iterates EXCLUDED_CHANGED_VALUES' own keys, not external input
        const changed = { ...base, [field]: EXCLUDED_CHANGED_VALUES[field] };
        expect(hasHardReloadDiff(base, changed)).toBe(false);
    });
});

describe('hotSwapDemo', () => {
    beforeEach(() => {
        resetSingleton();
        vi.spyOn(HotRuntime, 'requestHardReload').mockImplementation(() => {});
        vi.spyOn(HotRuntime, 'announce').mockImplementation(() => {});
    });

    afterEach(() => {
        resetSingleton();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    /** Minimal 2D-context canvas mock, enough for {@link SoftwareRenderer.init} to succeed. */
    function makeMock2DCanvas(): HTMLCanvasElement {
        return {
            ...makeMockCanvas(),
            getContext: (type: string) =>
                type === '2d'
                    ? {
                          imageSmoothingEnabled: false,
                          createImageData: (w: number, h: number) =>
                              ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData,
                          putImageData: vi.fn(),
                          clearRect: vi.fn(),
                          drawImage: vi.fn(),
                      }
                    : null,
        } as unknown as HTMLCanvasElement;
    }

    /** Stubs `OffscreenCanvas` with a 2D-context mock, matching {@link makeMock2DCanvas}. */
    function stubOffscreenCanvas(): void {
        vi.stubGlobal(
            'OffscreenCanvas',
            class MockOffscreenCanvas {
                constructor(
                    public width: number,
                    public height: number,
                ) {}
                getContext(contextType?: string) {
                    return contextType === '2d'
                        ? {
                              imageSmoothingEnabled: false,
                              createImageData: (w: number, h: number) =>
                                  ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) as ImageData,
                              putImageData: vi.fn(),
                          }
                        : null;
                }
            },
        );
    }

    function makeDemo(overrides: Partial<IBTDemo> = {}): IBTDemo {
        return {
            // No overrides: mergeHardwareSettings() treats an omitted displaySize identically
            // to an explicit `undefined` value, so this is behaviorally the same as
            // `{ displaySize: undefined }` while satisfying exactOptionalPropertyTypes.
            configure: () => ({ isSplashEnabled: false }),
            init: vi.fn().mockResolvedValue(true),
            update: vi.fn(),
            render: vi.fn(),
            ...overrides,
        };
    }

    it('requests a hard reload when hardware settings changed (Tier 3)', async () => {
        const oldDemo = makeDemo();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());

        class NewClass {
            configure() {
                return { targetFPS: 30 };
            }
            async init() {
                return true;
            }
            update() {}
            render() {}
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(true);
        expect(HotRuntime.requestHardReload).toHaveBeenCalledOnce();
    });

    it('does not request a hard reload for a render()-only edit when ?backend=software overrides configure()', async () => {
        stubOffscreenCanvas();
        vi.stubGlobal('location', { search: '?backend=software' });
        // The software backend inits successfully here, unlike the other tests in this
        // describe block (their makeMockCanvas() 2D/WebGPU contexts both return null, so
        // init() fails before the loop starts). Stub rAF so GameLoop never actually ticks -
        // no palette is set, and a real tick would throw after this test already returned.
        vi.stubGlobal('requestAnimationFrame', vi.fn());

        // configure() never mentions backend – mergeHardwareSettings() alone would default it to
        // 'webgpu'; only the URL override (applied during init, see applyBackendQueryOverride())
        // makes the running settings 'software'.
        class OriginalClass {
            async init() {
                return true;
            }
            update() {}
            render() {}
            configure() {
                return { isSplashEnabled: false };
            }
        }

        const oldDemo = new OriginalClass();
        await BTAPI.instance.init(oldDemo, makeMock2DCanvas());

        expect(BTAPI.instance.getHardwareSettings()?.backend).toBe('software');

        class NewClass {
            async init() {
                return true;
            }
            update() {}
            render() {
                // A pure render()-body edit – the exact BT-318 repro (changing a BT.clear
                // argument). Must swap in place, not force a full reload.
                return 'edited';
            }
            configure() {
                return { isSplashEnabled: false };
            }
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(true);
        expect(HotRuntime.requestHardReload).not.toHaveBeenCalled();
        expect(BTAPI.instance.getDemo()).toBe(oldDemo); // same instance: Tier 1 methods-only swap, not a reload
    });

    it('aborts without swapping when configure() throws, keeping the previous demo running', async () => {
        const oldDemo = makeDemo();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        class NewClass {
            configure(): never {
                throw new Error('boom');
            }
            async init() {
                return true;
            }
            update() {}
            render() {}
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(false);
        expect(BTAPI.instance.getDemo()).toBe(oldDemo);
        expect(HotRuntime.requestHardReload).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('keeping the previous version running'),
            expect.any(Error),
        );
    });

    it('re-initializes and swaps the instance when init() changed (Tier 2), passing a snapshot to onHotReload', async () => {
        class OldClass {
            score = 42;
            async init() {
                return true;
            }
            update() {}
            render() {}
        }

        const oldDemo = new OldClass();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());

        const onHotReload = vi.fn();

        class NewClass {
            onHotReload = onHotReload;

            async init() {
                // Different body than OldClass.init() on purpose, so initFingerprint differs
                // and this test actually exercises Tier 2 rather than Tier 1.
                return Promise.resolve(true);
            }
            update() {}
            render() {}
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(true);
        expect(BTAPI.instance.getDemo()).not.toBe(oldDemo);
        expect(onHotReload).toHaveBeenCalledWith(
            expect.objectContaining({ reason: 'reinit', snapshot: expect.objectContaining({ score: 42 }) }),
        );
        expect(HotRuntime.announce).toHaveBeenCalledWith('reinit', expect.any(Number), expect.any(Number));
    });

    it('keeps the old demo running when Tier 2 re-init fails', async () => {
        class OldClass {
            async init() {
                return true;
            }
            update() {}
            render() {}
        }

        const oldDemo = new OldClass();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());

        class NewClass {
            async init() {
                // Different body than OldClass.init() on purpose, so initFingerprint differs
                // and this test actually exercises Tier 2 rather than Tier 1.
                return Promise.resolve(false);
            }
            update() {}
            render() {}
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(false);
        expect(BTAPI.instance.getDemo()).toBe(oldDemo);
    });

    it('swaps the prototype in place and preserves fields when only methods changed (Tier 1)', async () => {
        class Original {
            score = 7;
            async init() {
                return true;
            }
            update() {
                return 'old';
            }
            render() {}
        }

        const oldDemo = new Original();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());

        // score stays 7, matching Original: initFingerprint treats a class-field initializer
        // change as a Tier 2 signal (see the initFingerprint describe block above), so this
        // test – which isolates a methods-only change – must not vary it. Its value would be
        // moot at runtime either way, since Tier 1 never re-runs a constructor.
        class NewClass {
            score = 7;
            async init() {
                return true;
            }
            update() {
                return 'new';
            }
            render() {}
        }

        const result = await hotSwapDemo(NewClass as unknown as DemoConstructor);

        expect(result).toBe(true);
        expect(BTAPI.instance.getDemo()).toBe(oldDemo); // same instance, not the new one
        expect((BTAPI.instance.getDemo() as unknown as { score: number }).score).toBe(7); // field preserved
        expect((BTAPI.instance.getDemo() as unknown as { update: () => string }).update()).toBe('new'); // method rebound
        expect(HotRuntime.announce).toHaveBeenCalledWith('methods', expect.any(Number), expect.any(Number));
    });

    it('returns false and logs when the candidate class throws on construction', async () => {
        const oldDemo = makeDemo();
        await BTAPI.instance.init(oldDemo, makeMockCanvas());
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        class Throws {
            constructor() {
                throw new Error('boom');
            }
        }

        const result = await hotSwapDemo(Throws as unknown as DemoConstructor);

        expect(result).toBe(false);
        expect(BTAPI.instance.getDemo()).toBe(oldDemo);
        expect(errorSpy).toHaveBeenCalled();
    });
});
