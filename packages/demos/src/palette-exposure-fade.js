// Palette Exposure Fade: two ways to fade the same picture, side by side.
//
// Part of the BLIT386 series (written for readers about 12 years old).
//
// Prerequisites:
//   Basics             https://demos.blit386.dev/basics
//   Palette Presets    https://demos.blit386.dev/palette-presets
//   Palette Fade       https://demos.blit386.dev/palette-fade
//     (walkthroughs: https://vancura.dev/articles/blit386-palette-presets,
//      https://vancura.dev/articles/blit386-palette-fade)
//
// Live version: https://demos.blit386.dev/palette-exposure-fade
//
// TWO KINDS OF FADE
//
// In the Palette Fade demo we used BT.paletteFade(). It mixes the numbers a color
// is stored as. Every color gets dimmer by the same share at the same moment, so
// the whole picture sinks into gray together. That is what film editors do AFTER
// a movie is shot, on a computer.
//
// A real camera does something different. It has a hole called an iris, and
// closing it lets in less LIGHT. The picture keeps looking bright for a while,
// then falls away quickly near the end. Bright things like a lamp hang on far
// longer than the dark corners of the room, which go black almost at once.
//
// BT.paletteFadeExposure() copies the camera. It dims light instead of stored
// numbers, and it gives each color its own start time based on how bright that
// color is. Bright colors leave first and arrive last; dark colors leave last and
// arrive first.
//
// WHY FADING UP LOOKS DIFFERENT FROM FADING DOWN
//
// The two directions are not simple reverses of each other, and that is on
// purpose. Every color's start time is set by how bright its LIT end is – but
// which end counts as "lit" depends on which way the fade is going:
//
//   Fading up   – timed by where each color is headed. A color heading toward
//                 white starts rising almost at once and arrives early. A color
//                 heading toward near-black waits, then rushes to catch up.
//   Fading down – timed by where each color started. A color that started bright
//                 keeps its brightness for a while before it begins to dim. A
//                 color that started dark begins dropping right away.
//
// Same rule both times – "the brightest end of the trip gets the head start" –
// just pointed at a different end of the trip. That is why, on the way up, the
// shadows are the ones that wait; on the way down, the lamp is the one that
// waits instead.
//
// WHY THE SCREEN IS SPLIT
//
// Both halves show the SAME picture with the SAME colors, start at the SAME
// moment, and take the SAME two seconds. The only thing that differs is which
// fade drives them:
//
//   Left  - BT.paletteFadeRange(), the plain "mix the numbers" fade
//   Right - BT.paletteFadeExposure(), the camera-style fade
//
// So anything you see differing between the halves comes from the curve alone.
//
// HOW THE TWO FADES STAY OUT OF EACH OTHER'S WAY
//
// A palette is one long list of 256 color slots, and a fade writes into that
// list. If both fades wrote into the same slots they would fight over them, and
// the last one to run each frame would win. So each half owns its own slots:
//
//   Slots 1..12   - the right half's picture (the exposure fade)
//   Slots 16..27  - the left half's picture (the plain fade)
//   Slots 240..251 - the shared UI panel colors (neither fade touches these)
//
// BT.paletteFadeRange(start, end, ...) already takes a slot range, so the left
// half is easy. For the right half we use a trick the engine supports on
// purpose: BT.paletteFadeExposure() leaves alone any slot past the END of the
// target palette you hand it. Our exposure target is only 16 slots long, so the
// fade can only ever reach slots 1..15 and never disturbs the left half or the UI.
//
// THE PALETTE GRID
//
// The engine overlay is open from the first frame, with its palette grid switched
// on, so you can watch the slots themselves rather than only the pictures. Each
// small square is one of the 256 slots. The first row holds the exposure fade's
// slots 1..12 and the second row holds the plain fade's 16..27, so during a fade
// you can see the first group's bright slots run ahead of the second group while
// its dark slots lag behind - the whole point of the effect, as raw numbers.
//
// Press ~ (or tap the symbol in the bottom-left corner) to close the overlay and
// watch just the pictures.
//
// WHAT YOU WILL SEE:
//   A lamp-lit room, drawn twice. The cycle repeats forever:
//   1. Fade up from black - 2 seconds
//   2. Hold, fully lit    - 1.5 seconds
//   3. Fade down to black - 2 seconds
//   4. Hold, dark         - 1 second
//   On the way up, the right lamp lights before the left one and the right
//   shadows stay black longer. On the way down, the right lamp is still glowing
//   after the left one has gone gray, and the right shadows die first.
//   Drag the "Highlight lead" slider to change how strong that difference is.
//   At 0 the right half behaves like a plain fade in light; higher is more
//   cinematic.

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, THEME_DEFAULT_START_SLOT, THEME_PANEL_OFFSET, THEME_TEXT_OFFSET, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */
/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// The engine runs this many update ticks every second.
const TICKS_PER_SECOND = 60;

// How long each step of the cycle lasts, counted in ticks.
const FADE_TICKS = 2 * TICKS_PER_SECOND; // 2 seconds
const HOLD_LIT_TICKS = 90; // 1.5 seconds
const HOLD_DARK_TICKS = 60; // 1 second

// The fade duration again, but in milliseconds, because the fade calls want
// milliseconds rather than ticks.
const FADE_MS = (FADE_TICKS / TICKS_PER_SECOND) * 1000;

// The cycle as a simple map: each step says how long it lasts and what comes next.
const PHASE_TRANSITIONS = {
    'fade-in': { duration: FADE_TICKS, next: 'lit' },
    lit: { duration: HOLD_LIT_TICKS, next: 'fade-out' },
    'fade-out': { duration: FADE_TICKS, next: 'dark' },
    dark: { duration: HOLD_DARK_TICKS, next: 'fade-in' },
};

// The right half's slots. Slot 0 is always transparent, so scene colors start at 1.
const EXP_FIRST_SLOT = 1;

// The left half's slots. Just above the exposure target's 16 slots - the exposure
// fade's own reach stops at slot 15, so this is out of its way.
const PLAIN_FIRST_SLOT = 16;

// The exposure fade's target palette is deliberately small. 16 is the smallest
// legal palette size that still holds our twelve scene colors, and its size is
// what fences the fade off from every slot above it.
const EXPOSURE_TARGET_SIZE = 16;

// The twelve colors of the lamp-lit room, brightest first. Both halves use this
// exact list, so any difference on screen comes from the fade, not the art.
const SCENE_COLORS = [
    new Color32(255, 250, 225), // 0 lamp bulb - the brightest thing in the room
    new Color32(255, 226, 150), // 1 lamp glow
    new Color32(214, 178, 116), // 2 lit patch of wall right under the lamp
    new Color32(168, 138, 96), // 3 wall, still well lit
    new Color32(120, 100, 74), // 4 wall in half shade
    new Color32(150, 120, 70), // 5 table top
    new Color32(96, 74, 48), // 6 table leg
    new Color32(74, 62, 52), // 7 floor near the lamp
    new Color32(48, 40, 34), // 8 floor further away
    new Color32(30, 26, 24), // 9 deep shadow
    new Color32(20, 17, 16), // 10 deeper shadow
    new Color32(12, 10, 10), // 11 the darkest corner
];

// Handy names for the parts of the room, as offsets into SCENE_COLORS above.
const C_BULB = 0;
const C_GLOW = 1;
const C_WALL_LIT = 2;
const C_WALL = 3;
const C_WALL_SHADE = 4;
const C_TABLE = 5;
const C_TABLE_LEG = 6;
const C_FLOOR_NEAR = 7;
const C_FLOOR_FAR = 8;
const C_SHADOW = 9;

// Readable names for each step of the cycle, shown in the engine overlay above the FPS bar.
const PHASE_LABELS = {
    'fade-in': 'Fading up',
    lit: 'Lit',
    'fade-out': 'Fading down',
    dark: 'Dark',
};

// The gray ramp strip along the bottom of each half reads the last few colors,
// then walks back up through the list. Seeing plain steps of brightness next to
// each other makes the ordering of the fade very easy to spot.
const RAMP_STEPS = [11, 10, 9, 8, 7, 6, 4, 3, 2, 1, 0];

// Screen geometry. The display is 480x480, so each half of the split is 240 wide.
//
// The vertical numbers are chosen around the engine overlay, which is open from the
// first frame here: it draws a few rows of text across the top and the palette grid
// across the bottom, and it draws AFTER the demo, so whatever it covers is lost.
// Everything this demo draws therefore lives in the free band between the two.
const HALF_WIDTH = 240;
const TITLE_Y = 50;
const SCENE_TOP = 70;
const SCENE_HEIGHT = 200;
const WALL_HEIGHT = 64;
const FLOOR_FAR_HEIGHT = 54;
const RAMP_TOP = 274;
const RAMP_HEIGHT = 22;

// Top of the demo's own control panel, just under the ramp strip and clear of the
// overlay's palette band. Pinned rather than anchored to the bottom of the screen,
// which is where the overlay lives.
const PANEL_Y = 302;

// The room, in pixels from the left edge of whichever half is being drawn, and from
// SCENE_TOP. Named so the drawing code below reads as shapes rather than numbers.
const WALL_MID_X = 30;
const WALL_MID_W = 177;
const WALL_LIT_X = 69;
const WALL_LIT_W = 99;
const WALL_LIT_H = 40;
const TABLE_X = 51;
const TABLE_W = 138;
const TABLE_Y = 113;
const TABLE_H = 8;
const LEG_LEFT_X = 63;
const LEG_RIGHT_X = 168;
const LEG_W = 9;
const LEG_H = 40;
const SHADOW_X = 45;
const SHADOW_W = 150;
const SHADOW_Y = 163;
const SHADOW_H = 14;
const GLOW_X = 93;
const GLOW_W = 51;
const GLOW_Y = 7;
const GLOW_H = 30;
const BULB_X = 108;
const BULB_W = 21;
const BULB_Y = 15;
const BULB_H = 15;
const STEM_X = 115;
const STEM_W = 6;
const STEM_Y = 37;

/**
 * Writes the room colors into a palette, starting at `firstSlot`.
 *
 * @param {Palette} palette - Palette to fill.
 * @param {number} firstSlot - Slot that receives the first color of SCENE_COLORS.
 */
function fillScene(palette, firstSlot) {
    for (let i = 0; i < SCENE_COLORS.length; i++) {
        palette.set(firstSlot + i, SCENE_COLORS[i]);
    }
}

/**
 * Writes plain black into the same run of slots, for the "faded out" target.
 *
 * @param {Palette} palette - Palette to fill.
 * @param {number} firstSlot - First slot of the run.
 */
function fillBlack(palette, firstSlot) {
    for (let i = 0; i < SCENE_COLORS.length; i++) {
        palette.set(firstSlot + i, new Color32(0, 0, 0));
    }
}

/**
 * Shows the difference between BT.paletteFade and BT.paletteFadeExposure by
 * running both on the same picture at the same time, on separate palette slots.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // The four fade destinations, built once in init(). Each fade needs a palette
    // holding the colors it should arrive at.
    /** @type {Palette | null} */
    expLit = null;
    /** @type {Palette | null} */
    expDark = null;
    /** @type {Palette | null} */
    plainLit = null;
    /** @type {Palette | null} */
    plainDark = null;

    // Palette slots of the shared UI colors, filled by applyTheme() in init().
    theme = null;

    // Where we are in the fade-in / hold / fade-out / hold cycle.
    phase = 'dark';

    // The tick the current step of the cycle started on.
    phaseStartTick = 0;

    // Whether this step has already fired its fades. Without this the fades would
    // restart on every single frame and never get anywhere.
    effectTriggered = false;

    // How strongly the exposure fade separates bright colors from dark ones.
    // 0 makes the right half behave like a plain fade in light; higher is more
    // cinematic. The slider in the UI panel writes to this.
    highlightLead = 0.5;

    // Reused every frame so the engine overlay row does not allocate a new object.
    overlayRowData = [{ leftText: 'Dark' }];

    /**
     * Opens the engine overlay with its palette grid already switched on.
     *
     * The grid draws all 256 palette slots as small swatches, so you can watch the
     * two fades move their own slots at their own pace instead of inferring it from
     * the picture. Slots 1..12 are the exposure fade and 16..27 the plain fade, so
     * during a fade the first group visibly runs ahead of the second on the way up
     * and behind it on the way down.
     *
     * The overlay starts open here because that grid is half the point of the demo.
     * Press ~ (or tap the symbol in the bottom-left corner) to close it and watch
     * the pictures on their own.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            // A square screen: two 240-wide pictures side by side, with enough height
            // left over for the overlay's palette grid underneath them.
            displaySize: new Vector2i(480, 480),
            maxCanvasSize: new Vector2i(960, 960),

            isOverlayPaletteEnabled: true,
            isOverlayVisibleAtStart: true,
            overlayPaletteRowsVisible: 2,
            overlayPaletteColumns: 15,

            // The overlay defaults to drawing itself with slots 1 and 2 - which in
            // this demo are the lamp bulb and its glow, and fade to black along with
            // everything else. So point it at the shared UI theme colors instead,
            // which neither fade can reach. configure() runs before init(), so the
            // slot numbers are derived here rather than read from this.theme.
            overlayStyle: {
                barPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_PANEL_OFFSET,
                textPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_TEXT_OFFSET,
                gapPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_PANEL_OFFSET,
            },
        };
    }

    /**
     * Builds the palette, the four fade targets, and starts the cycle.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // The live palette both halves draw from.
        this.palette = BT.paletteCreate(256);

        // Install the shared UI colors in slots 240..251 before activating the
        // palette. Neither fade can reach that high, so the panel stays readable
        // the whole way through.
        this.theme = applyTheme(this.palette);

        // The exposure fade's targets are small on purpose - see the header comment.
        this.expLit = BT.paletteCreate(EXPOSURE_TARGET_SIZE);
        fillScene(this.expLit, EXP_FIRST_SLOT);

        this.expDark = BT.paletteCreate(EXPOSURE_TARGET_SIZE);
        fillBlack(this.expDark, EXP_FIRST_SLOT);

        // The plain fade takes an explicit slot range, so its targets are full size.
        this.plainLit = BT.paletteCreate(256);
        fillScene(this.plainLit, PLAIN_FIRST_SLOT);

        this.plainDark = BT.paletteCreate(256);
        fillBlack(this.plainDark, PLAIN_FIRST_SLOT);

        // Start the picture black, so the first thing a viewer sees is a fade up.
        this.resetPictureToBlack();

        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Runs the cycle: fires both fades at the start of a fade step, then waits.
     */
    update() {
        // Lets the UI kit latch key presses, taps, and slider drags.
        ui.tick();

        const tick = BT.ticks;

        this.triggerPhaseEffect();
        this.advancePhaseIfExpired(tick - this.phaseStartTick, tick);
    }

    /**
     * Draws the room twice and the UI panel on top.
     */
    render() {
        // A dark backdrop so the two halves read as separate pictures.
        BT.clear(this.theme.shadow);

        // Left half: the plain fade. Right half: the exposure fade. Same drawing
        // code both times - only the first palette slot differs.
        this.renderRoom(0, PLAIN_FIRST_SLOT);
        this.renderRoom(HALF_WIDTH, EXP_FIRST_SLOT);

        // Name each half, using UI colors the fades never touch.
        BT.systemPrint(new Vector2i(7, TITLE_Y), this.theme.dim, 'paletteFade:');
        BT.systemPrint(new Vector2i(HALF_WIDTH + 7, TITLE_Y), this.theme.header, 'paletteFadeExposure:');

        // Pinned to PANEL_Y rather than anchored to the bottom of the screen: the
        // overlay's palette grid owns the bottom, and it draws after this.
        ui.begin('topLeft', { y: PANEL_Y });
        ui.panel('Exposure Fade');

        // Dragging this changes the next fade, not the one already running - a fade
        // captures its settings the moment it starts.
        this.highlightLead = ui.slider('Highlight lead', this.highlightLead, { min: 0, max: 0.95, width: 456 });

        // A tap target as well as a key, so the demo works on a phone.
        if (ui.button('Restart [R]', { key: 'KeyR' })) {
            this.restart();
        }

        ui.end();
    }

    /**
     * Current cycle step, shown in the engine overlay above the FPS bar.
     *
     * @returns {readonly { leftText: string }[]}
     */
    overlayRows() {
        this.overlayRowData[0].leftText = this.getPhaseLabel();

        return this.overlayRowData;
    }

    /**
     * A readable name for the step of the cycle we are in.
     *
     * @returns {string}
     */
    getPhaseLabel() {
        return PHASE_LABELS[this.phase];
    }

    /**
     * Fires this step's two fades, once per step.
     */
    triggerPhaseEffect() {
        // Already fired for this step, or this step has no fade at all.
        if (this.effectTriggered) {
            return;
        }

        if (this.phase === 'fade-in') {
            this.startFades(this.plainLit, this.expLit, 'Fade up');
        } else if (this.phase === 'fade-out') {
            this.startFades(this.plainDark, this.expDark, 'Fade down');
        }
    }

    /**
     * Starts both fades on the same frame with the same duration and easing.
     *
     * @param {Palette} plainTarget - Where the left half's colors should end up.
     * @param {Palette} exposureTarget - Where the right half's colors should end up.
     * @param {string} tag - Label for the engine overlay's timing chart.
     */
    startFades(plainTarget, exposureTarget, tag) {
        // Left half: the plain fade, limited to the slots the left picture uses.
        BT.paletteFadeRange(PLAIN_FIRST_SLOT, PLAIN_FIRST_SLOT + SCENE_COLORS.length - 1, plainTarget, FADE_MS);

        // Right half: the exposure fade. It only reaches slots 1..15 because the
        // target palette we hand it is 16 slots long.
        BT.paletteFadeExposure(exposureTarget, FADE_MS, { highlightLead: this.highlightLead });

        BT.assignTag(tag);

        this.effectTriggered = true;
    }

    /**
     * Moves to the next step of the cycle once the current one has run long enough.
     *
     * @param {number} elapsed - Ticks since this step started.
     * @param {number} tick - The current tick.
     */
    advancePhaseIfExpired(elapsed, tick) {
        const current = PHASE_TRANSITIONS[this.phase];

        if (elapsed >= current.duration) {
            this.phase = current.next;
            this.phaseStartTick = tick;
            this.effectTriggered = false;
        }
    }

    /**
     * Cancels anything running and starts the cycle over from black.
     */
    restart() {
        // Effects keep the palette wherever they left it, so paint black by hand.
        BT.paletteClearEffects();
        this.resetPictureToBlack();

        this.phase = 'fade-in';
        this.phaseStartTick = BT.ticks;
        this.effectTriggered = false;
    }

    /**
     * Paints both halves of the picture black, undoing whatever a fade left behind.
     */
    resetPictureToBlack() {
        fillBlack(this.palette, EXP_FIRST_SLOT);
        fillBlack(this.palette, PLAIN_FIRST_SLOT);
    }

    /**
     * Draws one lamp-lit room. Every draw call names a palette slot, never a
     * color, which is why changing the palette changes the picture.
     *
     * @param {number} originX - Left edge of this half of the screen.
     * @param {number} firstSlot - Slot holding the first color of SCENE_COLORS.
     */
    renderRoom(originX, firstSlot) {
        // Back wall, in three bands that get brighter closer to the lamp.
        BT.drawRectFill(new Rect2i(originX, SCENE_TOP, HALF_WIDTH - 1, WALL_HEIGHT), firstSlot + C_WALL_SHADE);
        BT.drawRectFill(new Rect2i(originX + WALL_MID_X, SCENE_TOP, WALL_MID_W, WALL_HEIGHT), firstSlot + C_WALL);
        BT.drawRectFill(new Rect2i(originX + WALL_LIT_X, SCENE_TOP, WALL_LIT_W, WALL_LIT_H), firstSlot + C_WALL_LIT);

        // Floor, split into a further and a nearer band.
        BT.drawRectFill(
            new Rect2i(originX, SCENE_TOP + WALL_HEIGHT, HALF_WIDTH - 1, FLOOR_FAR_HEIGHT),
            firstSlot + C_FLOOR_FAR,
        );
        BT.drawRectFill(
            new Rect2i(
                originX,
                SCENE_TOP + WALL_HEIGHT + FLOOR_FAR_HEIGHT,
                HALF_WIDTH - 1,
                SCENE_HEIGHT - WALL_HEIGHT - FLOOR_FAR_HEIGHT,
            ),
            firstSlot + C_FLOOR_NEAR,
        );

        // Table: a top plus two legs.
        BT.drawRectFill(new Rect2i(originX + TABLE_X, SCENE_TOP + TABLE_Y, TABLE_W, TABLE_H), firstSlot + C_TABLE);
        BT.drawRectFill(
            new Rect2i(originX + LEG_LEFT_X, SCENE_TOP + TABLE_Y + TABLE_H, LEG_W, LEG_H),
            firstSlot + C_TABLE_LEG,
        );
        BT.drawRectFill(
            new Rect2i(originX + LEG_RIGHT_X, SCENE_TOP + TABLE_Y + TABLE_H, LEG_W, LEG_H),
            firstSlot + C_TABLE_LEG,
        );

        // Shadow pooled under the table.
        BT.drawRectFill(new Rect2i(originX + SHADOW_X, SCENE_TOP + SHADOW_Y, SHADOW_W, SHADOW_H), firstSlot + C_SHADOW);

        // The lamp: a warm halo with the bulb sitting inside it.
        BT.drawRectFill(new Rect2i(originX + GLOW_X, SCENE_TOP + GLOW_Y, GLOW_W, GLOW_H), firstSlot + C_GLOW);
        BT.drawRectFill(new Rect2i(originX + BULB_X, SCENE_TOP + BULB_Y, BULB_W, BULB_H), firstSlot + C_BULB);

        // Its stem, running down to the table.
        BT.drawRectFill(
            new Rect2i(originX + STEM_X, SCENE_TOP + STEM_Y, STEM_W, TABLE_Y - STEM_Y),
            firstSlot + C_TABLE_LEG,
        );

        this.renderRamp(originX, firstSlot);
    }

    /**
     * Draws the strip of brightness steps under a room.
     *
     * @param {number} originX - Left edge of this half of the screen.
     * @param {number} firstSlot - Slot holding the first color of SCENE_COLORS.
     */
    renderRamp(originX, firstSlot) {
        // Share the width evenly between the steps, darkest on the left.
        const stepWidth = Math.floor((HALF_WIDTH - 8) / RAMP_STEPS.length);

        for (let i = 0; i < RAMP_STEPS.length; i++) {
            const x = originX + 4 + i * stepWidth;

            BT.drawRectFill(new Rect2i(x, RAMP_TOP, stepWidth, RAMP_HEIGHT), firstSlot + RAMP_STEPS[i]);
        }
    }
}

bootstrap(Demo);
