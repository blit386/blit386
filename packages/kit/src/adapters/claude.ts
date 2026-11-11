/**
 * The Claude Code adapter: `CLAUDE.md`, `.claude/` rules, skills, hooks and settings, `.mcp.json`, and
 * `.claude/launch.json`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import {
    AGENTS_MD,
    CLAUDE_HOOKS_DIR,
    CLAUDE_LAUNCH_JSON,
    CLAUDE_MD,
    CLAUDE_RULES_DIR,
    CLAUDE_SETTINGS_JSON,
    CLAUDE_SKILLS_DIR,
} from '../ownership';
import {
    type ClaudeSettingsJson,
    collectHookScripts,
    collectSkills,
    extractManagedRegion,
    type GeneratedFile,
    type HooksManifest,
    MANAGED_END,
    MANAGED_START,
    matcherGroupsByEvent,
    MCP_SERVER_NAME,
    mcpConfigFile,
    readHooksManifest,
    readRules,
    render,
    stripFrontmatter,
} from './shared';

/**
 * Generate the Claude Code adapter files from the kit IR:
 *   - `CLAUDE.md`                      (shared file with a managed region)
 *   - `.claude/rules/{name}.md`        (kit-owned; frontmatter stripped)
 *   - `.claude/skills/{name}/SKILL.md` (kit-owned)
 *   - `.claude/settings.json`          (kit-owned; translated from content/hooks.manifest.json)
 *   - `.claude/hooks/{script}`         (kit-owned; copied verbatim)
 *   - `.mcp.json`                      (kit-owned; the blit386.dev documentation MCP server)
 *   - `.claude/launch.json`            (user-owned; the desktop app's preview-server config, written
 *                                       when missing and never touched again)
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated Claude Code files and their contents.
 */
export function generateClaudeAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const files: GeneratedFile[] = [];

    const agentsMd = readFileSync(join(contentRoot, AGENTS_MD), 'utf8');
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

    files.push({ path: CLAUDE_MD, content: claudeMd });

    for (const rule of readRules(contentRoot)) {
        files.push({ path: `${CLAUDE_RULES_DIR}${rule.name}`, content: render(stripFrontmatter(rule.content), vars) });
    }

    files.push(...collectSkills(contentRoot, vars, CLAUDE_SKILLS_DIR));

    const manifest = readHooksManifest(contentRoot);
    files.push({
        path: CLAUDE_SETTINGS_JSON,
        content: `${JSON.stringify(buildClaudeSettings(manifest, vars), null, 2)}\n`,
    });

    files.push(mcpConfigFile('claude'));
    files.push(launchConfigFile(vars));
    files.push(...collectHookScripts(contentRoot, manifest, 'claude', CLAUDE_HOOKS_DIR));

    return files;
}

/**
 * Translate the canonical hooks manifest into Claude Code's `.claude/settings.json` hooks structure,
 * rendering template vars. Claude nests command handlers under matcher groups per event.
 */
function buildClaudeSettings(manifest: HooksManifest, vars: TemplateVars): ClaudeSettingsJson {
    const hooks = matcherGroupsByEvent(manifest, 'claude', vars);

    // Pre-approve the documentation server `.mcp.json` registers, so Claude Code does not leave it
    // off behind a trust prompt. Cursor has no equivalent key, so `.cursor/mcp.json` gets nothing.
    return { hooks, enabledMcpjsonServers: [MCP_SERVER_NAME] };
}

/**
 * The port the Claude desktop app's preview looks at. Vite's own default, pinned with `--strictPort`:
 * Vite ignores the `PORT` variable the app would pass with `autoPort: true`, so a fixed port is the
 * only setting under which the preview and the server are guaranteed to agree.
 */
const DEV_SERVER_PORT = 5173;

/**
 * How each package manager runs the project-local `vite` binary, keyed by the manager name that
 * leads `vars.pmRunDev`. Vite is run directly rather than through the `dev` script so the flags
 * below reach it the same way under every manager.
 */
const VITE_RUNNER_ARGS: Record<string, readonly string[] | undefined> & { npm: readonly string[] } = {
    npm: ['exec', '--', 'vite'],
    pnpm: ['exec', 'vite'],
    yarn: ['vite'],
    bun: ['x', 'vite'],
};

/**
 * `.claude/launch.json`: one preview-server configuration, so the Claude desktop app's browser pane
 * can start the game with no setup. `--no-open` keeps older games (whose `vite.config` still sets
 * `server.open: true`) from popping a system browser window next to the pane. Not `--open false`: Vite reads that
 * `false` as a path and opens `/false`.
 */
function launchConfigFile(vars: TemplateVars): GeneratedFile {
    const manager = vars.pmRunDev?.split(' ')[0] ?? '';
    const runner = VITE_RUNNER_ARGS[manager];

    const config = {
        version: '0.0.1',
        configurations: [
            {
                name: `${vars.packageName ?? 'game'}-dev`,
                runtimeExecutable: runner ? manager : 'npm',
                runtimeArgs: [
                    ...(runner ?? VITE_RUNNER_ARGS.npm),
                    '--port',
                    String(DEV_SERVER_PORT),
                    '--strictPort',
                    '--no-open',
                ],
                port: DEV_SERVER_PORT,
                autoPort: false,
            },
        ],
    };

    return { path: CLAUDE_LAUNCH_JSON, content: `${JSON.stringify(config, null, 2)}\n` };
}
