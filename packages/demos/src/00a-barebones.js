// @pageTitle Blit-Tech Demo 00a - Barebones
//
// Smallest runnable demo: fixed 320x240 display, one palette colour, clear each frame.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit-tech';

/** @typedef {import('blit-tech').IBlitTechDemo} IBlitTechDemo */

// #region Demo Class

/**
 * @implements {IBlitTechDemo}
 */
class Demo {
    palette = null;

    player = new Vector2i(160, 120);
    gravity = 0;
    jump = 0;

    async init() {
        this.palette = BT.paletteCreate(16);
        this.palette.set(1, new Color32(18, 22, 32));
        this.palette.set(2, new Color32(32, 0, 128));

        BT.paletteSet(this.palette);

        return true;
    }

    update() {
        if (BT.buttonDown(BT.BTN_A, 0)) {
            this.jump += 0.1;
            this.gravity = 0;
        }
        if (BT.buttonReleased(BT.BTN_A, 0)) {
            this.jump = 0;
        }
        if (BT.buttonDown(BT.BTN_RIGHT, 0)) {
            this.player.x++;
        }
        if (BT.buttonDown(BT.BTN_LEFT, 0)) {
            this.player.x--;
        }

        this.gravity += 0.1;

        this.player.y += this.gravity;
        this.player.y -= this.jump;
    }

    render() {
        BT.clear(2);
        BT.drawRectFill(new Rect2i(this.player.x, this.player.y, 32, 32), 1);
    }
}

// #endregion

// #region App Lifecycle

bootstrap(Demo);

// #endregion
