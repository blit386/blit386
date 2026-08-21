/**
 * Turns the templates plus the kit's canonical docs into a ready-to-run game project.
 *
 * Sources:
 *   - ../templates/base  (language-agnostic: index.html, vite config, README, .editorconfig, biome.json,
 *                        prettier.config.js + .prettierignore + scripts/prettier-plugin-compact-tables.mjs)
 *   - ../templates/js    (the JavaScript game + package.json + jsconfig)
 *   - ../templates/optional/* (wizard opt-in: CI, Cursor rules, Claude guide)
 *   - @blit386/kit content (AGENTS.md + docs/) – the single source for the AI/human guidance
 *
 * After emitting all files, scaffold writes `.blit/manifest.json` (the ownership manifest) and
 * `.blit/base/` (pristine copies of kit-owned and shared files) so future `blit agents sync` runs
 * can detect what the user has modified and handle conflicts without clobbering edits.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    agentsFile,
    classifyFile,
    collectDocs,
    type FileClass,
    type GeneratedFile,
    generateClaudeAdapter,
    generateCursorAdapter,
    isKitManaged,
    render,
    type TemplateVars,
} from '@blit386/kit/adapters';

const require = createRequire(import.meta.url);

/** blit386 version range written into the generated package.json. */
const BLIT386_RANGE = '^1.5.0';

/** Output directory names for optional wizard templates. */
const GITHUB_DIR = '.github';
const CURSOR_DIR = '.cursor';

/** The `.blit` directory name inside every generated project. */
const BLIT_DIR = '.blit';

/**
 * One entry in `.blit/manifest.json`, as written at scaffold time.
 *
 * The writer half of a deliberate pair: `ManifestEntry` / `BlitManifest` in
 * `packages/kit/src/commands/agents.ts` are the reader half, and make these fields optional because
 * they read manifests written by any released scaffolder. This side must always emit them, so its
 * fields stay required. Only `class` is shared – it is `FileClass` from `@blit386/kit/adapters` on
 * both sides, so a typo is a compile error. Merging the two shapes needs a manifest schema version
 * first.
 */
interface ManifestEntry {
    /** File path relative to the project root. */
    path: string;
    /** Ownership class determining how `blit agents sync` handles this file. */
    class: FileClass;
    /** Kit version that last wrote this file. */
    kitVersion: string;
    /** SHA-256 hex digest of the file content as generated (before any user edits). */
    sha256: string;
}

/** The full `.blit/manifest.json` structure. */
interface BlitManifest {
    /** Kit version that created this project. */
    kitVersion: string;
    /** ISO-8601 creation timestamp. */
    createdAt: string;
    /**
     * Template variables used at scaffold time (package-manager commands, project name, ...).
     * `blit agents sync` reads these back so it regenerates kit files with the exact same values,
     * independent of the environment it runs in.
     */
    vars: Record<string, string>;
    /** One entry per generated file, sorted by path for stable diffs. */
    files: ManifestEntry[];
}

export type AgentChoice = 'none' | 'claude' | 'cursor';

/** Which language layer to scaffold. */
export type LanguageChoice = 'js' | 'ts';

export interface ScaffoldOptions {
    targetDir: string;
    projectName: string;
    pmInstall: string;
    pmRunDev: string;
    pmRunBuild: string;
    pmRunFormat: string;
    pmRunLint: string;
    includeCi?: boolean;
    agent?: AgentChoice;
    /** Language layer to use; defaults to `'js'`. */
    language?: LanguageChoice;
}

function templatesDir(): string {
    // dist/index.js -> ../templates (templates ships alongside dist in the published package).
    return fileURLToPath(new URL('../templates', import.meta.url));
}

/**
 * The installed kit's package root.
 *
 * Deliberately not `kitRoot()` from `@blit386/kit/adapters`: that one resolves relative to its own
 * module URL ("the kit containing me"), while the scaffolder needs Node resolution ("the kit this
 * package depends on"). Same directory today, different behavior under bundling and linking.
 */
function kitRoot(): string {
    return dirname(require.resolve('@blit386/kit/package.json'));
}

function kitVersionRange(): string {
    const pkg = JSON.parse(readFileSync(join(kitRoot(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ? `^${pkg.version}` : '^0.1.0';
}

function stripTmpl(name: string): string {
    return name.endsWith('.tmpl') ? name.slice(0, -'.tmpl'.length) : name;
}

/** Map template file/dir names to their output names in the generated project. */
function mapOutputName(name: string): string {
    if (name === 'gitignore') {
        return '.gitignore';
    }
    if (name === 'editorconfig') {
        return '.editorconfig';
    }
    if (name === 'prettierignore') {
        return '.prettierignore';
    }
    if (name === 'dot-cursor') {
        return CURSOR_DIR;
    }
    if (name === 'dot-github') {
        return GITHUB_DIR;
    }
    return stripTmpl(name);
}

/** Turn a folder name into a valid npm package name (lowercase, dashes, no surprises). */
function toPackageName(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned.length > 0 ? cleaned : 'my-blit-game';
}

/** Copy a template tree, renaming special files/dirs, stripping `.tmpl`, and rendering placeholders. */
function copyTemplateTree(srcDir: string, destDir: string, vars: TemplateVars, written?: Set<string>): void {
    mkdirSync(destDir, { recursive: true });

    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = join(srcDir, entry.name);
        const outName = mapOutputName(entry.name);
        const destPath = join(destDir, outName);

        if (entry.isDirectory()) {
            copyTemplateTree(srcPath, destPath, vars, written);
        } else {
            const content = readFileSync(srcPath, 'utf8');
            writeFileSync(destPath, render(content, vars));
            written?.add(destPath);
        }
    }
}

/** Compute the SHA-256 hex digest of a UTF-8 file. */
function sha256(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Write `.blit/manifest.json` recording every generated file's path, class, kit version, and hash.
 * Also write pristine copies of kit-owned and shared files under `.blit/base/` so a future
 * `blit agents sync` run can perform a proper three-way merge instead of clobbering user edits.
 */
function writeBlitManifest(targetDir: string, writtenPaths: Set<string>, kitVer: string, vars: TemplateVars): void {
    const blitDir = join(targetDir, BLIT_DIR);
    const baseDir = join(blitDir, 'base');
    mkdirSync(baseDir, { recursive: true });

    const entries: ManifestEntry[] = [];

    for (const absPath of writtenPaths) {
        const relPath = relative(targetDir, absPath).replace(/\\/g, '/');

        // Skip files that are inside .blit/ itself (manifest and base copies).
        if (relPath.startsWith('.blit/')) {
            continue;
        }

        const fileClass = classifyFile(relPath);
        const digest = sha256(absPath);

        entries.push({ path: relPath, class: fileClass, kitVersion: kitVer, sha256: digest });

        // Keep a pristine copy for future three-way merges (kit-owned and shared files only).
        if (isKitManaged(fileClass)) {
            const baseCopyPath = join(baseDir, relPath);
            mkdirSync(dirname(baseCopyPath), { recursive: true });
            copyFileSync(absPath, baseCopyPath);
        }
    }

    // Sort by path for a stable, human-readable manifest.
    entries.sort((a, b) => a.path.localeCompare(b.path));

    const manifest: BlitManifest = {
        kitVersion: kitVer,
        createdAt: new Date().toISOString(),
        vars,
        files: entries,
    };

    writeFileSync(join(blitDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Write kit-generated agent files under `targetDir` and record each path in `writtenPaths`.
 * Generation lives in `@blit386/kit/adapters`; scaffold only persists the bytes to disk.
 */
function writeGeneratedFiles(targetDir: string, files: GeneratedFile[], writtenPaths: Set<string>): void {
    for (const file of files) {
        const dest = join(targetDir, file.path);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, file.content);
        writtenPaths.add(dest);
    }
}

/** Generate the project at `targetDir`. The caller guarantees the folder is empty. */
export function scaffold(options: ScaffoldOptions): void {
    // Resolve the actual kit version string (not the range) for the manifest.
    const kitPkg = JSON.parse(readFileSync(join(kitRoot(), 'package.json'), 'utf8')) as { version?: string };
    const kitVer = kitPkg.version ?? '0.1.0';

    const language: LanguageChoice = options.language ?? 'js';

    // gameFile is the user-readable path (README); entryFile is the HTML script src (leading slash).
    const gameFile = language === 'ts' ? 'src/game.ts' : 'src/game.js';
    const entryFile = `/${gameFile}`;

    const vars: TemplateVars = {
        projectName: options.projectName,
        packageName: toPackageName(options.projectName),
        blit386Version: BLIT386_RANGE,
        kitVersion: kitVersionRange(),
        pmInstall: options.pmInstall,
        pmRunDev: options.pmRunDev,
        pmRunBuild: options.pmRunBuild,
        pmRunFormat: options.pmRunFormat,
        pmRunLint: options.pmRunLint,
        // Resolved per language so base templates stay language-agnostic.
        entryFile,
        gameFile,
    };

    // Collect every file path we write so we can build the ownership manifest.
    const writtenPaths = new Set<string>();

    const templates = templatesDir();
    copyTemplateTree(join(templates, 'base'), options.targetDir, vars, writtenPaths);
    copyTemplateTree(join(templates, language), options.targetDir, vars, writtenPaths);

    if (options.includeCi) {
        copyTemplateTree(
            join(templates, 'optional', 'ci', 'github'),
            join(options.targetDir, GITHUB_DIR),
            vars,
            writtenPaths,
        );
    }

    const kit = kitRoot();

    if (options.agent === 'cursor') {
        writeGeneratedFiles(options.targetDir, generateCursorAdapter(kit, vars), writtenPaths);
    }

    if (options.agent === 'claude') {
        writeGeneratedFiles(options.targetDir, generateClaudeAdapter(kit, vars), writtenPaths);
    }

    // The kit's canonical guidance, emitted by the same generators `blit agents sync` uses, so these
    // destinations cannot drift from the paths `classifyFile` assigns ownership to. Both emitters copy
    // the content verbatim – no `{{placeholder}}` rendering – exactly as the previous direct copy did.
    writeGeneratedFiles(options.targetDir, [agentsFile(kit), ...collectDocs(kit)], writtenPaths);

    // Seal the ownership manifest and write pristine base copies.
    writeBlitManifest(options.targetDir, writtenPaths, kitVer, vars);
}
