// Hello World: the smallest possible BLIT386 program – one line of text, nothing else.
// @description The smallest possible BLIT386 program: one line of text, nothing else on screen.

import { bootstrap, BT, Color32, Vector2i } from 'blit386';

const C_BG = 1;
const C_TEXT = 2;

class Demo {
    palette = null;

    async init() {
        this.palette = BT.paletteCreate(16);
        this.palette.set(C_BG, new Color32(18, 22, 40));
        this.palette.set(C_TEXT, Color32.white);

        BT.paletteSet(this.palette);

        return true;
    }

    update() {}

    render() {
        BT.clear(C_BG);

        const text = 'Hello, World!';
        const size = BT.systemPrintMeasure(text);
        const x = Math.round(BT.displaySize.x / 2 - size.x / 2);
        const y = Math.round(BT.displaySize.y / 2 - size.y / 2);

        BT.systemPrint(new Vector2i(x, y), C_TEXT, text);
    }
}

bootstrap(Demo);
