// Twoslash gate and compiler options, shared between source.config.ts's
// transformerTwoslash call and scripts/__tests__/, so the regression tests
// exercise the same configuration the production build uses (BT-431, BT-188)
// instead of a copy that could drift out of sync.

// Explicit human override, honored in both directions: set it to turn Twoslash
// on in dev (`pnpm run dev:twoslash`), or to '0'/'false' to turn it off during a
// production build for a faster iteration loop. Also read from package.json, so
// scripts/__tests__/twoslash-enabled.test.mjs asserts the two copies agree.
export const TWOSLASH_ENV_VAR = 'BLIT386_TWOSLASH';

const EXPLICIT_OFF = new Set(['0', 'false']);

export const TWOSLASH_COMPILER_OPTIONS = { types: ['@webgpu/types', 'node'] };

/**
 * Whether the Twoslash transformer should run.
 *
 * Absent an explicit override the contract is "Twoslash runs iff Waku selected its Cloudflare adapter", so the
 * fallback mirrors `getDefaultAdapter()` in `waku/dist/lib/utils/config.js` exactly – including its plain-truthiness
 * quirk, under which `CLOUDFLARE=0` still selects the Cloudflare adapter. Do not "fix" that asymmetry: these are
 * machine signals, and diverging from Waku is what let a `WORKERS_CI` build ship every popup missing and silent
 * (BT-188). `TWOSLASH_ENV_VAR` is the escape hatch for humans and gets human semantics.
 *
 * `NODE_ENV` is not usable as the signal: `source.config.ts` is evaluated by the fumadocs-mdx Vite plugin before Vite
 * writes `NODE_ENV=production` into the environment.
 *
 * @param {Record<string, string | undefined>} [env] Environment to read; defaults to `process.env`.
 * @returns {boolean}
 */
export function isTwoslashEnabled(env = process.env) {
    const override = env[TWOSLASH_ENV_VAR];

    if (override !== undefined && override !== '') {
        return !EXPLICIT_OFF.has(override.toLowerCase());
    }

    return Boolean(env.CLOUDFLARE || env.WORKERS_CI);
}
