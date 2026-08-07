#!/usr/bin/env node
/**
 * Flag dash-typography violations of the root CLAUDE.md rule: en dash (–) for a
 * parenthetical break or a range, never an em dash (—) and never a hyphen used
 * the same way.
 *
 * Two checks, line by line:
 *   - Em dash anywhere – always flagged, there is no legitimate use in this repo's
 *     convention. A lone `(—)` right after the words "em dash" is exempt – that is
 *     this file (and CLAUDE.md itself) naming the character, not misusing it.
 *   - A hyphen surrounded by exactly one space on each side, with an
 *     alphanumeric/quote/paren character on both outer edges – the shape of a
 *     parenthetical break someone typed as `word - word` instead of `word – word`.
 *     Markdown list-item lines (`- item`, optionally prefixed by `*`, `//`, or `#`
 *     for a JSDoc/comment bullet) are exempt, and so is anything inside a fenced
 *     code block (``` ... ```) or an inline `code span`, since example output,
 *     commands, and illustrative snippets are not prose.
 *
 * `.ts`/`.tsx`/`.js`/`.cjs`/`.mjs` files are checked comment-only (`//` and
 * `/* *\/` text), not full source – arithmetic like `a - b` would otherwise
 * false-positive on the same shape a real dash break has. The extractor tracks
 * string/template-literal boundaries (with `\` escapes) so a `//` or `/*` inside
 * a quoted string – common in an embedded WGSL shader string, which itself uses
 * `//` comments – is not misread as a real comment marker; it does not evaluate
 * `${...}` template expressions, so dash text inside one is not checked.
 * `.md`/`.mdx` files are checked in full (minus fenced/inline code), since prose
 * is most of the file.
 *
 * CLI/JS -- style ranges, ISO dates, and CLI flags (`--verbose`, `-s`) do not
 * match either pattern, since neither has a space on both sides of a single
 * hyphen.
 *
 * Usage:
 *   node scripts/check-dash-typography.mjs [file ...]
 *
 * With no arguments, scans every git-tracked .ts/.tsx/.js/.cjs/.mjs/.md/.mdx file
 * (`git ls-files`), skipping packages/website/content/docs/** – that tree is
 * generated from packages/blit386/docs/ via `pnpm run sync:docs`, so the source
 * is already in scope and the mirror would just be a duplicate finding.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';
const FENCE_RE = /^\s*```/;
const LIST_BULLET_RE = /^\s*(?:[*#]|\/\/)?\s*-\s/;
const INLINE_CODE_RE = /`[^`]*`/g;
const QUOTE_CHARS = new Set(["'", '"', '`']);
const HYPHEN_BREAK_RE = /(?<=[A-Za-z0-9)"'`.,;:!?])[ \t]-[ \t](?=[A-Za-z0-9"'`(])/g;
const SCAN_EXTENSIONS = ['*.ts', '*.tsx', '*.js', '*.cjs', '*.mjs', '*.md', '*.mdx'];
const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs']);
const IGNORED_PATH_PATTERNS = [/^packages\/website\/content\/docs\/[^/]+\//u];

/**
 * @typedef {{ line: number, column: number, kind: 'em-dash' | 'hyphen-as-dash', message: string }} DashIssue
 */

/** Blanks the interior of every inline `code span` so it cannot trip the prose checks below, while keeping column offsets stable. @param {string} line @returns {string} */
function maskInlineCode(line) {
    return line.replace(INLINE_CODE_RE, (match) => `\`${' '.repeat(match.length - 2)}\``);
}

/**
 * Reduces JS/TS source to just its `//` and `/* *\/` comment text, blanking
 * everything else (code, string/template-literal content) to same-length spaces
 * or newlines so line/column offsets stay stable. Tracks quote state (with `\`
 * escapes) across `'`, `"`, and `` ` `` so a comment-like substring inside a
 * string is not misread as a real comment marker; does not evaluate `${...}`
 * template expressions.
 *
 * @param {string} text
 * @returns {string}
 */
function extractComments(text) {
    let output = '';
    let state = 'code';
    let i = 0;

    while (i < text.length) {
        const ch = text[i];
        const next = text[i + 1];
        const blank = ch === '\n' ? '\n' : ' ';

        if (state === 'code') {
            if (ch === '/' && next === '/') {
                state = 'lineComment';
                output += '//';
                i += 2;
            } else if (ch === '/' && next === '*') {
                state = 'blockComment';
                output += '/*';
                i += 2;
            } else if (QUOTE_CHARS.has(ch)) {
                state = ch;
                output += blank;
                i += 1;
            } else {
                output += blank;
                i += 1;
            }

            continue;
        }

        if (state === 'lineComment') {
            output += ch;
            i += 1;

            if (ch === '\n') state = 'code';

            continue;
        }

        if (state === 'blockComment') {
            if (ch === '*' && next === '/') {
                output += '*/';
                state = 'code';
                i += 2;
            } else {
                output += ch;
                i += 1;
            }

            continue;
        }

        // state holds the quote character ("'", '"', or "`") that opened the current string.
        if (ch === '\\' && next !== undefined) {
            output += blank + (next === '\n' ? '\n' : ' ');
            i += 2;
            continue;
        }

        if (ch === state) state = 'code';

        output += blank;
        i += 1;
    }

    return output;
}

/**
 * Scans `text` for em-dash and hyphen-as-parenthetical-break violations.
 *
 * @param {string} text
 * @param {{ commentsOnly?: boolean }} [options] Set `commentsOnly: true` for JS/TS
 *   source so arithmetic and string literals do not false-positive.
 * @returns {DashIssue[]}
 */
export function findDashTypographyIssues(text, options = {}) {
    const source = options.commentsOnly ? extractComments(text) : text;
    const issues = [];
    const lines = source.split('\n');
    let inFence = false;

    for (let i = 0; i < lines.length; i += 1) {
        const rawLine = lines[i];

        if (FENCE_RE.test(rawLine)) {
            inFence = !inFence;
            continue;
        }

        if (inFence) continue;

        const line = maskInlineCode(rawLine);
        let emIndex = line.indexOf(EM_DASH);

        while (emIndex !== -1) {
            const isNamingTheCharacter = line[emIndex - 1] === '(' && line[emIndex + 1] === ')';

            if (!isNamingTheCharacter) {
                issues.push({
                    line: i + 1,
                    column: emIndex + 1,
                    kind: 'em-dash',
                    message: `em dash (${EM_DASH}) is never allowed – use en dash (${EN_DASH}) for a parenthetical break`,
                });
            }

            emIndex = line.indexOf(EM_DASH, emIndex + 1);
        }

        if (LIST_BULLET_RE.test(rawLine)) continue;

        for (const match of line.matchAll(HYPHEN_BREAK_RE)) {
            issues.push({
                line: i + 1,
                column: match.index + 2,
                kind: 'hyphen-as-dash',
                message: `hyphen used as a parenthetical break – use en dash (${EN_DASH}) instead of a plain '-'`,
            });
        }
    }

    return issues;
}

/** @param {string} filePath @returns {boolean} */
export function isIgnoredFile(filePath) {
    const rel = relative(ROOT, filePath).split('\\').join('/');

    return IGNORED_PATH_PATTERNS.some((pattern) => pattern.test(rel));
}

/** @returns {string[]} Repo-relative paths of every tracked file matching SCAN_EXTENSIONS. */
function discoverTrackedFiles() {
    const output = execFileSync('git', ['ls-files', ...SCAN_EXTENSIONS], { cwd: ROOT, encoding: 'utf8' });

    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function main() {
    const argvFiles = process.argv.slice(2);
    const files = argvFiles.length > 0 ? argvFiles : discoverTrackedFiles();
    let hasIssues = false;

    for (const file of files) {
        const absolutePath = resolve(process.cwd(), file);

        if (isIgnoredFile(absolutePath)) continue;

        let text;

        try {
            text = readFileSync(absolutePath, 'utf8');
        } catch {
            continue;
        }

        const commentsOnly = CODE_EXTENSIONS.has(extname(file));
        const issues = findDashTypographyIssues(text, { commentsOnly });

        if (issues.length === 0) continue;

        hasIssues = true;

        for (const issue of issues) {
            console.error(`${file}:${issue.line}:${issue.column}  ${issue.kind}  ${issue.message}`);
        }
    }

    if (hasIssues) {
        console.error(`\nDash typography check failed – see root CLAUDE.md, "Shared conventions".`);
        console.error(`Use en dash (${EN_DASH}) for a parenthetical break: 'word ${EN_DASH} word'.`);
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
