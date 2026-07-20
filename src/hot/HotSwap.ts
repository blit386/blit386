/**
 * Tiered demo hot-swap: constructs a candidate instance from the newly evaluated
 * demo class and swaps it into the running engine using the cheapest tier that is
 * safe for what changed, preserving state whenever possible.
 *
 * Called only by `bootstrap()` (`src/utils/Bootstrap.ts`) when the engine is already
 * initialized and a Vite HMR context is registered ({@link isHotActive}); never
 * called directly by demo/game code.
 */

import { BTAPI } from '../core/BTAPI';
import type { HardwareSettings, IBTDemo } from '../core/IBTDemo';
import { mergeHardwareSettings } from '../core/IBTDemo';
import type { DemoConstructor } from '../utils/Bootstrap';
import type { Vector2i } from '../utils/Vector2i';
import { announce, nextGeneration, requestHardReload } from './HotRuntime';

/** HardwareSettings vector fields that force a hard reload when they change. */
const HARD_RELOAD_VECTOR_FIELDS = ['displaySize', 'drawingBufferSize', 'maxCanvasSize'] as const;

/** HardwareSettings scalar/string fields that force a hard reload when they change. */
const HARD_RELOAD_SCALAR_FIELDS = ['targetFPS', 'backend', 'audioVoices', 'outputUpscaleFilter'] as const;

/** HardwareSettings overlay scalar/boolean/count flags that force a hard reload when they change. */
const HARD_RELOAD_OVERLAY_FLAG_FIELDS = [
    'isOverlayEnabled',
    'isOverlayVisibleAtStart',
    'isOverlayToggleHintVisible',
    'isOverlayToggleEnabled',
    'isOverlayToggleHitDebugVisible',
    'isOverlayPaletteEnabled',
    'overlayPaletteColumns',
    'overlayPaletteRowsVisible',
    'isOverlayTimingChartEnabled',
    'overlayTimingChartHeight',
    'overlayTimingChartDiagnostics',
    'isOverlayRendererDiagnosticsBarEnabled',
    'isOverlayAudioMetersEnabled',
    'overlayAudioMeterHeight',
] as const;

/** HardwareSettings style-object fields compared by JSON projection. */
const HARD_RELOAD_STYLE_FIELDS = ['overlayStyle', 'overlayTimingChartStyle', 'overlayAudioMeterStyle'] as const;

/**
 * Matches the `class Name` (or anonymous `class`) header token at the very start of a
 * {@link Function.prototype.toString} dump of a class declaration, so {@link initFingerprint}
 * can normalize it away. Vite HMR always re-evaluates the same class declaration under the
 * same name across a hot reload, so the identifier itself carries no signal about whether a
 * reinit is needed - keeping it would only make two structurally identical classes fingerprint
 * differently because a test double (or a renamed export) happens to use a different name.
 */
const CLASS_NAME_HEADER_PATTERN = /^class\s+[$A-Za-z_][$\w]*/;

/**
 * Compares two optional {@link Vector2i} hardware-settings fields.
 *
 * @param previous - Value from the currently running settings.
 * @param next - Value from the candidate demo's resolved `configure()`.
 * @returns `true` when both are undefined or equal; `false` otherwise.
 */
function isVectorFieldEqual(previous: Vector2i | undefined, next: Vector2i | undefined): boolean {
    if (previous === undefined || next === undefined) {
        return previous === next;
    }

    return previous.isEqual(next);
}

/**
 * Reports whether any init-only hardware-settings field differs between the running
 * settings and a hot-swap candidate's resolved `configure()` output.
 *
 * @param previous - Currently active hardware settings.
 * @param next - Candidate demo's resolved hardware settings.
 * @returns `true` when a hard reload is required.
 */
export function hasHardReloadDiff(previous: HardwareSettings, next: HardwareSettings): boolean {
    /* eslint-disable security/detect-object-injection -- fields are literal keyof HardwareSettings, not external input */
    for (const field of HARD_RELOAD_VECTOR_FIELDS) {
        if (!isVectorFieldEqual(previous[field], next[field])) {
            return true;
        }
    }

    for (const field of [...HARD_RELOAD_SCALAR_FIELDS, ...HARD_RELOAD_OVERLAY_FLAG_FIELDS]) {
        if (previous[field] !== next[field]) {
            return true;
        }
    }

    for (const field of HARD_RELOAD_STYLE_FIELDS) {
        if (JSON.stringify(previous[field]) !== JSON.stringify(next[field])) {
            return true;
        }
    }
    /* eslint-enable security/detect-object-injection */

    return false;
}

/**
 * Builds a fingerprint that changes only when a class's constructor, class-field
 * initializers, or `init()` change - not when an unrelated method body is edited or
 * the class itself is declared under a different name.
 *
 * Concatenates `init()`'s own source with the class's full source (its declared name
 * normalized away, see {@link CLASS_NAME_HEADER_PATTERN}), with every prototype
 * method's source (other than `constructor`) stripped out. What remains covers the
 * constructor and class-field initializers.
 *
 * @param cls - Demo class to fingerprint.
 * @returns Fingerprint string; equal fingerprints mean a Tier 1 (methods-only) swap is safe.
 */
export function initFingerprint(cls: DemoConstructor): string {
    const prototype = cls.prototype as Record<string, unknown>;
    const initSource = typeof prototype.init === 'function' ? prototype.init.toString() : '';

    let classSource = cls.toString().replace(CLASS_NAME_HEADER_PATTERN, 'class');

    for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        if (name === 'constructor') {
            continue;
        }

        const member = Object.getOwnPropertyDescriptor(cls.prototype, name)?.value;

        if (typeof member === 'function') {
            classSource = classSource.replace(member.toString(), '');
        }
    }

    return initSource + classSource;
}

/**
 * Constructs a candidate instance from `NewClass` in try/catch.
 *
 * @param NewClass - Newly evaluated demo class.
 * @returns The constructed instance, or `null` on throw (logged).
 */
function constructCandidate(NewClass: DemoConstructor): IBTDemo | null {
    try {
        return new NewClass();
    } catch (err) {
        console.error('[BT] Hot reload failed; keeping the previous version running:', err);

        return null;
    }
}

/** {@link tryHardReload} could not run at all because the candidate's `configure()` threw. */
const HARD_RELOAD_OUTCOME_ABORTED = 'aborted';

/** {@link tryHardReload} ran to completion and found no init-only hardware-settings diff. */
const HARD_RELOAD_OUTCOME_NO_DIFF = 'no-diff';

/** {@link tryHardReload} ran to completion, found a diff, and requested a hard reload. */
const HARD_RELOAD_OUTCOME_RELOAD = 'reload';

/**
 * Outcome of the Tier 3 hardware-settings check. {@link HARD_RELOAD_OUTCOME_RELOAD} and
 * {@link HARD_RELOAD_OUTCOME_NO_DIFF} mean the check itself ran to completion (settings
 * differed, or they didn't); {@link HARD_RELOAD_OUTCOME_ABORTED} means the check could not
 * run at all, so {@link hotSwapDemo} must stop without attempting any swap - a hard-reload
 * result and an aborted check are not interchangeable "no swap happened" outcomes.
 */
type HardReloadOutcome =
    | typeof HARD_RELOAD_OUTCOME_ABORTED
    | typeof HARD_RELOAD_OUTCOME_NO_DIFF
    | typeof HARD_RELOAD_OUTCOME_RELOAD;

/**
 * Runs the Tier 3 check: a hardware-settings change forces a full page reload.
 *
 * @param newDemo - Constructed candidate instance.
 * @returns The check's outcome; see {@link HardReloadOutcome}.
 */
function tryHardReload(newDemo: IBTDemo): HardReloadOutcome {
    let nextSettings: HardwareSettings;

    try {
        nextSettings = mergeHardwareSettings(newDemo.configure?.());
    } catch (err) {
        console.error('[BT] Hot reload failed; keeping the previous version running:', err);

        return HARD_RELOAD_OUTCOME_ABORTED;
    }

    const previousSettings = BTAPI.instance.getHardwareSettings();

    if (previousSettings && hasHardReloadDiff(previousSettings, nextSettings)) {
        requestHardReload('Hardware settings changed');

        return HARD_RELOAD_OUTCOME_RELOAD;
    }

    return HARD_RELOAD_OUTCOME_NO_DIFF;
}

/**
 * Runs the Tier 2 check: re-creates the instance and re-runs `init()` while the previous
 * instance keeps driving the loop, swapping in the new instance only on success.
 *
 * @param oldDemo - Currently running instance.
 * @param newDemo - Constructed candidate instance.
 * @param startedAt - `performance.now()` when this swap attempt began, for the announce timing.
 * @returns `true` once the swap completed; `false` when `hotReplaceDemo` reported failure (already logged there).
 */
async function tryReinit(oldDemo: IBTDemo, newDemo: IBTDemo, startedAt: number): Promise<boolean> {
    const snapshot = Object.fromEntries(Object.entries(oldDemo));

    const success = await BTAPI.instance.hotReplaceDemo(newDemo);

    if (!success) {
        return false;
    }

    const generationValue = nextGeneration();

    try {
        newDemo.onHotReload?.({ reason: 'reinit', generation: generationValue, snapshot });
    } catch (err) {
        console.error('[BT] onHotReload threw:', err);
    }

    announce('reinit', generationValue, performance.now() - startedAt);

    return true;
}

/**
 * Runs the Tier 1 (default) swap: rebinds the running instance's prototype to the new
 * class in place, keeping every field untouched.
 *
 * @param oldDemo - Currently running instance, mutated in place.
 * @param NewClass - Newly evaluated demo class.
 * @param startedAt - `performance.now()` when this swap attempt began, for the announce timing.
 */
function applyMethodSwap(oldDemo: IBTDemo, NewClass: DemoConstructor, startedAt: number): void {
    Object.setPrototypeOf(oldDemo, NewClass.prototype);

    const generationValue = nextGeneration();

    try {
        oldDemo.onHotReload?.({ reason: 'methods', generation: generationValue });
    } catch (err) {
        console.error('[BT] onHotReload threw:', err);
    }

    announce('methods', generationValue, performance.now() - startedAt);
}

/**
 * Hot-swaps the running demo in place with a newly evaluated demo class, using the
 * cheapest tier that is safe for what changed.
 *
 * @param NewClass - Newly evaluated demo class from the re-run entry module.
 * @returns `true` when a swap tier ran (including a requested hard reload); `false` only
 *   when construction or the Tier 2 re-init failed and the previous demo instance is
 *   still running unmodified.
 */
export async function hotSwapDemo(NewClass: DemoConstructor): Promise<boolean> {
    const startedAt = performance.now();

    const oldDemo = BTAPI.instance.getDemo();

    if (!oldDemo) {
        console.error('[BT] Hot reload failed; keeping the previous version running: no active demo instance');

        return false;
    }

    const newDemo = constructCandidate(NewClass);

    if (!newDemo) {
        return false;
    }

    const hardReloadOutcome = tryHardReload(newDemo);

    if (hardReloadOutcome === HARD_RELOAD_OUTCOME_RELOAD) {
        return true;
    }

    if (hardReloadOutcome === HARD_RELOAD_OUTCOME_ABORTED) {
        return false;
    }

    if (initFingerprint(oldDemo.constructor as unknown as DemoConstructor) !== initFingerprint(NewClass)) {
        return tryReinit(oldDemo, newDemo, startedAt);
    }

    applyMethodSwap(oldDemo, NewClass, startedAt);

    return true;
}
