// Hello World: the smallest possible BLIT386 program – one line of text, nothing else.
// @description The smallest possible BLIT386 program: one line of text and a Cycle button to change its color.

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

// Slot 1: the background color. Slot 2: the greeting text. Slots 4-15 hold the shared UI
// theme, installed by applyTheme() below so the button drawn in render() has colors to use.
const C_BG = 1;
const C_TEXT = 2;

// Colors the greeting cycles through each time the button is tapped.
const TEXT_COLORS = [
    new Color32(255, 255, 255),
    new Color32(255, 200, 60),
    new Color32(120, 220, 255),
    new Color32(255, 110, 180),
];

class Demo {
    palette = null;

    // Where the shared UI theme colors landed in the palette, filled by applyTheme() in init().
    theme = null;

    // Index into TEXT_COLORS for the greeting's current color.
    colorIndex = 0;

    async init() {
        this.palette = BT.paletteCreate(16);
        this.palette.set(C_BG, new Color32(18, 22, 40));
        this.palette.set(C_TEXT, TEXT_COLORS[this.colorIndex]);

        // Install the shared UI theme before handing the palette to the engine, so the
        // button drawn in render() has its colors ready from the very first frame.
        this.theme = applyTheme(this.palette, 4);

        BT.paletteSet(this.palette);

        return true;
    }

    update() {
        // Let the UI kit track touch contacts and taps. This must be the first line of
        // update() so the button tap below is seen this tick.
        ui.tick();
    }

    render() {
        BT.clear(C_BG);

        const text = 'Hello, World!';
        const size = BT.systemPrintMeasure(text);
        const x = Math.round(BT.displaySize.x / 2 - size.x / 2);
        const y = Math.round(BT.displaySize.y / 2 - size.y / 2);

        BT.systemPrint(new Vector2i(x, y), C_TEXT, text);

        ui.begin('bottomRight');
        if (ui.button('Cycle')) {
            this.colorIndex = (this.colorIndex + 1) % TEXT_COLORS.length;
            this.palette.set(C_TEXT, TEXT_COLORS[this.colorIndex]);
        }
        ui.end();
    }
}

bootstrap(Demo);
