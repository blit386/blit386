import { describe, expect, it } from 'vitest';

import type { AssetChangedPayload } from './protocol';
import { ASSET_CHANGED_EVENT, HOT_RELOAD_DOM_EVENT } from './protocol';

describe('protocol', () => {
    it('exposes a distinct, namespaced event name for asset changes', () => {
        expect(ASSET_CHANGED_EVENT).toBe('blit386:asset-changed');
    });

    it('exposes a distinct, namespaced event name for hot reload broadcasts', () => {
        expect(HOT_RELOAD_DOM_EVENT).toBe('blit386:hot-reload');
    });

    it('uses two different event names', () => {
        expect(ASSET_CHANGED_EVENT).not.toBe(HOT_RELOAD_DOM_EVENT);
    });

    it('describes the expected payload shape', () => {
        const payload: AssetChangedPayload = { url: 'sprites/hero.png', type: 'image', timestamp: 1700000000000 };

        expect(payload).toEqual({ url: 'sprites/hero.png', type: 'image', timestamp: 1700000000000 });
    });
});
