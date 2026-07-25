/**
 * Canonical navigation order for demos.
 *
 * Filenames under `src/` are number-free kebab-case slugs (`basics.js`). This list is the
 * single source of truth for prev/next and fuzzy-combobox order — independent of discovery
 * order on disk. When adding a demo, append its slug here (never reintroduce a numeric
 * prefix). When retiring a demo, remove it from this list but keep its vintage mapping
 * forever (see `demo-vintage-urls.js`).
 */
export const DEMO_ORDER = [
    'barebones',
    'basics',
    'primitives',
    'colors',
    'fonts',
    'pixel-art',
    'patterns',
    'camera',
    'sprites',
    'animation',
    'sprite-effects',
    'starfield',
    'tilemap',
    'image-output',
    'game-scene',
    'palette-presets',
    'palette-animation',
    'palette-swap',
    'flurry',
    'palette-cycling',
    'palette-fade',
    'bitmap-font',
    'crt-pipboy',
    'crt-toggle',
    'pointer-basics',
    'pointer-paint',
    'pointer-drag-flick',
    'keyboard-input',
    'snake-game',
    'input-map-remapping',
    'gamepad-input',
    'named-colors',
    'basics-enhanced',
    'logo-lowres',
    'keyboard-diagnostic',
    'audio-basics',
    'music',
    'audio-buses',
    'synth-toy',
    'filip-test-02',
    'hypercube',
];
