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
 * Claude Code's MCP server configuration. Project root, not under `.claude/` – that is Claude Code's
 * own convention, so this is the one Claude path the `CLAUDE_DIR` prefix does not cover and
 * `AGENT_PATHS` has to name outright.
 */
export const CLAUDE_MCP_JSON = '.mcp.json';

/** Root of Cursor's generated configuration. */
export const CURSOR_DIR = '.cursor/';
export const CURSOR_RULES_DIR = `${CURSOR_DIR}rules/`;
export const CURSOR_HOOKS_DIR = `${CURSOR_DIR}hooks/`;
export const CURSOR_COMMANDS_DIR = `${CURSOR_DIR}commands/`;
export const CURSOR_HOOKS_JSON = `${CURSOR_DIR}hooks.json`;

/** Cursor's MCP server configuration. */
export const CURSOR_MCP_JSON = `${CURSOR_DIR}mcp.json`;

/** Beginner docs, copied from the kit's own `content/docs/`. */
export const DOCS_DIR = 'docs/';

/**
 * Which agent-sync ownership class a generated file belongs to.
 *
 * - `kit-owned`  – regenerated freely on sync when unmodified; never clobbered when modified
 * - `shared`     – only the managed region (`<!-- blit-kit:managed:start/end -->`) is rewritten on sync
 * - `user-owned` – scaffolded once, never touched again by sync or upgrade
 */
export type FileClass = 'kit-owned' | 'shared' | 'user-owned';

/** Exact paths that carry managed-region markers: sync rewrites only the marked block. */
const SHARED_FILES: readonly string[] = [AGENTS_MD, CLAUDE_MD];

/** Exact paths the kit owns outright. */
const KIT_OWNED_FILES: readonly string[] = [CLAUDE_SETTINGS_JSON, CLAUDE_MCP_JSON, CURSOR_HOOKS_JSON, CURSOR_MCP_JSON];

/** Directories whose entire contents the kit owns, trailing slash included. */
const KIT_OWNED_DIRS: readonly string[] = [
    DOCS_DIR,
    CLAUDE_RULES_DIR,
    CLAUDE_SKILLS_DIR,
    CLAUDE_HOOKS_DIR,
    CURSOR_RULES_DIR,
    CURSOR_HOOKS_DIR,
    CURSOR_COMMANDS_DIR,
];

/**
 * Classify a generated file by its path relative to the project root.
 *
 * Files under `docs/` and the AI-tooling directories are kit-owned (sync regenerates them).
 * `AGENTS.md` and `CLAUDE.md` are shared (sync rewrites only the managed region). Everything else -
 * game sources, language config, README, package.json – is user-owned, scaffolded once and never
 * overwritten by sync or upgrade.
 *
 * @param relPath – Path relative to the project root; Windows separators are normalized.
 * @returns The ownership class sync applies to that file.
 */
export function classifyFile(relPath: string): FileClass {
    const normalized = relPath.replace(/\\/g, '/');

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
 * @param fileClass – The class recorded for a file in `.blit/manifest.json`.
 * @returns True when sync may rewrite the file or its managed region.
 */
export function isKitManaged(fileClass: FileClass): boolean {
    return fileClass === 'kit-owned' || fileClass === 'shared';
}

/**
 * One AI assistant the kit generates files for.
 *
 * Scoped to the path helpers below. The scaffolder's `AgentChoice` narrows to `'none' | AgentKind`;
 * `blit agents add` uses `AgentKind` directly.
 */
export type AgentKind = 'claude' | 'cursor';

/** Every `AgentKind` value, for iteration and membership checks (`blit agents add`, the wizard). */
export const AGENT_KINDS: readonly AgentKind[] = ['claude', 'cursor'];

/** Human-readable assistant names for Tier-1 messages and wizard hints. */
export const AGENT_LABEL: Record<AgentKind, string> = {
    claude: 'Claude Code',
    cursor: 'Cursor',
};

/** Project-relative hint of what setting up each assistant adds, for wizard/CLI copy. */
export const AGENT_SETUP_HINT: Record<AgentKind, string> = {
    claude: `adds ${CLAUDE_MD}`,
    cursor: `adds ${CURSOR_RULES_DIR}`,
};

/**
 * Exact paths and directory prefixes each assistant's generated files occupy.
 *
 * Every path an adapter emits must match here, or `hasAgentFiles` under-reports and a sync skips that
 * assistant's files – `test/ownership.test.mjs` pins that invariant. Claude needs `CLAUDE_MCP_JSON`
 * spelled out because it sits at the project root rather than under `.claude/`; Cursor's `mcp.json`
 * is already covered by the `CURSOR_DIR` prefix.
 *
 * These are manifest paths, not disk paths: every caller passes `.blit/manifest.json` entries, so a
 * hand-written `.mcp.json` the kit never tracked cannot make an assistant look already set up. The
 * untracked case is handled separately, by `runAddAgent`'s collision check.
 */
const AGENT_PATHS: Record<AgentKind, { readonly files: readonly string[]; readonly dirs: readonly string[] }> = {
    claude: { files: [CLAUDE_MD, CLAUDE_MCP_JSON], dirs: [CLAUDE_DIR] },
    cursor: { files: [], dirs: [CURSOR_DIR] },
};

/**
 * Is this project-relative path part of `agent`'s generated file set?
 *
 * @param relPath – Path relative to the project root; Windows separators are normalized.
 * @param agent – The assistant to test against.
 * @returns True when the path is one the assistant's adapter emits.
 */
export function isAgentPath(relPath: string, agent: AgentKind): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    const spec = AGENT_PATHS[agent];

    return spec.files.includes(normalized) || spec.dirs.some((dir) => normalized.startsWith(dir));
}

/**
 * Does an ownership manifest already track files for `agent`?
 *
 * Takes anything carrying a `path` so the scaffolder's writer-side manifest entries and the CLI's
 * reader-side ones both satisfy it structurally, without this module depending on either shape.
 *
 * @param files – The manifest's tracked file entries.
 * @param agent – The assistant to look for.
 * @returns True when at least one tracked file belongs to that assistant.
 */
export function hasAgentFiles(files: readonly { readonly path: string }[], agent: AgentKind): boolean {
    return files.some((file) => isAgentPath(file.path, agent));
}
