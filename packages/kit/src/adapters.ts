/**
 * Shared agent adapters for Claude Code, Cursor, Gemini CLI, and Zed.
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
    type AgentKind,
    type AgentSpec,
    CLAUDE_HOOKS_DIR,
    CLAUDE_LAUNCH_JSON,
    CLAUDE_MD,
    CLAUDE_RULES_DIR,
    CLAUDE_SETTINGS_JSON,
    CLAUDE_SKILLS_DIR,
    CURSOR_HOOKS_DIR,
    CURSOR_HOOKS_JSON,
    CURSOR_RULES_DIR,
    CURSOR_SKILLS_DIR,
    DOCS_DIR,
    GEMINI_HOOKS_DIR,
    GEMINI_SETTINGS_JSON,
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
 * Basenames of hook scripts (e.g. `session-start.sh`, `shell-safety-run.cjs`) that one adapter's manifest entries
 * actually invoke, extracted from each entry's `command` string, plus every sibling `.cjs` those scripts `require()`
 * (so `protect-files.cjs` never ships without `guard-core.cjs`). A script absent from this set is not wired into that
 * adapter's settings/hooks file, so the adapter must not emit it.
 */
function referencedHookScripts(manifest: HooksManifest, agent: HookedAgent, hooksDir: string): Set<string> {
    const names = new Set<string>();

    for (const hook of manifest.hooks) {
        const command = hook[agent]?.command;
        if (!command) {
            continue;
        }

        for (const match of command.matchAll(/([\w.-]+\.(?:sh|cjs))\b/g)) {
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

interface HookManifestClaudeBlock {
    event: string;
    command: string;
    matcher?: string;
    timeout?: number;
}

interface HookManifestEntry {
    id: string;
    intent: string;
    cursor?: HookManifestCursorBlock;
    claude?: HookManifestClaudeBlock;
    /** Same shape as Claude's block, except `timeout` is in milliseconds. */
    gemini?: HookManifestClaudeBlock;
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

        const { event, command, matcher, timeout } = hook.claude;
        const commandHook: ClaudeHookCommand = {
            type: 'command',
            command: render(command, vars),
        };

        if (timeout !== undefined) {
            commandHook.timeout = timeout;
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

    // Pre-approve the documentation server `.mcp.json` registers, so Claude Code does not leave it
    // off behind a trust prompt. Cursor has no equivalent key, so `.cursor/mcp.json` gets nothing.
    return { hooks, enabledMcpjsonServers: [MCP_SERVER_NAME] };
}

/** One remote MCP server entry. */
interface McpServerEntry {
    /** Transport marker. Required by Claude Code, omitted for Cursor - see `MCP_SERVER_ENTRY`. */
    type?: string;
    /** Streamable HTTP endpoint, in Claude Code and Cursor. Gemini CLI reads this key as SSE, so it uses `httpUrl`. */
    url?: string;
    /** Gemini CLI's streamable HTTP endpoint. */
    httpUrl?: string;
}

/** The `mcpServers` wrapper both assistants read. */
interface McpConfigJson {
    mcpServers: Record<string, McpServerEntry>;
}

/**
 * The documentation-MCP server entry each assistant gets.
 *
 * The two entries differ by one key on purpose, and the difference is not cosmetic:
 * Claude Code rejects a remote entry that has a `url` but no `type` and skips the server entirely,
 * while for Cursor a `type` is the marker of a local stdio server - adding one there would make it
 * misread a remote HTTP endpoint. Do not harmonize the two shapes.
 *
 * Gemini CLI's entry is a third shape: `url` there means SSE, and streamable HTTP is `httpUrl`. It sits in
 * `.gemini/settings.json` beside other settings, so it has its own builder (`buildGeminiSettings`).
 */
const MCP_SERVER_ENTRY: Record<HookedAgent, McpServerEntry> = {
    claude: { type: 'http', url: MCP_SERVER_URL },
    cursor: { url: MCP_SERVER_URL },
    gemini: { httpUrl: MCP_SERVER_URL },
};

/** The standalone MCP configuration file for an assistant whose MCP config is not part of a larger settings file. */
function mcpConfigFile(agent: 'claude' | 'cursor'): GeneratedFile {
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
 * Generate the Zed adapter files: `.zed/settings.json` only (kit-owned, merged with the user's own settings).
 *
 * Zed's built-in agent reads `AGENTS.md` and the shared `.agents/skills/` folder natively, so the persona and skills
 * need nothing here. The settings turn format-on-save on (the agent's edits are formatted on save too), name Biome as
 * the JavaScript, TypeScript, and JSON formatter, matching the starter's `format` script (needs the Biome extension), and register the docs MCP server.
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
    zed: { ...AGENT_SPECS.zed, generate: generateZedAdapter },
};

/**
 * Every agent file the kit emits for a set of assistants: each one's private files, plus the shared skills folder
 * once when any of them reads it. The single place shared output is deduplicated - scaffold, sync, and add all call
 * this rather than the per-agent generators.
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @param agents - The assistants to generate for.
 * @returns The generated files, each path at most once.
 */
export function generateAgentFiles(root: string, vars: TemplateVars, agents: readonly AgentKind[]): GeneratedFile[] {
    const files = agents.flatMap((agent) => AGENT_ADAPTERS[agent].generate(root, vars));

    return sharedSkillsWanted(agents) ? [...files, ...generateSharedSkills(root, vars)] : files;
}
