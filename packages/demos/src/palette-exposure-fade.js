/*

Palette Exposure Fade: two ways to fade the same picture, side by side.
@description The plain palette fade and the camera-style exposure fade side by side, running on one shared palette.

Part of the BLIT386 demo series.

Prerequisites:
  - Basics: https://demos.blit386.dev/basics
  - Sprites: https://demos.blit386.dev/sprites
  - Sprite Effects: https://demos.blit386.dev/sprite-effects
  - Palette Fade: https://demos.blit386.dev/palette-fade

Live version: https://demos.blit386.dev/palette-exposure-fade

Guides:
  - Palette: https://blit386.dev/docs/guides/palette#runtime-palette-effects
  - Palette: https://blit386.dev/docs/guides/palette#index-sprites-preferred-and-manual-flows
  - Overlay: https://blit386.dev/docs/guides/overlay#optional-bands
  - Overlay: https://blit386.dev/docs/guides/overlay#custom-rows

Reference:
  - Palette: https://blit386.dev/docs/api/palette#exposure-fade
  - Assets: https://blit386.dev/docs/api/assets#register-colors-into-the-palette
  - Overlay: https://blit386.dev/docs/api/overlay#bottom-band

---

WHAT YOU WILL SEE
-----------------

A 480x480 display split into two 240-wide halves, each showing the same painting of an
explosion over a canyon (public/sprites/mushroom-cloud.png, 231x240, twelve colors) with
a strip of its twelve color swatches underneath. The left half is labeled
"paletteFadeRange:" and the right half "paletteFadeExposure:". Below both sits
a UI kit panel with a "Highlight lead" slider and a "Restart [R]" button. The
engine overlay is open from the first frame, with its palette grid showing two
rows of fifteen slots at the bottom. The cycle repeats forever:

  1. Fade up from black - 2 seconds.
  2. Hold, fully lit - 1.5 seconds.
  3. Fade down to black - 2 seconds.
  4. Hold, dark - 1 second.

On the way up, the right fireball lights before the left one and the right shadows stay
black longer. On the way down, the right fireball is still glowing after the left one has
gone gray, and the right shadows go dark first.

WHAT YOU WILL LEARN
-------------------

- BT.paletteFadeExposure(target, durationMs, { highlightLead }) and how it differs from
  BT.paletteFade() / BT.paletteFadeRange().
- Scoping two simultaneous fades to disjoint slot ranges: an explicit range for the plain
  fade, and a deliberately small target palette for the exposure fade.
- SpriteSheet.loadColorsIntoPalette() and sheet.indexize() to turn a PNG into palette
  indices, then BT.drawSprite() with a palette offset to draw it from a second slot range.
- BT.paletteClearEffects() to cancel running fades before restarting.
- A tick-driven phase table, a custom overlay row via overlayRows(), and configure()
  options for the overlay palette grid (isOverlayPaletteEnabled, overlayPaletteColumns,
  overlayPaletteRowsVisible, isOverlayVisibleAtStart, overlayStyle).

TWO KINDS OF FADE
-----------------

BT.paletteFade() interpolates the stored (sRGB-encoded) color values. Every color drops by
the same proportion at the same moment, so the whole picture sinks into gray together.
That is a post-production crossfade.

A camera iris does something different: it scales light. Interpolating in linear light,
a picture keeps looking bright for a while and then falls away quickly near the end, and
bright elements such as a fireball hang on far longer than the dark rocks around them.

BT.paletteFadeExposure() models the iris. It interpolates each RGB channel in linear
light, and it gives each palette entry its own schedule offset derived from its luminance:
bright colors leave first and arrive last; dark colors leave last and arrive first.

WHY FADING UP LOOKS DIFFERENT FROM FADING DOWN?
-----------------------------------------------

The two directions are not simple reverses of each other, by design. Every entry's offset
is set by the luminance of its LIT end, and which end counts as lit depends on the
direction of travel:

  - Fading up - timed by where each entry is headed. An entry heading toward white starts
    rising almost at once and arrives early. An entry heading toward near-black waits,
    then catches up quickly.
  - Fading down - timed by where each entry started. An entry that started bright holds
    its brightness for a while before it begins to dim. An entry that started dark begins
    dropping right away.

Same rule both times - the brightest end of the trip gets the head start - pointed at a
different end of the trip. On the way up the shadows wait; on the way down the fireball
waits instead.

WHY IS THE SCREEN SPLIT?
------------------------

Both halves show the same picture with the same colors, start at the same moment, and take
the same two seconds. The only difference is which fade drives them:

  - Left - BT.paletteFadeRange(), the plain fade on an explicit slot range.
  - Right - BT.paletteFadeExposure(), the camera-style fade.

Any difference between the halves therefore comes from the curve alone.

ONE PICTURE, DRAWN TWICE
------------------------

The image is a real PNG painted with exactly twelve colors, and it happens to hold both
extremes this demo needs: a white-hot cloud at the top and near-black rock in the shadows.
Getting it onto the screen takes three steps:

  1. SpriteSheet.loadColorsIntoPalette() scans every pixel of the PNG, collects the
     distinct colors, and writes them into palette slots 1..12, darkest first. It returns
     the same list as an array.
  2. The same twelve colors are copied into slots 16..27 as well, so the palette holds
     the picture's colors twice, in two separate places.
  3. sheet.indexize() rewrites the image: every pixel stops storing a color and starts
     storing a slot number from 1 to 12.

After that, one BT.drawSprite() call draws the image as it is, reading slots 1..12. A
second call draws the very same image with a palette offset of 15, which adds 15 to every
pixel's slot number as it is drawn, so the identical pixels read slots 16..27 instead:
same picture, second set of colors, no second copy of the image in memory. The Sprite
Effects demo introduced this trick: https://demos.blit386.dev/sprite-effects

HOW THE TWO FADES STAY OUT OF EACH OTHER'S WAY
----------------------------------------------

A palette is one list of 256 color slots, and a fade writes into that list. If both fades
wrote into the same slots they would fight, and the last one to run each tick would win.
So each half owns its own slots:

  - Slots 1..12 - the right half's picture (the exposure fade).
  - Slots 16..27 - the left half's picture (the plain fade).
  - Slots 240..251 - the shared UI kit colors (neither fade touches these).

BT.paletteFadeRange(start, end, ...) takes a slot range, so the left half is explicit. For
the right half the demo relies on a documented property of BT.paletteFadeExposure(): it
leaves alone every slot past the end of the target palette it is handed. The exposure
targets are 16 slots long, so the fade can only ever reach slots 1..15 and never disturbs
the left half or the UI.

THE PALETTE GRID
----------------

The engine overlay is open from the first frame with its palette grid switched on, so the
slots themselves can be watched rather than only the pictures. The grid is laid out
fifteen slots to a row with two rows visible: the first row holds the exposure fade's
slots 1..12 and the second row the plain fade's slots 16..27, one group directly above the
other. During a fade the first group's bright slots run ahead of the second group while
its dark slots lag behind - the effect, as raw numbers.

TRY THIS
--------

- Drag the "Highlight lead" slider (0 to 0.95) to change how strongly the exposure fade
  separates bright colors from dark ones. At 0 the right half is a plain linear-light fade
  with every slot on one schedule; higher values are more cinematic. The new value applies
  to the next fade, not the one already running.
- Press R or tap "Restart [R]" to cancel the running fades, cut both pictures to black,
  and start the cycle over with a fade up.
- Press the backquote key (`) or tap the symbol in the bottom-left corner to close the
  engine overlay and watch just the pictures. Its custom row names the current phase.

*/

import { bootstrap, BT, Color32, Rect2i, SpriteSheet, Vector2i } from 'blit386';

import {
    applyTheme,
    THEME_DEFAULT_START_SLOT,
    THEME_PANEL_OFFSET,
    THEME_TEXT_OFFSET,
    ui,
    UI_ANCHORS,
} from './shared/ui.js';

/** @typedef {import('blit386').Palette} Palette */

// The engine runs this many update ticks every second.
const TICKS_PER_SECOND = 60;

// How long each step of the cycle lasts, in ticks.
const FADE_TICKS = 2 * TICKS_PER_SECOND; // 2 seconds
const HOLD_LIT_TICKS = 90; // 1.5 seconds
const HOLD_DARK_TICKS = 60; // 1 second

// The fade duration again, in milliseconds, because the fade calls take milliseconds
// rather than ticks.
const FADE_MS = (FADE_TICKS / TICKS_PER_SECOND) * 1000;

// The cycle as a lookup table: each step says how long it lasts and which step follows.
const PHASE_TRANSITIONS = {
    'fade-in': { duration: FADE_TICKS, next: 'lit' },
    lit: { duration: HOLD_LIT_TICKS, next: 'fade-out' },
    'fade-out': { duration: FADE_TICKS, next: 'dark' },
    dark: { duration: HOLD_DARK_TICKS, next: 'fade-in' },
};

// The picture both halves draw: a PNG painted with exactly twelve colors.
const SPRITE_URL = '/sprites/mushroom-cloud.png';

// The right half's slots. Slot 0 is always transparent, so scene colors start at 1.
const EXP_FIRST_SLOT = 1;

// The left half's slots, just above the exposure target's 16 slots. The exposure fade's
// reach stops at slot 15, so this range is out of its way.
const PLAIN_FIRST_SLOT = 16;

// The exposure fade's target palette is deliberately small. 16 is the smallest legal
// palette size that still holds the twelve scene colors, and its size is what fences the
// fade off from every slot above it.
const EXPOSURE_TARGET_SIZE = 16;

// Readable names for each step of the cycle, shown as a custom row in the engine overlay.
const PHASE_LABELS = {
    'fade-in': 'Fading up',
    lit: 'Lit',
    'fade-out': 'Fading down',
    dark: 'Dark',
};

// Screen geometry. The display is 480x480, so each half of the split is 240 wide. The
// vertical numbers are chosen around the engine overlay, which is open from the first
// frame: it draws a few rows of text across the top and the palette grid across the
// bottom, and it draws after the demo, so whatever it covers is lost. Everything this
// demo draws lives in the free band between the two.
const HALF_WIDTH = 240;
const TITLE_Y = 44;
const SCENE_TOP = 62;

// The picture's own height in pixels - mushroom-cloud.png is 231x240 - and the rows below
// it are stacked from this number. init() checks the loaded image against it and warns in
// the console if the art is ever swapped for a different size.
const SCENE_HEIGHT = 240;

// The strip of color swatches under each picture, four pixels below it.
const RAMP_TOP = SCENE_TOP + SCENE_HEIGHT + 4;
const RAMP_HEIGHT = 22;

// Top of the demo's own control panel, just under the swatch strip and clear of the
// overlay's palette band. Pinned rather than anchored to the bottom of the screen, which
// is where the overlay lives.
const PANEL_Y = RAMP_TOP + RAMP_HEIGHT + 6;

// Copies a list of colors into a palette, starting at `firstSlot`.
function fillColors(palette, firstSlot, colors) {
    for (let i = 0; i < colors.length; i++) {
        palette.set(firstSlot + i, colors[i]);
    }
}

// Writes plain black into `count` slots starting at `firstSlot`, for the "faded out"
// targets.
function fillBlack(palette, firstSlot, count) {
    for (let i = 0; i < count; i++) {
        palette.set(firstSlot + i, new Color32(0, 0, 0));
    }
}

// Shows the difference between BT.paletteFadeRange() and BT.paletteFadeExposure() by
// running both on the same picture at the same time, on separate palette slots.
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // The picture.
    /** @type {SpriteSheet | null} */
    sheet = null;

    // The rectangle covering all of the picture.
    /** @type {Rect2i | null} */
    spriteRect = null;

    // The colors found inside the PNG, darkest first.
    /** @type {Color32[]} */
    sceneColors = [];

    // How many colors the PNG holds.
    colorCount = 0;

    // How far in from the left edge of a half the picture sits, so it ends up centered.
    sceneX = 0;

    // The four fade destinations, built once in init(). Each fade needs a palette holding
    // the colors it should arrive at: the exposure fade's lit target.
    /** @type {Palette | null} */
    expLit = null;

    // The exposure fade's dark target.
    /** @type {Palette | null} */
    expDark = null;

    // The plain fade's lit target.
    /** @type {Palette | null} */
    plainLit = null;

    // The plain fade's dark target.
    /** @type {Palette | null} */
    plainDark = null;

    // Palette slots of the shared UI colors, filled by applyTheme() in init().
    theme = null;

    // Where we are in the fade-in / hold / fade-out / hold cycle.
    phase = 'dark';

    // The tick the current step of the cycle started on.
    phaseStartTick = 0;

    // Whether this step has already fired its fades. Without this the fades would restart
    // on every tick and never get anywhere.
    effectTriggered = false;

    // How strongly the exposure fade separates bright colors from dark ones. 0 makes the
    // right half a plain linear-light fade; higher is more cinematic. The slider in the
    // UI panel writes to this.
    highlightLead = 0.5;

    // Reused every frame so the engine overlay row does not allocate a new object.
    overlayRowData = [{ leftText: 'Dark' }];

    // Opens the engine overlay with its palette grid already switched on. The grid draws
    // the palette slots as small swatches, so the two fades can be watched moving their
    // own slots at their own pace instead of inferred from the picture. Slots 1..12 are
    // the exposure fade and 16..27 the plain fade, so during a fade the first group
    // visibly runs ahead of the second on the way up and behind it on the way down. The
    // overlay starts open because that grid is half the point of the demo; the backquote
    // key (`) or the symbol in the bottom-left corner closes it.
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

            // The overlay defaults to drawing itself with slots 1 and 2, which in this
            // demo are two of the picture's colors and fade to black along with
            // everything else. So point it at the shared UI theme colors instead, which
            // neither fade can reach. configure() runs before init(), so the slot numbers
            // are derived here rather than read from this.theme.
            overlayStyle: {
                barPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_PANEL_OFFSET,
                textPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_TEXT_OFFSET,
                gapPaletteIndex: THEME_DEFAULT_START_SLOT + THEME_PANEL_OFFSET,
            },
        };
    }

    // Loads the picture, builds the palette and the four fade targets, and starts the
    // cycle.
    async init() {
        // The live palette both halves draw from.
        this.palette = BT.paletteCreate(256);

        // Install the shared UI colors in slots 240..251 before activating the palette.
        // Neither fade can reach that high, so the panel stays readable throughout.
        this.theme = applyTheme(this.palette);

        // The exposure fade's targets are small on purpose - see the header comment.
        // Reading the PNG's colors straight into this one serves two purposes: it becomes
        // the "fully lit" target for the right half, and it is the palette handed to
        // indexize() below, which is what makes pixel colors become slots 1..12 rather
        // than any other run of numbers.
        this.expLit = BT.paletteCreate(EXPOSURE_TARGET_SIZE);

        try {
            this.sceneColors = await SpriteSheet.loadColorsIntoPalette(SPRITE_URL, this.expLit, EXP_FIRST_SLOT);
        } catch (error) {
            console.error('[PaletteExposureFadeDemo] Failed to read sprite colors:', error);

            return false;
        }

        this.colorCount = this.sceneColors.length;
        console.log(`[PaletteExposureFadeDemo] Found ${this.colorCount} unique colors in ${SPRITE_URL}`);

        // Slot 0 is reserved for transparency, so the 16-slot exposure target has room
        // for 15 colors at most. Any more and the picture's colors would spill into the
        // left half's slots and the two fades would fight over them.
        const maxColors = EXPOSURE_TARGET_SIZE - EXP_FIRST_SLOT;

        if (this.colorCount > maxColors) {
            console.error(
                `[PaletteExposureFadeDemo] ${SPRITE_URL} uses ${this.colorCount} colors, but only ${maxColors} fit.`,
            );

            return false;
        }

        // The same colors again, as the left half's "fully lit" target. The plain fade
        // takes an explicit slot range, so its targets are full size.
        this.plainLit = BT.paletteCreate(256);
        fillColors(this.plainLit, PLAIN_FIRST_SLOT, this.sceneColors);

        // The two "faded out" targets: the same runs of slots, but black.
        this.expDark = BT.paletteCreate(EXPOSURE_TARGET_SIZE);
        fillBlack(this.expDark, EXP_FIRST_SLOT, this.colorCount);

        this.plainDark = BT.paletteCreate(256);
        fillBlack(this.plainDark, PLAIN_FIRST_SLOT, this.colorCount);

        // Now the image itself. This second read costs nothing extra: the engine's asset
        // loader caches the decoded PNG, so it is the same image the color scan walked.
        try {
            this.sheet = await SpriteSheet.load(SPRITE_URL);
        } catch (error) {
            console.error('[PaletteExposureFadeDemo] Failed to load sprite:', error);

            return false;
        }

        // A source rectangle covering the whole image, and the gap that centers it inside
        // its 240-wide half of the screen.
        this.spriteRect = this.sheet.fullRect();
        this.sceneX = Math.floor((HALF_WIDTH - this.spriteRect.width) / 2);

        if (this.spriteRect.height !== SCENE_HEIGHT) {
            console.warn(
                `[PaletteExposureFadeDemo] ${SPRITE_URL} is ${this.spriteRect.height}px tall, ` +
                    `but the layout expects ${SCENE_HEIGHT}px. Update SCENE_HEIGHT.`,
            );
        }

        // Turn the picture's pixels into slot numbers. Every pixel is looked up in
        // expLit, where the colors sit at slots 1..12, so that is what each pixel stores
        // from here on.
        this.sheet.indexize(this.expLit);

        // Start the picture black, so the first thing a viewer sees is a fade up.
        this.resetPictureToBlack();

        BT.paletteSet(this.palette);

        return true;
    }

    // Runs the cycle: fires both fades at the start of a fade step, then waits.
    update() {
        // Lets the UI kit latch key presses, taps, and slider drags.
        ui.tick();

        const tick = BT.ticks;

        this.triggerPhaseEffect();
        this.advancePhaseIfExpired(tick - this.phaseStartTick, tick);
    }

    // Draws the picture twice and the UI panel on top.
    render() {
        // A dark backdrop so the two halves read as separate pictures.
        BT.clear(this.theme.shadow);

        // Left half: the plain fade. Right half: the exposure fade. The same sprite both
        // times - only the run of palette slots it reads differs.
        this.renderScene(0, PLAIN_FIRST_SLOT);
        this.renderScene(HALF_WIDTH, EXP_FIRST_SLOT);

        // Name each half after the call that drives it. The left label matches
        // BT.paletteFadeRange(), the call startFades() uses for that half's slots.
        BT.systemPrint(new Vector2i(7, TITLE_Y), this.theme.dim, 'paletteFadeRange:');
        BT.systemPrint(new Vector2i(HALF_WIDTH + 7, TITLE_Y), this.theme.header, 'paletteFadeExposure:');

        // Pinned to PANEL_Y rather than anchored to the bottom of the screen: the
        // overlay's palette grid owns the bottom, and it draws after this.
        ui.begin(UI_ANCHORS.TOP_LEFT, { y: PANEL_Y });
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

    // Supplies one custom overlay row naming the current cycle step.
    overlayRows() {
        this.overlayRowData[0].leftText = this.getPhaseLabel();

        return this.overlayRowData;
    }

    // A readable name for the step of the cycle we are in.
    getPhaseLabel() {
        return PHASE_LABELS[this.phase];
    }

    // Fires this step's two fades, once per step.
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

    // Starts both fades on the same tick with the same duration. `plainTarget` is where
    // the left half's colors should end up, `exposureTarget` where the right half's
    // should.
    startFades(plainTarget, exposureTarget) {
        // Left half: the plain fade, limited to the slots the left picture uses.
        BT.paletteFadeRange(PLAIN_FIRST_SLOT, PLAIN_FIRST_SLOT + this.colorCount - 1, plainTarget, FADE_MS);

        // Right half: the exposure fade. It only reaches slots 1..15 because the target
        // palette handed to it is 16 slots long.
        BT.paletteFadeExposure(exposureTarget, FADE_MS, { highlightLead: this.highlightLead });

        this.effectTriggered = true;
    }

    // Moves to the next step of the cycle once the current one has run long enough.
    // `elapsed` is ticks since this step started, `tick` the current tick.
    advancePhaseIfExpired(elapsed, tick) {
        const current = PHASE_TRANSITIONS[this.phase];

        if (elapsed >= current.duration) {
            this.phase = current.next;
            this.phaseStartTick = tick;
            this.effectTriggered = false;
        }
    }

    // Cancels anything running and starts the cycle over from black.
    restart() {
        // Effects leave the palette wherever they stopped, so paint black by hand.
        BT.paletteClearEffects();
        this.resetPictureToBlack();

        this.phase = 'fade-in';
        this.phaseStartTick = BT.ticks;
        this.effectTriggered = false;
    }

    // Paints both halves of the picture black, undoing whatever a fade left behind.
    resetPictureToBlack() {
        fillBlack(this.palette, EXP_FIRST_SLOT, this.colorCount);
        fillBlack(this.palette, PLAIN_FIRST_SLOT, this.colorCount);
    }

    // Draws one copy of the picture, plus the swatch strip under it. `originX` is the
    // left edge of this half of the screen, `firstSlot` the slot holding the picture's
    // first (darkest) color.
    renderScene(originX, firstSlot) {
        // Every pixel of the image stores a slot number counted from EXP_FIRST_SLOT.
        // drawSprite() adds this offset to each of them as it draws, which is how the one
        // image reads two different runs of slots: 0 leaves it on slots 1..12, and 15
        // shifts it up onto slots 16..27.
        const paletteOffset = firstSlot - EXP_FIRST_SLOT;

        BT.drawSprite(this.sheet, this.spriteRect, new Vector2i(originX + this.sceneX, SCENE_TOP), paletteOffset);

        this.renderRamp(originX, firstSlot);
    }

    // Draws the strip of the picture's colors under one copy of it. The colors arrive
    // from the loader sorted darkest first, so the strip reads as a plain climb in
    // brightness from left to right. Seeing those steps side by side makes the ordering
    // of a fade easy to spot: the plain fade dims all eleven gaps by the same share at
    // once, while the exposure fade lets the right-hand swatches lead and the left-hand
    // ones lag.
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
