/**
 * The BLIT386 splash: a logo bitmap fading in, holding, and fading out on its
 * own gray ramp before the game's first frame.
 *
 * Owns its palette, its own {@link PaletteEffectManager}, and its own state
 * machine. It does *not* own the frame driver – `BTAPI.init()` calls
 * {@link Splash.advance} and {@link Splash.draw} from a `requestAnimationFrame`
 * loop that runs before the `GameLoop` is constructed. Keeping the loop outside
 * this class is what makes the state machine testable with a fake clock and
 * keeps the fixed-timestep accumulator from ever seeing splash time.
 *
 * No engine code outside this subsystem may branch on `fadingIn` / `fadingOut`.
 * The moment it does, the animation model becomes public API forever – which is
 * why {@link Splash.isVisible} is computed here rather than by the caller.
 */

import type { Palette } from '../assets/Palette';
import { ExposureFadeEffect, PaletteEffectManager } from '../assets/PaletteEffect';
import { SpriteSheet } from '../assets/SpriteSheet';
import { PixelGlitch } from '../render/effects/pixel/PixelGlitch';
import type { IRenderer } from '../render/IRenderer';
import { Rect2i } from '../utils/Rect2i';
import { Vector2i } from '../utils/Vector2i';
import {
    FADE_IN_MS,
    FADE_OUT_MS,
    GLITCH_BAND_HEIGHT,
    GLITCH_MAX_INTENSITY,
    HOLD_MIN_MS,
    RAMP_FIRST_SLOT,
} from './constants';
import { LOGO_HEIGHT, LOGO_PIXELS, LOGO_WIDTH } from './logoData';
import { createBlackened, createRamp } from './ramp';
import type { SplashOptions, SplashState } from './types';

/**
 * The splash's palette, five-state lifecycle, and drawing.
 *
 * Construct it, {@link Splash.start} it, then drive {@link Splash.advance} and
 * {@link Splash.draw} once per frame until {@link Splash.state} reaches `done`.
 */
export class Splash {
    /** Current lifecycle state. */
    private currentState: SplashState = 'disabled';

    /** Wall-clock time the current state was entered, in milliseconds. */
    private stateEnteredAt = 0;

    /** Whether the game's `init()` has settled (resolved or rejected). */
    private isInitSettled = false;

    /** Whether the viewer asked to skip, or reduced motion is preferred. Collapses the fade-in and the minimum hold. */
    private isSkipped = false;

    /** Whether reduced motion is preferred for this run. Set once, in {@link start}. */
    private isReducedMotion = false;

    /** The splash's own palette: slot 0 transparent, the gray ramp above it. */
    private readonly ramp: Palette;

    /** Live palette handed to the renderer; the effects fade this toward {@link ramp}. */
    private readonly live: Palette;

    /** Splash-local effect manager, so BTAPI's own manager is untouched. */
    private readonly effects: PaletteEffectManager;

    /** The logo, built synchronously from committed indexed bytes. */
    private readonly logo: SpriteSheet;

    /** Source rectangle covering the whole logo sheet. */
    private readonly logoSrc: Rect2i;

    /** Reused destination for the centered logo blit, so drawing allocates nothing. */
    private readonly logoDest = new Vector2i(0, 0);

    /** Reused background rectangle, resized per frame from the display size. */
    private readonly background = new Rect2i(0, 0, 0, 0);

    /** Clock function returning milliseconds. */
    private readonly timeProvider: () => number;

    /** WebGPU-only dissolve effect, or null on the software backend. */
    private glitch: PixelGlitch | null = null;

    /** Event target the skip listeners are attached to, or null when detached. */
    private skipTarget: EventTarget | null = null;

    /** Bound skip handler, retained so it can be removed again. */
    private readonly onSkipEvent: (event: Event) => void;

    /**
     * Creates a splash.
     *
     * @param options – Ramp endpoints. Both default to black and white.
     * @param timeProvider – Clock function returning milliseconds. Defaults to
     *   `performance.now()`. Pass a custom function for deterministic unit tests.
     */
    constructor(options: SplashOptions = {}, timeProvider: () => number = () => performance.now()) {
        this.timeProvider = timeProvider;
        this.ramp = createRamp(options.colorDark, options.colorLight);
        this.live = createBlackened(this.ramp);
        this.effects = new PaletteEffectManager(timeProvider);
        this.logo = SpriteSheet.fromIndexedPixels(LOGO_WIDTH, LOGO_HEIGHT, Uint8Array.from(LOGO_PIXELS));
        this.logoSrc = new Rect2i(0, 0, LOGO_WIDTH, LOGO_HEIGHT);

        this.onSkipEvent = (event: Event): void => {
            // Capture phase, so this runs before anything the page or the game
            // wired up. preventDefault stops the browser's own reaction (scroll,
            // zoom, focus move); the engine input subsystems are drained by the
            // caller at handoff so the game's first update() sees no press edge.
            if (event.cancelable) {
                event.preventDefault();
            }

            this.skip();
        };
    }

    /**
     * Current lifecycle state.
     *
     * @returns The state this splash is in right now.
     */
    get state(): SplashState {
        return this.currentState;
    }

    /**
     * Whether the splash is on screen.
     *
     * The derived one-term query consumers should use: `disabled` and `done` are
     * indistinguishable to them.
     *
     * @returns `true` while fading in, holding, or fading out.
     */
    get isVisible(): boolean {
        return this.currentState === 'fadingIn' || this.currentState === 'shown' || this.currentState === 'fadingOut';
    }

    /**
     * The palette the renderer must draw the splash through.
     *
     * A live reference: the fade effects mutate it in place each frame.
     *
     * @returns The splash's live palette.
     */
    get palette(): Palette {
        return this.live;
    }

    /**
     * The dissolve effect, when one is running.
     *
     * Exposed so the caller can register and, critically, *unregister it by exact
     * reference* – the game's `init()` runs concurrently and may have added effects
     * of its own, so clearing the chain is never correct here.
     *
     * @returns The glitch effect, or null on the software backend.
     */
    get dissolveEffect(): PixelGlitch | null {
        return this.glitch;
    }

    /**
     * Begins the splash, entering `fadingIn` and starting the fade up from black.
     *
     * Calling this more than once is a no-op, so a re-entrant caller cannot
     * restart a finished splash.
     *
     * @param reducedMotion – When `true`, skips the fade-in effect entirely (the palette
     *   snaps straight to the fully lit ramp) and collapses the minimum hold the same way a
     *   manual {@link skip} does, without waiting for a press.
     */
    public start(reducedMotion: boolean = false): void {
        if (this.currentState !== 'disabled') {
            return;
        }

        this.isReducedMotion = reducedMotion;
        this.enter('fadingIn', this.timeProvider());

        if (reducedMotion) {
            this.live.copyFrom(this.ramp);
            this.isSkipped = true;
        } else {
            this.effects.add(new ExposureFadeEffect(this.live, this.ramp, FADE_IN_MS));
        }
    }

    /**
     * Turns on the pixelated dissolve.
     *
     * Called only when the active backend is WebGPU: the effect is pixel-tier and
     * the Canvas 2D software renderer throws on post-process. Software gets the
     * palette fades alone, which is the accepted lower-fidelity floor.
     */
    public enableDissolve(): void {
        if (this.glitch) {
            // Idempotent on purpose: the caller registers the effect by reference and
            // removes it the same way, so replacing the instance would orphan the
            // registered one in the renderer's chain.
            return;
        }

        this.glitch = new PixelGlitch();
        this.glitch.bandHeight = GLITCH_BAND_HEIGHT;
        this.glitch.intensity = 0;
    }

    /**
     * Steps the state machine and the palette effects by one frame.
     *
     * Reads the clock through the injected provider, so unit tests drive it
     * without sleeping. One call may cross more than one boundary – a first frame
     * scheduled late, or a backgrounded tab, can land well past a short fade – so
     * transitions cascade until the machine settles.
     */
    public advance(): void {
        if (this.currentState === 'disabled' || this.currentState === 'done') {
            return;
        }

        this.effects.update(this.live);

        while (this.transition()) {
            // Keep going while boundaries remain crossed in this frame.
        }

        // After the transitions settle, so intensity reflects the state actually
        // being drawn this frame rather than the one entered on the way here.
        this.updateDissolve(this.timeProvider() - this.stateEnteredAt);
    }

    /**
     * Draws one splash frame: a filled background with the logo centered on it.
     *
     * Index 0 is transparent, so the background is drawn explicitly as the ramp's
     * dark end rather than left to reveal the clear color.
     *
     * `IRenderer` exposes no display size, so the caller passes it – `BTAPI` is
     * the one that knows it.
     *
     * @param renderer – Active renderer; the caller has already begun the frame.
     * @param displaySize – Logical display size in pixels.
     */
    public draw(renderer: IRenderer, displaySize: Vector2i): void {
        this.background.set(0, 0, displaySize.x, displaySize.y);

        renderer.drawRectFill(this.background, RAMP_FIRST_SLOT);

        this.logoDest.set(Math.floor((displaySize.x - LOGO_WIDTH) / 2), Math.floor((displaySize.y - LOGO_HEIGHT) / 2));

        renderer.drawSprite(this.logo, this.logoSrc, this.logoDest);
    }

    /**
     * Records that the game's `init()` has settled.
     *
     * The hold has a minimum but no maximum: it extends until this is called, so
     * the splash doubles as a loading screen. Called on both success and failure,
     * so a failed `init()` cannot leave the splash holding forever.
     */
    public markInitSettled(): void {
        this.isInitSettled = true;
    }

    /**
     * Collapses the remaining fade-in and the minimum hold.
     *
     * Skip cannot mean "start now": when the splash is also the loading screen,
     * the handoff still waits on {@link markInitSettled}. Normal runs leave the
     * fade-out at its full duration because it is the handoff into the game's
     * palette, not decoration; reduced-motion runs complete it immediately instead
     * (see {@link leaveShown}).
     */
    public skip(): void {
        if (this.currentState === 'disabled' || this.currentState === 'done') {
            return;
        }

        this.isSkipped = true;
    }

    /**
     * Installs capture-phase skip listeners.
     *
     * Any key, click, or tap skips. The game loop is suspended for the splash's
     * whole duration, so the input is free to take.
     *
     * @param target – Event target to listen on, normally `window`.
     */
    public attachSkipInput(target: EventTarget): void {
        this.detachSkipInput();

        // Not every host is an event target. The engine's own unit tests run in node,
        // where `globalThis` has no `addEventListener`, and the splash still has to
        // run to completion there rather than throwing out of `BTAPI.init()`.
        if (typeof target?.addEventListener !== 'function') {
            return;
        }

        this.skipTarget = target;

        target.addEventListener('keydown', this.onSkipEvent, { capture: true });
        target.addEventListener('pointerdown', this.onSkipEvent, { capture: true });
    }

    /** Removes the skip listeners. Safe to call when nothing is attached. */
    public detachSkipInput(): void {
        if (!this.skipTarget) {
            return;
        }

        this.skipTarget.removeEventListener('keydown', this.onSkipEvent, { capture: true });
        this.skipTarget.removeEventListener('pointerdown', this.onSkipEvent, { capture: true });

        this.skipTarget = null;
    }

    /**
     * Applies at most one state transition.
     *
     * A state that expires naturally hands its leftover time to the next one –
     * the entry stamp advances by the elapsed state's exact duration rather than
     * to the current clock reading – so a single late frame cannot stretch the
     * whole sequence. A skipped state has no duration to carry, so it stamps at
     * the current reading instead.
     *
     * @returns `true` when a transition happened and another may follow.
     */
    private transition(): boolean {
        const now = this.timeProvider();
        const elapsed = now - this.stateEnteredAt;

        if (this.currentState === 'fadingIn') {
            if (this.isSkipped) {
                this.enter('shown', now);

                return true;
            }

            if (elapsed >= FADE_IN_MS) {
                this.enter('shown', this.stateEnteredAt + FADE_IN_MS);

                return true;
            }

            return false;
        }

        if (this.currentState === 'shown') {
            return this.leaveShown(now, elapsed);
        }

        if (this.currentState === 'fadingOut' && elapsed >= FADE_OUT_MS) {
            this.enter('done', this.stateEnteredAt + FADE_OUT_MS);
            this.effects.clear();

            return true;
        }

        return false;
    }

    /**
     * Leaves `shown` for `fadingOut` once the hold is satisfied.
     *
     * The hold has a minimum but no maximum, so this refuses to move until the
     * game's `init()` has settled however long a skip has been waiting.
     *
     * @param now – Current clock reading in milliseconds.
     * @param elapsed – Milliseconds spent in `shown`.
     * @returns `true` when the state changed.
     */
    private leaveShown(now: number, elapsed: number): boolean {
        if (!this.isInitSettled) {
            return false;
        }

        if (this.isSkipped) {
            this.enter('fadingOut', now);
        } else if (elapsed >= HOLD_MIN_MS) {
            this.enter('fadingOut', this.stateEnteredAt + HOLD_MIN_MS);
        } else {
            return false;
        }

        // A skip can leave the fade-in still running. Clearing first stops the two
        // effects fighting over the same palette for the rest of the fade-in's duration.
        this.effects.clear();

        if (this.isReducedMotion) {
            // Instant swap: snap to black and immediately back-date entry time so the very
            // next transition() check sees the fade-out duration as already elapsed.
            this.live.copyFrom(createBlackened(this.live));
            this.stateEnteredAt -= FADE_OUT_MS;
        } else {
            this.effects.add(new ExposureFadeEffect(this.live, createBlackened(this.live), FADE_OUT_MS));
        }

        return true;
    }

    /**
     * Drives dissolve intensity from the current state's progress.
     *
     * Peaks at the start of the fade-in and the end of the fade-out, and sits at
     * zero through the hold, so the logo is clean while it is being read.
     *
     * @param elapsed – Milliseconds since the current state was entered.
     */
    private updateDissolve(elapsed: number): void {
        const glitch = this.glitch;

        if (!glitch) {
            return;
        }

        // Vary the band noise per frame so consecutive frames do not shear identically.
        glitch.seed = elapsed;

        if (this.currentState === 'fadingIn') {
            const t = Math.min(1, elapsed / FADE_IN_MS);

            glitch.intensity = GLITCH_MAX_INTENSITY * (1 - t);

            return;
        }

        if (this.currentState === 'fadingOut') {
            const t = Math.min(1, elapsed / FADE_OUT_MS);

            glitch.intensity = GLITCH_MAX_INTENSITY * t;

            return;
        }

        glitch.intensity = 0;
    }

    /**
     * Transitions to a new state and stamps when it was entered.
     *
     * @param next – State to enter.
     * @param at – Effective entry time in milliseconds.
     */
    private enter(next: SplashState, at: number): void {
        this.currentState = next;
        this.stateEnteredAt = at;
    }
}
