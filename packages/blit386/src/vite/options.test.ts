import { describe, expect, it } from 'vitest';

import { defaultInclude, resolveOptions } from './options';

describe('defaultInclude', () => {
    it('matches a .ts module id under /src/', () => {
        expect(defaultInclude('/project/src/main.ts')).toBe(true);
    });

    it.each(['.js', '.ts', '.mjs', '.mts'])('matches the %s extension', (ext) => {
        expect(defaultInclude(`/project/src/main${ext}`)).toBe(true);
    });

    it('does not match a module id outside /src/', () => {
        expect(defaultInclude('/project/lib/main.ts')).toBe(false);
    });

    it('does not match an unsupported extension', () => {
        expect(defaultInclude('/project/src/styles.css')).toBe(false);
    });

    it('strips a query suffix before matching', () => {
        expect(defaultInclude('/project/src/main.ts?raw')).toBe(true);
    });
});

describe('resolveOptions', () => {
    it('applies every default when called with no user options', () => {
        const resolved = resolveOptions(undefined, '/project');

        expect(resolved.assetDirs).toEqual(['/project/public']);
        expect(resolved.fullReloadOnUnknownAssets).toBe(true);
        expect(resolved.include).toBe(defaultInclude);
        expect(resolved.assetTypes.get('.png')).toBe('image');
        expect(resolved.assetTypes.get('.gif')).toBe('image');
        expect(resolved.assetTypes.get('.webp')).toBe('image');
        expect(resolved.assetTypes.get('.jpg')).toBe('image');
        expect(resolved.assetTypes.get('.jpeg')).toBe('image');
        expect(resolved.assetTypes.get('.wav')).toBe('audio');
        expect(resolved.assetTypes.get('.mp3')).toBe('audio');
        expect(resolved.assetTypes.get('.ogg')).toBe('audio');
        expect(resolved.assetTypes.get('.flac')).toBe('audio');
        expect(resolved.assetTypes.get('.btfont')).toBe('font');
    });

    it('resolves assetDirs against the given root', () => {
        const resolved = resolveOptions({ assetDirs: ['static', 'assets'] }, '/project');

        expect(resolved.assetDirs).toEqual(['/project/static', '/project/assets']);
    });

    it('merges user assetTypes over the defaults rather than replacing them', () => {
        const resolved = resolveOptions({ assetTypes: { '.svg': 'image' } }, '/project');

        expect(resolved.assetTypes.get('.svg')).toBe('image');
        expect(resolved.assetTypes.get('.png')).toBe('image');
    });

    it('uses a user-provided include predicate verbatim', () => {
        const include = () => false;
        const resolved = resolveOptions({ include }, '/project');

        expect(resolved.include).toBe(include);
    });

    it('uses a user-provided fullReloadOnUnknownAssets value', () => {
        const resolved = resolveOptions({ fullReloadOnUnknownAssets: false }, '/project');

        expect(resolved.fullReloadOnUnknownAssets).toBe(false);
    });
});
