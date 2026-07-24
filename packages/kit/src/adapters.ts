/**
 * Shared agent adapters for Claude Code and Cursor.
 *
 * Single source of truth: both `create-blit386` (scaffold-time write-to-disk) and `blit agents sync` /
 * `blit agents add` (generate-to-memory) import these generators. They return `{ path, content }`
 * pairs; callers write to disk or apply the ownership model as needed.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Managed-region markers shared by AGENTS.md and CLAUDE.md. */
const MANAGED_START = '<!-- blit-kit:managed:start -->';
const MANAGED_END = '<!-- blit-kit:managed:end -->';

/** A regenerated file: a project-relative path (forward slashes) and its full content. */
export interface GeneratedFile {
    /** Path relative to the project root, using forward slashes. */
    path: string;
    /** Full file content as the kit would write it. */
    content: string;
}

/** Template variables substituted into kit content (package-manager commands, project name, ...). */
export type TemplateVars = Record<string, string>;

/** The kit package root (the folder containing this kit's package.json and content/). */
export function kitRoot(): string {
    // Emitted as dist/adapters.js (and also inlined into dist/cli.js); `../package.json` is the kit root.
    return dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
}

/** Replace {{placeholder}} tokens; unknown tokens are left untouched so mistakes stay visible. */
function render(content: string, vars: TemplateVars): string {
    return content.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? `{{${key}}}`);
}

/**
 * Strip YAML frontmatter (a `---`…`---` block at the top) from a markdown file.
 *
 * Kit rules carry frontmatter used by the Cursor adapter (alwaysApply, globs). The Claude adapter uses
 * only the body, so it strips the frontmatter before emitting the file into `.claude/rules/`.
 */
function stripFrontmatter(content: string): string {
    if (!content.startsWith('---')) {
        return content;
    }

    const firstLineEnd = content.indexOf('\n');
    if (firstLineEnd === -1) {
        return content;
    }

    const rest = content.slice(firstLineEnd + 1);
    const closingMatch = rest.match(/^---\s*(?:\r?\n|$)/m);
    if (!closingMatch || closingMatch.index === undefined) {
        return content;
    }

    const bodyStart = firstLineEnd + 1 + closingMatch.index + closingMatch[0].length;

    return content.slice(bodyStart).replace(/^\r?\n/, '');
}

/**
 * Extract the content between the managed-region markers, skipping the ownership-comment block that
 * immediately follows the start marker.
 */
function extractManagedRegion(content: string): string {
    const startIdx = content.indexOf(MANAGED_START);
    const endIdx = content.indexOf(MANAGED_END);

    if (startIdx === -1 || endIdx === -1) {
        return content.trim();
    }

    let bodyStart = startIdx + MANAGED_START.length;

    const afterStart = content.slice(bodyStart).trimStart();
    if (afterStart.startsWith('<!--')) {
        const commentEnd = content.indexOf('-->', bodyStart);
        if (commentEnd !== -1) {
            bodyStart = commentEnd + '-->'.length;
        }
    }

    return content.slice(bodyStart, endIdx).trim();
}

/**
 * Replace the managed region of an existing shared file with a freshly generated one, preserving
 * everything outside the markers byte-for-byte. Returns null when either file lacks both markers,
 * so the caller can fall back to a conflict copy.
 */
export function replaceManagedRegion(existing: string, regenerated: string): string | null {
    const exStart = existing.indexOf(MANAGED_START);
    const exEnd = existing.indexOf(MANAGED_END);
    const regStart = regenerated.indexOf(MANAGED_START);
    const regEnd = regenerated.indexOf(MANAGED_END);

    if (exStart === -1 || exEnd === -1 || regStart === -1 || regEnd === -1) {
        return null;
    }

    const before = existing.slice(0, exStart);
    const after = existing.slice(exEnd + MANAGED_END.length);
    const newBlock = regenerated.slice(regStart, regEnd + MANAGED_END.length);

    return `${before}${newBlock}${after}`;
}

/** The AGENTS.md file, copied verbatim from the kit (a shared file with managed markers). */
export function agentsFile(root: string): GeneratedFile {
    const content = readFileSync(join(root, 'content', 'AGENTS.md'), 'utf8');
    return { path: 'AGENTS.md', content };
}

/** Every doc under content/docs, as kit-owned `docs/<name>` files. */
export function collectDocs(root: string): GeneratedFile[] {
    const docsRoot = join(root, 'content', 'docs');
    const files: GeneratedFile[] = [];

    if (!existsSync(docsRoot)) {
        return files;
    }

    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), childPrefix);
            } else {
                files.push({ path: `docs/${childPrefix}`, content: readFileSync(join(dir, entry.name), 'utf8') });
            }
        }
    };

    walk(docsRoot, '');

    return files;
}

/**
 * Generate the Claude Code adapter files from the kit IR:
 *   - `CLAUDE.md`                      (shared file with a managed region)
 *   - `.claude/rules/{name}.md`        (kit-owned; frontmatter stripped)
 *   - `.claude/skills/{name}/SKILL.md` (kit-owned)
 *   - `.claude/settings.json`          (kit-owned; translated from content/hooks.manifest.json)
 *   - `.claude/hooks/{script}`         (kit-owned; copied verbatim)
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated Claude Code files and their contents.
 */
export function generateClaudeAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const files: GeneratedFile[] = [];

    const agentsMd = readFileSync(join(contentRoot, 'AGENTS.md'), 'utf8');
    const managedBody = extractManagedRegion(agentsMd);

    const commandsBlock = [
        '',
        '## Commands',
        '',
        `- \`${vars.pmRunDev}\` - start the dev server`,
        `- \`${vars.pmRunBuild}\` - build for production`,
        `- \`${vars.pmRunFormat}\` - format the code`,
        `- \`${vars.pmRunLint}\` - check code style`,
        '- `npx blit doctor` - check your setup',
        '- `npx blit upgrade` - update BLIT386',
    ].join('\n');

    const claudeMd = [
        MANAGED_START,
        '<!-- This block is managed by @blit386/kit. Run `npx blit agents sync` to update it. Put your own notes below the end marker. -->',
        '',
        managedBody,
        commandsBlock,
        '',
        MANAGED_END,
        '',
        '## Your notes',
        '',
        'Add project-specific notes for Claude here. This section is yours.',
        '',
    ].join('\n');

    files.push({ path: 'CLAUDE.md', content: claudeMd });

    const rulesDir = join(contentRoot, 'rules');
    if (existsSync(rulesDir)) {
        for (const entry of readdirSync(rulesDir, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) {
                continue;
            }

            const src = join(rulesDir, entry.name);
            files.push({
                path: `.claude/rules/${entry.name}`,
                content: render(stripFrontmatter(readFileSync(src, 'utf8')), vars),
            });
        }
    }

    const skillsDir = join(contentRoot, 'skills');
    if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }

            const skillSrc = join(skillsDir, entry.name, 'SKILL.md');
            if (!existsSync(skillSrc)) {
                continue;
            }

            // Keep the frontmatter: Claude Code reads name/description from it to
            // discover and trigger the skill, so stripping it would make it inert.
            files.push({
                path: `.claude/skills/${entry.name}/SKILL.md`,
                content: render(readFileSync(skillSrc, 'utf8'), vars),
            });
        }
    }

    const hookManifestPath = join(contentRoot, 'hooks.manifest.json');
    if (existsSync(hookManifestPath)) {
        const manifest = JSON.parse(readFileSync(hookManifestPath, 'utf8')) as HooksManifest;
        const claudeSettings = buildClaudeSettings(manifest, vars);
        files.push({ path: '.claude/settings.json', content: `${JSON.stringify(claudeSettings, null, 2)}\n` });
    }

    const hooksScriptsDir = join(contentRoot, 'hooks');
    if (existsSync(hooksScriptsDir)) {
        for (const entry of readdirSync(hooksScriptsDir, { withFileTypes: true })) {
            if (!entry.isFile()) {
                continue;
            }

            files.push({
                path: `.claude/hooks/${entry.name}`,
                content: readFileSync(join(hooksScriptsDir, entry.name), 'utf8'),
            });
        }
    }

    return files;
}

interface CursorHookEntry {
    command?: string;
    matcher?: string;
    timeout?: number;
    failClosed?: boolean;
}

interface CursorHooksJson {
    version: number;
    hooks: Record<string, CursorHookEntry[]>;
}

interface HookManifestCursorBlock extends CursorHookEntry {
    event: string;
}

/** One command handler inside a Claude Code matcher group. */
interface ClaudeHookCommand {
    type: 'command';
    command: string;
    timeout?: number;
    continueOnError?: boolean;
}

/** A Claude Code matcher group: tool-name matcher + one or more command hooks. */
interface ClaudeMatcherGroup {
    matcher?: string;
    hooks: ClaudeHookCommand[];
}

interface ClaudeSettingsJson {
    hooks: Record<string, ClaudeMatcherGroup[]>;
}

interface HookManifestClaudeBlock {
    event: string;
    command: string;
    matcher?: string;
    timeout?: number;
    continueOnError?: boolean;
}

interface HookManifestEntry {
    id: string;
    intent: string;
    cursor?: HookManifestCursorBlock;
    claude?: HookManifestClaudeBlock;
}

interface HooksManifest {
    version: string;
    hooks: HookManifestEntry[];
}

/** Translate the canonical hooks manifest into Cursor's `hooks.json` structure, rendering template vars. */
function buildCursorHooks(manifest: HooksManifest, vars: TemplateVars): CursorHooksJson {
    const hooks: Record<string, CursorHookEntry[]> = {};

    for (const hook of manifest.hooks) {
        if (!hook.cursor) {
            continue;
        }

        const { event, ...rest } = hook.cursor;
        const entry: CursorHookEntry = {};

        if (rest.command !== undefined) {
            entry.command = render(rest.command, vars);
        }

        if (rest.matcher !== undefined) {
            entry.matcher = rest.matcher;
        }

        if (rest.timeout !== undefined) {
            entry.timeout = rest.timeout;
        }

        if (rest.failClosed !== undefined) {
            entry.failClosed = rest.failClosed;
        }

        if (!hooks[event]) {
            hooks[event] = [];
        }

        hooks[event].push(entry);
    }

    return { version: 1, hooks };
}

/**
 * Translate the canonical hooks manifest into Claude Code's `.claude/settings.json` hooks structure,
 * rendering template vars. Claude nests command handlers under matcher groups per event.
 */
function buildClaudeSettings(manifest: HooksManifest, vars: TemplateVars): ClaudeSettingsJson {
    const hooks: Record<string, ClaudeMatcherGroup[]> = {};

    for (const hook of manifest.hooks) {
        if (!hook.claude) {
            continue;
        }

        const { event, command, matcher, timeout, continueOnError } = hook.claude;
        const commandHook: ClaudeHookCommand = {
            type: 'command',
            command: render(command, vars),
        };

        if (timeout !== undefined) {
            commandHook.timeout = timeout;
        }

        if (continueOnError !== undefined) {
            commandHook.continueOnError = continueOnError;
        }

        const group: ClaudeMatcherGroup = { hooks: [commandHook] };
        if (matcher !== undefined) {
            group.matcher = matcher;
        }

        if (!hooks[event]) {
            hooks[event] = [];
        }

        hooks[event].push(group);
    }

    return { hooks };
}

/**
 * Generate the Cursor adapter files from the kit IR:
 *   - `.cursor/rules/{name}.mdc`      (kit-owned; MDC frontmatter preserved)
 *   - `.cursor/hooks.json`            (kit-owned; translated from content/hooks.manifest.json)
 *   - `.cursor/hooks/{script}`        (kit-owned; copied verbatim)
 *   - `.cursor/commands/{name}.md`    (kit-owned, one per skill)
 */
export function generateCursorAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const files: GeneratedFile[] = [];

    const rulesDir = join(contentRoot, 'rules');
    if (existsSync(rulesDir)) {
        for (const entry of readdirSync(rulesDir, { withFileTypes: true })) {
            if (!entry.isFile() || !entry.name.endsWith('.md')) {
                continue;
            }

            const src = join(rulesDir, entry.name);
            const destName = entry.name.replace(/\.md$/, '.mdc');
            files.push({ path: `.cursor/rules/${destName}`, content: render(readFileSync(src, 'utf8'), vars) });
        }
    }

    const hookManifestPath = join(contentRoot, 'hooks.manifest.json');
    if (existsSync(hookManifestPath)) {
        const manifest = JSON.parse(readFileSync(hookManifestPath, 'utf8')) as HooksManifest;
        const cursorHooks = buildCursorHooks(manifest, vars);
        files.push({ path: '.cursor/hooks.json', content: `${JSON.stringify(cursorHooks, null, 2)}\n` });
    }

    const hooksScriptsDir = join(contentRoot, 'hooks');
    if (existsSync(hooksScriptsDir)) {
        for (const entry of readdirSync(hooksScriptsDir, { withFileTypes: true })) {
            if (!entry.isFile()) {
                continue;
            }

            files.push({
                path: `.cursor/hooks/${entry.name}`,
                content: readFileSync(join(hooksScriptsDir, entry.name), 'utf8'),
            });
        }
    }

    const skillsDir = join(contentRoot, 'skills');
    if (existsSync(skillsDir)) {
        for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }

            const skillSrc = join(skillsDir, entry.name, 'SKILL.md');
            if (!existsSync(skillSrc)) {
                continue;
            }

            // A Cursor command is invoked by filename, so the skill's name/description
            // frontmatter adds no value and would render as literal text. Strip it.
            // The Claude adapter keeps the frontmatter (a skill needs it to trigger).
            files.push({
                path: `.cursor/commands/${entry.name}.md`,
                content: render(stripFrontmatter(readFileSync(skillSrc, 'utf8')), vars),
            });
        }
    }

    return files;
}
