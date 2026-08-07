// Shared between source.config.ts's transformerTwoslash call and
// scripts/__tests__/twoslash-webgpu-types.test.mjs, so the regression test
// exercises the same compiler options the production build uses (BT-431)
// instead of a copy that could drift out of sync.
export const TWOSLASH_COMPILER_OPTIONS = { types: ['@webgpu/types', 'node'] };
