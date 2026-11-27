/**
 * The version in a pinned engine URL: `https://cdn.jsdelivr.net/npm/blit386@<version>/`. Matches any version text up
 * to the next `/`, so a malformed pin is reported as drift rather than skipped. `scripts/bump-lockstep.mjs` rewrites
 * and checks pins with it; `packages/website/scripts/check-chat-prompt.mjs` finds the chat prompt's import lines with
 * it. `blit bundle --engine cdn` builds the same URL form from ENGINE_CDN_PREFIX in
 * packages/kit/src/commands/bundle.ts; keep the two in step.
 *
 * Deliberately not global: a shared `g` regex carries `lastIndex` between callers, so `.test()` would alternate.
 * A caller that needs every match builds its own copy with `new RegExp(CDN_PIN_RE.source, 'gu')`.
 */
export const CDN_PIN_RE = /(https:\/\/cdn\.jsdelivr\.net\/npm\/blit386@)([^/\s'"`]+)(\/)/u;
