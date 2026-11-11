/**
 * The Gemini CLI adapter: `.gemini/settings.json` (hooks, context files, docs server) and its hook scripts.
 */

import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import { AGENTS_MD, GEMINI_HOOKS_DIR, GEMINI_SETTINGS_JSON } from '../ownership';
import {
    collectHookScripts,
    type GeneratedFile,
    type HooksManifest,
    MCP_SERVER_ENTRY,
    MCP_SERVER_NAME,
    type McpServerEntry,
    readHooksManifest,
    render,
} from './shared';

/** One command handler inside a Gemini CLI matcher group. `timeout` is in milliseconds. */
interface GeminiHookCommand {
    name: string;
    type: 'command';
    command: string;
    timeout?: number;
}

/** A Gemini CLI matcher group: a regex over tool names (exact string for lifecycle events) + command hooks. */
interface GeminiMatcherGroup {
    matcher?: string;
    hooks: GeminiHookCommand[];
}

/** `.gemini/settings.json` as the kit writes it. */
interface GeminiSettingsJson {
    context: { fileName: string[] };
    mcpServers: Record<string, McpServerEntry>;
    hooks: Record<string, GeminiMatcherGroup[]>;
}

/**
 * Gemini CLI reads `GEMINI.md`, not `AGENTS.md`, unless `context.fileName` says otherwise. Listing `GEMINI.md` too keeps
 * a hand-written one loading; the kit never emits it.
 */
const GEMINI_CONTEXT_FILES = [AGENTS_MD, 'GEMINI.md'];

/** Translate the canonical hooks manifest and the docs server into `.gemini/settings.json`, rendering template vars. */
function buildGeminiSettings(manifest: HooksManifest, vars: TemplateVars): GeminiSettingsJson {
    const hooks: Record<string, GeminiMatcherGroup[]> = {};

    for (const hook of manifest.hooks) {
        if (!hook.gemini) {
            continue;
        }

        const { event, command, matcher, timeout } = hook.gemini;
        const commandHook: GeminiHookCommand = { name: hook.id, type: 'command', command: render(command, vars) };

        if (timeout !== undefined) {
            commandHook.timeout = timeout;
        }

        const group: GeminiMatcherGroup = { hooks: [commandHook] };
        if (matcher !== undefined) {
            group.matcher = matcher;
        }

        hooks[event] = [...(hooks[event] ?? []), group];
    }

    return {
        context: { fileName: GEMINI_CONTEXT_FILES },
        mcpServers: { [MCP_SERVER_NAME]: MCP_SERVER_ENTRY.gemini },
        hooks,
    };
}

/**
 * Generate the Gemini CLI adapter files from the kit IR:
 *   - `.gemini/settings.json`       (kit-owned, merged on `add`; the `AGENTS.md` pointer, the docs MCP server, and hooks)
 *   - `.gemini/hooks/{script}`      (kit-owned; copied verbatim)
 *
 * Skills come from the shared `.agents/skills/` folder (`generateAgentFiles` adds it) and the persona is `AGENTS.md`,
 * so neither is emitted here. No `.gemini/policies/` (the workspace policy tier does not work) and no `GEMINI.md`.
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated Gemini CLI files and their contents.
 */
export function generateGeminiAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);

    return [
        { path: GEMINI_SETTINGS_JSON, content: `${JSON.stringify(buildGeminiSettings(manifest, vars), null, 2)}\n` },
        ...collectHookScripts(contentRoot, manifest, 'gemini', GEMINI_HOOKS_DIR),
    ];
}
