/**
 * Checks the paste-a-prompt text (`public/prompt.txt`, served at blit386.dev/prompt.txt) against the built engine:
 * every name its pinned jsDelivr import line pulls in, and every `Name.member...` chain on one of those names (for
 * example `BT.random.int`, `AudioClip.synth`), must exist in `packages/blit386/dist/blit386.d.ts`. A small model told
 * "use only the API listed below" copies whatever the prompt says, so a renamed engine API has to fail here, not in a
 * visitor's first game.
 *
 * The names are resolved by the TypeScript checker, not by searching the `.d.ts` text: `BT` is typed as an
 * intersection of `typeof` modules, which only the checker can walk. The pin's version is checked elsewhere - the
 * lockstep bump owns it (`CHAT_PROMPT_FILE` in `scripts/bump-lockstep.mjs`, enforced by `pnpm run bump:check`).
 *
 * shortcut: members reached through a local value (`rectA.isIntersecting`, `p.set`) and `configure()` keys are not
 * checked; check them by hand when the prompt changes, or add them here if one ever drifts.
 */

import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { CDN_PIN_RE } from '../../../scripts/lib/cdn-pin.mjs';

/** The prompt file, as served at `/prompt.txt`. */
export const CHAT_PROMPT_PATH = fileURLToPath(new URL('../public/prompt.txt', import.meta.url));

// A virtual file in this directory, so `import ... from 'blit386'` resolves to the workspace engine's dist types.
const PROBE_PATH = fileURLToPath(new URL('./__chat-prompt-probe__.ts', import.meta.url));

// Every line that starts with `import`, and every `import {` later in a line (after a bullet or a colon), is an import
// statement, and each one must be exactly this shape with a pinned URL: anything else is reported, never skipped, so a
// reformatted, unpinned or mid-sentence import cannot slip past the check.
const ANY_IMPORT_RE = /^[ \t]*import\b.*$|\bimport\s*\{[^\n]*/gmu;
const PINNED_IMPORT_RE = /^import \{([^}]+)\} from '([^']+)';$/u;

/** @param {string} text Text to match literally. @returns {string} `text` with regex metacharacters escaped. */
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

/**
 * @param {string} prompt The prompt text.
 * @returns {string[]} One message per problem; empty when the prompt matches the engine.
 */
export function checkChatPrompt(prompt) {
    const importLines = (prompt.match(ANY_IMPORT_RE) ?? []).map((line) => line.trim());

    if (importLines.length === 0) {
        return ['no `import { ... } from <pinned jsDelivr URL>` line found'];
    }

    const problems = [];
    /** @type {string[]} */
    const specifiers = [];

    for (const line of importLines) {
        const match = PINNED_IMPORT_RE.exec(line);

        if (match === null || !CDN_PIN_RE.test(match[2] ?? '')) {
            problems.push(`not an \`import { ... } from '<pinned jsDelivr URL>';\` line: ${line}`);
            continue;
        }

        specifiers.push(...(match[1] ?? '').split(',').map((specifier) => specifier.trim()));
    }

    if (new Set(importLines).size > 1) {
        problems.push(`the import lines differ:\n${importLines.map((line) => `  ${line}`).join('\n')}`);
    }

    const uniqueSpecifiers = [...new Set(specifiers)].filter(Boolean);

    if (uniqueSpecifiers.length === 0) {
        return problems;
    }

    // `BT as B` binds `B`, so chains are looked up by the local name.
    const locals = uniqueSpecifiers.map((specifier) => specifier.split(/\s+as\s+/u).at(-1) ?? specifier);
    const chainRe = new RegExp(
        String.raw`(?<![\w$])(?:${locals.map(escapeRegExp).join('|')})(?:\.[A-Za-z_$][\w$]*)+`,
        'gu',
    );
    const chains = [...new Set(prompt.match(chainRe) ?? [])];

    // Line 1 is the import, line N + 2 is chains[N], so a diagnostic's line maps straight back to its chain.
    const probe = [
        `import { ${uniqueSpecifiers.join(', ')} } from 'blit386';`,
        ...chains.map((chain) => `void ${chain};`),
    ].join('\n');

    const options = {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
        types: [],
    };
    const host = ts.createCompilerHost(options);
    const { getSourceFile, fileExists, readFile } = host;

    host.getSourceFile = (fileName, languageVersion, ...rest) =>
        fileName === PROBE_PATH
            ? ts.createSourceFile(fileName, probe, languageVersion)
            : getSourceFile.call(host, fileName, languageVersion, ...rest);
    host.fileExists = (fileName) => fileName === PROBE_PATH || fileExists.call(host, fileName);
    host.readFile = (fileName) => (fileName === PROBE_PATH ? probe : readFile.call(host, fileName));

    const program = ts.createProgram([PROBE_PATH], options, host);
    const probeFile = program.getSourceFile(PROBE_PATH);

    if (probeFile === undefined) {
        throw new Error(`TypeScript did not load the probe file ${PROBE_PATH}`);
    }

    const diagnostics = [
        ...program.getOptionsDiagnostics(),
        ...program.getGlobalDiagnostics(),
        ...program.getSyntacticDiagnostics(probeFile),
        ...program.getSemanticDiagnostics(probeFile),
    ];

    for (const diagnostic of diagnostics) {
        const line =
            diagnostic.file === probeFile && diagnostic.start !== undefined
                ? probeFile.getLineAndCharacterOfPosition(diagnostic.start).line
                : -1;
        const where = line === -1 ? 'compiler' : line === 0 ? 'import line' : chains[line - 1];

        problems.push(`${where}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }

    return problems;
}
