/**
 * Values of the Worker vars that `scripts/patch-wrangler.mjs` writes into the built
 * `wrangler.json` and the Worker and `press.config.tsx` compare against. Plain `.mjs`
 * so the Node build script and the TypeScript source import the same literal.
 */

/** `BLIT386_CHANNEL` on the next.blit386.dev preview build and Worker. */
export const NEXT_CHANNEL = 'next';

/** `BLIT386_CSP_REPORT_ONLY` that switches a deployment to a report-only CSP. */
export const REPORT_ONLY_ENABLED = '1';
