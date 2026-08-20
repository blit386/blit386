#!/usr/bin/env node
/**
 * Fails when a public `BT.*` member has no inline-code mention in `.claude/rules/bt-api-getters.md`,
 * catching the class of drift where a new getter/method ships without the hand-maintained rule
 * being updated to teach it. Reuses `gen-api-history.mjs`'s TypeScript-compiled symbol extraction
 * instead of parsing `src/BLIT386.ts` a second way.
 *
 * Usage:
 *   node scripts/check-api-getters-drift.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createRepoProgram, ENTRY_FILE, enumerateSymbols, ROOT } from './gen-api-history.mjs';

const RULE_FILE_PATH = join(ROOT, '.claude', 'rules', 'bt-api-getters.md');

/**
 * Bare `BT.*` member names that legitimately never get an individual backtick-wrapped mention in
 * `bt-api-getters.md` – they are deprecated aliases documented only by cross-reference to
 * `docs/reference-deprecations.md` (the "Deprecated aliases still on `BT`" paragraph), never listed
 * by name in the getters/methods sections this check scans.
 */
export const NO_INLINE_MENTION_ALLOWLIST = new Set([
    'pointerPosValid',
    'buttonDown',
    'buttonPressed',
    'buttonReleased',
    'gamepadConnected',
    'keyDown',
    'keyPressed',
    'keyReleased',
]);

/**
 * Reduces a flat symbol-name list (as produced by `enumerateSymbols`) to bare namespace member
 * names, stripping the `<prefix>.` qualifier and discarding non-namespaced top-level exports
 * (types, classes) – the rule file's convention is bare backtick names, never `BT.foo`.
 *
 * @param {string[]} symbolNames – Symbol names, e.g. `['BT.paletteFade', 'Vector2i']`.
 * @param {{ namespaceExportName?: string }} [options] – `namespaceExportName` defaults to `'BT'`.
 * @returns {string[]} Bare member names, e.g. `['paletteFade']`.
 */
export function deriveBtMemberNames(symbolNames, options = {}) {
    const prefix = `${options.namespaceExportName ?? 'BT'}.`;

    return symbolNames.filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length));
}

/**
 * Asserts every member name (except allowlisted deprecated aliases) appears as an exact
 * backtick-delimited inline code span somewhere in the rule file text – either the bare name
 * (`` `paletteFade` ``) or a call-syntax mention (`` `audioVolumeSet(bus, value, options?)` ``, the
 * convention used for methods with documented arguments). Loose substring match by design – this
 * is prose, not a structured document – but requiring a backtick immediately before the name and
 * a backtick or `(` immediately after stops a longer sibling name (e.g. `paletteFadeRange`) from
 * masking a missing shorter one (`paletteFade`). Collects every miss instead of stopping at the
 * first one.
 *
 * @param {string[]} memberNames – Bare `BT.*` member names to check for.
 * @param {string} ruleContent – Full text of `bt-api-getters.md`.
 * @param {ReadonlySet<string>} [allowlist] – Names exempt from the check.
 * @returns {string[]} Human-readable failure messages, one per missing member (empty when all found).
 */
export function findMissingRuleMentions(memberNames, ruleContent, allowlist = NO_INLINE_MENTION_ALLOWLIST) {
    const failures = [];

    for (const name of memberNames) {
        if (allowlist.has(name)) {
            continue;
        }

        const isBareMention = ruleContent.includes(`\`${name}\``);
        const isCallSyntaxMention = ruleContent.includes(`\`${name}(`);

        if (!isBareMention && !isCallSyntaxMention) {
            failures.push(
                `BT.${name} is missing from .claude/rules/bt-api-getters.md (expected an inline code span: \`${name}\`)`,
            );
        }
    }

    return failures;
}

/** Path relative to the package root, for readable console output. */
function relativeToRoot(filePath) {
    return filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
}

/**
 * Kinds `enumerateSymbols` may report for a `BT` namespace member. Only `method` and `getter`
 * fall under `bt-api-getters.md`'s naming convention (getters vs. methods); `const` covers plain
 * enum-like values (`BT.BTN_A`, `BT.FLIP_H`, preset namespace objects, ...) that the rule never
 * documents by name and has no naming decision to make about.
 */
const NAMING_RELEVANT_KINDS = new Set(['method', 'getter']);

/** CLI entry point. */
function main() {
    const program = createRepoProgram();
    const symbols = enumerateSymbols(program, ENTRY_FILE);
    const namingRelevantNames = Object.entries(symbols)
        .filter(([, info]) => NAMING_RELEVANT_KINDS.has(info.kind))
        .map(([name]) => name);
    const memberNames = deriveBtMemberNames(namingRelevantNames);
    const ruleContent = readFileSync(RULE_FILE_PATH, 'utf8');
    const failures = findMissingRuleMentions(memberNames, ruleContent);

    if (failures.length === 0) {
        console.log(
            `All ${memberNames.length} public BT.* members are mentioned in ${relativeToRoot(RULE_FILE_PATH)}.`,
        );

        return;
    }

    console.error(`${failures.length} public BT.* member(s) missing from ${relativeToRoot(RULE_FILE_PATH)}:`);

    for (const failure of failures) {
        console.error(`  - ${failure}`);
    }

    process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
