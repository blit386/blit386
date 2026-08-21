// Palette Exposure Fade: two ways to fade the same picture, side by side.
// @description The plain palette fade and the camera-style exposure fade side by side, running on one shared palette.
//
// Part of the BLIT386 series.
//
// Prerequisites:
//   Basics             https://demos.blit386.dev/basics
//   Sprites            https://demos.blit386.dev/sprites
//   Palette Presets    https://demos.blit386.dev/palette-presets
//   Palette Fade       https://demos.blit386.dev/palette-fade
//     (guides: https://blit386.dev/docs/guides/palette-presets,
//      https://blit386.dev/docs/guides/palette#runtime-palette-effects)
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
// then falls away quickly near the end. Bright things like a fireball hang on far
// longer than the dark rocks around it, which go black almost at once.
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
// shadows are the ones that wait; on the way down, the fireball is the one that
// waits instead.
//
// WHY THE SCREEN IS SPLIT
//
// Both halves show the SAME picture with the SAME colors, start at the SAME
// moment, and take the SAME two seconds. The only thing that differs is which
// fade drives them:
//
//   Left  – BT.paletteFadeRange(), the plain "mix the numbers" fade
//   Right – BT.paletteFadeExposure(), the camera-style fade
//
// So anything you see differing between the halves comes from the curve alone.
//
// ONE PICTURE, DRAWN TWICE
//
// The picture is a real image file: public/sprites/mushroom-cloud.png, a 231x240
// painting of an explosion lighting up a canyon. It is drawn with exactly twelve
// different colors, and it happens to hold both extremes this demo needs – a
// blazing white-hot cloud at the top and near-black rock in the shadows.
//
// Getting it onto the screen takes three steps:
//
//   1. SpriteSheet.loadColorsIntoPalette() walks every pixel of the PNG, collects
//      the colors it finds, and writes them into palette slots 1..12, darkest
//      first. It hands the same list back to us as an array.
//   2. We copy that same list of twelve colors into slots 16..27 as well, so the
//      palette now holds the picture's colors twice over, in two separate places.
//   3. sheet.indexize() rewrites the image itself: every pixel stops storing a
//      color and starts storing a slot NUMBER, from 1 to 12.
//
// After that, one BT.drawSprite() call draws the image as it is, reading slots
// 1..12. A second call draws the very same image with a palette offset of 15,
// which adds 15 to every pixel's slot number as it is drawn – so the identical
// pixels read slots 16..27 instead. Same picture, second set of colors, and no
// second copy of the image in memory. We met that trick in the Sprite Effects
// demo: https://demos.blit386.dev/sprite-effects
//
// HOW THE TWO FADES STAY OUT OF EACH OTHER'S WAY
//
// A palette is one long list of 256 color slots, and a fade writes into that
// list. If both fades wrote into the same slots they would fight over them, and
// the last one to run each frame would win. So each half owns its own slots:
//
//   Slots 1..12   – the right half's picture (the exposure fade)
//   Slots 16..27  – the left half's picture (the plain fade)
//   Slots 240..251 – the shared UI panel colors (neither fade touches these)
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
// small square is one of the 256 slots, laid out fifteen to a row. The first row
// holds the exposure fade's slots 1..12 and the second row holds the plain fade's
// 16..27, one group directly above the other, so during a fade you can see the
// first group's bright slots run ahead of the second group while its dark slots
// lag behind – the whole point of the effect, as raw numbers.
//
// Press ~ (or tap the symbol in the bottom-left corner) to close the overlay and
// watch just the pictures.
//
// WHAT YOU WILL SEE:
//   An explosion over a canyon, drawn twice. The cycle repeats forever:
//   1. Fade up from black – 2 seconds
//   2. Hold, fully lit    – 1.5 seconds
//   3. Fade down to black – 2 seconds
//   4. Hold, dark         – 1 second
//   On the way up, the right fireball lights before the left one and the right
//   shadows stay black longer. On the way down, the right fireball is still
//   glowing after the left one has gone gray, and the right shadows die first.
//   Drag the "Highlight lead" slider to change how strong that difference is.
//   At 0 the right half behaves like a plain fade in light; higher is more
//   cinematic.

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import {
    applyTheme,
    THEME_DEFAULT_START_SLOT,
    THEME_PANEL_OFFSET,
    THEME_TEXT_OFFSET,
    ui,
    UI_ANCHORS,
} from './shared/ui.js';

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

// The picture both halves draw. A PNG painted with exactly twelve colors.
const SPRITE_URL = '/sprites/mushroom-cloud.png';

// The right half's slots. Slot 0 is always transparent, so scene colors start at 1.
const EXP_FIRST_SLOT = 1;

// The left half's slots. Just above the exposure target's 16 slots – the exposure
// fade's own reach stops at slot 15, so this is out of its way.
const PLAIN_FIRST_SLOT = 16;

// The exposure fade's target palette is deliberately small. 16 is the smallest
// legal palette size that still holds our twelve scene colors, and its size is
// what fences the fade off from every slot above it.
const EXPOSURE_TARGET_SIZE = 16;

// Readable names for each step of the cycle, shown in the engine overlay above the FPS bar.
const PHASE_LABELS = {
    'fade-in': 'Fading up',
    lit: 'Lit',
    'fade-out': 'Fading down',
    dark: 'Dark',
};

// Screen geometry. The display is 480x480, so each half of the split is 240 wide.
//
// The vertical numbers are chosen around the engine overlay, which is open from the
// first frame here: it draws a few rows of text across the top and the palette grid
// across the bottom, and it draws AFTER the demo, so whatever it covers is lost.
// Everything this demo draws therefore lives in the free band between the two.
const HALF_WIDTH = 240;
const TITLE_Y = 44;
const SCENE_TOP = 62;

// The picture's own height in pixels – mushroom-cloud.png is 231x240, and the rows
// below it are stacked from this number. init() checks the loaded image against it
// and complains in the console if the art is ever swapped for a different size.
const SCENE_HEIGHT = 240;

// The strip of color swatches under each picture, four pixels below it.
const RAMP_TOP = SCENE_TOP + SCENE_HEIGHT + 4;
const RAMP_HEIGHT = 22;

// Top of the demo's own control panel, just under the swatch strip and clear of the
// overlay's palette band. Pinned rather than anchored to the bottom of the screen,
// which is where the overlay lives.
const PANEL_Y = RAMP_TOP + RAMP_HEIGHT + 6;

/**
 * Copies a list of colors into a palette, starting at `firstSlot`.
 *
 * @param {Palette} palette – Palette to fill.
 * @param {number} firstSlot – Slot that receives the first color of the list.
 * @param {readonly Color32[]} colors – Colors to write, in order.
 */
function fillColors(palette, firstSlot, colors) {
    for (let i = 0; i < colors.length; i++) {
        palette.set(firstSlot + i, colors[i]);
    }
}

/**
 * Writes plain black into a run of slots, for the "faded out" target.
 *
 * @param {Palette} palette – Palette to fill.
 * @param {number} firstSlot – First slot of the run.
 * @param {number} count – How many slots to blacken.
 */
function fillBlack(palette, firstSlot, count) {
    for (let i = 0; i < count; i++) {
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

    // The picture, and the rectangle covering all of it.
    /** @type {SpriteSheet | null} */
    sheet = null;
    /** @type {Rect2i | null} */
    spriteRect = null;

    // The colors found inside the PNG, darkest first, and how many there were.
    /** @type {Color32[]} */
    sceneColors = [];
    colorCount = 0;

    // How far in from the left edge of a half the picture sits, so it ends up centered.
    sceneX = 0;

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

            // The overlay defaults to drawing itself with slots 1 and 2 – which in
            // this demo are two of the picture's colors, and fade to black along with
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
     * Loads the picture, builds the palette and the four fade targets, and starts
     * the cycle.
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

        // The exposure fade's targets are small on purpose – see the header comment.
        // Reading the PNG's colors straight into this one kills two birds: it becomes
        // the "fully lit" target for the right half, AND the palette we hand to
        // indexize() below, which is what decides that pixel colors become slots
        // 1..12 rather than any other run of numbers.
        this.expLit = BT.paletteCreate(EXPOSURE_TARGET_SIZE);

        try {
            this.sceneColors = await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.expLit, EXP_FIRST_SLOT);
        } catch (error) {
            console.error('[PaletteExposureFadeDemo] Failed to read sprite colors:', error);

            return false;
        }

        this.colorCount = this.sceneColors.length;
        console.log(`[PaletteExposureFadeDemo] Found ${this.colorCount} unique colors in ${SPRITE_URL}`);

        // Slot 0 is reserved for transparency, so the 16-slot exposure target has
        // room for 15 colors at most. Any more and the picture's colors would spill
        // into the left half's slots and the two fades would fight over them.
        const maxColors = EXPOSURE_TARGET_SIZE - EXP_FIRST_SLOT;

        if (this.colorCount > maxColors) {
            console.error(
                `[PaletteExposureFadeDemo] ${SPRITE_URL} uses ${this.colorCount} colors, but only ${maxColors} fit.`,
            );

            return false;
        }

        // The same colors again, as the left half's "fully lit" target. The plain
        // fade takes an explicit slot range, so its targets are full size.
        this.plainLit = BT.paletteCreate(256);
        fillColors(this.plainLit, PLAIN_FIRST_SLOT, this.sceneColors);

        // The two "faded out" targets: the same runs of slots, but black.
        this.expDark = BT.paletteCreate(EXPOSURE_TARGET_SIZE);
        fillBlack(this.expDark, EXP_FIRST_SLOT, this.colorCount);

        this.plainDark = BT.paletteCreate(256);
        fillBlack(this.plainDark, PLAIN_FIRST_SLOT, this.colorCount);

        // Now the image itself. This second read costs nothing extra: the engine's
        // asset loader caches the decoded PNG, so it is the very same image the
        // color scan above walked.
        try {
            this.sheet = await SpriteSheet.load(SPRITE_URL);
        } catch (error) {
            console.error('[PaletteExposureFadeDemo] Failed to load sprite:', error);

            return false;
        }

        // A source rectangle covering the whole image, and the gap that centers it
        // inside its 240-wide half of the screen.
        this.spriteRect = this.sheet.fullRect();
        this.sceneX = Math.floor((HALF_WIDTH - this.spriteRect.width) / 2);

        if (this.spriteRect.height !== SCENE_HEIGHT) {
            console.warn(
                `[PaletteExposureFadeDemo] ${SPRITE_URL} is ${this.spriteRect.height}px tall, ` +
                    `but the layout expects ${SCENE_HEIGHT}px. Update SCENE_HEIGHT.`,
            );
        }

        // Turn the picture's pixels into slot numbers. Every pixel is looked up in
        // expLit, where the colors sit at slots 1..12, so that is what each pixel
        // stores from here on.
        this.sheet.indexize(this.expLit);

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
     * Draws the picture twice and the UI panel on top.
     */
    render() {
        // A dark backdrop so the two halves read as separate pictures.
        BT.clear(this.theme.shadow);

        // Left half: the plain fade. Right half: the exposure fade. The same sprite
        // both times – only the run of palette slots it reads differs.
        this.renderScene(0, PLAIN_FIRST_SLOT);
        this.renderScene(HALF_WIDTH, EXP_FIRST_SLOT);

        // Name each half, using UI colors the fades never touch.
        BT.systemPrint(new Vector2i(7, TITLE_Y), this.theme.dim, 'paletteFade:');
        BT.systemPrint(new Vector2i(HALF_WIDTH + 7, TITLE_Y), this.theme.header, 'paletteFadeExposure:');

        // Pinned to PANEL_Y rather than anchored to the bottom of the screen: the
        // overlay's palette grid owns the bottom, and it draws after this.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: PANEL_Y });
        ui.panel('Exposure Fade');

        // Dragging this changes the next fade, not the one already running – a fade
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
            this.startFades(this.plainLit, this.expLit);
        } else if (this.phase === 'fade-out') {
            this.startFades(this.plainDark, this.expDark);
        }
    }

    /**
     * Starts both fades on the same frame with the same duration and easing.
     *
     * @param {Palette} plainTarget – Where the left half's colors should end up.
     * @param {Palette} exposureTarget – Where the right half's colors should end up.
     */
    startFades(plainTarget, exposureTarget) {
        // Left half: the plain fade, limited to the slots the left picture uses.
        BT.paletteFadeRange(PLAIN_FIRST_SLOT, PLAIN_FIRST_SLOT + this.colorCount - 1, plainTarget, FADE_MS);

        // Right half: the exposure fade. It only reaches slots 1..15 because the
        // target palette we hand it is 16 slots long.
        BT.paletteFadeExposure(exposureTarget, FADE_MS, { highlightLead: this.highlightLead });

        this.effectTriggered = true;
    }

    /**
     * Moves to the next step of the cycle once the current one has run long enough.
     *
     * @param {number} elapsed – Ticks since this step started.
     * @param {number} tick – The current tick.
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
        fillBlack(this.palette, EXP_FIRST_SLOT, this.colorCount);
        fillBlack(this.palette, PLAIN_FIRST_SLOT, this.colorCount);
    }

    /**
     * Draws one copy of the picture, plus the swatch strip under it.
     *
     * @param {number} originX – Left edge of this half of the screen.
     * @param {number} firstSlot – Slot holding the picture's first (darkest) color.
     */
    renderScene(originX, firstSlot) {
        // Every pixel of the image stores a slot number counted from EXP_FIRST_SLOT.
        // drawSprite() adds this number to each of them as it draws, which is how the
        // one image reads two different runs of slots: 0 leaves it on slots 1..12, and
        // 15 shifts it up onto slots 16..27.
        const paletteOffset = firstSlot - EXP_FIRST_SLOT;

        BT.drawSprite(this.sheet, this.spriteRect, new Vector2i(originX + this.sceneX, SCENE_TOP), paletteOffset);

        this.renderRamp(originX, firstSlot);
    }

    /**
     * Draws the strip of the picture's colors under one copy of it.
     *
     * The colors arrive from the loader sorted darkest first, so the strip reads as a
     * plain climb in brightness from left to right. Seeing those steps side by side
     * makes the ordering of a fade very easy to spot: the plain fade dims all eleven
     * gaps by the same share at once, while the exposure fade lets the right-hand
     * swatches lead and the left-hand ones lag.
     *
     * @param {number} originX – Left edge of this half of the screen.
     * @param {number} firstSlot – Slot holding the picture's first (darkest) color.
     */
    renderRamp(originX, firstSlot) {
        // Share the width evenly between the swatches, then center the whole strip.
        const stepWidth = Math.floor((HALF_WIDTH - 8) / this.colorCount);
        const stripWidth = stepWidth * this.colorCount;
        const left = originX + Math.floor((HALF_WIDTH - stripWidth) / 2);

        for (let i = 0; i < this.colorCount; i++) {
            BT.drawRectFill(new Rect2i(left + i * stepWidth, RAMP_TOP, stepWidth, RAMP_HEIGHT), firstSlot + i);
        }
    }
}

bootstrap(Demo);
