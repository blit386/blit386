/**
 * Regression tests for package-consumer documentation imports.
 *
 * README and docs guides must import from the published `blit386` package,
 * not from repository source paths such as `../src/BLIT386`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Imports that bypass the published package entry point. */
const FORBIDDEN_SOURCE_IMPORT = /from\s+['"]\.\.\/src\/BLIT386['"]/;

/** Deep package subpath imports not exposed in package.json exports. */
const FORBIDDEN_DEEP_PACKAGE_IMPORT = /from\s+['"]blit386\/render\//;

/**
 * Recursively collects markdown file paths under a directory.
 *
 * @param dir Absolute directory to scan.
 * @returns Relative paths from {@link REPO_ROOT}.
 */
const collectMarkdownFiles = (dir: string): string[] => {
    const entries = readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
        const absolutePath = join(dir, entry.name);

        if (entry.isDirectory()) {
            files.push(...collectMarkdownFiles(absolutePath));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(relative(REPO_ROOT, absolutePath));
        }
    }

    return files;
};

const CONSUMER_DOC_FILES = ['README.md', ...collectMarkdownFiles(join(REPO_ROOT, 'docs'))];

describe('consumer documentation imports', () => {
    for (const relativePath of CONSUMER_DOC_FILES) {
        it(`${relativePath} must not import from ../src/BLIT386`, () => {
            const content = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
            const match = FORBIDDEN_SOURCE_IMPORT.exec(content);

            expect(match, `found forbidden source import in ${relativePath}: ${match?.[0] ?? ''}`).toBeNull();
        });

        it(`${relativePath} must not deep-import blit386/render/...`, () => {
            const content = readFileSync(join(REPO_ROOT, relativePath), 'utf8');
            const match = FORBIDDEN_DEEP_PACKAGE_IMPORT.exec(content);

            expect(match, `found forbidden deep package import in ${relativePath}: ${match?.[0] ?? ''}`).toBeNull();
        });
    }
});
