import { describe, expect, it, vi } from 'vitest';

import { ASSET_CHANGED_EVENT } from '../hot/protocol';
import { blit386 } from './index';
import { INJECTION_MARKER } from './transform';

/**
 * Vite calls plugin hooks with `this` bound to a plugin context (for `hotUpdate`, an object
 * exposing `.environment.name`). The plugin object under test uses method shorthand relying on
 * that binding, so tests must invoke hooks the same way Vite does, via `.call()`/`.apply()`.
 */
function invokeHook(hook: unknown, thisArg: unknown, ...args: unknown[]): unknown {
    return (hook as (...a: unknown[]) => unknown).apply(thisArg, args);
}

describe('blit386', () => {
    it('is a dev-only plugin named blit386', () => {
        const plugin = blit386();

        expect(plugin.name).toBe('blit386');
        expect(plugin.apply).toBe('serve');
    });

    describe('transform', () => {
        const code = "import { bootstrap } from 'blit386';\nbootstrap(Demo);\n";

        it('injects the snippet into a matching module', () => {
            const plugin = blit386();

            const result = invokeHook(plugin.transform, undefined, code, '/project/src/main.ts') as {
                code: string;
            } | null;

            expect(result).not.toBeNull();
            expect(result?.code).toContain(INJECTION_MARKER);
        });

        it('skips a non-matching module', () => {
            const plugin = blit386();

            const result = invokeHook(plugin.transform, undefined, 'export const x = 1;\n', '/project/src/other.ts');

            expect(result).toBeNull();
        });

        it('honors a custom include predicate', () => {
            const plugin = blit386({ include: () => false });

            const result = invokeHook(plugin.transform, undefined, code, '/project/src/main.ts');

            expect(result).toBeNull();
        });

        it('reports a syntax error through this.error() for a broken .js entry, instead of injecting', () => {
            const plugin = blit386();
            const brokenCode = "import { bootstrap } from 'blit386';\nconst x = ;\nbootstrap(Demo);\n";
            const error = vi.fn(() => {
                throw new Error('mocked this.error()');
            });

            expect(() => invokeHook(plugin.transform, { error }, brokenCode, '/project/src/001-basics.js')).toThrow(
                'mocked this.error()',
            );
            expect(error).toHaveBeenCalledExactlyOnceWith(
                expect.stringContaining('Unexpected token'),
                expect.any(Number),
            );
        });

        it('still injects a syntactically valid .ts entry without calling this.error()', () => {
            const plugin = blit386();
            const error = vi.fn();

            const result = invokeHook(plugin.transform, { error }, code, '/project/src/main.ts') as {
                code: string;
            } | null;

            expect(error).not.toHaveBeenCalled();
            expect(result?.code).toContain(INJECTION_MARKER);
        });
    });

    describe('hotUpdate', () => {
        it('resolves assetDirs against the root from configResolved', () => {
            const plugin = blit386();
            const send = vi.fn();

            invokeHook(plugin.configResolved, undefined, { root: '/project' });

            const result = invokeHook(
                plugin.hotUpdate,
                { environment: { name: 'client' } },
                { file: '/project/public/hero.png', server: { ws: { send } } },
            );

            expect(result).toEqual([]);
            expect(send).toHaveBeenCalledExactlyOnceWith({
                type: 'custom',
                event: ASSET_CHANGED_EVENT,
                data: { url: '/hero.png', type: 'image', timestamp: expect.any(Number) },
            });
        });

        it('applies user-provided assetDirs and assetTypes', () => {
            const plugin = blit386({ assetDirs: ['assets'], assetTypes: { '.svg': 'image' } });
            const send = vi.fn();

            invokeHook(plugin.configResolved, undefined, { root: '/project' });

            const result = invokeHook(
                plugin.hotUpdate,
                { environment: { name: 'client' } },
                { file: '/project/assets/icon.svg', server: { ws: { send } } },
            );

            expect(result).toEqual([]);
            expect(send).toHaveBeenCalledExactlyOnceWith({
                type: 'custom',
                event: ASSET_CHANGED_EVENT,
                data: { url: '/icon.svg', type: 'image', timestamp: expect.any(Number) },
            });
        });

        it('ignores non-client environments', () => {
            const plugin = blit386();
            const send = vi.fn();

            invokeHook(plugin.configResolved, undefined, { root: '/project' });

            const result = invokeHook(
                plugin.hotUpdate,
                { environment: { name: 'ssr' } },
                { file: '/project/public/hero.png', server: { ws: { send } } },
            );

            expect(result).toBeUndefined();
            expect(send).not.toHaveBeenCalled();
        });
    });
});
