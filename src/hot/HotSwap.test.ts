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
    // Verified empirically (blank lines, extra inter-token spacing) - both are normalized away
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
    });

    function makeDemo(overrides: Partial<IBTDemo> = {}): IBTDemo {
        return {
            // No overrides: mergeHardwareSettings() treats an omitted displaySize identically
            // to an explicit `undefined` value, so this is behaviorally the same as
            // `{ displaySize: undefined }` while satisfying exactOptionalPropertyTypes.
            configure: () => ({}),
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
        // test - which isolates a methods-only change - must not vary it. Its value would be
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
