import { describe, expect, it, vi } from 'vitest';

import { ASSET_CHANGED_EVENT } from '../hot/protocol';
import { assetTypeForFile, handleAssetHotUpdate, resolveAssetUrl } from './assets';

describe('resolveAssetUrl', () => {
    it('maps a file under an asset dir to a leading-slash relative URL', () => {
        expect(resolveAssetUrl('/project/public/sprites/hero.png', ['/project/public'])).toBe('/sprites/hero.png');
    });

    it('returns null for a file outside every asset dir', () => {
        expect(resolveAssetUrl('/project/src/main.ts', ['/project/public'])).toBeNull();
    });

    it('returns null for the asset dir itself (no relative remainder)', () => {
        expect(resolveAssetUrl('/project/public', ['/project/public'])).toBeNull();
    });

    it('checks multiple asset dirs in order', () => {
        expect(resolveAssetUrl('/project/assets/sfx/blip.wav', ['/project/public', '/project/assets'])).toBe(
            '/sfx/blip.wav',
        );
    });
});

describe('assetTypeForFile', () => {
    const assetTypes = new Map([
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
    const assetTypes = new Map([['.png', 'image']]);

    it('sends a custom asset-changed event for a recognized extension', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/hero.png',
            environmentName: 'client',
            send,
            assetDirs,
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

    it('sends a full-reload for an unrecognized extension when enabled', () => {
        const send = vi.fn();

        const result = handleAssetHotUpdate({
            file: '/project/public/data.json',
            environmentName: 'client',
            send,
            assetDirs,
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
            assetTypes,
            fullReloadOnUnknownAssets: true,
        });

        expect(result).toBeUndefined();
        expect(send).not.toHaveBeenCalled();
    });
});
