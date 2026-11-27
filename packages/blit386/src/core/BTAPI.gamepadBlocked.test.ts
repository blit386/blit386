/**
 * A page whose Permissions Policy blocks `gamepad` (BT-875): `navigator.getGamepads()` throws
 * SecurityError, yet the real engine still boots, keeps running frames, and warns once.
 */

import { afterEach, expect, it, vi } from 'vitest';

import { startEngine } from '../__test__/engineHarness';
import { BT } from '../BLIT386';

const FRAMES = 10;

let dispose: (() => void) | null = null;

afterEach(() => {
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
});

it('boots and runs frames with gamepads blocked, warning once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const getGamepads = vi.fn((): (Gamepad | null)[] => {
        throw new DOMException('blocked', 'SecurityError');
    });

    const harness = await startEngine({ read: () => BT.gamepadCount, getGamepads });

    dispose = harness.dispose;

    expect(harness.runAt(60, FRAMES)).toBeGreaterThan(0);
    expect(harness.renders).toHaveLength(FRAMES);
    expect(harness.updates.every((count) => count === 0)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(getGamepads).toHaveBeenCalledTimes(1);
});
