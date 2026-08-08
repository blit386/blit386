// Filip Test 02: a bare-bones starter with no shared UI kit, kept as a minimal reference.
// @description A pointer-centered rectangle, palette colors animated by the cursor, and a circle drawn pixel by pixel.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').Palette} Palette */

const C_BG = 1; // The screen background: a dark blue-gray.
const DISPLAY_W = 320;
const DISPLAY_H = 240;

/**
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    myRect = new Rect2i(0, 0, 50, 50);

    // Reused every update() tick so the palette loop does not allocate 248 Color32s.
    tempColor = new Color32(0, 0, 0);

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
        // Keep the ring on-screen: center is (200, 100), so the radius cannot reach past
        // the nearest edge without clipping. Clamp so every plotted pixel can land inside.
        const maxRadius = Math.min(200, 100, DISPLAY_W - 200, DISPLAY_H - 100);
        const r = Math.max(0, Math.min(Math.round(radius), maxRadius));

        // 0.05 radian steps are dense enough for a filled ring at this size without
        // spending a whole frame drawing thousands of near-duplicate pixels.
        for (let i = 0; i < Math.PI * 2; i += 0.05) {
            const x = Math.round(Math.sin(i) * r + 200);
            const y = Math.round(Math.cos(i) * r + 100);

            if (x < 0 || x >= DISPLAY_W || y < 0 || y >= DISPLAY_H) {
                continue;
            }

            const col = Math.floor(i * 20) + 3;

            BT.drawPixel(new Vector2i(x, y), col);
        }
    }

    update() {
        const pointer = BT.pointerPos();

        // Rect2i.setPosition truncates to integers (direct .x/.y writes would not).
        this.myRect.setPosition(pointer.x - 25, pointer.y - 25);

        for (let i = 2; i < 250; i++) {
            // Color32 clamps out-of-range channels itself; floor keeps the recipe readable.
            // palette.set() clones the color, so one reused tempColor is enough.
            this.tempColor.setRGBA(Math.floor(pointer.y), Math.floor(pointer.x), Math.floor(8 + i * 10), 255);
            this.palette.set(i, this.tempColor);
        }
    }

    render() {
        BT.clear(1);

        BT.drawRect(this.myRect, 2);

        this.drawCircle(BT.pointerPos().x);
    }
}

bootstrap(Demo);
