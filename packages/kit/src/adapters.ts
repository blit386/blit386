/**
 * Shared agent adapters for Claude Code, Cursor, Antigravity, Codex, GitHub Copilot, Gemini CLI, OpenCode, and Zed.
 *
 * Single source of truth: both `create-blit386` (scaffold-time write-to-disk) and `blit agents sync` /
 * `blit agents add` (generate-to-memory) import these generators. They return `{ path, content }`
 * pairs; callers write to disk or apply the ownership model as needed.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
    AGENT_SPECS,
    AGENTS_MD,
    ANTIGRAVITY_HOOKS_DIR,
    ANTIGRAVITY_HOOKS_JSON,
    type AgentKind,
    type AgentSpec,
    CLAUDE_HOOKS_DIR,
    CLAUDE_LAUNCH_JSON,
    CLAUDE_MD,
    CLAUDE_RULES_DIR,
    CLAUDE_SETTINGS_JSON,
    CLAUDE_SKILLS_DIR,
    CODEX_CONFIG_TOML,
    CODEX_HOOKS_DIR,
    CODEX_HOOKS_JSON,
    COPILOT_HOOKS_DIR,
    COPILOT_HOOKS_JSON,
    COPILOT_SETUP_STEPS_YML,
    CURSOR_HOOKS_DIR,
    CURSOR_HOOKS_JSON,
    CURSOR_RULES_DIR,
    CURSOR_SKILLS_DIR,
    DOCS_DIR,
    GEMINI_HOOKS_DIR,
    GEMINI_SETTINGS_JSON,
    OPENCODE_HOOKS_DIR,
    OPENCODE_JSON,
    OPENCODE_KIT_GUARD,
    SHARED_SKILLS_DIR,
    sharedSkillsWanted,
    ZED_SETTINGS_JSON,
} from './ownership';
import type { TemplateVars } from './manifest';

// Ownership classification lives in its own leaf module (the generators below build every path they
// emit from its constants), re-exported here because `./adapters` is the kit's only published
// subpath - create-blit386 imports these from '@blit386/kit/adapters'.
export {
    AGENT_KINDS,
    AGENT_SPECS,
    type AgentKind,
    type AgentSpec,
    type FileClass,
    classifyFile,
    hasAgentFiles,
    isAgentPath,
    isKitManaged,
    SHARED_SKILLS_DIR,
} from './ownership';

// Kit-root resolution lives in its own leaf module so `./env` and the CLI commands can import it
// without pulling in the generators, re-exported here because `./adapters` is the kit's only published
// subpath - create-blit386 imports `resolveKitRoot` from '@blit386/kit/adapters'. The two answers are
// not interchangeable; `./kit-root` documents which question each one asks.
export { KIT_PACKAGE_NAME, kitRoot, resolveKitRoot } from './kit-root';

// The `.blit/manifest.json` location and shape live in their own leaf module, re-exported for the
// same reason: create-blit386 stamps the manifest that `blit agents sync` later reads back, so both
// sides must see one declaration.
export {
    BASE_DIR,
    BLIT_DIR,
    type BlitManifest,
    MANIFEST_FILE,
    type ManifestEntry,
    type ReadBlitManifest,
    type ReadManifestEntry,
    type TemplateVars,
} from './manifest';

/** Managed-region markers shared by AGENTS.md and CLAUDE.md. */
const MANAGED_START = '<!-- blit-kit:managed:start -->';
const MANAGED_END = '<!-- blit-kit:managed:end -->';

/**
 * The blit386.dev documentation MCP server that every generated game registers with its assistant.
 *
 * MANUAL-SYNC HAZARD: the canonical definition of this server lives in the website package, at
 * `packages/website/public/.well-known/mcp/server-card.json` (and `packages/website/src/mcp-server.ts`).
 * `@blit386/kit` ships standalone and cannot import across that boundary, so these two literals are a
 * deliberate copy. `packages/kit/test/mcp-config.test.mjs` compares them against the server card, so an
 * edit on either side that is not mirrored on the other fails the kit test suite rather than shipping
 * a generated game that points at a dead endpoint.
 */
export const MCP_SERVER_NAME = 'blit386-docs';
const MCP_SERVER_URL = 'https://blit386.dev/mcp';

/**
 * The assistants that get hook scripts and an `mcpServers` JSON file. Zed has neither: its settings file carries the
 * docs-MCP server (`generateZedAdapter`) and nothing in it runs a script.
 */
type HookedAgent = Exclude<AgentKind, 'zed'>;

/** A regenerated file: a project-relative path (forward slashes) and its full content. */
export interface GeneratedFile {
    /** Path relative to the project root, using forward slashes. */
    path: string;
    /** Full file content as the kit would write it. */
    content: string;
}

/**
 * Replace {{placeholder}} tokens; unknown tokens are left untouched so mistakes stay visible.
 *
 * Exported so `create-blit386` renders its templates with the same grammar the kit renders its own
 * content with - both write into the same generated project, so two copies of this regex would let
 * the placeholder syntax drift between them.
 *
 * @param content - Template text containing `{{name}}` tokens.
 * @param vars - Values to substitute, keyed by token name.
 * @returns The rendered text.
 */
export function render(content: string, vars: TemplateVars): string {
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
 * Extract the content between the managed-region markers of the kit's own `AGENTS.md`, skipping the
 * ownership comment that immediately follows the start marker. Throws when the kit file lacks either
 * marker or that comment: the kit ships it, so a missing one is a broken kit, not a case to paper over.
 */
function extractManagedRegion(content: string): string {
    const afterStart = content.indexOf(MANAGED_START) + MANAGED_START.length;
    const commentEnd = content.indexOf('-->', afterStart);
    const end = content.indexOf(MANAGED_END);

    if (
        afterStart < MANAGED_START.length ||
        !content.slice(afterStart).trimStart().startsWith('<!--') ||
        commentEnd === -1 ||
        end < commentEnd
    ) {
        throw new Error(`The kit's ${AGENTS_MD} is missing its managed-region markers or ownership comment.`);
    }

    return content.slice(commentEnd + '-->'.length, end).trim();
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

/**
 * The version of the kit at `root`, read from its own `package.json` - what the scaffolder pins and
 * what `blit agents sync` stamps into the manifest. Throws when the field is missing: the kit always
 * publishes one, so there is no sensible version to invent.
 *
 * @param root - The kit root directory.
 * @returns The kit's semver version string.
 */
export function readKitVersion(root: string): string {
    const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: unknown };

    if (typeof version !== 'string') {
        throw new Error(`${join(root, 'package.json')} has no version.`);
    }

    return version;
}

/** The AGENTS.md file, copied verbatim from the kit (a shared file with managed markers). */
export function agentsFile(root: string): GeneratedFile {
    const content = readFileSync(join(root, 'content', AGENTS_MD), 'utf8');
    return { path: AGENTS_MD, content };
}

/** Every doc under content/docs, as kit-owned `docs/<name>` files. */
export function collectDocs(root: string): GeneratedFile[] {
    const docsRoot = join(root, 'content', 'docs');
    const files: GeneratedFile[] = [];

    const walk = (dir: string, prefix: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const childPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(join(dir, entry.name), childPrefix);
            } else {
                files.push({ path: `${DOCS_DIR}${childPrefix}`, content: readFileSync(join(dir, entry.name), 'utf8') });
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

/** Every `content/rules/*.md` file the kit ships, by file name. */
function readRules(contentRoot: string): { name: string; content: string }[] {
    const rulesDir = join(contentRoot, 'rules');

    return readdirSync(rulesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => ({ name: entry.name, content: readFileSync(join(rulesDir, entry.name), 'utf8') }));
}

/** The kit's canonical hook intent, `content/hooks.manifest.json`. */
function readHooksManifest(contentRoot: string): HooksManifest {
    return JSON.parse(readFileSync(join(contentRoot, 'hooks.manifest.json'), 'utf8')) as HooksManifest;
}

/** A sibling `.cjs` a hook script loads with `require('./name.cjs')` (the guard core, today). */
const LOCAL_REQUIRE = /require\(\s*['"]\.\/([\w.-]+\.cjs)['"]\s*\)/g;

/**
 * Basenames of hook scripts (e.g. `session-start.sh`, `shell-safety.cjs`) that one adapter's manifest entries
 * actually invoke, extracted from each entry's `command` string, plus every sibling `.cjs` those scripts `require()`
 * (so `protect-files.cjs` never ships without `guard-core.cjs`). A script absent from this set is not wired into that
 * adapter's settings/hooks file, so the adapter must not emit it.
 */
function referencedHookScripts(manifest: HooksManifest, agent: HookedAgent, hooksDir: string): Set<string> {
    const names = new Set<string>();

    for (const hook of manifest.hooks) {
        const block = hook[agent];
        if (!block) {
            continue;
        }

        if ('scripts' in block) {
            for (const name of block.scripts) {
                names.add(name);
            }
            continue;
        }

        if (!block.command) {
            continue;
        }

        for (const match of block.command.matchAll(/([\w.-]+\.(?:sh|cjs))\b/g)) {
            const scriptName = match[1];
            if (scriptName) {
                names.add(scriptName);
            }
        }
    }

    // A Set iterates entries added during the loop, so dependencies of dependencies are followed too.
    for (const name of names) {
        if (!name.endsWith('.cjs')) {
            continue;
        }

        for (const match of readFileSync(join(hooksDir, name), 'utf8').matchAll(LOCAL_REQUIRE)) {
            if (match[1]) {
                names.add(match[1]);
            }
        }
    }

    return names;
}

/**
 * Every hook script one adapter wires up, copied verbatim under `destDir`. Only scripts the adapter's manifest entries
 * reference (and their `require()` siblings) ship - a script referenced by only one adapter (e.g. the Claude-only
 * SessionStart bootstrap) must not land as dead weight in another adapter's project.
 */
function collectHookScripts(
    contentRoot: string,
    manifest: HooksManifest,
    agent: HookedAgent,
    destDir: string,
): GeneratedFile[] {
    const hooksDir = join(contentRoot, 'hooks');

    return [...referencedHookScripts(manifest, agent, hooksDir)].sort().map((name) => ({
        path: `${destDir}${name}`,
        content: readFileSync(join(hooksDir, name), 'utf8'),
    }));
}

/**
 * Every skill under `content/skills/`, as `<destDir><name>/SKILL.md`. Keeps the frontmatter: every agent that loads
 * skills reads `name`/`description` from it to discover and trigger the skill, so stripping it would make it inert.
 */
function collectSkills(contentRoot: string, vars: TemplateVars, destDir: string): GeneratedFile[] {
    const skillsDir = join(contentRoot, 'skills');

    return readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
            path: `${destDir}${entry.name}/SKILL.md`,
            content: render(readFileSync(join(skillsDir, entry.name, 'SKILL.md'), 'utf8'), vars),
        }));
}

/**
 * The kit skills once, as `.agents/skills/<name>/SKILL.md` - the folder most agents other than Claude Code and Cursor
 * read natively. Same content and `render()` as the private copies; emitted by `generateAgentFiles` only while an agent
 * that reads it is set up (`sharedSkillsWanted`).
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns One file per skill.
 */
export function generateSharedSkills(root: string, vars: TemplateVars): GeneratedFile[] {
    return collectSkills(join(root, 'content'), vars, SHARED_SKILLS_DIR);
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
}

/** A Claude Code matcher group: tool-name matcher + one or more command hooks. */
interface ClaudeMatcherGroup {
    matcher?: string;
    hooks: ClaudeHookCommand[];
}

interface ClaudeSettingsJson {
    hooks: Record<string, ClaudeMatcherGroup[]>;
    /** `.mcp.json` servers Claude Code trusts without its one-time approval prompt. */
    enabledMcpjsonServers: string[];
}

interface HookManifestCommandBlock {
    event: string;
    command: string;
    matcher?: string;
    timeout?: number;
}

/**
 * How a hook is wired for OpenCode. Not a command: OpenCode runs `kit-guard.ts` as a plugin, so the block names the
 * plugin event the hook rides on and the `hooks/` scripts that plugin loads (shipped beside it, like a command's).
 */
interface HookManifestOpenCodeBlock {
    event: string;
    scripts: string[];
}

interface HookManifestEntry {
    id: string;
    intent: string;
    cursor?: HookManifestCursorBlock;
    claude?: HookManifestCommandBlock;
    /** Same shape as Claude's block; `.agents/hooks.json` groups it under `blit-<id>`, tool events in a matcher group. */
    antigravity?: HookManifestCommandBlock;
    opencode?: HookManifestOpenCodeBlock;
    /** Same shape as Claude's block; `.codex/hooks.json` nests it the same way. */
    codex?: HookManifestCommandBlock;
    /** Same shape as Claude's block, except `timeout` is in milliseconds. */
    gemini?: HookManifestCommandBlock;
    /** Same shape as Claude's block; `timeout` is seconds (Copilot's `timeoutSec`), and `command` must be Node only. */
    copilot?: HookManifestCommandBlock;
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

/** One manifest command block as a command handler, template vars rendered. */
function commandHandler(block: HookManifestCommandBlock, vars: TemplateVars): ClaudeHookCommand {
    const handler: ClaudeHookCommand = { type: 'command', command: render(block.command, vars) };

    if (block.timeout !== undefined) {
        handler.timeout = block.timeout;
    }

    return handler;
}

/** One manifest command block as a matcher group (matcher, then a single command handler), template vars rendered. */
function matcherGroup(block: HookManifestCommandBlock, vars: TemplateVars): ClaudeMatcherGroup {
    const group: ClaudeMatcherGroup = { hooks: [commandHandler(block, vars)] };

    if (block.matcher !== undefined) {
        group.matcher = block.matcher;
    }

    return group;
}

/**
 * One agent's manifest blocks as Claude-shaped matcher groups keyed by event, in manifest order. Claude Code and Codex
 * read the same nesting.
 */
function matcherGroupsByEvent(
    manifest: HooksManifest,
    agent: 'claude' | 'codex',
    vars: TemplateVars,
): Record<string, ClaudeMatcherGroup[]> {
    const hooks: Record<string, ClaudeMatcherGroup[]> = {};

    for (const hook of manifest.hooks) {
        const block = hook[agent];

        if (block) {
            hooks[block.event] = [...(hooks[block.event] ?? []), matcherGroup(block, vars)];
        }
    }

    return hooks;
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
 * The assistants whose docs-MCP config is an `mcpServers` JSON file of their own. OpenCode's lives in `opencode.json`,
 * Codex's is a TOML table (`codexConfigFile`), and Copilot reads Claude Code's root `.mcp.json`.
 */
type McpJsonAgent = Exclude<HookedAgent, 'opencode' | 'codex' | 'copilot'>;

/** One remote MCP server entry. */
interface McpServerEntry {
    /** Transport marker. Required by Claude Code, omitted for Cursor - see `MCP_SERVER_ENTRY`. */
    type?: string;
    /** Streamable HTTP endpoint, in Claude Code and Cursor. Gemini CLI reads this key as SSE, so it uses `httpUrl`. */
    url?: string;
    /** Gemini CLI's streamable HTTP endpoint. */
    httpUrl?: string;
    /** Antigravity's key for a remote server; it rejects `url` and `httpUrl`. */
    serverUrl?: string;
}

/** The `mcpServers` wrapper every assistant reads. */
interface McpConfigJson {
    mcpServers: Record<string, McpServerEntry>;
}

/**
 * The documentation-MCP server entry each assistant gets.
 *
 * The entries differ on purpose, and the difference is not cosmetic:
 * Claude Code rejects a remote entry that has a `url` but no `type` and skips the server entirely,
 * while for Cursor a `type` is the marker of a local stdio server - adding one there would make it
 * misread a remote HTTP endpoint. Antigravity accepts only `serverUrl` for a remote server. Do not harmonize the shapes.
 *
 * Gemini CLI's entry is a third shape: `url` there means SSE, and streamable HTTP is `httpUrl`. It sits in
 * `.gemini/settings.json` beside other settings, so it has its own builder (`buildGeminiSettings`).
 */
const MCP_SERVER_ENTRY: Record<McpJsonAgent, McpServerEntry> = {
    claude: { type: 'http', url: MCP_SERVER_URL },
    cursor: { url: MCP_SERVER_URL },
    gemini: { httpUrl: MCP_SERVER_URL },
    antigravity: { serverUrl: MCP_SERVER_URL },
};

/** The standalone MCP configuration file for an assistant whose MCP config is not part of a larger settings file. */
function mcpConfigFile(agent: Exclude<McpJsonAgent, 'gemini'>): GeneratedFile {
    const config: McpConfigJson = { mcpServers: { [MCP_SERVER_NAME]: MCP_SERVER_ENTRY[agent] } };

    return { path: AGENT_SPECS[agent].mcpConfig, content: `${JSON.stringify(config, null, 2)}\n` };
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
 * can start the game with no setup. `--no-open` overrides the starter's `server.open: true`, which
 * would otherwise pop a system browser window next to the pane. Not `--open false`: Vite reads that
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

/**
 * Translate the canonical hooks manifest into `.codex/hooks.json`. Codex parses the file with unknown fields denied, so
 * a stray key (a `$schema`, say) would make it skip every hook - only `hooks` is written. It also keys each hook's
 * one-time approval by its event and position, so reordering the manifest's Codex blocks asks every user to approve
 * the moved hooks again.
 */
function buildCodexHooks(manifest: HooksManifest, vars: TemplateVars): { hooks: Record<string, ClaudeMatcherGroup[]> } {
    return { hooks: matcherGroupsByEvent(manifest, 'codex', vars) };
}

/**
 * `.codex/config.toml`: the docs server, as one table and nothing else, so a user extending the file has a single
 * block of the kit's to merge around (see `tryMergeCodexConfig` in `src/commands/agents.ts`). `url` is Codex's key for
 * a streamable HTTP server. Written by hand - the kit has no TOML dependency, and one table needs none.
 */
function codexConfigFile(): GeneratedFile {
    const content = [
        '# Source: @blit386/kit (generated by `npx blit agents sync`). Add your own settings around this table;',
        '# sync keeps them. Codex reads this file only after you trust the project.',
        `[mcp_servers.${MCP_SERVER_NAME}]`,
        `url = "${MCP_SERVER_URL}"`,
        '',
    ].join('\n');

    return { path: CODEX_CONFIG_TOML, content };
}

/**
 * Generate the Codex adapter files from the kit IR. Persona is `AGENTS.md` and skills are the shared `.agents/skills/`
 * folder, so neither is emitted here:
 *   - `.codex/hooks.json`     (kit-owned; translated from content/hooks.manifest.json)
 *   - `.codex/config.toml`    (kit-owned, merged on `add`; the blit386.dev documentation MCP server)
 *   - `.codex/hooks/{script}` (kit-owned; copied verbatim)
 *
 * Deliberately absent: `.codex/rules/*.rules` (experimental, prefix matching only, and one rules file that fails to parse
 * makes Codex drop every user and project rule - the hooks already hard-deny) and `.codex/environments/` (the desktop
 * app's schema is undocumented).
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated Codex files and their contents.
 */
export function generateCodexAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);

    return [
        { path: CODEX_HOOKS_JSON, content: `${JSON.stringify(buildCodexHooks(manifest, vars), null, 2)}\n` },
        codexConfigFile(),
        ...collectHookScripts(contentRoot, manifest, 'codex', CODEX_HOOKS_DIR),
    ];
}

/** One command entry in a Copilot hooks file (`.github/hooks/*.json`). */
interface CopilotHookCommand {
    type: 'command';
    /** Always the repository root: Copilot resolves `cwd` against it, so the relative script paths hold wherever the session started. */
    cwd: '.';
    bash: string;
    /** The same Node command: Windows runs this key, and the cloud agent runs only `bash`. */
    powershell: string;
    timeoutSec?: number;
    matcher?: string;
}

/**
 * Translate the canonical hooks manifest into Copilot's hooks file, rendering template vars. One flat list per event:
 * Copilot anchors `matcher` itself (`^(?:PATTERN)$`) and tests it against the tool name. Only `.github/hooks/*.json`
 * is read by every Copilot surface (CLI, cloud agent, VS Code), which is why this is not a `.claude/settings.json`
 * copy even though the CLI reads that too.
 */
function buildCopilotHooks(
    manifest: HooksManifest,
    vars: TemplateVars,
): { version: number; hooks: Record<string, CopilotHookCommand[]> } {
    const hooks: Record<string, CopilotHookCommand[]> = {};

    for (const hook of manifest.hooks) {
        if (!hook.copilot) {
            continue;
        }

        const { event, command, matcher, timeout } = hook.copilot;
        const rendered = render(command, vars);
        const entry: CopilotHookCommand = { type: 'command', cwd: '.', bash: rendered, powershell: rendered };

        if (timeout !== undefined) {
            entry.timeoutSec = timeout;
        }

        if (matcher !== undefined) {
            entry.matcher = matcher;
        }

        hooks[event] = [...(hooks[event] ?? []), entry];
    }

    return { version: 1, hooks };
}

/**
 * GitHub Actions pins shared with create-blit386's optional CI template (`templates/optional/ci/github/workflows/ci.yml`).
 * MANUAL-SYNC HAZARD: the kit cannot read that template, so bump both together (Renovate updates the template only);
 * create-blit386's `test/agent-copilot.test.mjs` compares the two and fails when they drift.
 */
const ACTIONS_CHECKOUT = 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6';
const ACTIONS_SETUP_NODE = 'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6';

/**
 * `.github/workflows/copilot-setup-steps.yml`: what the Copilot cloud agent runs before it starts work on an issue, so
 * its sandbox has Node and the game's dependencies. GitHub requires the job to be named exactly `copilot-setup-steps`,
 * and it allows only a few job keys (`steps`, `permissions`, `runs-on`, `services`, `snapshot`, `timeout-minutes`).
 * Corepack provides the pinned npm/pnpm/yarn from `packageManager`; Bun, which Corepack does not manage, is installed
 * through npm instead.
 */
function copilotSetupStepsFile(vars: TemplateVars): GeneratedFile {
    const install = vars.pmInstall;
    if (!install) {
        throw new Error('The Copilot setup workflow needs the pmInstall template variable.');
    }

    // `pmInstall` leads with the manager: `npm install`, `pnpm install`, `yarn`, `bun install`.
    const toolchain = install.startsWith('bun ')
        ? ['      - name: Install Bun', '        run: npm install --global bun']
        : ['      - name: Enable Corepack', '        run: corepack enable'];

    const lines = [
        "# Prepares the GitHub Copilot cloud agent's environment before it works on this game.",
        '# Source: @blit386/kit (generated by `npx blit agents sync`).',
        'name: Copilot setup steps',
        '',
        'on:',
        '  workflow_dispatch:',
        '  push:',
        '    paths:',
        `      - ${COPILOT_SETUP_STEPS_YML}`,
        '  pull_request:',
        '    paths:',
        `      - ${COPILOT_SETUP_STEPS_YML}`,
        '',
        'jobs:',
        '  copilot-setup-steps:',
        '    runs-on: ubuntu-latest',
        '    permissions:',
        '      contents: read',
        '',
        '    steps:',
        '      - name: Checkout code',
        `        uses: ${ACTIONS_CHECKOUT}`,
        '',
        '      - name: Setup Node.js',
        `        uses: ${ACTIONS_SETUP_NODE}`,
        '        with:',
        "          node-version-file: '.node-version'",
        '',
        ...toolchain,
        '',
        '      - name: Install dependencies',
        `        run: ${install}`,
        '',
    ];

    return { path: COPILOT_SETUP_STEPS_YML, content: lines.join('\n') };
}

/**
 * Generate the GitHub Copilot adapter files from the kit IR. Persona is `AGENTS.md` and skills are the shared
 * `.agents/skills/` folder, both read natively by the Copilot CLI, the cloud agent, and VS Code, so neither needs a copy:
 *   - `.github/hooks/blit.json`                 (kit-owned; translated from content/hooks.manifest.json)
 *   - `.github/hooks/{script}`                  (kit-owned; copied verbatim)
 *   - `.github/workflows/copilot-setup-steps.yml` (kit-owned; the cloud agent's environment setup)
 *   - `.mcp.json`                               (kit-owned, shared with Claude Code; the docs MCP server for the
 *                                                 Copilot CLI and VS Code)
 *
 * Deliberately absent: `.vscode/mcp.json` (VS Code reads the root `.mcp.json`, so a copy would register the server
 * twice), `.github/prompts/` (prompt files are deprecated and the VS Code Agent Host does not load them),
 * and `.vscode/settings.json` `chat.tools.*.autoApprove` rules (they only prompt, and the Agent Host ignores the
 * terminal one in workspace scope - the hooks are the enforcement).
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated Copilot files and their contents.
 */
export function generateCopilotAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);

    return [
        { path: COPILOT_HOOKS_JSON, content: `${JSON.stringify(buildCopilotHooks(manifest, vars), null, 2)}\n` },
        ...collectHookScripts(contentRoot, manifest, 'copilot', COPILOT_HOOKS_DIR),
        copilotSetupStepsFile(vars),
        // Claude Code's root `.mcp.json`, shared: the Copilot CLI and VS Code both read it, and `generateAgentFiles`
        // emits it once. The cloud agent reads no project MCP config; its servers live in the repository's settings.
        mcpConfigFile('claude'),
    ];
}

/**
 * The `permission` half of `opencode.json`: OpenCode's declarative deny rules. The last matching rule wins and `*`
 * crosses `/`, so a leading `*` covers nested files and `*.env.example` has to come after `*.env.*`. There is no
 * `"*": "allow"` base entry on purpose: it would override a stricter user-level default for every tool call.
 *
 * MANUAL-SYNC HAZARD: these lists restate the guard core's policy (`content/hooks/guard-core.cjs`: `isProtectedPath`,
 * `isDangerousCommand`) in a form glob patterns can express - coarser, never laxer. `test/opencode.test.mjs`
 * runs one case table through both, so an edit on either side that is not mirrored fails the kit tests. The
 * `kit-guard.ts` plugin enforces the exact policy on top of this, including what a pattern cannot (`bash -c "..."`).
 */
const OPENCODE_PERMISSION = {
    // Matched against the project-relative path, so each base name is listed bare (a top-level file) and with a `*/`
    // prefix (any depth). Spelling them as `*pnpm-lock.yaml` or `*.env.*` would also catch `my-pnpm-lock.yaml` and
    // `game.env.js`, which the guard core allows.
    edit: {
        'pnpm-lock.yaml': 'deny',
        '*/pnpm-lock.yaml': 'deny',
        'package-lock.json': 'deny',
        '*/package-lock.json': 'deny',
        'bun.lockb': 'deny',
        '*/bun.lockb': 'deny',
        '*.lock': 'deny',
        '.env': 'deny',
        '*/.env': 'deny',
        '.env.*': 'deny',
        '*/.env.*': 'deny',
        '.env.example': 'allow',
        '*/.env.example': 'allow',
    },
    // The built-in default for `.env` reads is `ask` in source and `deny` in the docs, so state it.
    read: {
        '.env': 'deny',
        '*/.env': 'deny',
        '.env.*': 'deny',
        '*/.env.*': 'deny',
        '.env.example': 'allow',
        '*/.env.example': 'allow',
    },
    bash: {
        'git reset --hard*': 'deny',
        'git checkout -- *': 'deny',
        'git restore *': 'deny',
        'git restore --staged *': 'allow',
        'git clean': 'deny',
        'git clean *': 'deny',
        'git clean -n*': 'allow',
        'git clean --dry-run*': 'allow',
        'git push -f*': 'ask',
        'git push * -f*': 'ask',
        'git push *--force*': 'ask',
        'git push * +*': 'ask',
        'git branch -D *': 'ask',
        'git branch * -D*': 'ask',
        'git stash drop*': 'ask',
        'git stash clear*': 'ask',
    },
} as const;

/**
 * Which formatter owns which file type, the same split as the Claude and Cursor `format-file.cjs` hook and the starter's
 * `format` script: Biome formats code and JSON, Prettier formats Markdown and YAML. OpenCode's formatters are off until
 * enabled, and its built-in Prettier would also claim code files, so each tool is pinned to its own extensions.
 */
const OPENCODE_FORMATTER = {
    biome: { extensions: ['.js', '.cjs', '.mjs', '.ts', '.json', '.jsonc'] },
    prettier: { extensions: ['.md', '.mdx', '.mdc', '.yml', '.yaml'] },
} as const;

/**
 * `opencode.json`. Both formatters are switched on by name (see `OPENCODE_FORMATTER`). The docs server entry has no
 * `mcpServers` wrapper - OpenCode calls the key `mcp` and marks a remote server with `type: 'remote'`.
 */
function openCodeConfigFile(): GeneratedFile {
    const config = {
        $schema: 'https://opencode.ai/config.json',
        formatter: OPENCODE_FORMATTER,
        permission: OPENCODE_PERMISSION,
        mcp: { [MCP_SERVER_NAME]: { type: 'remote', url: MCP_SERVER_URL, enabled: true } },
    };

    return { path: OPENCODE_JSON, content: `${JSON.stringify(config, null, 2)}\n` };
}

/**
 * Generate the OpenCode adapter files from the kit IR. Skills and the persona need none of their own: OpenCode reads
 * `AGENTS.md` and the shared `.agents/skills/` folder (`generateAgentFiles` emits it).
 *   - `opencode.json`                   (kit-owned; formatter, permission map, docs MCP server)
 *   - `.opencode/plugins/kit-guard.ts`  (kit-owned; rendered from `content/hooks/opencode-kit-guard.ts`)
 *   - `.opencode/hooks/{script}`        (kit-owned; copied verbatim - the guard core and the bootstrap script)
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated OpenCode files and their contents.
 */
export function generateOpenCodeAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);
    const plugin = render(readFileSync(join(contentRoot, 'hooks', 'opencode-kit-guard.ts'), 'utf8'), vars);

    return [
        openCodeConfigFile(),
        { path: OPENCODE_KIT_GUARD, content: plugin },
        ...collectHookScripts(contentRoot, manifest, 'opencode', OPENCODE_HOOKS_DIR),
    ];
}

/**
 * Generate the Zed adapter files: `.zed/settings.json` only (kit-owned, merged with the user's own settings).
 *
 * Zed's built-in agent reads `AGENTS.md` and the shared `.agents/skills/` folder natively, so the persona and skills
 * need nothing here. The settings turn format-on-save on (the agent's edits are formatted on save too), name Biome as
 * the JavaScript, TypeScript, and JSON formatter, matching the starter's `format` script (needs the Biome extension),
 * and register the docs MCP server.
 *
 * Deliberately absent: an `agent` key (`agent.tool_permissions` is honored only in the user's own settings, so a
 * project copy would be silently ignored - `AGENTS.md` teaches the hard rules and a paste-in snippet instead), and the
 * `.rules` / `.cursorrules` / `.windsurfrules` / `.clinerules` files (Zed reads only the first match of that list,
 * and each of them would hide `AGENTS.md`).
 *
 * @returns The generated Zed files.
 */
export function generateZedAdapter(): GeneratedFile[] {
    const biome = { formatter: { language_server: { name: 'biome' } } };
    const settings = {
        format_on_save: 'on',
        languages: { JavaScript: biome, TypeScript: biome, JSON: biome, JSONC: biome },
        context_servers: { [MCP_SERVER_NAME]: { url: MCP_SERVER_URL } },
    };

    return [{ path: ZED_SETTINGS_JSON, content: `${JSON.stringify(settings, null, 2)}\n` }];
}

/** One agent's registry entry: its data from `AGENT_SPECS` plus the generator that renders its private files. */
export interface AgentAdapter extends AgentSpec {
    /** Render the agent's private files from the kit IR (shared files come from `generateAgentFiles`). */
    readonly generate: (root: string, vars: TemplateVars) => GeneratedFile[];
}

/**
 * The agent registry: one entry per `AgentKind`. Scaffold, `blit agents sync`, and `blit agents add` all dispatch
 * through it (via `generateAgentFiles`), so adding an agent is one `AGENT_SPECS` entry plus one generator here.
 */
export const AGENT_ADAPTERS: Record<AgentKind, AgentAdapter> = {
    claude: { ...AGENT_SPECS.claude, generate: generateClaudeAdapter },
    cursor: { ...AGENT_SPECS.cursor, generate: generateCursorAdapter },
    gemini: { ...AGENT_SPECS.gemini, generate: generateGeminiAdapter },
    antigravity: { ...AGENT_SPECS.antigravity, generate: generateAntigravityAdapter },
    codex: { ...AGENT_SPECS.codex, generate: generateCodexAdapter },
    copilot: { ...AGENT_SPECS.copilot, generate: generateCopilotAdapter },
    opencode: { ...AGENT_SPECS.opencode, generate: generateOpenCodeAdapter },
    zed: { ...AGENT_SPECS.zed, generate: generateZedAdapter },
};

/**
 * Every agent file the kit emits for a set of assistants: each one's private files, plus the shared skills folder
 * once when any of them reads it. The single place shared output is deduplicated - scaffold, sync, and add all call
 * this rather than the per-agent generators. A shared exact path (`AgentSpec.readsSharedFiles`, e.g. `.mcp.json` from
 * both Claude Code and Copilot) is generated byte-identically by each reader and kept once; two readers disagreeing on
 * its content is a kit bug, so it throws rather than picking one.
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @param agents - The assistants to generate for.
 * @returns The generated files, each path at most once.
 */
export function generateAgentFiles(root: string, vars: TemplateVars, agents: readonly AgentKind[]): GeneratedFile[] {
    const byPath = new Map<string, GeneratedFile>();

    for (const file of agents.flatMap((agent) => AGENT_ADAPTERS[agent].generate(root, vars))) {
        const earlier = byPath.get(file.path);
        if (earlier !== undefined && earlier.content !== file.content) {
            throw new Error(`Two agent adapters generate ${file.path} with different content.`);
        }

        byPath.set(file.path, file);
    }

    const files = [...byPath.values()];

    return sharedSkillsWanted(agents) ? [...files, ...generateSharedSkills(root, vars)] : files;
}
