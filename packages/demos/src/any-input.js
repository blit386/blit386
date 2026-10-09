// @ogScale integer
/**
 * Any Input Demo - "press any key" gates, repeat, and "everything is up" release edges.
 * @description Press-any-key gates, tick repeat, and all-keys-up release edges for keyboard and gamepad, with a log.
 *
 * Part of the BLIT386 demo series.
 * Prerequisites:
 *   Keyboard Input https://demos.blit386.dev/keyboard-input
 *   Gamepad Input  https://demos.blit386.dev/gamepad-input
 *
 * Live version: https://demos.blit386.dev/any-input
 *
 * Sometimes a game does not care WHICH key you pressed, only that you pressed one:
 * "Press any key to start" on a title screen is the classic case. BLIT386 has six helpers
 * for that, three for the keyboard and three for gamepads:
 * - BT.isAnyKeyDown() / BT.isAnyButtonDown(player): true while at least one is held.
 * - BT.isAnyKeyPressed(repeatRate) / BT.isAnyButtonPressed(player, repeatRate): true on the
 *   tick something goes down, even when other keys are already held. With a repeat rate it
 *   also fires every N ticks while you keep holding.
 * - BT.isAnyKeyReleased() / BT.isAnyButtonReleased(player): true only on the tick when
 *   EVERYTHING is up. Letting go of one key while another is still held does not count.
 *
 * Every panel here shows one of those behaviors, and the log at the bottom writes each
 * event down with the engine tick it happened on, so quick edges are easy to read.
 *
 * Try this:
 * - Press any key on the title screen. Tap keys to play until the game is over, then press
 *   one more to go back to the title.
 * - Hold one key, then press a second one. The gate still fires - the "Overlap" counter
 *   counts those presses.
 * - Hold a key and watch the "Press/rep" counter climb. Drag the slider to change how many
 *   ticks pass between repeats.
 * - Hold A and S together, then let go of A: "A released" goes up, "All up" does not.
 *   Let go of S and "All up" finally fires.
 * - Plug in a gamepad (press a button to wake it) and watch its player slot light up.
 *   Each of the four slots is tracked on its own.
 */

import { bootstrap, BT, Vector2i } from 'blit386';

import { applyTheme, ui, UI_ANCHORS } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

// The three screens of the tiny "game" behind the press-any-key gate.
const STAGE_TITLE = 'Title';
const STAGE_PLAY = 'Play';
const STAGE_GAME_OVER = 'Game over';

// How many key presses it takes to finish the play stage.
const HITS_TO_FINISH = 5;

// Repeat slider limits and starting value, in engine ticks (the engine ticks 60 times a second).
const REPEAT_MIN = 1;
const REPEAT_MAX = 30;
const REPEAT_DEFAULT = 10;

// The one specific key we compare against "any key". KeyboardEvent.code strings name the
// physical key, so this is the A key on any keyboard layout.
const WATCHED_KEY = 'KeyA';

// A gamepad slot is a number from 0 to 3, so four players fit.
const PLAYER_COUNT = 4;

// How many lines the event log keeps. Older lines scroll away. The four panels above never
// change height, so the log can take all the room below them.
const LOG_MAX = 17;

// The screen is 600x315 display pixels. That is exactly half of the 1200x630 social card, so
// the card shows it at a clean 2x scale with no blurry resampling.
const DISPLAY_W = 600;
const DISPLAY_H = 315;

// Fixed layout, in display pixels: four panels in a row under the title strip, the log
// along the bottom. Each panel's left edge is pinned so they sit in even columns.
const PANEL_TOP_Y = 36;
const PANEL_WIDTH = 141; // Equal widths keep the four columns tidy: 4 x 141 + 3 gaps of 8 = 588.
const GATE_PANEL_X = 4;
const REPEAT_PANEL_X = 153;
const RELEASE_PANEL_X = 302;
const PADS_PANEL_X = 451;
const LOG_PANEL_WIDTH = 588;
const SLIDER_WIDTH = 120; // Narrow enough to stay inside a 141-pixel panel.

/**
 * Shows the six BT.isAny* helpers side by side with their per-key cousins.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Which screen of the little gate game we are on.
    stage = STAGE_TITLE;

    // Key presses so far in the play stage.
    playHits = 0;

    // Presses that arrived while another key was already held (the "second key" case).
    overlapPresses = 0;

    // Was any key held at the end of the previous tick? Used to spot an overlapping press.
    wasAnyKeyHeld = false;

    // How many ticks pass between repeats of isAnyKeyPressed(repeatRate). The slider edits it.
    repeatRate = REPEAT_DEFAULT;

    // Counters for the repeat panel: first presses, and the extra repeat fires while holding.
    firstPresses = 0;
    repeatFires = 0;

    // Counters for the release panel: the A key alone versus the whole keyboard.
    watchedKeyReleases = 0;
    allUpReleases = 0;

    // Per-player gamepad counters, one entry per slot.
    padPresses = new Array(PLAYER_COUNT).fill(0);
    padReleases = new Array(PLAYER_COUNT).fill(0);

    /** @type {string[]} Newest event last. */
    log = [];

    /**
     * Stop Space and the arrow keys from scrolling the host page.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),

            // Turn the engine's debug overlay off, along with its small corner toggle mark.
            // This demo has no use for it.
            isOverlayEnabled: false,

            // Space and the arrow keys scroll the host page by default. Every key is fair game
            // in this demo, so opt in to keep the page still while you press them.
            isCapturingKeyboardScroll: true,
        };
    }

    /**
     * Install the shared UI theme.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        this.palette = BT.paletteCreate(256);

        // The shared UI colors go in before the palette is handed to the engine.
        this.theme = applyTheme(this.palette);

        BT.paletteSet(this.palette);

        return true;
    }

    /**
     * Read the keyboard helpers once per tick. Keyboard edges (pressed / released) only last
     * one tick, so they must be read here and remembered, never read from render().
     */
    update() {
        // The UI kit's once-per-tick housekeeping. It also notices touch contacts, which
        // ui.hasTouch() in render() relies on to show the "needs a keyboard" notice.
        ui.tick();

        this.updateKeyboard();
    }

    /**
     * Clear the frame and declare the panels.
     */
    render() {
        // Gamepad edges are the odd one out: the engine clears them once per DRAWN frame, not
        // once per tick. On a fast screen some frames run no tick at all, and on a slow one a
        // frame can run two, so reading them in update() would miss or double-count presses.
        // render() runs exactly once per drawn frame, so each edge is seen exactly once here.
        this.readGamepads();

        BT.clear(this.theme.bg);

        ui.begin(UI_ANCHORS.TOP_BAR);
        ui.panel('Any Input - keys and gamepad buttons');
        ui.end();

        this.renderGatePanel();
        this.renderRepeatPanel();
        this.renderReleasePanel();
        this.renderGamepadPanel();
        this.renderLog();
    }

    /**
     * Handle every keyboard helper for this tick.
     */
    updateKeyboard() {
        // Edge only: true on the tick a key goes down, even if another key is already held.
        // (Think of a doorbell: it rings when someone presses the button, whatever else is going on.)
        if (BT.isAnyKeyPressed()) {
            this.firstPresses += 1;
            this.addLog('any key pressed');

            // If a key was already held when this one arrived, it is the "second key" case.
            if (this.wasAnyKeyHeld) {
                this.overlapPresses += 1;
            }

            this.advanceGate();
        } else if (BT.isAnyKeyPressed(this.repeatRate)) {
            // Same helper with a repeat rate. The plain call above was false, so this one
            // is true only because a key has been held for a multiple of repeatRate ticks.
            this.repeatFires += 1;
            this.addLog('repeat fire');
        }

        // The A key on its own. This fires the moment A comes up, even if S is still held.
        if (BT.isKeyReleased(WATCHED_KEY)) {
            this.watchedKeyReleases += 1;
            this.addLog('A released');
        }

        // The whole keyboard. This fires only on the tick when nothing at all is held.
        if (BT.isAnyKeyReleased()) {
            this.allUpReleases += 1;
            this.addLog('ALL keys up');
        }

        // Remember held state for the next tick's overlap check.
        this.wasAnyKeyHeld = BT.isAnyKeyDown();
    }

    /**
     * Handle the gamepad helpers for each of the four player slots. Called once per drawn
     * frame from render(), see the note there.
     */
    readGamepads() {
        for (let player = 0; player < PLAYER_COUNT; player++) {
            if (BT.isAnyButtonPressed(player)) {
                this.padPresses[player] += 1;
                this.addLog(`P${player + 1} pad pressed`);
            }

            // Like the keyboard version, this is the "everything is up" moment for that player.
            if (BT.isAnyButtonReleased(player)) {
                this.padReleases[player] += 1;
                this.addLog(`P${player + 1} pad ALL up`);
            }
        }
    }

    /**
     * Move the little title / play / game over loop one step on a key press.
     */
    advanceGate() {
        if (this.stage === STAGE_TITLE) {
            this.stage = STAGE_PLAY;
        } else if (this.stage === STAGE_PLAY) {
            this.playHits += 1;

            if (this.playHits >= HITS_TO_FINISH) {
                this.stage = STAGE_GAME_OVER;
            }
        } else {
            // Back to the title: clear the hit count so the next round starts from zero.
            this.stage = STAGE_TITLE;
            this.playHits = 0;
        }
    }

    /**
     * Add a line to the log, stamped with the engine tick, dropping the oldest when full.
     *
     * @param {string} text
     */
    addLog(text) {
        this.log.push(`t${BT.ticks} ${text}`);

        if (this.log.length > LOG_MAX) {
            this.log.shift();
        }
    }

    /**
     * The "press any key" gate and its overlap counter.
     */
    renderGatePanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: GATE_PANEL_X, y: PANEL_TOP_Y, width: PANEL_WIDTH });
        ui.panel('Gate: isAnyKeyPressed');
        ui.kv('Stage', this.stage);
        ui.kv('Hits', `${this.playHits}/${HITS_TO_FINISH}`);
        ui.kv('Overlap', this.overlapPresses);

        if (ui.hasTouch()) {
            // Touch screens have no keyboard, so say so once instead of staying silent.
            ui.label('Needs a keyboard', { color: 'warm' });
        } else if (this.stage === STAGE_TITLE) {
            ui.label('Press any key', { color: 'accent' });
        } else if (this.stage === STAGE_PLAY) {
            ui.label('Hold one, tap another', { color: 'dim' });
        } else {
            ui.label('Any key: title', { color: 'dim' });
        }

        ui.end();
    }

    /**
     * Press and repeat counters, with a slider for the repeat rate.
     */
    renderRepeatPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: REPEAT_PANEL_X, y: PANEL_TOP_Y, width: PANEL_WIDTH });
        ui.panel('Repeat while held');

        // The slider hands back its new value every frame. Rounding keeps it a whole number of ticks.
        this.repeatRate = Math.round(
            ui.slider('Ticks', this.repeatRate, {
                min: REPEAT_MIN,
                max: REPEAT_MAX,
                width: SLIDER_WIDTH,
            }),
        );

        // Plain presses (edge only) next to the extra fires that only the repeat rate adds.
        ui.kv('Press/rep', `${this.firstPresses}/${this.repeatFires}`);

        // Held state is safe to read in render(). Only the edges must stay in update().
        ui.pip('Any key held', BT.isAnyKeyDown());
        ui.end();
    }

    /**
     * One key's release versus the whole keyboard's release.
     */
    renderReleasePanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: RELEASE_PANEL_X, y: PANEL_TOP_Y, width: PANEL_WIDTH });
        ui.panel('Release: A vs all');
        ui.pip('A held (isKeyDown)', BT.isKeyDown(WATCHED_KEY));
        ui.kv('A released', this.watchedKeyReleases);
        ui.kv('All up', this.allUpReleases);
        ui.label('Hold A+S, free A', { color: 'dim' });
        ui.end();
    }

    /**
     * One row per gamepad slot, so "per player" is easy to see.
     */
    renderGamepadPanel() {
        ui.begin(UI_ANCHORS.TOP_LEFT, { x: PADS_PANEL_X, y: PANEL_TOP_Y, width: PANEL_WIDTH });
        ui.panel('Pads (press a button)');

        for (let player = 0; player < PLAYER_COUNT; player++) {
            // The dot is lit while that player holds any button. The numbers are the press and
            // "all up" counts for that slot.
            const text = `P${player + 1} ${this.padPresses[player]} press ${this.padReleases[player]} up`;

            ui.pip(text, BT.isAnyButtonDown(player));
        }
        ui.end();
    }

    /**
     * The event log along the bottom edge.
     */
    renderLog() {
        ui.begin(UI_ANCHORS.BOTTOM_LEFT, { width: LOG_PANEL_WIDTH });
        ui.panel('Event log (tick, event)');

        for (let i = 0; i < LOG_MAX; i++) {
            // Rows with no event yet show a dim "..." so the log keeps its full height.
            const line = this.log[i];

            ui.label(line ?? '...', { color: line === undefined ? 'dim' : 'text' });
        }

        ui.end();
    }
}

bootstrap(Demo);
