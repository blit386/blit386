/**
 * Shared setup for the shared UI kit's node:test suites: a minimal fake palette (just enough
 * surface for applyTheme() to write into) and a ready UiContext built from it. Used by
 * ui-core.test.mjs, ui-widgets.test.mjs, and ui-dpad.test.mjs, which all need the same
 * "theme applied, fresh context" starting point.
 *
 * ui-theme.test.mjs keeps its own richer fake palette (it inspects the slots/names applyTheme()
 * wrote), so it is not consolidated here.
 */

import { UiContext } from '../ui-core.js';
import { applyTheme } from '../ui-theme.js';

/**
 * @returns {{ size: number, set: Function, setNamed: Function }}
 */
function createFakePalette() {
    return { size: 256, set() {}, setNamed() {} };
}

/**
 * Applies the theme (required before any UiContext.begin() call) and returns a fresh
 * UiContext - fresh per test, so no per-instance state (hitRects, pointer, tickPointer,
 * commands) leaks between cases.
 *
 * @returns {UiContext}
 */
function createReadyContext() {
    applyTheme(createFakePalette());

    return new UiContext();
}

export { createFakePalette, createReadyContext };
