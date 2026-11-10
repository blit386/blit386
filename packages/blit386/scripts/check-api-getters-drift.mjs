#!/usr/bin/env node
/**
 * Fails when a public `BT.*` getter or method has no inline-code mention in
 * `.claude/rules/bt-api-getters.md`, catching the class of drift where a new getter/method ships
 * without the hand-maintained rule being updated to teach it. Also fails when a getter is not listed under
 * "Prefer getters" or a method under "Keep as methods", or when either list names something that is no longer a
 * `BT` member. Reuses `gen-api-history.mjs`'s
 * TypeScript-compiled symbol extraction instead of parsing `src/BLIT386.ts` a second way.
 *
 * Usage:
 *   node scripts/check-api-getters-drift.mjs
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { createRepoProgram, ENTRY_FILE, enumerateSymbols, ROOT } from './gen-api-history.mjs';
import { relativeToRoot } from './generated-file-check.mjs';

const RULE_FILE_PATH = join(ROOT, '.claude', 'rules', 'bt-api-getters.md');
const HARDWARE_SETTINGS_FILE = join(ROOT, 'src', 'core', 'IBTDemo.ts');
const HARDWARE_SETTINGS_INTERFACE = 'HardwareSettings';
const TIER_B_ROW_MARKER = '**B** Configure flags';
/** Boolean-flag naming prefixes governed by the Tier A / Tier B convention. */
const FLAG_NAME_PATTERN = /^(is|has)[A-Z]/;

/**
 * Bare `BT.*` member names that legitimately never get an individual backtick-wrapped mention in
 * `bt-api-getters.md` - they are deprecated aliases documented only by cross-reference to
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
 * (types, classes) - the rule file's convention is bare backtick names, never `BT.foo`.
 *
 * @param {string[]} symbolNames - Symbol names, e.g. `['BT.paletteFade', 'Vector2i']`.
 * @param {{ namespaceExportName?: string }} [options] - `namespaceExportName` defaults to `'BT'`.
 * @returns {string[]} Bare member names, e.g. `['paletteFade']`.
 */
export function deriveBtMemberNames(symbolNames, options = {}) {
    const prefix = `${options.namespaceExportName ?? 'BT'}.`;

    return symbolNames.filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length));
}

/**
 * Asserts every member name (except allowlisted deprecated aliases) appears as an exact
 * backtick-delimited inline code span somewhere in the rule file text - either the bare name
 * (`` `paletteFade` ``) or a call-syntax mention (`` `audioVolumeSet(bus, value, options?)` ``, the
 * convention used for methods with documented arguments). Loose substring match by design - this
 * is prose, not a structured document - but requiring a backtick immediately before the name and
 * a backtick or `(` immediately after stops a longer sibling name (e.g. `paletteFadeRange`) from
 * masking a missing shorter one (`paletteFade`). Collects every miss instead of stopping at the
 * first one.
 *
 * @param {string[]} memberNames - Bare `BT.*` member names to check for.
 * @param {string} ruleContent - Full text of `bt-api-getters.md`.
 * @param {ReadonlySet<string>} [allowlist] - Names exempt from the check.
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

/**
 * Enumerates the `is*` / `has*` boolean fields declared on the `HardwareSettings` interface,
 * using the TypeScript type checker (never a regex over source text) so an optional
 * `flag?: boolean` and a plain `flag: boolean` both count.
 *
 * @param {import('typescript').Program} program - Program containing the interface's source file.
 * @param {{ filePath?: string, interfaceName?: string }} [options] - Defaults to `HardwareSettings` in `src/core/IBTDemo.ts`.
 * @returns {string[]} Field names in declaration order (empty when the interface is not found).
 */
export function enumerateHardwareSettingsFlags(program, options = {}) {
    const sourceFile = program.getSourceFile(options.filePath ?? HARDWARE_SETTINGS_FILE);
    const interfaceName = options.interfaceName ?? HARDWARE_SETTINGS_INTERFACE;

    if (!sourceFile) {
        return [];
    }

    const checker = program.getTypeChecker();
    const names = [];

    for (const statement of sourceFile.statements) {
        if (!ts.isInterfaceDeclaration(statement) || statement.name.text !== interfaceName) {
            continue;
        }

        for (const member of statement.members) {
            if (!ts.isPropertySignature(member) || !ts.isIdentifier(member.name)) {
                continue;
            }

            const name = member.name.text;
            const type = checker.getNonNullableType(checker.getTypeAtLocation(member));

            if (FLAG_NAME_PATTERN.test(name) && (type.flags & ts.TypeFlags.BooleanLike) !== 0) {
                names.push(name);
            }
        }
    }

    return names;
}

/**
 * Extracts the Tier B "Configure flags" table row from the rule file text.
 *
 * @param {string} ruleContent - Full text of `bt-api-getters.md`.
 * @returns {string | undefined} The row's line, or `undefined` when the row is absent.
 */
export function extractTierBRow(ruleContent) {
    return ruleContent.split('\n').find((line) => line.includes(TIER_B_ROW_MARKER));
}

/**
 * Asserts every `HardwareSettings` flag has an inline-code mention in the Tier B row, using the
 * same bare-name-or-call-syntax matching as `findMissingRuleMentions` (scoped to that row so a
 * mention elsewhere in the file cannot mask a Tier B omission).
 *
 * @param {string[]} flagNames - `HardwareSettings` flag field names.
 * @param {string} ruleContent - Full text of `bt-api-getters.md`.
 * @returns {string[]} Human-readable failure messages (empty when all found).
 */
export function findMissingTierBMentions(flagNames, ruleContent) {
    const row = extractTierBRow(ruleContent);

    if (row === undefined) {
        return [`The Tier B row ("${TIER_B_ROW_MARKER}") is missing from .claude/rules/bt-api-getters.md`];
    }

    return flagNames
        .filter((name) => findMissingRuleMentions([name], row, new Set()).length > 0)
        .map(
            (name) =>
                `${HARDWARE_SETTINGS_INTERFACE}.${name} is missing from the Tier B row of .claude/rules/bt-api-getters.md (expected an inline code span: \`${name}\`)`,
        );
}

/** Prefix `enumerateSymbols` puts on `BT` namespace members. */
const BT_MEMBER_PREFIX = 'BT.';
/** Rule-file section that must list every `BT` getter. */
const GETTERS_HEADING = '## Prefer getters';
/** Rule-file section that must list every `BT` method. */
const METHODS_HEADING = '## Keep as methods';
/** Section each naming-relevant kind must be listed under. */
const HEADING_BY_KIND = new Map([
    ['getter', GETTERS_HEADING],
    ['method', METHODS_HEADING],
]);

/**
 * Lowercase inline-code names in the two lists that are not `BT` members on purpose: literal values, the
 * `configure()` hook, `BT.preset` members, and argument names. Anything else there must be a live member.
 */
const NON_MEMBER_NAMES = new Set([
    'null',
    'true',
    'false',
    'configure',
    'crtPipBoy',
    'amber',
    'green',
    'paletteOffset',
    'out',
]);

/**
 * Returns one `## ` section of the rule file, from its heading up to the next `## ` heading.
 *
 * @param {string} ruleContent - Full text of `bt-api-getters.md`.
 * @param {string} heading - The section's heading line prefix, e.g. `'## Prefer getters'`.
 * @returns {string | undefined} The section text, or `undefined` when the heading is absent.
 */
export function extractSection(ruleContent, heading) {
    const start = ruleContent.startsWith(heading) ? 0 : ruleContent.indexOf(`\n${heading}`);

    if (start === -1) {
        return undefined;
    }

    const end = ruleContent.indexOf('\n## ', start + 1);

    return ruleContent.slice(start, end === -1 ? undefined : end);
}

/**
 * Collects the names a section mentions as a bare or call-syntax inline code span starting with a lowercase
 * letter (`` `paletteFade` ``, `` `isDown(...)` ``). `BT.`-prefixed spans are skipped: the rule uses them only
 * in its Good/Bad examples, where a removed name is the point.
 *
 * @param {string} sectionText - One section of the rule file.
 * @returns {Set<string>} The mentioned names.
 */
function mentionedNames(sectionText) {
    return new Set([...sectionText.matchAll(/`([a-z][A-Za-z0-9]*)(?:`|\()/g)].map((match) => match[1]));
}

/**
 * Checks section membership and stale names: every getter must be listed under "Prefer getters" and every
 * method under "Keep as methods" (allowlisted deprecated aliases exempt), and every lowercase name either
 * section lists must be a live `BT` member or in `NON_MEMBER_NAMES`.
 *
 * @param {Map<string, string>} memberKinds - Bare `BT` member name to its `enumerateSymbols` kind.
 * @param {string} ruleContent - Full text of `bt-api-getters.md`.
 * @param {ReadonlySet<string>} [allowlist] - Members exempt from the membership check.
 * @returns {string[]} Human-readable failure messages (empty when clean).
 */
export function findSectionDrift(memberKinds, ruleContent, allowlist = NO_INLINE_MENTION_ALLOWLIST) {
    const failures = [];
    const mentionsByHeading = new Map();

    for (const heading of HEADING_BY_KIND.values()) {
        const section = extractSection(ruleContent, heading);

        if (section === undefined) {
            failures.push(`The "${heading}" section is missing from .claude/rules/bt-api-getters.md`);
        } else {
            mentionsByHeading.set(heading, mentionedNames(section));
        }
    }

    for (const [name, kind] of memberKinds) {
        const heading = HEADING_BY_KIND.get(kind);

        if (heading && !allowlist.has(name) && mentionsByHeading.get(heading)?.has(name) === false) {
            failures.push(`BT.${name} is a ${kind} but is not listed under "${heading}"`);
        }
    }

    for (const [heading, names] of mentionsByHeading) {
        for (const name of names) {
            if (!memberKinds.has(name) && !NON_MEMBER_NAMES.has(name)) {
                failures.push(`\`${name}\` is listed under "${heading}" but is not a BT member (removed or renamed?)`);
            }
        }
    }

    return failures;
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
    const memberKinds = new Map(
        Object.entries(symbols)
            .filter(([name]) => name.startsWith(BT_MEMBER_PREFIX))
            .map(([name, info]) => [name.slice(BT_MEMBER_PREFIX.length), info.kind]),
    );
    const failures = [
        ...findMissingRuleMentions(memberNames, ruleContent),
        ...findSectionDrift(memberKinds, ruleContent),
    ];
    const flagNames = enumerateHardwareSettingsFlags(program);
    const flagFailures =
        flagNames.length === 0
            ? [
                  `No is*/has* boolean fields found on ${HARDWARE_SETTINGS_INTERFACE} in ${relativeToRoot(HARDWARE_SETTINGS_FILE)} (interface renamed or moved?)`,
              ]
            : findMissingTierBMentions(flagNames, ruleContent);

    if (failures.length === 0 && flagFailures.length === 0) {
        console.log(
            `All ${memberNames.length} public BT.* getters and methods are listed in their sections of ${relativeToRoot(RULE_FILE_PATH)}.`,
        );
        console.log(
            `All ${flagNames.length} ${HARDWARE_SETTINGS_INTERFACE} is*/has* flags are mentioned in the Tier B row.`,
        );

        return;
    }

    if (failures.length > 0) {
        console.error(`${failures.length} BT.* getter/method drift(s) in ${relativeToRoot(RULE_FILE_PATH)}:`);

        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }
    }

    if (flagFailures.length > 0) {
        console.error(`${HARDWARE_SETTINGS_INTERFACE} flag drift in ${relativeToRoot(RULE_FILE_PATH)}:`);

        for (const failure of flagFailures) {
            console.error(`  - ${failure}`);
        }
    }

    process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
