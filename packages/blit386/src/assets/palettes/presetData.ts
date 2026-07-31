/**
 * Built-in preset palette data used by {@link Palette} factory methods.
 *
 * Each array stores colors as `RRGGBB` hex strings. Palette construction keeps
 * index `0` reserved for transparency, so preset values are copied starting at
 * palette index `1`.
 */

/** Masks an 8-bit channel before hex formatting. */
const BYTE_MASK = 0xff;

/**
 * Formats three RGB bytes into a compact `RRGGBB` hex string.
 *
 * @param r - Red channel.
 * @param g - Green channel.
 * @param b - Blue channel.
 * @returns RGB color string without a leading `#`.
 */
function rgbToHex(r: number, g: number, b: number): string {
    return [r, g, b].map((channel) => (channel & BYTE_MASK).toString(16).padStart(2, '0')).join('');
}

/** Classic VGA 16-color base entries (indices 0-15). */
const VGA_BASE_HEX = [
    '000000',
    '800000',
    '008000',
    '808000',
    '000080',
    '800080',
    '008080',
    'c0c0c0',
    '808080',
    'ff0000',
    '00ff00',
    'ffff00',
    '0000ff',
    'ff00ff',
    '00ffff',
    'ffffff',
] as const;

/** VGA 6-level per-channel steps for the 216-entry color cube (indices 16-231). */
const VGA_CUBE_CHANNEL_LEVELS = [0, 95, 135, 175, 215, 255] as const;

/** VGA grayscale ramp parameters (indices 232-255). */
const VGA_GRAYSCALE_ENTRY_COUNT = 24;
const VGA_GRAYSCALE_LEVEL_STEP = 10;
const VGA_GRAYSCALE_START_LEVEL = 8;

const VGA_CUBE_HEX = VGA_CUBE_CHANNEL_LEVELS.flatMap((r) =>
    VGA_CUBE_CHANNEL_LEVELS.flatMap((g) => VGA_CUBE_CHANNEL_LEVELS.map((b) => rgbToHex(r, g, b))),
);

const VGA_GRAYSCALE_HEX = Array.from({ length: VGA_GRAYSCALE_ENTRY_COUNT }, (_, index) => {
    const level = VGA_GRAYSCALE_START_LEVEL + index * VGA_GRAYSCALE_LEVEL_STEP;

    return rgbToHex(level, level, level);
});

/** Default VGA 256-color preset data. */
export const VGA_HEX = [...VGA_BASE_HEX, ...VGA_CUBE_HEX, ...VGA_GRAYSCALE_HEX];

/** Commodore 64 16-color preset data. */
// cspell:disable
export const C64_HEX = [
    '000000',
    'ffffff',
    '813338',
    '75cec8',
    '8e3c97',
    '56ac4d',
    '2e2c9b',
    'edf171',
    '8e5029',
    '553800',
    'c46c71',
    '4a4a4a',
    '7b7b7b',
    'a9ff9f',
    '706deb',
    'b2b2b2',
];
// cspell:enable

/** Classic CGA 16-color preset data. */
// cspell:disable
export const CGA_HEX = [
    '000000',
    '0000aa',
    '00aa00',
    '00aaaa',
    'aa0000',
    'aa00aa',
    'aa5500',
    'aaaaaa',
    '555555',
    '5555ff',
    '55ff55',
    '55ffff',
    'ff5555',
    'ff55ff',
    'ffff55',
    'ffffff',
];
// cspell:enable

/** Four-shade Game Boy preset data. */
// cspell:disable
export const GAMEBOY_HEX = ['0f380f', '306230', '8bac0f', '9bbc0f'];
// cspell:enable

/** NES 64-slot preset data. */
// cspell:disable
export const NES_HEX = [
    '7c7c7c',
    '0000fc',
    '0000bc',
    '4428bc',
    '940084',
    'a80020',
    'a81000',
    '881400',
    '503000',
    '007800',
    '006800',
    '005800',
    '004058',
    '000000',
    '000000',
    '000000',
    'bcbcbc',
    '0078f8',
    '0058f8',
    '6844fc',
    'd800cc',
    'e40058',
    'f83800',
    'e45c10',
    'ac7c00',
    '00b800',
    '00a800',
    '00a844',
    '008888',
    '000000',
    '000000',
    '000000',
    'f8f8f8',
    '3cbcfc',
    '6888fc',
    '9878f8',
    'f878f8',
    'f85898',
    'f87858',
    'fca044',
    'f8b800',
    'b8f818',
    '58d854',
    '58f898',
    '00e8d8',
    '787878',
    '000000',
    '000000',
    'fcfcfc',
    'a4e4fc',
    'b8b8f8',
    'd8b8f8',
    'f8b8f8',
    'f8a4c0',
    'f0d0b0',
    'fce0a8',
];
// cspell:enable

/** PICO-8 16-color preset data. */
// cspell:disable
export const PICO8_HEX = [
    '000000',
    '1d2b53',
    '7e2553',
    '008751',
    'ab5236',
    '5f574f',
    'c2c3c7',
    'fff1e8',
    'ff004d',
    'ffa300',
    'ffec27',
    '00e436',
    '29adff',
    '83769c',
    'ff77a8',
    'ffccaa',
];
// cspell:enable
