// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { normalizeAssetUrl } from '../utils/HotReloadUrl';
import { resolveServedUrl } from './assets';

// The plugin's broadcast URL and the engine's registry key are built on opposite sides of the
// HMR socket; a save only lands when the two produce the same string for the same file.
describe('resolveServedUrl against the engine registry key', () => {
    const serve = { base: '/', publicDir: '/project/public', root: '/project' };

    it.each(['hero@2x.png', 'hero+1.png', 'a,b;c=d&e$f:g.png', 'my hero.png', 'hero-é.png'])(
        'broadcasts %s under the key the engine cached it under',
        (name) => {
            expect(resolveServedUrl(`/project/public/sprites/${name}`, serve)).toBe(
                normalizeAssetUrl(`/sprites/${name}`),
            );
        },
    );
});
