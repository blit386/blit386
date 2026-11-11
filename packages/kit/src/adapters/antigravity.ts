/**
 * The Antigravity adapter: `.agents/hooks.json`, its hook scripts, and `.agents/mcp_config.json`.
 */

import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import { ANTIGRAVITY_HOOKS_DIR, ANTIGRAVITY_HOOKS_JSON } from '../ownership';
import {
    type ClaudeHookCommand,
    type ClaudeMatcherGroup,
    collectHookScripts,
    commandHandler,
    type GeneratedFile,
    type HooksManifest,
    matcherGroup,
    mcpConfigFile,
    readHooksManifest,
} from './shared';

/**
 * Antigravity's `.agents/hooks.json`: hook-group name, then event, then handlers. Tool events (`PreToolUse`,
 * `PostToolUse`) nest handlers under matcher groups; every other event lists its handlers directly.
 */
type AntigravityHooksJson = Record<string, Record<string, (ClaudeMatcherGroup | ClaudeHookCommand)[]>>;

/** The Antigravity events that take a tool matcher. The rest ignore it and expect bare handlers. */
const ANTIGRAVITY_TOOL_EVENTS: ReadonlySet<string> = new Set(['PreToolUse', 'PostToolUse']);

/**
 * Translate the canonical hooks manifest into Antigravity's `.agents/hooks.json`. One group per manifest hook,
 * named `blit-<id>` so a user's own groups never collide with ours; tool events use Claude's matcher-group shape.
 */
function buildAntigravityHooks(manifest: HooksManifest, vars: TemplateVars): AntigravityHooksJson {
    const groups: AntigravityHooksJson = {};

    for (const hook of manifest.hooks) {
        if (!hook.antigravity) {
            continue;
        }

        const { event } = hook.antigravity;
        const entry = ANTIGRAVITY_TOOL_EVENTS.has(event)
            ? matcherGroup(hook.antigravity, vars)
            : commandHandler(hook.antigravity, vars);

        groups[`blit-${hook.id}`] = { [event]: [entry] };
    }

    return groups;
}

/**
 * Generate the Antigravity adapter files from the kit IR. Persona is `AGENTS.md` and skills are the shared
 * `.agents/skills/` folder, so neither is emitted here:
 *   - `.agents/hooks.json`        (kit-owned; translated from content/hooks.manifest.json)
 *   - `.agents/hooks/{script}`    (kit-owned; copied verbatim)
 *   - `.agents/mcp_config.json`   (kit-owned; the blit386.dev documentation MCP server)
 */
export function generateAntigravityAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);

    return [
        {
            path: ANTIGRAVITY_HOOKS_JSON,
            content: `${JSON.stringify(buildAntigravityHooks(manifest, vars), null, 2)}\n`,
        },
        mcpConfigFile('antigravity'),
        ...collectHookScripts(contentRoot, manifest, 'antigravity', ANTIGRAVITY_HOOKS_DIR),
    ];
}
