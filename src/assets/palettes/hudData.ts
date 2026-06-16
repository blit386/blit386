/**
 * Built-in HUD palette preset data used by {@link Palette.applyHUD}.
 *
 * Six named UI color slots applied contiguously starting at a caller-supplied
 * start index. Values match the most common pattern seen across blit386 demos:
 * white text, a dark background, label gray, golden header, dim gray for FPS,
 * and a slate blue for code snippets.
 */

// cspell:disable

/**
 * The six built-in HUD UI color slots in application order.
 *
 * Each entry is a `{ hex, name }` pair. The `hex` value is an `RRGGBB` string
 * without a leading `#`, matching the format used by {@link Color32.fromHex}.
 * The `name` is the alias registered by `palette.setNamed()` so callers can
 * resolve the slot index later via `palette.getNamed('hud_white')` etc.
 */
export const HUD_SLOTS = [
    { hex: 'ffffff', name: 'hud_white' },
    { hex: '1e1428', name: 'hud_bg' },
    { hex: 'c8c8c8', name: 'hud_label' },
    { hex: 'ffdc64', name: 'hud_header' },
    { hex: '646464', name: 'hud_dim' },
    { hex: '6496c8', name: 'hud_code' },
] as const;

// cspell:enable
