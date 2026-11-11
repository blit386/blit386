/**
 * The Cursor adapter: `.cursor/` rules, hooks, skills, and `mcp.json`.
 */

import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import { CURSOR_HOOKS_DIR, CURSOR_HOOKS_JSON, CURSOR_RULES_DIR, CURSOR_SKILLS_DIR } from '../ownership';
import {
    collectHookScripts,
    collectSkills,
    type CursorHookEntry,
    type CursorHooksJson,
    type GeneratedFile,
    type HooksManifest,
    mcpConfigFile,
    readHooksManifest,
    readRules,
    render,
} from './shared';

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
 * Generate the Cursor adapter files from the kit IR:
 *   - `.cursor/rules/{name}.mdc`           (kit-owned; MDC frontmatter preserved)
 *   - `.cursor/hooks.json`                 (kit-owned; translated from content/hooks.manifest.json)
 *   - `.cursor/hooks/{script}`             (kit-owned; copied verbatim)
 *   - `.cursor/skills/{name}/SKILL.md`     (kit-owned, one per skill; frontmatter kept)
 *   - `.cursor/mcp.json`                   (kit-owned; the blit386.dev documentation MCP server)
 */
export function generateCursorAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const files: GeneratedFile[] = [];

    for (const rule of readRules(contentRoot)) {
        files.push({
            path: `${CURSOR_RULES_DIR}${rule.name.replace(/\.md$/, '.mdc')}`,
            content: render(rule.content, vars),
        });
    }

    const manifest = readHooksManifest(contentRoot);
    files.push({ path: CURSOR_HOOKS_JSON, content: `${JSON.stringify(buildCursorHooks(manifest, vars), null, 2)}\n` });

    files.push(mcpConfigFile('cursor'));
    files.push(...collectHookScripts(contentRoot, manifest, 'cursor', CURSOR_HOOKS_DIR));
    files.push(...collectSkills(contentRoot, vars, CURSOR_SKILLS_DIR));

    return files;
}
