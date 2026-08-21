#!/usr/bin/env node
/**
 * Fails when the kit's `blit386.engineRange` or the scaffolder's `BLIT386_RANGE` no longer
 * matches what `scripts/bump-lockstep.mjs` would derive from the engine's current version –
 * catching a manual hand-edit that leaves either copy out of sync outside of a lockstep bump.
 *
 * Read-only: reuses `bump-lockstep.mjs`'s own parsing (`applyEngineRange` / `applyBlit386Range`)
 * purely to read the current value, so there is exactly one implementation of that parsing – this
 * script never writes.
 *
 * Usage:
 *   node scripts/check-engine-range-drift.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    applyBlit386Range,
    applyEngineRange,
    deriveCaretRange,
    ENGINE_PACKAGE_JSON_PATH,
    KIT_PACKAGE_JSON_PATH,
    parseVersionArg,
    SCAFFOLD_RANGE_FILE,
} from './bump-lockstep.mjs';

/** Repo root, resolved from this script's own location at repo-root `scripts/`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * @param {{ root?: string, readFile?: (path: string) => string }} [options]
 * @returns {string[]} Human-readable mismatch messages (empty when both derived ranges are in sync).
 */
export function findEngineRangeDrift(options = {}) {
    const root = options.root ?? ROOT;
    const readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'));

    const engineRaw = readFile(join(root, ENGINE_PACKAGE_JSON_PATH));
    const engineVersion = parseVersionArg(JSON.parse(engineRaw).version);
    const expectedRange = deriveCaretRange(engineVersion);

    const kitRaw = readFile(join(root, KIT_PACKAGE_JSON_PATH));
    const { previous: actualKitRange } = applyEngineRange(kitRaw, expectedRange);

    const scaffoldRaw = readFile(join(root, SCAFFOLD_RANGE_FILE));
    const { previous: actualScaffoldRange } = applyBlit386Range(scaffoldRaw, expectedRange);

    const failures = [];

    if (actualKitRange !== expectedRange) {
        failures.push(
            `${KIT_PACKAGE_JSON_PATH} blit386.engineRange is "${actualKitRange}", expected "${expectedRange}" ` +
                `(derived from ${ENGINE_PACKAGE_JSON_PATH} version ${engineVersion})`,
        );
    }

    if (actualScaffoldRange !== expectedRange) {
        failures.push(
            `${SCAFFOLD_RANGE_FILE} BLIT386_RANGE is "${actualScaffoldRange}", expected "${expectedRange}" ` +
                `(derived from ${ENGINE_PACKAGE_JSON_PATH} version ${engineVersion})`,
        );
    }

    return failures;
}

/** CLI entry point. */
function main() {
    const failures = findEngineRangeDrift();

    if (failures.length > 0) {
        console.error('Engine range drift check failed:');

        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }

        console.error('\nFix: run `pnpm run bump -- <the current lockstep version>` to re-derive both ranges.');
        process.exit(1);
    }

    console.log('Engine range OK (kit blit386.engineRange and scaffolder BLIT386_RANGE both match the derived range).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
