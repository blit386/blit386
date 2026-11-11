/**
 * The boot splash during init(): run the game's init() behind the splash, play the splash frames, and hand
 * the screen and palette over to the game. Part of {@link BTAPI}; not part of the BT API.
 */

import { isSplashEnabled, Splash } from '../../splash';
import { Vector2i } from '../../utils/Vector2i';
import type { BTAPI } from '../BTAPI';
import type { HardwareSettings, IBTDemo } from '../IBTDemo';
import { ReducedMotion } from '../ReducedMotion';

/** Runs the game's init() behind the BLIT386 boot splash. */
export class SplashBoot {
    /**
     * Creates the part for one engine.
     *
     * @param engine - The engine this part belongs to.
     */
    public constructor(private readonly engine: BTAPI) {}

    /**
     * Runs the game's `init()`, behind the splash when one is playing.
     *
     * @param demo - Demo whose `init()` runs.
     * @param hwSettings - Resolved hardware settings for this run.
     * @returns Whatever the demo's `init()` resolved to.
     */
    public async runDemoInitWithSplash(demo: IBTDemo, hwSettings: HardwareSettings): Promise<boolean> {
        const splash = this.engine.splash;

        if (!splash || this.engine.isRestartAfterSplash) {
            return this.engine.runDemoInit(demo);
        }

        return this.runDemoInitBehindSplash(demo, splash, hwSettings.displaySize);
    }

    /**
     * Drives the splash's own animation frames until it reaches `done`.
     *
     * Deliberately not the {@link GameLoop}: running the splash on a separate
     * driver keeps the loop's fixed-timestep accumulator, its `lastUpdateTime`,
     * and its rolling dropped-frame baseline from ever seeing splash time.
     *
     * The splash frame deliberately skips `beginRenderFrame()` and the overlay -
     * the overlay would draw over the logo and resolve its HUD slots through the
     * splash's ramp, and keeping it out is also what keeps the overlay free of
     * splash-state branching.
     *
     * @param displaySize - Logical display size the splash centers its logo in.
     * @returns Promise resolving once the splash is done.
     */
    private async runSplash(displaySize: Vector2i): Promise<void> {
        const splash = this.engine.splash;
        const renderer = this.engine.renderer;

        if (!splash || !renderer) {
            return;
        }

        await new Promise<void>((resolve, reject) => {
            const frame = (): void => {
                try {
                    splash.advance();

                    if (splash.state === 'done') {
                        resolve();

                        return;
                    }

                    renderer.beginFrame();
                    renderer.setCameraOffset(Vector2i.zero());
                    splash.draw(renderer, displaySize);
                    // No effect time passes during the splash: the tick clock has not started, and the
                    // splash dissolve reads Splash's own clock, not deltaMs.
                    renderer.endFrame(0);
                } catch (error) {
                    // Settle rather than scheduling another frame. Nothing else can
                    // resolve this promise, so a throw here would leave init() pending
                    // forever behind a splash that has stopped animating.
                    reject(error instanceof Error ? error : new Error(String(error)));

                    return;
                }

                requestAnimationFrame(frame);
            };

            requestAnimationFrame(frame);
        });
    }

    /**
     * Runs the game's `init()` behind the splash, then performs the handoff.
     *
     * The two run concurrently, so the splash doubles as a loading screen and
     * costs close to zero perceived time.
     *
     * @param demo - Demo whose `init()` runs behind the splash.
     * @param splash - The splash covering the screen.
     * @param displaySize - Logical display size passed through to the splash.
     * @returns Whatever the demo's `init()` resolved to.
     */
    private async runDemoInitBehindSplash(demo: IBTDemo, splash: Splash, displaySize: Vector2i): Promise<boolean> {
        const reducedMotion = ReducedMotion.isPreferred;

        // Install it as the active palette, not just on the renderer: endPaletteCapture()
        // reads this.engine.palette to fade the splash down when the game never sets one of its
        // own, and the two must not disagree while the splash is the thing on screen.
        this.engine.installPalette(splash.palette);
        this.engine.beginPaletteCapture();
        splash.attachSkipInput(globalThis);
        splash.start(reducedMotion);

        // Gate on activeBackend, not requestedBackend: this is a runtime feature
        // gate, and the software renderer throws on post-process. Reduced motion skips the
        // dissolve entirely - it is a simulated glitch effect, exactly the category of motion
        // the preference exists to suppress.
        if (this.engine.activeBackend === 'webgpu' && !reducedMotion) {
            splash.enableDissolve();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                this.engine.effectAdd(dissolve);
            }
        }

        // markInitSettled fires on failure too, so a failed init() cannot leave the
        // hold running forever.
        const initPromise = this.engine.runDemoInit(demo).then((ok) => {
            splash.markInitSettled();

            return ok;
        });

        try {
            // allSettled, not all: a splash frame that throws must not tear the capture
            // down while the game's init() is still running, or a paletteSet() landing
            // after the teardown would apply straight to the screen mid-handoff.
            const [initSettled, splashSettled] = await Promise.allSettled([initPromise, this.runSplash(displaySize)]);

            if (splashSettled.status === 'rejected') {
                throw splashSettled.reason;
            }

            return initSettled.status === 'fulfilled' ? initSettled.value : false;
        } finally {
            // In a finally so a throw from either side still tears the splash down.
            // Leaving capture armed would make every later BT.paletteSet() a no-op.
            splash.detachSkipInput();

            const dissolve = splash.dissolveEffect;

            if (dissolve) {
                // By exact reference, never effectClear(): the game's init() ran
                // concurrently and may have registered effects of its own.
                this.engine.effectRemove(dissolve);
            }

            this.engine.endPaletteCapture(reducedMotion);
            this.engine.drainInputEdges(0);
        }
    }
}

/**
 * Creates the splash when gating says it should play on this page load.
 *
 * A module-level helper rather than a method so `init()` stays within its
 * complexity budget; it needs no instance state.
 *
 * @param hwSettings - Resolved hardware settings for this run.
 * @returns A fresh splash, or `null` when gating turned it off.
 */
export function createSplashIfEnabled(hwSettings: HardwareSettings): Splash | null {
    if (!isSplashEnabled(hwSettings.isSplashEnabled)) {
        return null;
    }

    return new Splash({ colorDark: hwSettings.splashColorDark, colorLight: hwSettings.splashColorLight });
}
