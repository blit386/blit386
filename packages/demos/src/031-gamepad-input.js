/**
 * Gamepad Input Demo - analog sticks, triggers, and face-button masks.
 *
 * Demo 031 in the BLIT386 demo series.
 * Prerequisites: 001-Basics (https://demos.blit386.dev/001-basics),
 * 028-Keyboard-Input (https://demos.blit386.dev/028-keyboard-input).
 *
 * This demo gives you a tiny "hover pod" toy you can steer with a gamepad:
 * - Left stick moves the pod around the arena.
 * - Right stick moves a small aim cursor.
 * - Trigger pressure changes pod size (a little "throttle" feeling).
 * - A cycles pod color, B toggles a small trail, Start resets position.
 *
 * It also shows `BT.isGamepadConnected`, `BT.gamepadCount`, `BT.getAxis`, and
 * a bitmask button check with `BT.isDown(BT.BTN_A | BT.BTN_B, player)`.
 *
 * The status panel on the right comes from the shared UI kit in src/shared/ui.js:
 * pip rows light up while buttons are physically held, key-value rows show the raw
 * stick axis numbers, and a meter bar fills with trigger pressure. The demo itself
 * still needs a real gamepad - the kit only draws the readouts (and shows a friendly
 * note on touch screens, where a gamepad is usually not available).
 *
 * Try this:
 * - Plug in a gamepad and press any button so the browser wakes it up.
 * - Move the left stick to fly the pod; move the right stick to drag the crosshair.
 * - Squeeze either trigger and watch the pod grow (whichever trigger reads higher wins).
 * - Hold A and B together and watch the "(A|B) mask" pip in the panel light up.
 *
 * Live version: https://demos.blit386.dev/031-gamepad-input
 */

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

import { applyTheme, ui } from './shared/ui.js';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

const PLAYER = BT.PLAYER_ONE;

// Scene palette indices. Slot 0 stays transparent; toy colors start at 1. The shared UI
// kit's applyTheme() adds its own twelve colors way up at slots 240+, so nothing collides.
const C_POD_OUTLINE = 1; // Pod outline white; doubles as the timing-chart render bar.
const C_ARENA = 2; // Filled interior of the steering arena.
const C_ARENA_BORDER = 3; // Arena border rectangle.
const C_CHART_DIM = 4; // Timing-chart update bar (soft gray).
const C_CHART_TAG = 5; // Timing-chart milestone tag color (amber).
const C_POD_A = 6; // First pod color (cycles with A).
const C_POD_B = 7; // Second pod color.
const C_POD_C = 8; // Third pod color.
const C_TRAIL = 9; // Semi-transparent white pixels when trail is on.
const C_AIM = 10; // Right-stick crosshair color.

// The play arena rectangle, in display pixels. It sits below the title strip and the
// hint text, and stops short of the status panel on the right.
const ARENA_X = 8;
const ARENA_Y = 108;
const ARENA_W = 200;
const ARENA_H = 124;

const POD_BASE_SIZE = 10;
const POD_MAX_EXTRA_SIZE = 10;
const POD_SPEED = 3;
const AIM_SPEED = 4;
const TRAIL_MAX = 28;

// Width in pixels of the trigger pressure meter bar in the status panel.
const THROTTLE_METER_W = 80;

/**
 * Format a stick axis value (-1..+1) as a fixed-width string like '+0.50' or '-0.32'.
 * Writing the '+' out keeps every row the same width, so the numbers in the panel do
 * not jiggle left and right as the sign flips.
 *
 * @param {number} value
 * @returns {string}
 */
function formatAxis(value) {
    // toFixed(2) rounds to two decimal places and always prints both (0.5 -> '0.50').
    return (value >= 0 ? '+' : '') + value.toFixed(2);
}

/**
 * Tiny gamepad playground that visualizes sticks, triggers, and buttons.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Palette slots of the shared UI theme colors, filled by applyTheme() in init().
    /** @type {ReturnType<typeof applyTheme> | null} */
    theme = null;

    // Pod position in integer display pixels.
    podPos = new Vector2i(Math.floor(DISPLAY_W / 2), Math.floor(DISPLAY_H / 2));

    // Small cursor moved by the right stick so both sticks have visible jobs.
    aimPos = new Vector2i(Math.floor(DISPLAY_W / 2) + 28, Math.floor(DISPLAY_H / 2));

    // Pod/aim position at the START of the most recent update() tick, before this
    // tick's stick input moved them. render() blends between these and podPos/aimPos
    // using BT.renderAlpha so the pod and aim cursor glide smoothly between physics
    // ticks instead of jumping - see "Interpolating render state with renderAlpha" in
    // the engine's docs/api-game-loop.md. Start equal to podPos/aimPos so the very
    // first frame does not blend in from a stale position.
    prevPodPos = this.podPos;
    prevAimPos = this.aimPos;

    // Trail points for optional motion history.
    /** @type {Vector2i[]} */
    trail = [];
    trailEnabled = false;

    // Cycles through three pod colors when A is pressed.
    podColorIndex = 0;

    wasConnected = false;

    /**
     * Arena size, timing chart colors, and default overlay flags.
     *
     * @returns {Partial<HardwareSettings>}
     */
    configure() {
        return {
            displaySize: new Vector2i(DISPLAY_W, DISPLAY_H),
            isOverlayTimingChartEnabled: true,
            overlayTimingChartStyle: {
                updateBarPaletteIndex: C_CHART_DIM,
                renderBarPaletteIndex: C_POD_OUTLINE,
                tagPaletteIndex: C_CHART_TAG,
            },
        };
    }

    /**
     * Build a small custom palette, install the shared UI theme, and start centered.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // Build a small custom palette before any drawing happens.
        // Think of each slot as a numbered paint can the engine looks up while rendering.
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_POD_OUTLINE, new Color32(245, 248, 255));
        this.palette.set(C_ARENA, new Color32(24, 30, 47));
        this.palette.set(C_ARENA_BORDER, new Color32(68, 80, 108));
        this.palette.set(C_CHART_DIM, new Color32(130, 144, 173));
        this.palette.set(C_CHART_TAG, new Color32(255, 190, 95));
        this.palette.set(C_POD_A, new Color32(120, 255, 170));
        this.palette.set(C_POD_B, new Color32(255, 130, 140));
        this.palette.set(C_POD_C, new Color32(120, 185, 255));
        this.palette.set(C_TRAIL, new Color32(255, 255, 255, 120));
        this.palette.set(C_AIM, new Color32(255, 220, 130));

        // The shared UI kit needs its theme colors in the palette before any ui.* call
        // can draw. applyTheme() writes them into high slots (240 and up), far away from
        // the scene slots above, and hands back a map like { bg: 240, text: 244, ... }
        // so this demo can reuse theme colors for its own drawing (we clear with bg).
        this.theme = applyTheme(this.palette);

        // Tell the engine to use this palette for every draw call from now on.
        BT.paletteSet(this.palette);

        // Place the pod and aim cursor in the middle of the arena.
        this.resetPod();
        return true;
    }

    /**
     * Read gamepad input and update toy state.
     */
    update() {
        // Let the UI kit do its once-per-tick housekeeping first. This demo has no kit
        // buttons or key bindings, but ui.tick() also tracks whether the screen has ever
        // been touched - that is what feeds the ui.hasTouch() hint drawn in render().
        ui.tick();

        // Ask the engine whether a gamepad is currently plugged in for this player slot.
        const connected = BT.isGamepadConnected(PLAYER);

        // "Edge detection": we only want to react the moment the gamepad is first connected,
        // not every single frame it stays connected. So we compare the current state
        // to what it was last frame (stored in wasConnected).
        // If it just became true (false -> true), that is the "rising edge" - the instant of connection.
        if (connected && !this.wasConnected) {
            // Label this moment on the overlay timing chart so you can see exactly
            // which frame the gamepad was detected.
            BT.assignTag('Gamepad connected');
        }

        // Save this frame's connection state so next frame can compare against it.
        this.wasConnected = connected;

        // A press (edge) cycles pod color once per physical press.
        if (BT.isPressed(BT.BTN_A, PLAYER)) {
            this.podColorIndex = (this.podColorIndex + 1) % 3;
        }

        // B press (edge) toggles trail drawing.
        if (BT.isPressed(BT.BTN_B, PLAYER)) {
            this.trailEnabled = !this.trailEnabled;

            // Clearing keeps the trail from "teleporting" across toggles.
            if (!this.trailEnabled) {
                this.trail = [];
            }
        }

        // Start recenters the toy instantly.
        if (BT.isPressed(BT.BTN_START, PLAYER)) {
            this.resetPod();
        }

        // Axes are dead-zone filtered by the engine.
        const moveX = BT.getAxis(BT.AXIS_LEFT_X, PLAYER);
        const moveY = BT.getAxis(BT.AXIS_LEFT_Y, PLAYER);
        const aimX = BT.getAxis(BT.AXIS_RIGHT_X, PLAYER);
        const aimY = BT.getAxis(BT.AXIS_RIGHT_Y, PLAYER);
        const throttle = Math.max(BT.getAxis(BT.AXIS_TRIGGER_L, PLAYER), BT.getAxis(BT.AXIS_TRIGGER_R, PLAYER));

        // Remember where the pod and aim cursor were before this tick moves them, so
        // render() can draw a smooth in-between position instead of a pop.
        this.prevPodPos = this.podPos;
        this.prevAimPos = this.aimPos;

        // Convert analog float values into integer pixel steps.
        this.podPos = this.podPos.add(new Vector2i(Math.round(moveX * POD_SPEED), Math.round(moveY * POD_SPEED)));
        this.aimPos = this.aimPos.add(new Vector2i(Math.round(aimX * AIM_SPEED), Math.round(aimY * AIM_SPEED)));

        const podHalf = this.currentPodHalfSize(throttle);
        this.podPos = this.clampToArena(this.podPos, podHalf);
        this.aimPos = this.clampToArena(this.aimPos, 4);

        if (this.trailEnabled) {
            this.trail.push(this.podPos);

            if (this.trail.length > TRAIL_MAX) {
                this.trail.shift();
            }
        }
    }

    /**
     * Draw the toy arena and the UI kit groups: title bar, hints, and the status panel.
     */
    render() {
        // Erase last frame with the shared theme background, then redraw from scratch.
        BT.clear(this.theme.bg);

        // The full-width title strip along the top edge.
        ui.begin('topBar');
        ui.panel('Gamepad Input - sticks, triggers, button masks');
        ui.end();

        this.renderHints();
        this.renderArena();
        this.renderStatusPanel();

        // When no gamepad is plugged in yet, show a friendly prompt inside the arena.
        if (!BT.isGamepadConnected(PLAYER)) {
            this.renderEmptyState();
        }
    }

    /**
     * Return one of the pod palette colors.
     *
     * @returns {number}
     */
    currentPodColor() {
        if (this.podColorIndex === 0) {
            return C_POD_A;
        }

        if (this.podColorIndex === 1) {
            return C_POD_B;
        }

        return C_POD_C;
    }

    /**
     * Convert trigger pressure (0..1) into integer size.
     *
     * @param {number} throttle
     * @returns {number}
     */
    currentPodSize(throttle) {
        return POD_BASE_SIZE + Math.round(throttle * POD_MAX_EXTRA_SIZE);
    }

    /**
     * Return half of the rendered pod size, floored for integer pixels.
     *
     * @param {number} throttle
     * @returns {number}
     */
    currentPodHalfSize(throttle) {
        return Math.floor(this.currentPodSize(throttle) / 2);
    }

    /**
     * Keep a square centered point inside the play area.
     *
     * @param {Vector2i} pos
     * @param {number} radius
     * @returns {Vector2i}
     */
    clampToArena(pos, radius) {
        // The center may come no closer to a wall than its own radius, so the pod's
        // edge stops right at the arena border instead of poking through it.
        const minX = ARENA_X + radius;
        const maxX = ARENA_X + ARENA_W - 1 - radius;
        const minY = ARENA_Y + radius;
        const maxY = ARENA_Y + ARENA_H - 1 - radius;

        // Math.min picks the smaller of two numbers, Math.max the larger; chaining them
        // "clamps" a value so it can never leave the min..max range.
        const clampedX = Math.max(minX, Math.min(maxX, pos.x));
        const clampedY = Math.max(minY, Math.min(maxY, pos.y));

        return new Vector2i(clampedX, clampedY);
    }

    /**
     * Reset pod and aim cursor near the arena center.
     */
    resetPod() {
        this.podPos = new Vector2i(ARENA_X + Math.floor(ARENA_W / 2), ARENA_Y + Math.floor(ARENA_H / 2));
        this.aimPos = this.podPos.add(new Vector2i(28, 0));

        // Snap prevPodPos/prevAimPos to match, so render() does not blend in from
        // wherever the pod was before the reset (Start button press).
        this.prevPodPos = this.podPos;
        this.prevAimPos = this.aimPos;

        this.trail = [];
    }

    /**
     * Control hints under the title bar, drawn as a borderless kit group (labels only,
     * no panel background). On touch screens an extra warm line explains that this
     * particular demo cannot work without a physical gamepad.
     */
    renderHints() {
        ui.begin('topLeft', { y: 28 });
        ui.label('Left stick move | Right stick aim', { color: 'dim' });
        ui.label('Triggers = pod size', { color: 'dim' });
        ui.label('A color | B trail | Start reset', { color: 'dim' });

        // ui.hasTouch() turns true after the first touch contact and stays true. Touch
        // devices rarely have a gamepad attached, so warn those visitors up front.
        if (ui.hasTouch()) {
            ui.label('This demo needs a gamepad', { color: 'warm' });
        }

        ui.end();
    }

    /**
     * Draw arena border, optional trail, pod, and aim cursor.
     */
    renderArena() {
        // Play area: filled panel with a border so the pod has walls to bounce against visually.
        BT.drawRectFill(new Rect2i(ARENA_X, ARENA_Y, ARENA_W, ARENA_H), C_ARENA);
        BT.drawRect(new Rect2i(ARENA_X, ARENA_Y, ARENA_W, ARENA_H), C_ARENA_BORDER);

        // Optional breadcrumb trail: one pixel per past pod position when B toggled it on.
        if (this.trailEnabled) {
            for (let i = 0; i < this.trail.length; i++) {
                const p = this.trail[i];
                BT.drawPixel(p, C_TRAIL);
            }
        }

        // BT.getAxis returns a float from about -1 to +1 for sticks, 0 to +1 for triggers.
        // The engine applies a "dead zone" first: tiny wobble near center becomes 0 so the
        // pod does not drift when you let go of the stick.
        // We read BOTH triggers and keep whichever is squeezed harder (Math.max).
        const throttle = Math.max(BT.getAxis(BT.AXIS_TRIGGER_L, PLAYER), BT.getAxis(BT.AXIS_TRIGGER_R, PLAYER));
        const size = this.currentPodSize(throttle);
        const half = this.currentPodHalfSize(throttle);

        // Blend each entity's previous and current tick position by BT.renderAlpha so the
        // pod and aim cursor glide smoothly across render frames instead of snapping to a
        // new spot only once per physics tick (see the prevPodPos/prevAimPos comment above).
        const pod = Vector2i.lerp(this.prevPodPos, this.podPos, BT.renderAlpha);
        const aim = Vector2i.lerp(this.prevAimPos, this.aimPos, BT.renderAlpha);

        // Draw the pod as a square centered on podPos; white outline makes it pop on the panel.
        BT.drawRectFill(new Rect2i(pod.x - half, pod.y - half, size, size), this.currentPodColor());
        BT.drawRect(new Rect2i(pod.x - half, pod.y - half, size, size), C_POD_OUTLINE);

        // Right-stick aim cursor: small crosshair so both sticks have visible jobs.
        BT.drawLine(new Vector2i(aim.x - 4, aim.y), new Vector2i(aim.x + 4, aim.y), C_AIM);
        BT.drawLine(new Vector2i(aim.x, aim.y - 4), new Vector2i(aim.x, aim.y + 4), C_AIM);
    }

    /**
     * The right-hand status panel: connection info, live button pips, raw stick axis
     * numbers, and a trigger pressure meter.
     *
     * Everything read here is HELD state or an axis value, both safe to read in render().
     * Button EDGES (BT.isPressed - "did it go down this exact frame?") must stay in
     * update(), where this demo already handles them (028-keyboard-input explains why).
     */
    renderStatusPanel() {
        // Bitmask OR: BT.BTN_A | BT.BTN_B builds one mask. isDown returns true when
        // **either** button is held - handy for "press any of these" checks in games.
        // The two single-button pips above it let you watch the OR happen live.
        const aHeld = BT.isDown(BT.BTN_A, PLAYER);
        const bHeld = BT.isDown(BT.BTN_B, PLAYER);
        const maskHeld = BT.isDown(BT.BTN_A | BT.BTN_B, PLAYER);

        // Raw axis values for the readout rows - the same calls the movement code uses.
        const moveX = BT.getAxis(BT.AXIS_LEFT_X, PLAYER);
        const moveY = BT.getAxis(BT.AXIS_LEFT_Y, PLAYER);
        const aimX = BT.getAxis(BT.AXIS_RIGHT_X, PLAYER);
        const aimY = BT.getAxis(BT.AXIS_RIGHT_Y, PLAYER);
        const throttle = Math.max(BT.getAxis(BT.AXIS_TRIGGER_L, PLAYER), BT.getAxis(BT.AXIS_TRIGGER_R, PLAYER));

        ui.begin('topRight', { y: 28 });
        ui.panel('Gamepad');

        // How many gamepads the browser reports, and whether player one has one.
        ui.kv('Pads', BT.gamepadCount);
        ui.pip('P1 connected', BT.isGamepadConnected(PLAYER));

        // Pips light up while a button is physically held down right now.
        ui.pip('A held', aHeld);
        ui.pip('B held', bHeld);
        ui.pip('(A|B) mask', maskHeld);
        ui.separator();

        // LX/LY are the left stick, RX/RY the right stick, each from -1.00 to +1.00.
        ui.kv('LX', formatAxis(moveX));
        ui.kv('LY', formatAxis(moveY));
        ui.kv('RX', formatAxis(aimX));
        ui.kv('RY', formatAxis(aimY));

        // The meter fills left-to-right with trigger pressure (0 = released, 1 = fully
        // squeezed) - the same value that grows the pod.
        ui.meter('Throttle', throttle, { width: THROTTLE_METER_W });
        ui.end();
    }

    /**
     * The "no gamepad yet" prompt, shown inside the empty arena. Same wording as the
     * old hand-drawn warning, restyled as warm kit labels in a borderless group.
     */
    renderEmptyState() {
        ui.begin('topLeft', { x: ARENA_X + 12, y: ARENA_Y + 42 });
        ui.label('Connect a gamepad and press', { color: 'warm' });
        ui.label('any button to wake it.', { color: 'warm' });
        ui.end();
    }
}

bootstrap(Demo);
