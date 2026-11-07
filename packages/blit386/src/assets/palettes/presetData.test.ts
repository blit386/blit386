/**
 * Guards the hand-copied hex lists in docs/guide-palette-presets.md against
 * drift from the preset data the engine actually ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { HUD_SLOTS } from './hudData';
import { C64_HEX, CGA_HEX, GAMEBOY_HEX, NES_HEX, PICO8_HEX, VGA_HEX } from './presetData';

const guide = readFileSync(fileURLToPath(new URL('../../../docs/guide-palette-presets.md', import.meta.url)), 'utf8');

/** Quoted 'rrggbb' strings in the section whose heading line starts with `heading`. */
function guideHexes(heading: string): string[] {
    const start = guide.indexOf(`\n${heading}`);

    if (start < 0) throw new Error(`Guide heading not found: ${heading}`);

    const rest = guide.slice(start + 1);
    const end = rest.slice(1).search(/\n#{2,3} /);
    const section = end < 0 ? rest : rest.slice(0, end + 1);

    return (section.match(/'[0-9a-f]{6}'/g) ?? []).map((q) => q.slice(1, -1));
}

describe('guide-palette-presets.md hex lists', () => {
    it.each([
        ['### VGA base 16 (', VGA_HEX.slice(0, 16)],
        ['## CGA (', CGA_HEX],
        ['## C64 (', C64_HEX],
        ['## Game Boy (', GAMEBOY_HEX],
        ['## Pico8 (', PICO8_HEX],
        ['## NES (', NES_HEX],
        ['## HUD preset\n', HUD_SLOTS.map((s) => s.hex)],
    ])('%s matches the shipped data', (heading, expected) => {
        expect(guideHexes(heading)).toEqual(expected);
    });
});
