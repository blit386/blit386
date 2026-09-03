import type { BitmapFont } from '../assets/BitmapFont';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import { OVERLAY_DIVIDER_GAP_PX, SYSTEM_CHAR_ADVANCE } from './constants';
import type { OverlayDrawTarget } from './OverlayDrawTarget';

/**
 * Matches demo registry titles, both the legacy numbered form (`BLIT386 Demo 006 - Patterns`)
 * and the current number-free form (`BLIT386 Demo – Hypercube`). Accepts an ASCII hyphen or an
 * en dash as the separator, and a fixed-shape optional numbering segment (three digits, or the
 * legacy `00a` marker) rather than arbitrary text – this mirrors the already-bounded
 * `PAGE_TITLE_PREFIX_PATTERN` in demos' `plugins/demo-registry.js`.
 */
// The nested (?:...)? group is fixed-width ([0-9]{3} or the literal 00a), so there is no
// unbounded/ambiguous repetition to backtrack over; the static analyzer flags the group shape
// itself, not an actual exponential-blowup pattern.
// eslint-disable-next-line security/detect-unsafe-regex -- see comment above
const REGISTRY_TITLE_PATTERN = /^BLIT386 Demo (?:(?:[0-9]{3}|00a) )?[-–]\s*(.+)$/;

/** Trailing tracking column inside each 6 px glyph cell (glyphs ink 5 of the 6 px advance). */
const GLYPH_TRACKING_PX = 1;

/**
 * Nominal advance from one segment's end to the next segment's start: the divider line
 * plus {@link OVERLAY_DIVIDER_GAP_PX} of visual space on each side, minus the previous
 * segment's built-in trailing tracking.
 */
const SEGMENT_SEPARATOR_ADVANCE_PX = 2 * OVERLAY_DIVIDER_GAP_PX;

/** Reused divider fill rect; {@link OverlayDrawTarget.drawBarFill} consumes rects immediately. */
const dividerScratch = new Rect2i(0, 0, 1, 0);

/** Reused segment draw position; {@link OverlayDrawTarget.drawLabel} consumes positions immediately. */
const segmentScratch = new Vector2i(0, 0);

/**
 * Left-pads an already-formatted numeric segment with spaces to a fixed column width.
 *
 * Engine-composed rows join several of these segments with `|` dividers positioned by
 * cumulative character count (see {@link drawOverlayLabelWithDividers}). Without a fixed width,
 * a value's digit count changing from one frame to the next (for example `8.3` becoming `16.7`,
 * or an update-step suffix like `x3` appearing and disappearing) shifts every later segment on
 * the row. Padding every such field to the same width up front keeps divider and segment
 * positions stable regardless of the underlying value.
 *
 * @param text – Already-formatted field text, e.g. `'8.3'`, `'60'`, or `'x3'` (may be empty).
 * @param width – Fixed column width in characters.
 * @returns `text` padded with leading spaces to at least `width` characters.
 */
export function padOverlayField(text: string, width: number): string {
    return text.padStart(width, ' ');
}

/**
 * Turns the browser page title into a short top-left overlay label.
 *
 * @param pageTitle – Browser document title when available.
 * @returns Short label for the top-left bar (registry titles such as
 *   `BLIT386 Demo 002 - Primitives` become `Primitives Demo`).
 */
export function resolveOverlayTopLeftLabel(pageTitle: string | undefined): string {
    const raw = typeof pageTitle === 'string' ? pageTitle.trim() : '';

    if (raw.length === 0) {
        return 'Demo';
    }

    const match = raw.match(REGISTRY_TITLE_PATTERN);

    if (match) {
        return `${match[1]} Demo`;
    }

    return raw;
}

/**
 * Draws an engine-composed overlay label, rendering each `|` separator as a 1 px
 * full-row-height vertical divider in the gap palette index instead of a text glyph.
 *
 * Only engine-composed labels route through this helper: `|` is treated as a separator
 * marker with no surrounding spaces. The text is drawn as individual segments so each
 * divider line keeps {@link OVERLAY_DIVIDER_GAP_PX} of visual space between itself and
 * the inked glyphs on both sides. User-supplied strings (demo title, custom rows) keep
 * literal pipes via plain {@link OverlayDrawTarget.drawLabel}. Measure the rendered
 * width with {@link overlayDividerLabelWidth}.
 *
 * @param target – Overlay draw target.
 * @param font – System bitmap font.
 * @param pos – Label draw position.
 * @param text – Engine-composed label; every `|` becomes a drawn divider.
 * @param rowRect – Row band rect the dividers span vertically.
 * @param textPaletteOffset – Palette offset for the label glyphs.
 * @param gapIndex – Palette index for divider fills (same as row gaps).
 */
export function drawOverlayLabelWithDividers(
    target: OverlayDrawTarget,
    font: BitmapFont,
    pos: Vector2i,
    text: string,
    rowRect: Rect2i,
    textPaletteOffset: number,
    gapIndex: number,
): void {
    if (!text.includes('|')) {
        target.drawLabel(font, pos, text, textPaletteOffset);

        return;
    }

    let segmentX = pos.x;
    let segmentStart = 0;

    segmentScratch.y = pos.y;

    for (;;) {
        const separatorIndex = text.indexOf('|', segmentStart);
        const isLastSegment = separatorIndex === -1;
        const segment = isLastSegment ? text.slice(segmentStart) : text.slice(segmentStart, separatorIndex);

        segmentScratch.x = segmentX;

        target.drawLabel(font, segmentScratch, segment, textPaletteOffset);

        if (isLastSegment) {
            break;
        }

        const segmentEnd = segmentX + segment.length * SYSTEM_CHAR_ADVANCE;

        dividerScratch.set(segmentEnd - GLYPH_TRACKING_PX + OVERLAY_DIVIDER_GAP_PX, rowRect.y, 1, rowRect.height);

        target.drawBarFill(dividerScratch, gapIndex);

        segmentX = segmentEnd + SEGMENT_SEPARATOR_ADVANCE_PX;
        segmentStart = separatorIndex + 1;
    }
}

/**
 * Nominal advance width of an engine-composed label rendered by
 * {@link drawOverlayLabelWithDividers}: segment glyph advances plus
 * {@link SEGMENT_SEPARATOR_ADVANCE_PX} per divider.
 *
 * @param text – Engine-composed label with `|` separator markers.
 * @returns Rendered width in pixels (same convention as `length * SYSTEM_CHAR_ADVANCE`
 *   for plain text, including the last glyph's trailing tracking).
 */
export function overlayDividerLabelWidth(text: string): number {
    let dividerCount = 0;

    for (let pipeIndex = text.indexOf('|'); pipeIndex !== -1; pipeIndex = text.indexOf('|', pipeIndex + 1)) {
        dividerCount++;
    }

    return (text.length - dividerCount) * SYSTEM_CHAR_ADVANCE + dividerCount * SEGMENT_SEPARATOR_ADVANCE_PX;
}
