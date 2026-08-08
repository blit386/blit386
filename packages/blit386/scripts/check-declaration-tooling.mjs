import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON_PATH = path.join(REPO_ROOT, 'package.json');
const DECLARATION_OUTPUT = path.join(REPO_ROOT, 'dist', 'blit386.d.ts');
const VITE_DECLARATION_OUTPUT = path.join(REPO_ROOT, 'dist', 'vite.d.ts');

/**
 * Minimum acceptable byte size for `dist/vite.d.ts`. Guards against the plugin's
 * `rollupTypes` single-entry mode silently collapsing the declaration file to a
 * near-empty `export {}` stub (observed at 12 bytes) instead of the real ~3.3KB output.
 */
const VITE_DECLARATION_MIN_BYTES = 500;

/**
 * Public `BT` getters that must appear in rolled-up `dist/blit386.d.ts`.
 * Add entries here when shipping new configure/runtime getters on the facade.
 */
export const REQUIRED_BT_DECLARATION_MEMBERS = ['requestedBackend', 'activeBackend'];

/**
 * Top-level exports that must appear in rolled-up `dist/vite.d.ts`.
 * Add entries here when shipping new public exports from the `blit386/vite` package entry.
 */
export const REQUIRED_VITE_DECLARATION_MEMBERS = ['blit386'];

/** Substrings that indicate TS/API Extractor compiler drift during declaration rollup. */
export const DRIFT_WARNING_PATTERNS = [
    /incompatible versions/i,
    /TypeScript version used (?:for analysis )?is different/i,
    /compiler version.*(?:different|mismatch|drift)/i,
    /typescript.*(?:mismatch|drift)/i,
    /Using TypeScript \d+\.\d+\.\d+ but API Extractor/i,
];

/**
 * Returns the pinned workspace TypeScript version from package.json.
 *
 * @returns {string} Semver string (for example `5.9.3`).
 */
export function readPinnedTypeScriptVersion() {
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const version = packageJson.devDependencies?.typescript;

    if (typeof version !== 'string' || version.length === 0) {
        throw new Error('package.json devDependencies.typescript is missing or invalid');
    }

    return version;
}

/**
 * Scans build log text for known declaration-tooling drift warnings.
 *
 * @param {string} logText Full stdout/stderr from `pnpm build`.
 * @returns {string[]} Human-readable failure messages (empty when clean).
 */
export function findDriftWarnings(logText) {
    const failures = [];

    for (const pattern of DRIFT_WARNING_PATTERNS) {
        const match = logText.match(pattern);
        if (match) {
            failures.push(`Declaration tooling drift pattern matched: ${match[0]}`);
        }
    }

    return failures;
}

/**
 * Verifies API Extractor reports the same bundled TypeScript version as the workspace pin.
 *
 * @param {string} logText Full stdout/stderr from `pnpm build`.
 * @param {string} expectedVersion Workspace TypeScript version from package.json.
 * @returns {string[]} Human-readable failure messages (empty when aligned).
 */
export function findAlignmentFailures(logText, expectedVersion) {
    const failures = [];
    const alignmentPattern = /Analysis will use the bundled TypeScript version (\d+\.\d+\.\d+)/i;
    const match = logText.match(alignmentPattern);

    if (!match) {
        failures.push(
            'Expected API Extractor alignment log line "Analysis will use the bundled TypeScript version X.Y.Z" was not found',
        );
        return failures;
    }

    const reportedVersion = match[1];
    if (reportedVersion !== expectedVersion) {
        failures.push(
            `API Extractor bundled TypeScript ${reportedVersion} does not match workspace pin ${expectedVersion}`,
        );
    }

    return failures;
}

/** Opening forms for the rolled-up `BT` object type in `dist/blit386.d.ts`. */
const BT_DECLARATION_OPENERS = [
    /(?:export\s+)?declare\s+const\s+BT\s*:\s*\{/,
    /(?:export\s+)?declare\s+namespace\s+BT\s*\{/,
    /(?:export\s+)?declare\s+interface\s+BT\s*\{/,
    /(?:export\s+)?type\s+BT\s*=\s*\{/,
    /\binterface\s+BT\s*\{/,
];

/**
 * Extracts the `{ ... }` body of the public `BT` declaration from rolled-up `.d.ts` text.
 *
 * @param {string} dtsText Contents of `dist/blit386.d.ts`.
 * @returns {string | null} Balanced brace block for `BT`, or null when not found.
 */
export function extractBtDeclarationBlock(dtsText) {
    for (const opener of BT_DECLARATION_OPENERS) {
        const match = opener.exec(dtsText);
        if (!match) {
            continue;
        }

        const openBrace = dtsText.indexOf('{', match.index);
        if (openBrace < 0) {
            continue;
        }

        const body = dtsText.slice(openBrace);
        let depth = 0;
        for (let i = 0; i < body.length; i++) {
            const char = body.charAt(i);
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                if (depth === 0) {
                    return body.slice(0, i + 1);
                }
            }
        }
    }

    return null;
}

/**
 * Verifies rolled-up declarations export required `BT` facade members.
 *
 * @param {string} dtsText Contents of `dist/blit386.d.ts`.
 * @param {readonly string[]} [requiredMembers] Getter names that must be present.
 * @returns {string[]} Human-readable failure messages (empty when all members are found).
 */
export function findMissingBtDeclarationMembers(dtsText, requiredMembers = REQUIRED_BT_DECLARATION_MEMBERS) {
    const btBlock = extractBtDeclarationBlock(dtsText);
    if (!btBlock) {
        return requiredMembers.map(
            (member) => `dist/blit386.d.ts is missing BT declaration block (cannot verify getter: ${member})`,
        );
    }

    const failures = [];

    for (const member of requiredMembers) {
        const pattern = new RegExp(`\\breadonly\\s+${member}\\s*:`, 'm');
        if (!pattern.test(btBlock)) {
            failures.push(`dist/blit386.d.ts is missing BT getter: ${member}`);
        }
    }

    return failures;
}

/**
 * Verifies `dist/vite.d.ts` is not a collapsed near-empty stub (the plugin's silent
 * `rollupTypes` failure mode observed at 12 bytes, versus a real output around 3.3KB).
 *
 * @param {number} fileSizeBytes Size in bytes of `dist/vite.d.ts`.
 * @returns {string[]} Human-readable failure messages (empty when the size is acceptable).
 */
export function findViteDeclarationSizeFailure(fileSizeBytes) {
    if (fileSizeBytes < VITE_DECLARATION_MIN_BYTES) {
        return [
            `dist/vite.d.ts is only ${fileSizeBytes} bytes, below the ${VITE_DECLARATION_MIN_BYTES}-byte ` +
                'minimum (looks like a collapsed export {} stub, not the real declaration output)',
        ];
    }

    return [];
}

/**
 * Verifies rolled-up `dist/vite.d.ts` exports required top-level members. Unlike the `BT`
 * facade, `dist/vite.d.ts` has no wrapping namespace/object block – it is flat top-level
 * `export declare` statements – so this checks for a matching function declaration directly.
 *
 * @param {string} dtsText Contents of `dist/vite.d.ts`.
 * @param {readonly string[]} [requiredMembers] Export names that must be present.
 * @returns {string[]} Human-readable failure messages (empty when all members are found).
 */
export function findMissingViteDeclarationMembers(dtsText, requiredMembers = REQUIRED_VITE_DECLARATION_MEMBERS) {
    const failures = [];

    for (const member of requiredMembers) {
        const pattern = new RegExp(`\\bdeclare\\s+function\\s+${member}\\s*\\(`, 'm');
        if (!pattern.test(dtsText)) {
            failures.push(`dist/vite.d.ts is missing export: ${member}`);
        }
    }

    return failures;
}

/**
 * Validates declaration build output and log alignment.
 *
 * @param {string} logText Full stdout/stderr from `pnpm build`.
 * @param {{ requireOutputFile?: boolean }} [options]
 * @returns {string[]} All failure messages (empty when checks pass).
 */
export function validateDeclarationTooling(logText, options = {}) {
    const { requireOutputFile = true } = options;
    const expectedVersion = readPinnedTypeScriptVersion();
    const failures = [...findDriftWarnings(logText), ...findAlignmentFailures(logText, expectedVersion)];

    if (requireOutputFile && !fs.existsSync(DECLARATION_OUTPUT)) {
        failures.push(`Missing rolled-up declaration output: ${path.relative(REPO_ROOT, DECLARATION_OUTPUT)}`);
    } else if (requireOutputFile) {
        const dtsText = fs.readFileSync(DECLARATION_OUTPUT, 'utf8');
        failures.push(...findMissingBtDeclarationMembers(dtsText));
    }

    if (requireOutputFile && !fs.existsSync(VITE_DECLARATION_OUTPUT)) {
        failures.push(`Missing rolled-up declaration output: ${path.relative(REPO_ROOT, VITE_DECLARATION_OUTPUT)}`);
    } else if (requireOutputFile) {
        const viteFileSizeBytes = fs.statSync(VITE_DECLARATION_OUTPUT).size;
        failures.push(...findViteDeclarationSizeFailure(viteFileSizeBytes));

        const viteDtsText = fs.readFileSync(VITE_DECLARATION_OUTPUT, 'utf8');
        failures.push(...findMissingViteDeclarationMembers(viteDtsText));
    }

    return failures;
}

/**
 * @param {string[]} failures
 * @returns {never}
 */
function exitWithFailures(failures) {
    console.error('Declaration tooling check failed:');
    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }
    process.exit(1);
}

function main() {
    const logPath = process.argv[2];
    let logText;

    if (logPath) {
        logText = fs.readFileSync(path.resolve(logPath), 'utf8');
    } else if (!process.stdin.isTTY) {
        logText = fs.readFileSync(0, 'utf8');
    } else {
        console.error('Usage: node scripts/check-declaration-tooling.mjs <build.log>');
        process.exit(2);
    }

    const failures = validateDeclarationTooling(logText);
    if (failures.length > 0) {
        exitWithFailures(failures);
    }

    const version = readPinnedTypeScriptVersion();
    console.log(
        `Declaration tooling OK (TypeScript ${version}, ${path.relative(REPO_ROOT, DECLARATION_OUTPUT)} and ` +
            `${path.relative(REPO_ROOT, VITE_DECLARATION_OUTPUT)} present)`,
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
