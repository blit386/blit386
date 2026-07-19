import { describe, expect, it } from 'vitest';

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
});
