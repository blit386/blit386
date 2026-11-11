/**
 * Shared pieces of the agent adapters: template rendering, the managed region of `AGENTS.md` / `CLAUDE.md`, the
 * kit's own files (`AGENTS.md`, `docs/`, skills, rules, hook scripts), the hooks-manifest types and the matcher groups
 * several agents share, and the docs-MCP server definition.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import { AGENT_SPECS, type AgentKind, AGENTS_MD, DOCS_DIR, SHARED_SKILLS_DIR } from '../ownership';

/** Managed-region markers shared by AGENTS.md and CLAUDE.md. */
export const MANAGED_START = '<!-- blit-kit:managed:start -->';
export const MANAGED_END = '<!-- blit-kit:managed:end -->';

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
export const MCP_SERVER_URL = 'https://blit386.dev/mcp';

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
export function stripFrontmatter(content: string): string {
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
export function extractManagedRegion(content: string): string {
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

/** Offsets of the lines that hold exactly `marker`; a marker quoted inside a sentence is not one. */
function markerLineOffsets(text: string, marker: string): number[] {
    const offsets: number[] = [];
    let offset = 0;

    for (const line of text.split('\n')) {
        if (line.trimEnd() === marker) {
            offsets.push(offset);
        }

        offset += line.length + 1;
    }

    return offsets;
}

/** The one start-then-end marker pair in `text`, or null when there is none or it is ambiguous. */
function managedBounds(text: string): { start: number; end: number } | null {
    const [start, ...extraStarts] = markerLineOffsets(text, MANAGED_START);
    const [end, ...extraEnds] = markerLineOffsets(text, MANAGED_END);

    if (start === undefined || end === undefined || extraStarts.length > 0 || extraEnds.length > 0 || end < start) {
        return null;
    }

    return { start, end: end + MANAGED_END.length };
}

/**
 * Replace the managed region of an existing shared file with a freshly generated one, preserving
 * everything outside the markers byte-for-byte. A marker counts only on a line of its own, so notes
 * may quote one in a sentence. Returns null when either file does not hold exactly one start marker
 * followed by one end marker, so the caller can fall back to a conflict copy instead of guessing.
 */
export function replaceManagedRegion(existing: string, regenerated: string): string | null {
    const ex = managedBounds(existing);
    const reg = managedBounds(regenerated);

    if (ex === null || reg === null) {
        return null;
    }

    return `${existing.slice(0, ex.start)}${regenerated.slice(reg.start, reg.end)}${existing.slice(ex.end)}`;
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

/** Every `content/rules/*.md` file the kit ships, by file name. */
export function readRules(contentRoot: string): { name: string; content: string }[] {
    const rulesDir = join(contentRoot, 'rules');

    return readdirSync(rulesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => ({ name: entry.name, content: readFileSync(join(rulesDir, entry.name), 'utf8') }));
}

/** The kit's canonical hook intent, `content/hooks.manifest.json`. */
export function readHooksManifest(contentRoot: string): HooksManifest {
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
export function collectHookScripts(
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
export function collectSkills(contentRoot: string, vars: TemplateVars, destDir: string): GeneratedFile[] {
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

export interface CursorHookEntry {
    command?: string;
    matcher?: string;
    timeout?: number;
    failClosed?: boolean;
}

export interface CursorHooksJson {
    version: number;
    hooks: Record<string, CursorHookEntry[]>;
}

interface HookManifestCursorBlock extends CursorHookEntry {
    event: string;
}

/** One command handler inside a Claude Code matcher group. */
export interface ClaudeHookCommand {
    type: 'command';
    command: string;
    timeout?: number;
}

/** A Claude Code matcher group: tool-name matcher + one or more command hooks. */
export interface ClaudeMatcherGroup {
    matcher?: string;
    hooks: ClaudeHookCommand[];
}

export interface ClaudeSettingsJson {
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

export interface HooksManifest {
    version: string;
    hooks: HookManifestEntry[];
}

/** One manifest command block as a command handler, template vars rendered. */
export function commandHandler(block: HookManifestCommandBlock, vars: TemplateVars): ClaudeHookCommand {
    const handler: ClaudeHookCommand = { type: 'command', command: render(block.command, vars) };

    if (block.timeout !== undefined) {
        handler.timeout = block.timeout;
    }

    return handler;
}

/** One manifest command block as a matcher group (matcher, then a single command handler), template vars rendered. */
export function matcherGroup(block: HookManifestCommandBlock, vars: TemplateVars): ClaudeMatcherGroup {
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
export function matcherGroupsByEvent(
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
 * The assistants whose docs-MCP config is an `mcpServers` JSON file of their own. OpenCode's lives in `opencode.json`,
 * Codex's is a TOML table (`codexConfigFile`), and Copilot reads Claude Code's root `.mcp.json`.
 */
type McpJsonAgent = Exclude<HookedAgent, 'opencode' | 'codex' | 'copilot'>;

/** One remote MCP server entry. */
export interface McpServerEntry {
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
export const MCP_SERVER_ENTRY: Record<McpJsonAgent, McpServerEntry> = {
    claude: { type: 'http', url: MCP_SERVER_URL },
    cursor: { url: MCP_SERVER_URL },
    gemini: { httpUrl: MCP_SERVER_URL },
    antigravity: { serverUrl: MCP_SERVER_URL },
};

/** The standalone MCP configuration file for an assistant whose MCP config is not part of a larger settings file. */
export function mcpConfigFile(agent: Exclude<McpJsonAgent, 'gemini'>): GeneratedFile {
    const config: McpConfigJson = { mcpServers: { [MCP_SERVER_NAME]: MCP_SERVER_ENTRY[agent] } };

    return { path: AGENT_SPECS[agent].mcpConfig, content: `${JSON.stringify(config, null, 2)}\n` };
}
