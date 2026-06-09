/**
 * Turns the templates plus the kit's canonical docs into a ready-to-run game project.
 *
 * Sources:
 *   - ../templates/base  (language-agnostic: index.html, vite config, README, .gitignore, public/)
 *   - ../templates/js    (the JavaScript game + package.json + jsconfig)
 *   - @blit-tech/kit content (AGENTS.md + docs/) - the single source for the AI/human guidance
 */

import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

/** blit-tech version range written into the generated package.json. */
const BLIT_TECH_RANGE = '^1.1.1';

export interface ScaffoldOptions {
    targetDir: string;
    projectName: string;
    pmInstall: string;
    pmRunDev: string;
}

type TemplateVars = Record<string, string>;

function templatesDir(): string {
    // dist/index.js -> ../templates (templates ships alongside dist in the published package).
    return fileURLToPath(new URL('../templates', import.meta.url));
}

function kitRoot(): string {
    return dirname(require.resolve('@blit-tech/kit/package.json'));
}

function kitVersionRange(): string {
    const pkg = JSON.parse(readFileSync(join(kitRoot(), 'package.json'), 'utf8')) as { version?: string };
    return pkg.version ? `^${pkg.version}` : '^0.1.0';
}

/** Replace {{placeholder}} tokens; unknown tokens are left untouched so mistakes are visible. */
function render(content: string, vars: TemplateVars): string {
    return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
}

function stripTmpl(name: string): string {
    return name.endsWith('.tmpl') ? name.slice(0, -'.tmpl'.length) : name;
}

/** Turn a folder name into a valid npm package name (lowercase, dashes, no surprises). */
function toPackageName(name: string): string {
    const cleaned = name
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned.length > 0 ? cleaned : 'my-blit-game';
}

/** Copy a template tree, renaming `gitignore` -> `.gitignore`, stripping `.tmpl`, and rendering placeholders. */
function copyTemplateTree(srcDir: string, destDir: string, vars: TemplateVars): void {
    mkdirSync(destDir, { recursive: true });

    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = join(srcDir, entry.name);
        const outName = entry.name === 'gitignore' ? '.gitignore' : stripTmpl(entry.name);
        const destPath = join(destDir, outName);

        if (entry.isDirectory()) {
            copyTemplateTree(srcPath, destPath, vars);
        } else {
            const content = readFileSync(srcPath, 'utf8');
            writeFileSync(destPath, render(content, vars));
        }
    }
}

/** Generate the project at `targetDir`. The caller guarantees the folder is empty. */
export function scaffold(options: ScaffoldOptions): void {
    const vars: TemplateVars = {
        projectName: options.projectName,
        packageName: toPackageName(options.projectName),
        blitTechVersion: BLIT_TECH_RANGE,
        kitVersion: kitVersionRange(),
        pmInstall: options.pmInstall,
        pmRunDev: options.pmRunDev,
    };

    const templates = templatesDir();
    copyTemplateTree(join(templates, 'base'), options.targetDir, vars);
    copyTemplateTree(join(templates, 'js'), options.targetDir, vars);

    // Copy the kit's canonical guidance (single source of truth for AGENTS.md + docs).
    const content = kitRoot();
    copyFileSync(join(content, 'content', 'AGENTS.md'), join(options.targetDir, 'AGENTS.md'));
    cpSync(join(content, 'content', 'docs'), join(options.targetDir, 'docs'), { recursive: true });
}
