#!/usr/bin/env node
/**
 * Fails when a JSDoc `{@link}` (or `{@linkcode}` / `{@linkplain}`) in `src/` does not resolve.
 * `tsc --noEmit` never reports these: the checker resolves link names for hover and
 * go-to-definition but issues no diagnostics for them, so a dead link only shows up as an editor
 * squiggle in stricter language servers (BT-850). Two rules:
 *
 * - unresolved: the link's first name is neither in scope in its file nor exported from the
 *   package entry (`src/BLIT386.ts`), or a later member does not exist. Public exports count
 *   because the published declaration rollup is one file where every export is in scope, so
 *   `{@link BT.soundPlay}` works for consumers without an import that ESLint would call unused.
 * - instance member: `{@link A.b}` names an instance or interface member of `A`. In TSDoc `.`
 *   means a static (or namespace) member, so the correct form is `{@link A#b}`. The TypeScript
 *   checker resolves the `.` form leniently, which is why this needs its own rule.
 *
 * Usage:
 *   node scripts/check-jsdoc-links.mjs
 */
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { ENTRY_FILE, ROOT } from './gen-api-history.mjs';
import { relativeToRoot } from './generated-file-check.mjs';

export const LINK_UNRESOLVED = 'unresolved';
export const LINK_INSTANCE_MEMBER = 'instance-member';

const SRC_DIR = join(ROOT, 'src') + sep;
const TSCONFIG_PATH = join(ROOT, 'tsconfig.json');
/** TypeScript parses `{@link https://x}` as name `https` plus text `://x`; a URL link has no symbol to resolve. */
const URL_LINK_TEXT = /^:\/\//;

/**
 * Resolves a link name to the symbol it targets, following TSDoc's `.` (static) / `#` (instance)
 * split.
 *
 * @param {ts.TypeChecker} checker - Type checker for the program.
 * @param {Map<ts.__String, ts.Symbol>} publicExports - Exports of the package entry.
 * @param {ts.EntityName | ts.JSDocMemberName} name - The link's target name.
 * @returns {{ symbol?: ts.Symbol, suggestion?: string }} The target symbol; no symbol when it does
 *   not resolve; a `suggestion` (the `A#b` form) when a `.` names an instance or interface member.
 */
function resolveLinkName(checker, publicExports, name) {
    if (ts.isIdentifier(name)) {
        const symbol = checker.getSymbolAtLocation(name) ?? publicExports.get(name.escapedText);

        return { symbol: symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol };
    }

    const owner = resolveLinkName(checker, publicExports, name.left);

    if (!owner.symbol) {
        return owner;
    }

    const memberName = name.right.escapedText;
    const instanceMember = checker.getDeclaredTypeOfSymbol(owner.symbol).getProperty(memberName);

    if (ts.isJSDocMemberName(name)) {
        return { symbol: instanceMember };
    }

    const staticMember =
        owner.symbol.exports?.get(memberName) ??
        (owner.symbol.flags & ts.SymbolFlags.Value
            ? checker.getTypeOfSymbol(owner.symbol).getProperty(memberName)
            : undefined);

    if (!staticMember && instanceMember) {
        return { suggestion: `${name.left.getText()}#${name.right.text}` };
    }

    return { symbol: staticMember };
}

/**
 * Finds every unresolved or wrongly-formed JSDoc link in the program's target files.
 *
 * @param {ts.Program} program - Program to scan; must contain `entryFile`.
 * @param {{ entryFile: string, isTarget: (fileName: string) => boolean }} options - Package entry
 *   whose exports count as in scope everywhere, and which source files to scan.
 * @returns {{ file: string, line: number, text: string, kind: string, suggestion?: string }[]} Problems found.
 */
export function findJsdocLinkProblems(program, { entryFile, isTarget }) {
    const checker = program.getTypeChecker();
    const entry = program.getSourceFile(entryFile);

    if (!entry) {
        throw new Error(`Entry file ${entryFile} is not part of the program`);
    }

    const publicExports = new Map(
        checker.getExportsOfModule(checker.getSymbolAtLocation(entry)).map((symbol) => [symbol.escapedName, symbol]),
    );
    const problems = [];

    for (const sourceFile of program.getSourceFiles()) {
        if (!isTarget(sourceFile.fileName)) {
            continue;
        }

        const report = (node, problem) => {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            problems.push({ file: sourceFile.fileName, line: line + 1, text: node.getText(sourceFile), ...problem });
        };

        const visit = (node) => {
            if (
                (ts.isJSDocLink(node) || ts.isJSDocLinkCode(node) || ts.isJSDocLinkPlain(node)) &&
                node.name &&
                !URL_LINK_TEXT.test(node.text)
            ) {
                const { symbol, suggestion } = resolveLinkName(checker, publicExports, node.name);

                if (suggestion) {
                    report(node, { kind: LINK_INSTANCE_MEMBER, suggestion });
                } else if (!symbol) {
                    report(node, { kind: LINK_UNRESOLVED });
                }
            }

            ts.forEachChild(node, visit);

            // JSDoc comments hang off `node.jsDoc`, which `forEachChild` does not visit.
            for (const doc of node.jsDoc ?? []) {
                visit(doc);
            }
        };

        visit(sourceFile);
    }

    return problems;
}

/**
 * Builds a program over every file `tsconfig.json` includes, so test files and fixtures under
 * `src/` are scanned too (the entry-rooted `createRepoProgram` only reaches the public graph).
 *
 * @returns {ts.Program} Compiled program.
 */
function createTsconfigProgram() {
    const parsed = ts.getParsedCommandLineOfConfigFile(
        TSCONFIG_PATH,
        {},
        {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
                throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
            },
        },
    );

    return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function main() {
    const problems = findJsdocLinkProblems(createTsconfigProgram(), {
        entryFile: ENTRY_FILE,
        isTarget: (fileName) => resolve(fileName).startsWith(SRC_DIR),
    });

    if (problems.length === 0) {
        console.log('All JSDoc {@link} targets resolve.');
        return;
    }

    console.error(`${problems.length} JSDoc {@link} target(s) do not resolve:`);

    for (const { file, line, text, kind, suggestion } of problems) {
        const reason =
            kind === LINK_INSTANCE_MEMBER
                ? `instance member, use {@link ${suggestion}}`
                : 'not in scope here and not a public export - qualify it or use a code span';
        console.error(`  ${relativeToRoot(resolve(file))}:${line} ${text} - ${reason}`);
    }

    process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
