/**
 * The known engine migrations, in date order.
 *
 * This is the structured form of `blit386`'s `docs/deprecations.md`: each entry mirrors one dated section of that
 * timeline. Keep the two in sync until the engine generates `deprecations.md` from this data (see the design doc,
 * section 4.6). New games rarely need these, but a project that upgrades across the rename can use `blit migrate`.
 */

import { compareVersions } from '../env';
import { HOT_RELOAD_SINCE } from './enableHotReload';
import type { Migration } from './types';

/**
 * Migrations shipped with this kit, oldest first.
 *
 * Safety: `BT.*` calls and the engine's distinctive object keys (`overlay*`, `detectDroppedFrames`) auto-apply. Renames
 * whose old name is generic enough to appear in unrelated code - common method words (`equals`, `contains`,
 * `intersects`, `tick`) and generic bootstrap keys (`canvasId`, `containerId`, `waitForDOMReady`) - are marked `review`:
 * located and reported with a suggestion, but never rewritten automatically.
 */
export const MIGRATIONS: readonly Migration[] = [
    {
        id: '2026-06-16-package-rename',
        date: '2026-06-16',
        since: '1.1.0',
        summary:
            'The engine package was renamed from blit-tech to blit386. Update the import path and package.json dependency.',
        renames: [
            {
                from: 'blit-tech',
                to: 'blit386',
                kind: 'importPath',
                safety: 'auto',
                note: 'Package rename: update the import/require string and your package.json dependency key.',
            },
        ],
    },
    {
        id: '2026-05-31-api-naming',
        date: '2026-05-31',
        since: '1.0.0',
        summary:
            'Input, overlay, and helper names switched to is-prefixed, question-style names (for example buttonDown became isDown).',
        renames: [
            // BT namespace input queries (receiver-anchored, safe).
            {
                from: 'pointerPosValid',
                to: 'isPointerActive',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'buttonDown',
                to: 'isDown',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'buttonPressed',
                to: 'isPressed',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'buttonReleased',
                to: 'isReleased',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'gamepadConnected',
                to: 'isGamepadConnected',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'keyDown',
                to: 'isKeyDown',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'keyPressed',
                to: 'isKeyPressed',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },
            {
                from: 'keyReleased',
                to: 'isKeyReleased',
                kind: 'memberCall',
                safety: 'auto',
                receiver: 'BT',
            },

            // HardwareSettings configure() flags (distinctive object keys).
            {
                from: 'detectDroppedFrames',
                to: 'isDetectingDroppedFrames',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayEnabled',
                to: 'isOverlayEnabled',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayVisibleAtStart',
                to: 'isOverlayVisibleAtStart',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayToggleHintVisible',
                to: 'isOverlayToggleHintVisible',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayToggleEnabled',
                to: 'isOverlayToggleEnabled',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayPaletteView',
                to: 'isOverlayPaletteEnabled',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayTimingChart',
                to: 'isOverlayTimingChartEnabled',
                kind: 'objectKey',
                safety: 'auto',
            },
            {
                from: 'overlayRendererDiagnosticsBar',
                to: 'isOverlayRendererDiagnosticsBarEnabled',
                kind: 'objectKey',
                safety: 'auto',
            },

            // BootstrapOptions fields. These keys are generic enough to appear on unrelated objects, so they are
            // reported for review rather than rewritten globally.
            {
                from: 'canvasId',
                to: 'canvasID',
                kind: 'objectKey',
                safety: 'review',
                note: 'bootstrap() option; "canvasId" is a generic key, so confirm the context before renaming.',
            },
            {
                from: 'containerId',
                to: 'containerID',
                kind: 'objectKey',
                safety: 'review',
                note: 'bootstrap() option; "containerId" is a generic key, so confirm the context before renaming.',
            },
            {
                from: 'waitForDOMReady',
                to: 'isWaitingForDOMReady',
                kind: 'objectKey',
                safety: 'review',
                note: 'bootstrap() option; confirm the context before renaming.',
            },

            // Class method aliases. Distinctive names auto-apply; common-word names need review.
            {
                from: 'isIndexized',
                to: 'isIndexed',
                kind: 'method',
                safety: 'auto',
                note: 'SpriteSheet',
            },
            {
                from: 'containsXY',
                to: 'isContainingXY',
                kind: 'method',
                safety: 'auto',
                note: 'Rect2i',
            },
            {
                from: 'intersectionTo',
                to: 'intersectTo',
                kind: 'method',
                safety: 'auto',
                note: 'Rect2i',
            },
            {
                from: 'tick',
                to: 'fireIfElapsed',
                kind: 'method',
                safety: 'review',
                note: 'Timer.tick(); "tick" is too common to rewrite automatically.',
            },
            {
                from: 'equals',
                to: 'isEqual',
                kind: 'method',
                safety: 'review',
                note: 'Vector2i / Rect2i / Color32; "equals" is too common to rewrite automatically.',
            },
            {
                from: 'contains',
                to: 'isContaining',
                kind: 'method',
                safety: 'review',
                note: 'Rect2i.contains(); "contains" is too common to rewrite automatically.',
            },
            {
                from: 'intersects',
                to: 'isIntersecting',
                kind: 'method',
                safety: 'review',
                note: 'Rect2i.intersects(); "intersects" is too common to rewrite automatically.',
            },
        ],
    },
    {
        id: '2026-07-23-hot-reload-vite-plugin',
        date: '2026-07-23',
        since: HOT_RELOAD_SINCE,
        summary:
            'Dev hot reload: wire the blit386() Vite plugin so code and public/ asset edits keep the game running. Applied by blit migrate / blit upgrade as a vite.config rewrite (not a source rename).',
        renames: [],
    },
];

/** Migrations whose new names are canonical at or below `version` (oldest first). */
export function migrationsThrough(version: string): Migration[] {
    return MIGRATIONS.filter((m) => compareVersions(version, m.since) >= 0);
}
