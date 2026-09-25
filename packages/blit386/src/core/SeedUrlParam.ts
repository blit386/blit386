/**
 * `?seed=N` URL parameter - seeds `BT.random` before the game's own `init()` runs.
 *
 * Split into a pure resolver plus a thin reader so the validation logic tests in plain
 * Node without a `location` stub, mirroring `readUrlFlags()` in `src/splash/gating.ts`.
 */

const PARAM = 'seed';

/**
 * Validates the raw `?seed=` value.
 *
 * Only safe integers are accepted. `Random.seed()` does `seed >>> 0`, so a `NaN` from a
 * non-numeric value would otherwise silently become seed `0` - reject it here instead.
 *
 * @param raw - The raw query value, or `null` when the parameter is absent.
 * @returns The seed, or `null` when absent or invalid (a warning is logged when invalid).
 */
export function resolveSeedUrlParam(raw: string | null): number | null {
    if (raw === null) {
        return null;
    }

    const seed = raw.trim() === '' ? Number.NaN : Number(raw);

    if (!Number.isSafeInteger(seed)) {
        console.warn(`[BT] Ignoring ?seed=${raw}: it must be a whole number.`);

        return null;
    }

    return seed;
}

/**
 * Reads `?seed=N` from the current URL.
 *
 * @returns The validated seed, or `null` when absent, invalid, or there is no `location`.
 */
export function readSeedUrlParam(): number | null {
    const search = typeof globalThis.location?.search === 'string' ? globalThis.location.search : '';

    if (!search) {
        return null;
    }

    try {
        return resolveSeedUrlParam(new URLSearchParams(search).get(PARAM));
    } catch (error) {
        console.warn('[BT] Failed to parse ?seed URL parameter:', error);

        return null;
    }
}
