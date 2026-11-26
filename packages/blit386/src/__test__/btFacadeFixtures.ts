/**
 * Shared fixtures for the `src/bt/*.test.ts` facade tests: a minimal `HardwareSettings` and a wrapper that runs a
 * callback with the dev-only error panel container in the DOM.
 */

import type { HardwareSettings } from '../core/IBTDemo';
import { DEFAULT_CONTAINER_ID } from '../utils/BootstrapHelpers';
import { Vector2i } from '../utils/Vector2i';

export const mockHardwareSettings = (displaySize = new Vector2i(320, 240), targetFPS = 60): HardwareSettings => ({
    displaySize,
    targetFPS,
});

function setupErrorContainer(): HTMLDivElement {
    // The error panel is dev-only (BT-765); release builds only log.
    globalThis.__BLIT386_DEV__ = true;

    const existingContainer = document.getElementById(DEFAULT_CONTAINER_ID);

    if (existingContainer instanceof HTMLDivElement) {
        existingContainer.textContent = '';

        return existingContainer;
    }

    const container = document.createElement('div');

    container.id = DEFAULT_CONTAINER_ID;
    document.body.appendChild(container);

    return container;
}

function clearErrorContainer(): void {
    globalThis.__BLIT386_DEV__ = undefined;

    const container = document.getElementById(DEFAULT_CONTAINER_ID);

    if (container?.parentElement) {
        container.parentElement.removeChild(container);
    }
}

export async function withErrorContainer(callback: () => void | Promise<void>): Promise<void> {
    setupErrorContainer();

    try {
        await callback();
    } finally {
        clearErrorContainer();
    }
}
