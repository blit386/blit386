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
 * Try this:
 * - Plug in a gamepad and press any button so the browser wakes it up.
 * - Move the left stick to fly the pod; move the right stick to drag the crosshair.
 * - Squeeze either trigger and watch the pod grow (whichever trigger reads higher wins).
 * - Hold A and B together and read the "(A|B) mask down" line in the HUD.
 *
 * Live version: https://demos.blit386.dev/031-gamepad-input
 */

// @pageTitle BLIT386 Demo 031 - Gamepad Input

import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

/** @typedef {import('blit386').IBTDemo} IBTDemo */

/** @typedef {import('blit386').HardwareSettings} HardwareSettings */
/** @typedef {import('blit386').Palette} Palette */

const DISPLAY_W = 320;
const DISPLAY_H = 240;

const PLAYER = BT.PLAYER_ONE;

// Palette indices. Slot 0 stays transparent; toy and HUD colors start at 1.
const C_WHITE = 1; // Pod outline and timing-chart render bar.
const C_BG = 2; // Screen background outside the play arena.
const C_PANEL = 3; // Filled interior of the steering arena.
const C_PANEL_BORDER = 4; // Arena border rectangle.
const C_DIM = 5; // HUD hint text and timing-chart update bar.
const C_ACCENT = 6; // "Connect a gamepad" warning and chart tags.
const C_POD_A = 7; // First pod color (cycles with A).
const C_POD_B = 8; // Second pod color.
const C_POD_C = 9; // Third pod color.
const C_TRAIL = 10; // Semi-transparent white pixels when trail is on.
const C_AIM = 11; // Right-stick crosshair color.

const POD_BASE_SIZE = 10;
const POD_MAX_EXTRA_SIZE = 10;
const POD_SPEED = 3;
const AIM_SPEED = 4;
const TRAIL_MAX = 28;

/**
 * Tiny gamepad playground that visualizes sticks, triggers, and buttons.
 *
 * @implements {IBTDemo}
 */
class Demo {
    /** @type {Palette | null} */
    palette = null;

    // Pod position in integer display pixels.
    podPos = new Vector2i(Math.floor(DISPLAY_W / 2), Math.floor(DISPLAY_H / 2));

    // Small cursor moved by the right stick so both sticks have visible jobs.
    aimPos = new Vector2i(Math.floor(DISPLAY_W / 2) + 28, Math.floor(DISPLAY_H / 2));

    // Trail points for optional motion history.
    /** @type {Vector2i[]} */
    trail = [];
    trailEnabled = false;

    // Cycles through three pod colors when A is pressed.
    podColorIndex = 0;

    wasConnected = false;

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
        const minX = 8 + radius;
        const maxX = DISPLAY_W - 9 - radius;
        const minY = 44 + radius;
        const maxY = DISPLAY_H - 9 - radius;

        const clampedX = Math.max(minX, Math.min(maxX, pos.x));
        const clampedY = Math.max(minY, Math.min(maxY, pos.y));

        return new Vector2i(clampedX, clampedY);
    }

    /**
     * Reset pod and aim cursor near center.
     */
    resetPod() {
        this.podPos = new Vector2i(Math.floor(DISPLAY_W / 2), Math.floor((44 + DISPLAY_H - 8) / 2));
        this.aimPos = this.podPos.add(new Vector2i(28, 0));
        this.trail = [];
    }

    /**
     * Draw arena border, optional trail, pod, and aim cursor.
     */
    renderArena() {
        // Play area: filled panel with a border so the pod has walls to bounce against visually.
        BT.drawRectFill(new Rect2i(8, 44, DISPLAY_W - 16, DISPLAY_H - 52), C_PANEL);
        BT.drawRect(new Rect2i(8, 44, DISPLAY_W - 16, DISPLAY_H - 52), C_PANEL_BORDER);

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

        // Draw the pod as a square centered on podPos; white outline makes it pop on the panel.
        BT.drawRectFill(new Rect2i(this.podPos.x - half, this.podPos.y - half, size, size), this.currentPodColor());
        BT.drawRect(new Rect2i(this.podPos.x - half, this.podPos.y - half, size, size), C_WHITE);

        // Right-stick aim cursor: small crosshair so both sticks have visible jobs.
        BT.drawLine(
            new Vector2i(this.aimPos.x - 4, this.aimPos.y),
            new Vector2i(this.aimPos.x + 4, this.aimPos.y),
            C_AIM,
        );
        BT.drawLine(
            new Vector2i(this.aimPos.x, this.aimPos.y - 4),
            new Vector2i(this.aimPos.x, this.aimPos.y + 4),
            C_AIM,
        );
    }

    /**
     * Draw gamepad status and quick button hints.
     */
    renderHud() {
        const connected = BT.isGamepadConnected(PLAYER);
        const count = BT.gamepadCount;

        // Bitmask OR: BT.BTN_A | BT.BTN_B builds one mask. isDown returns true when
        // **either** button is held - handy for "press any of these" checks in games.
        const aOrB = BT.isDown(BT.BTN_A | BT.BTN_B, PLAYER);
        const controlsHint = 'A cycle color | B toggle trail | Start reset';
        const maskHint = `(A|B) mask down: ${aOrB ? 'true' : 'false'}`;

        BT.systemPrint(new Vector2i(10, 200), C_DIM, `Gamepads: ${count} | P1 connected: ${connected ? 'yes' : 'no'}`);
        BT.systemPrint(new Vector2i(10, 212), C_DIM, `${controlsHint} | ${maskHint}`);

        if (!connected) {
            BT.systemPrint(new Vector2i(10, 34), C_ACCENT, 'Connect a gamepad and press any button to wake it.');
        }
    }

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
                updateBarPaletteIndex: C_DIM,
                renderBarPaletteIndex: C_WHITE,
                tagPaletteIndex: C_ACCENT,
            },
        };
    }

    /**
     * Build a small custom palette and start centered.
     *
     * @returns {Promise<boolean>}
     */
    async init() {
        // Build a small custom palette before any drawing happens.
        // Think of each slot as a numbered paint can the engine looks up while rendering.
        this.palette = BT.paletteCreate(256);

        this.palette.set(C_WHITE, new Color32(245, 248, 255));
        this.palette.set(C_BG, new Color32(10, 13, 23));
        this.palette.set(C_PANEL, new Color32(24, 30, 47));
        this.palette.set(C_PANEL_BORDER, new Color32(68, 80, 108));
        this.palette.set(C_DIM, new Color32(130, 144, 173));
        this.palette.set(C_ACCENT, new Color32(255, 190, 95));
        this.palette.set(C_POD_A, new Color32(120, 255, 170));
        this.palette.set(C_POD_B, new Color32(255, 130, 140));
        this.palette.set(C_POD_C, new Color32(120, 185, 255));
        this.palette.set(C_TRAIL, new Color32(255, 255, 255, 120));
        this.palette.set(C_AIM, new Color32(255, 220, 130));

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
     * Draw the toy arena and live input readouts.
     */
    render() {
        // Erase last frame, then redraw the toy and HUD from scratch.
        BT.clear(C_BG);

        // One-line control summary at the top of the logical screen.
        BT.systemPrint(new Vector2i(8, 18), C_DIM, 'Left stick move | Right stick aim | Triggers = pod size');

        this.renderArena();
        this.renderHud();
    }
}

bootstrap(Demo);
