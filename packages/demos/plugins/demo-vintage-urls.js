/**
 * Persistent mapping from every historical demo slug to its current slug.
 *
 * Keys are never removed. On a future rename, update the target (and add a new entry for
 * the slug being vacated). Structurally separate from `DEMO_ORDER` in `demo-order.js` —
 * order is navigation; this file is permanent URL compatibility.
 *
 * Targets that no longer exist on disk (retired demos) stay listed for history; redirect
 * generation skips keys whose current slug is not in the live registry.
 */
export const VINTAGE_URLS = {
    '00a-barebones': 'barebones',
    '001-basics': 'basics',
    '002-primitives': 'primitives',
    '003-colors': 'colors',
    '004-fonts': 'fonts',
    '005-pixel-art': 'pixel-art',
    '006-patterns': 'patterns',
    '007-camera': 'camera',
    '008-sprites': 'sprites',
    '009-animation': 'animation',
    '010-sprite-effects': 'sprite-effects',
    '011-starfield': 'starfield',
    '012-tilemap': 'tilemap',
    '013-image-output': 'image-output',
    '014-game-scene': 'game-scene',
    '015-palette-presets': 'palette-presets',
    '016-palette-animation': 'palette-animation',
    '017-palette-swap': 'palette-swap',
    '018-flurry': 'flurry',
    '019-palette-cycling': 'palette-cycling',
    '020-palette-fade': 'palette-fade',
    // Retired — number stays unused; no `src/error-preview.js` on disk.
    '021-error-preview': 'error-preview',
    '022-bitmap-font': 'bitmap-font',
    '023-crt-pipboy': 'crt-pipboy',
    '024-crt-toggle': 'crt-toggle',
    '025-pointer-basics': 'pointer-basics',
    '026-pointer-paint': 'pointer-paint',
    '027-pointer-drag-flick': 'pointer-drag-flick',
    '028-keyboard-input': 'keyboard-input',
    '029-snake-game': 'snake-game',
    '030-input-map-remapping': 'input-map-remapping',
    '031-gamepad-input': 'gamepad-input',
    '032-named-colors': 'named-colors',
    '033-basics-enhanced': 'basics-enhanced',
    '034-logo-lowres': 'logo-lowres',
    '035-keyboard-diagnostic': 'keyboard-diagnostic',
    '036-audio-basics': 'audio-basics',
    '037-music': 'music',
    '038-audio-buses': 'audio-buses',
    '041-synth-toy': 'synth-toy',
    '042-filip-test-02': 'filip-test-02',
};
