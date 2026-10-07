/**
 * Which generated files the kit owns, and the project-relative paths each AI assistant occupies.
 *
 * Single source of truth for both packages. `src/adapters.ts` builds every path it emits from the
 * constants below, `blit agents sync` / `add` classify incoming files with `classifyFile`, and
 * `create-blit386` imports the same helpers through `@blit386/kit/adapters` when it stamps
 * `.blit/manifest.json` at scaffold time. One implementation, so a file the kit starts shipping
 * lands in the same ownership class whichever side sees it first.
 *
 * A leaf module on purpose: no imports, no filesystem access, so the classifier stays trivially
 * testable and `adapters.ts` can depend on it without a cycle.
 */

/**
 * Project-relative paths the kit writes into a generated game.
 *
 * Directory constants carry their trailing slash, so one literal serves as both the join base for
 * the adapters that emit these paths and the `startsWith` prefix for the classifier that matches
 * them. A slash-stripped second copy is exactly the drift this module exists to prevent, and the
 * slash is also what keeps `.claude/rulesbackup.md` out of `.claude/rules/`.
 */

/** The canonical AI guidance file (shared: only its managed region is rewritten on sync). */
export const AGENTS_MD = 'AGENTS.md';

/** Claude Code's project guide (shared: only its managed region is rewritten on sync). */
export const CLAUDE_MD = 'CLAUDE.md';

/** Root of Claude Code's generated configuration. */
export const CLAUDE_DIR = '.claude/';
export const CLAUDE_RULES_DIR = `${CLAUDE_DIR}rules/`;
export const CLAUDE_SKILLS_DIR = `${CLAUDE_DIR}skills/`;
export const CLAUDE_HOOKS_DIR = `${CLAUDE_DIR}hooks/`;
export const CLAUDE_SETTINGS_JSON = `${CLAUDE_DIR}settings.json`;

/**
 * The Claude desktop app's preview-server configuration. Deliberately absent from `KIT_OWNED_FILES`:
 * the desktop app and other tools write into this file, so it is user-owned - the kit writes it when
 * it is missing and never touches it again.
 */
export const CLAUDE_LAUNCH_JSON = `${CLAUDE_DIR}launch.json`;

/**
 * Claude Code's MCP server configuration. Project root, not under `.claude/` - that is Claude Code's
 * own convention, so this is the one Claude path the `CLAUDE_DIR` prefix does not cover and
 * `AGENT_PATHS` has to name outright.
 */
export const CLAUDE_MCP_JSON = '.mcp.json';

/** Root of Cursor's generated configuration. */
export const CURSOR_DIR = '.cursor/';
export const CURSOR_RULES_DIR = `${CURSOR_DIR}rules/`;
export const CURSOR_HOOKS_DIR = `${CURSOR_DIR}hooks/`;
export const CURSOR_SKILLS_DIR = `${CURSOR_DIR}skills/`;
export const CURSOR_HOOKS_JSON = `${CURSOR_DIR}hooks.json`;

/** Cursor's MCP server configuration. */
export const CURSOR_MCP_JSON = `${CURSOR_DIR}mcp.json`;

/**
 * Zed's generated configuration. `settings.json` is user-extendable JSON (Zed also allows comments), so like the MCP
 * configs it is merged structurally by `blit agents add` and three-way merged by `sync`.
 */
export const ZED_DIR = '.zed/';
export const ZED_SETTINGS_JSON = `${ZED_DIR}settings.json`;

/** Beginner docs, copied from the kit's own `content/docs/`. */
export const DOCS_DIR = 'docs/';

/**
 * The skills folder several agents read natively (Zed, Gemini CLI, Codex, Antigravity, GitHub Copilot, OpenCode, ...).
 *
 * Shared, not private: a path under it belongs to every agent whose `AgentSpec.readsSharedSkills` is set, so the kit
 * emits it once while at least one of them is set up. Only `.agents/skills/` is claimed - never the bare `.agents/`
 * prefix, because Antigravity owns exact files (`hooks.json`, `hooks/`, `mcp_config.json`) beside it.
 */
export const SHARED_SKILLS_DIR = '.agents/skills/';

/**
 * Which agent-sync ownership class a generated file belongs to.
 *
 * - `kit-owned`  - regenerated freely on sync when unmodified; never clobbered when modified
 * - `shared`     - only the managed region (`<!-- blit-kit:managed:start/end -->`) is rewritten on sync
 * - `user-owned` - scaffolded once, never touched again by sync or upgrade. An adapter may emit one
 *   (`CLAUDE_LAUNCH_JSON`); sync and `add` then write it only when it is missing on disk
 */
export type FileClass = 'kit-owned' | 'shared' | 'user-owned';

/** Exact paths that carry managed-region markers: sync rewrites only the marked block. */
const SHARED_FILES: readonly string[] = [AGENTS_MD, CLAUDE_MD];

/** Exact paths the kit owns outright. */
const KIT_OWNED_FILES: readonly string[] = [
    CLAUDE_SETTINGS_JSON,
    CLAUDE_MCP_JSON,
    CURSOR_HOOKS_JSON,
    CURSOR_MCP_JSON,
    ZED_SETTINGS_JSON,
];

/** Directories whose entire contents the kit owns, trailing slash included. */
const KIT_OWNED_DIRS: readonly string[] = [
    DOCS_DIR,
    CLAUDE_RULES_DIR,
    CLAUDE_SKILLS_DIR,
    CLAUDE_HOOKS_DIR,
    CURSOR_RULES_DIR,
    CURSOR_HOOKS_DIR,
    CURSOR_SKILLS_DIR,
    SHARED_SKILLS_DIR,
];

/**
 * Classify a generated file by its path relative to the project root.
 *
 * Files under `docs/` and the AI-tooling directories are kit-owned (sync regenerates them).
 * `AGENTS.md` and `CLAUDE.md` are shared (sync rewrites only the managed region). Everything else -
 * game sources, language config, README, package.json - is user-owned, scaffolded once and never
 * overwritten by sync or upgrade.
 *
 * @param relPath - Path relative to the project root; Windows separators are normalized.
 * @returns The ownership class sync applies to that file.
 */
export function classifyFile(relPath: string): FileClass {
    const normalized = normalize(relPath);

    if (SHARED_FILES.includes(normalized)) {
        return 'shared';
    }

    if (KIT_OWNED_FILES.includes(normalized) || KIT_OWNED_DIRS.some((dir) => normalized.startsWith(dir))) {
        return 'kit-owned';
    }

    return 'user-owned';
}

/**
 * Does the kit regenerate this class on sync? User-owned files are never touched, so only kit-owned
 * and shared files are hashed, kept as pristine `.blit/base/` copies, and checked for drift.
 *
 * @param fileClass - The class recorded for a file in `.blit/manifest.json`.
 * @returns True when sync may rewrite the file or its managed region.
 */
export function isKitManaged(fileClass: FileClass): boolean {
    return fileClass === 'kit-owned' || fileClass === 'shared';
}

/**
 * One AI assistant the kit generates files for.
 *
 * The scaffolder's wizard collects zero or more of these (`agents: readonly AgentKind[]`); `blit agents add` uses
 * `AgentKind` directly. Adding a kind is one `AGENT_SPECS` entry here plus one generator in `AGENT_ADAPTERS`
 * (`src/adapters.ts`) - both are `Record<AgentKind, ...>`, so the compiler rejects a kind missing from either.
 */
export type AgentKind = 'claude' | 'cursor' | 'zed';

/** Every `AgentKind` value, for iteration and membership checks (`blit agents add`, the wizard). */
export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'cursor', 'zed'];

/** The data half of one agent's registry entry; `AGENT_ADAPTERS` in `src/adapters.ts` adds the generator. */
export interface AgentSpec {
    /** Human-readable assistant name for Tier-1 messages and wizard hints. */
    readonly label: string;
    /** Project-relative hint of what setting up the assistant adds, for wizard/CLI copy. */
    readonly setupHint: string;
    /** Exact paths only this agent's adapter emits. */
    readonly files: readonly string[];
    /** Directory prefixes (trailing slash) only this agent's adapter emits. */
    readonly dirs: readonly string[];
    /** Where the agent's docs-MCP config lives, so `blit doctor` can check every agent without hardcoding one. */
    readonly mcpConfig: string;
    /** Does the agent read `SHARED_SKILLS_DIR`? Claude Code does not, and Cursor is unverified, so both keep private copies. */
    readonly readsSharedSkills: boolean;
}

/**
 * Every assistant's registry data.
 *
 * `files` and `dirs` are the agent's private paths: every path an adapter emits must match them (or be a shared path
 * the agent reads), or a sync skips it - `test/ownership.test.mjs` pins that invariant. Claude needs `CLAUDE_MCP_JSON`
 * spelled out because it sits at the project root rather than under `.claude/`; Cursor's `mcp.json` is already covered
 * by the `CURSOR_DIR` prefix.
 */
export const AGENT_SPECS: Record<AgentKind, AgentSpec> = {
    claude: {
        label: 'Claude Code',
        setupHint: `adds ${CLAUDE_MD}`,
        files: [CLAUDE_MD, CLAUDE_MCP_JSON],
        dirs: [CLAUDE_DIR],
        mcpConfig: CLAUDE_MCP_JSON,
        readsSharedSkills: false,
    },
    cursor: {
        label: 'Cursor',
        setupHint: `adds ${CURSOR_RULES_DIR}`,
        files: [],
        dirs: [CURSOR_DIR],
        mcpConfig: CURSOR_MCP_JSON,
        readsSharedSkills: false,
    },
    zed: {
        label: 'Zed',
        setupHint: `adds ${ZED_SETTINGS_JSON}`,
        files: [],
        dirs: [ZED_DIR],
        mcpConfig: ZED_SETTINGS_JSON,
        readsSharedSkills: true,
    },
};

/** Normalize Windows separators so one prefix test serves every platform. */
function normalize(relPath: string): string {
    return relPath.replace(/\\/g, '/');
}

/** Is the path one only `agent` emits? Shared paths never count. */
function isPrivateAgentPath(normalized: string, agent: AgentKind): boolean {
    const spec = AGENT_SPECS[agent];

    return spec.files.includes(normalized) || spec.dirs.some((dir) => normalized.startsWith(dir));
}

/**
 * Is this project-relative path part of `agent`'s generated file set?
 *
 * True for the agent's private paths and for shared paths it reads - so a shared skill belongs to several agents at once.
 *
 * @param relPath - Path relative to the project root; Windows separators are normalized.
 * @param agent - The assistant to test against.
 * @returns True when the path is one the assistant reads from the kit's output.
 */
export function isAgentPath(relPath: string, agent: AgentKind): boolean {
    const normalized = normalize(relPath);

    return (
        isPrivateAgentPath(normalized, agent) ||
        (AGENT_SPECS[agent].readsSharedSkills && normalized.startsWith(SHARED_SKILLS_DIR))
    );
}

/**
 * Should the kit emit the shared skills folder for this set of assistants? Yes while at least one of them reads it;
 * once none does, sync stops regenerating it and drops it from the manifest like any other retired file.
 *
 * @param agents - The assistants set up in the project.
 * @returns True when any of them reads `SHARED_SKILLS_DIR`.
 */
export function sharedSkillsWanted(agents: readonly AgentKind[]): boolean {
    return agents.some((agent) => AGENT_SPECS[agent].readsSharedSkills);
}

/**
 * Does an ownership manifest already track files for `agent`?
 *
 * Counts private paths only. A tracked shared skill is evidence that some reader is set up, not which one - counting
 * it would make one reader being set up drag every other reader's files into the next sync.
 *
 * Takes anything carrying a `path` so the scaffolder's writer-side manifest entries and the CLI's reader-side ones both
 * satisfy it structurally, without this module depending on either shape. These are manifest paths, not disk paths: a
 * hand-written `.mcp.json` the kit never tracked cannot make an assistant look already set up. The untracked case is
 * handled separately, by `runAddAgent`'s collision check.
 *
 * @param files - The manifest's tracked file entries.
 * @param agent - The assistant to look for.
 * @returns True when at least one tracked file is private to that assistant.
 */
export function hasAgentFiles(files: readonly { readonly path: string }[], agent: AgentKind): boolean {
    return files.some((file) => isPrivateAgentPath(normalize(file.path), agent));
}
