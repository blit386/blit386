import { describe, expect, it, vi } from 'vitest';

import { ASSET_CHANGED_EVENT } from '../hot/protocol';
import { assetTypeForFile, handleAssetHotUpdate, resolveServedUrl } from './assets';
import type { AssetKind } from './options';

describe('assetTypeForFile', () => {
    const assetTypes = new Map<string, AssetKind>([
        ['.png', 'image'],
        ['.wav', 'audio'],
        ['.btfont', 'font'],
    ]);

    it('matches a known extension case-insensitively', () => {
        expect(assetTypeForFile('/x/HERO.PNG', assetTypes)).toBe('image');
    });

    it('returns null for an unregistered extension', () => {
        expect(assetTypeForFile('/x/notes.txt', assetTypes)).toBeNull();
    });
});

describe('handleAssetHotUpdate', () => {
    const assetDirs = ['/project/public'];
    const serve = { base: '/', publicDir: '/project/public', root: '/project' };
    const assetTypes = new Map<string, AssetKind>([['.png', 'image']]);

    it('sends a custom asset-changed event for a recognized extension', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/hero.png',
            environmentName: 'client',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        expect(result).toEqual([]);
        expect(send).toHaveBeenCalledExactlyOnceWith({
            type: 'custom',
            event: ASSET_CHANGED_EVENT,
            data: { url: '/hero.png', type: 'image', timestamp: expect.any(Number) },
        });
    });

    it.each(['/project/public/.DS_Store', '/project/public/sprites/.hero.png.swp'])(
        'ignores the hidden file %s even when full reload on unknown assets is enabled',
        (file) => {
            const send = vi.fn();

            const result = handleAssetHotUpdate({
                file,
                environmentName: 'client',
                send,
                assetDirs,
                serve,
                assetTypes,
                fullReloadOnUnknownAssets: true,
            });

            expect(result).toBeUndefined();
            expect(send).not.toHaveBeenCalled();
        },
    );

    it('sends a full-reload for an unrecognized extension when enabled', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/data.json',
            environmentName: 'client',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        expect(result).toEqual([]);
        expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'full-reload' });
    });

    it('defers to default handling for an unrecognized extension when disabled', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/data.json',
            environmentName: 'client',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: false,
        });

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });

    it('ignores non-client environments', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/hero.png',
            environmentName: 'ssr',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });

    it('defers for a file outside every asset dir', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/src/main.ts',
            environmentName: 'client',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });
});

describe('resolveServedUrl', () => {
    const serve = { base: '/', publicDir: '/project/public', root: '/project' };

    it('percent-encodes each path segment', () => {
        expect(resolveServedUrl('/project/public/my sprites/hero #1.png', serve)).toBe('/my%20sprites/hero%20%231.png');
    });

    it('uses only the pathname of an absolute base URL', () => {
        expect(resolveServedUrl('/project/public/hero.png', { ...serve, base: 'https://cdn.example/game' })).toBe(
            '/game/hero.png',
        );
    });

    it('returns null for a file outside both publicDir and root', () => {
        expect(resolveServedUrl('/elsewhere/hero.png', serve)).toBeNull();
    });
});

// The watched-dir cases of the removed resolveAssetUrl tests, carried over to its only caller.
describe('handleAssetHotUpdate watched-dir check', () => {
    const serve = { base: '/', publicDir: '/project/public', root: '/project' };
    const assetTypes = new Map<string, AssetKind>([
        ['.png', 'image'],
        ['.wav', 'audio'],
    ]);

    function update(file: string, assetDirs: readonly string[]) {
        const send = vi.fn();
        const result = handleAssetHotUpdate({
            file,
            environmentName: 'client',
            send,
            assetDirs,
            serve,
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        return { result, send };
    }

    it('broadcasts a file under an asset dir', () => {
        const { result, send } = update('/project/public/sprites/hero.png', ['/project/public']);

        expect(result).toEqual([]);
        expect(send).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ data: expect.objectContaining({ url: '/sprites/hero.png' }) }),
        );
    });

    it('defers for a file outside every asset dir, even one Vite serves from the root', () => {
        const { result, send } = update('/project/src/main.ts', ['/project/public']);

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });

    it('defers for the asset dir itself (no path inside it)', () => {
        const { result, send } = update('/project/public', ['/project/public']);

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });

    it('checks every asset dir, not only the first', () => {
        const { result, send } = update('/project/assets/sfx/blip.wav', ['/project/public', '/project/assets']);

        expect(result).toEqual([]);
        expect(send).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ data: expect.objectContaining({ url: '/assets/sfx/blip.wav', type: 'audio' }) }),
        );
    });
});
