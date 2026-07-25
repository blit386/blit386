import { bootstrap, BT, Color32, Rect2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

const C_BG = 1; // The screen background: a dark blue-gray.

/**
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    myRect = new Rect2i(0, 0, 50, 50);

    configure() {
        return {
            isOverlayPaletteEnabled: true,
        };
    }

    /**
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_BG, new Color32(18, 22, 32));
        this.palette.set(2, new Color32(255, 255, 255));

        BT.paletteSet(this.palette);

        return true;
    }

    drawCircle(radius) {
        for (let i = 0; i < Math.PI * 2; i += 0.005) {
            const x = Math.sin(i) * radius + 200;
            const y = Math.cos(i) * radius + 100;
            const col = Math.floor(i * 20) + 3;

            BT.drawPixel(x, y, col);
        }
    }

    update() {
        this.myRect.x = BT.pointerPos().x - 25;
        this.myRect.y = BT.pointerPos().y - 25;

        for (let i = 2; i < 250; i++) {
            const r = BT.pointerPos().y;
            const g = BT.pointerPos().x;
            const b = Math.floor(8 + i * 10);
            const col = new Color32(r, g, b);

            this.palette.set(i, col);
        }
    }

    render() {
        BT.clear(1);

        BT.drawRect(this.myRect, 2);

        this.drawCircle(BT.pointerPos().x);
    }
}

bootstrap(Demo);
