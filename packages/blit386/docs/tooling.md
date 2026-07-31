# Tooling

Build, declaration, and quality-tooling notes for contributors. For the full contributing workflow and IDE setup, see
[Developer Experience Guide](developer-experience-guide.md).

## TypeScript version

The workspace pins TypeScript 5.9.3 in `package.json` to match the compiler bundled with API Extractor (invoked by
`vite-plugin-dts` when `rollupTypes: true`). This avoids TS/API Extractor drift warnings during `pnpm run build` and
keeps rolled-up `dist/blit386.d.ts` deterministic.

When bumping `typescript` or `vite-plugin-dts`, confirm the build log reports the same bundled version and that
`node scripts/check-declaration-tooling.mjs build.log` passes (log alignment plus required `BT` getters in
`dist/blit386.d.ts`, including `requestedBackend` and `activeBackend`). See
[Declaration tooling](developer-experience-guide.md#declaration-tooling-typescript--api-extractor) in the DX guide for
CI details.

## Declaration tooling commands

| Command | Description |
| --- | --- |
| `pnpm run test:declarations` | Node tests for `scripts/check-declaration-tooling.mjs` (drift patterns and alignment log parsing). Included in `pnpm run preflight`. |
| `pnpm run build` then `node scripts/check-declaration-tooling.mjs build.log` | Manual check after a local build (same assertion CI runs). |

CI runs the checker after `pnpm run build` in:

- `.github/workflows/ci.yml` – `build-library` job
- `.github/workflows/ci.yml` – `bundle-size` job

More context: [Testing – Declaration tooling checks](reference-testing.md#declaration-tooling-checks).

## See also

| Guide | What it covers |
| --- | --- |
| [Developer Experience](developer-experience-guide.md) | TypeScript pin rationale, declaration rollup |
| [Documentation and API Versioning](documentation-and-versioning-guide.md) | @since/@changed tagging, doc component workflow |
| [Testing](reference-testing.md) | declaration tooling test (`test:declarations`) |
