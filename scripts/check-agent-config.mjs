#!/usr/bin/env node
/**
 * Verify the agent-facing config surface has not drifted. There is one `.claude/`
 * (hooks, skills, settings) for the whole monorepo, at the repo root only - a
 * package never carries its own `.claude/skills`, `.agents/skills`, or
 * `.zed/settings.json`. A package may still carry its own `.claude/rules/` for
 * package-scoped rules, and every package carries its own AGENTS.md / CLAUDE.md.
 *
 * Repo root only:
 *   - `.agents/skills/*` symlink integrity - every entry must be a working
 *     symlink into `.claude/skills/<same-name>`, and every `.claude/skills/*`
 *     directory must have a matching symlink.
 *   - `.zed/settings.json` is present, parseable as JSON, and consistent with
 *     the `.agents/skills` layout.
 *   - `.github/copilot-instructions.md` points at both AGENTS.md and CLAUDE.md.
 *     GitHub only reads the top-level `.github/`, so this does not apply to
 *     package roots.
 *   - `.mcp.json` declares the blit386.dev docs server, it and the website's
 *     discovery card both still point at the pinned endpoint, and git does not
 *     ignore the file.
 *   - `.cursor/rules/*.mdc` <-> `.claude/rules/*.md` parity (a rule added to
 *     one side must exist on the other, by basename).
 *   - `.cursor/mcp.json` declares the blit386.dev docs server using Cursor's
 *     own remote-server schema (no `type` field), pinned to the same URL.
 *   - Maintainer dogfood configs for Antigravity, Codex, Gemini CLI, Copilot, and
 *     OpenCode (installed by `scripts/sync-maintainer-agents.mjs`): each config
 *     file exists and parses, the docs server uses that agent's URL key, guards
 *     are wired, on-disk hook scripts under the agent `hooks/` dirs symlink into
 *     `packages/kit/content/hooks/`, and git does not ignore `.codex/hooks.json`.
 *     Missing scripts and byte drift are `sync:maintainer-agents:check`.
 *
 * Repo root and every package that carries an AGENTS.md or CLAUDE.md:
 *   - AGENTS.md still points at an existing CLAUDE.md.
 *
 * This is read-only - unlike `sync-doc-banners.mjs` it never writes fixes,
 * it only reports drift for a human (or `pnpm run rules:sync`-style script)
 * to resolve.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} path @returns {string | null} File contents, or `null` when the file does not exist. */
function readFileIfExists(path) {
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Pushes each failure onto `failures`, tagged with `[prefix]`.
 *
 * @param {string[]} failures Accumulator array, mutated in place.
 * @param {string} prefix Root label to prefix each failure with (e.g. `.` or `packages/blit386`).
 * @param {string[]} newFailures Failure messages to prefix and append.
 */
function collect(failures, prefix, newFailures) {
    for (const failure of newFailures) {
        failures.push(`[${prefix}] ${failure}`);
    }
}

/**
 * Verifies every `.agents/skills/*` entry is a working symlink that resolves
 * to a same-named `.claude/skills/*` directory, and that every
 * `.claude/skills/*` directory has a matching symlink (catches a new skill
 * added without its Zed symlink).
 *
 * @param {Array<{ name: string, isSymlink: boolean, resolvedName: string | null }>} agentsSkillEntries
 *   `resolvedName` is the basename the symlink resolves to under `.claude/skills/`, or `null` when broken.
 * @param {string[]} claudeSkillDirNames Directory names under `.claude/skills/`.
 * @returns {string[]} Human-readable failure messages (empty when in sync).
 */
export function findSkillsSymlinkFailures(agentsSkillEntries, claudeSkillDirNames) {
    const failures = [];
    const resolvedNames = new Set();

    for (const entry of agentsSkillEntries) {
        if (!entry.isSymlink) {
            failures.push(`.agents/skills/${entry.name} is not a symlink`);
            continue;
        }

        if (entry.resolvedName === null) {
            failures.push(`.agents/skills/${entry.name} is a broken symlink`);
            continue;
        }

        if (entry.resolvedName !== entry.name) {
            failures.push(
                `.agents/skills/${entry.name} resolves to .claude/skills/${entry.resolvedName}, expected ${entry.name}`,
            );
            continue;
        }

        resolvedNames.add(entry.name);
    }

    for (const name of claudeSkillDirNames) {
        if (!resolvedNames.has(name)) {
            failures.push(`.claude/skills/${name} has no matching .agents/skills/${name} symlink`);
        }
    }

    return failures.sort();
}

/**
 * Verifies AGENTS.md exists, still references CLAUDE.md, and CLAUDE.md exists.
 *
 * @param {string | null} agentsMdContent Contents of AGENTS.md, or `null` when the file is missing.
 * @param {boolean} claudeMdExists Whether CLAUDE.md exists at the given root.
 * @returns {string[]} Human-readable failure messages (empty when the pointer is valid).
 */
export function findAgentsPointerFailures(agentsMdContent, claudeMdExists) {
    if (agentsMdContent === null) {
        return ['AGENTS.md is missing'];
    }

    const failures = [];

    if (!/\]\(CLAUDE\.md\)/u.test(agentsMdContent)) {
        failures.push('AGENTS.md does not reference CLAUDE.md');
    }

    if (!claudeMdExists) {
        failures.push('AGENTS.md points at CLAUDE.md, but CLAUDE.md is missing');
    }

    return failures;
}

/**
 * Verifies `.github/copilot-instructions.md` exists, references both AGENTS.md and
 * CLAUDE.md via relative `../` links, and that both targets exist.
 *
 * @param {string | null} copilotContent Contents of `.github/copilot-instructions.md`, or `null` when missing.
 * @param {boolean} agentsMdExists Whether AGENTS.md exists at the repo root.
 * @param {boolean} claudeMdExists Whether CLAUDE.md exists at the repo root.
 * @returns {string[]} Human-readable failure messages (empty when the pointer is valid).
 */
export function findCopilotPointerFailures(copilotContent, agentsMdExists, claudeMdExists) {
    if (copilotContent === null) {
        return ['.github/copilot-instructions.md is missing'];
    }

    const failures = [];
    const referencesAgents = /\]\(\.\.\/AGENTS\.md\)/u.test(copilotContent);
    const referencesClaude = /\]\(\.\.\/CLAUDE\.md\)/u.test(copilotContent);

    if (!referencesAgents) {
        failures.push('.github/copilot-instructions.md does not reference AGENTS.md');
    }

    if (!referencesClaude) {
        failures.push('.github/copilot-instructions.md does not reference CLAUDE.md');
    }

    if (referencesAgents && !agentsMdExists) {
        failures.push('.github/copilot-instructions.md points at AGENTS.md, but AGENTS.md is missing');
    }

    if (referencesClaude && !claudeMdExists) {
        failures.push('.github/copilot-instructions.md points at CLAUDE.md, but CLAUDE.md is missing');
    }

    return failures;
}

/**
 * Verifies `.zed/settings.json` exists, parses as JSON, declares the project MCP server at the
 * pinned `PROJECT_MCP_SERVER_URL` (Zed does not read `.mcp.json`), and that the `.agents/skills`
 * layout is present when the settings file exists. JSON parsing runs on the passed-in
 * string so the function stays unit-testable without touching disk; parse errors become
 * failure messages rather than throws. Full-line `//` comments are stripped first so
 * Zed's JSONC settings still validate.
 *
 * @param {string | null} zedSettingsContent Contents of `.zed/settings.json`, or `null` when missing.
 * @param {boolean} agentsSkillsLayoutExists Whether the `.agents/skills` directory exists.
 * @returns {string[]} Human-readable failure messages (empty when settings are consistent).
 */
export function findZedSettingsFailures(zedSettingsContent, agentsSkillsLayoutExists) {
    if (zedSettingsContent === null) {
        return ['.zed/settings.json is missing'];
    }

    const failures = [];

    try {
        const withoutLineComments = zedSettingsContent
            .split('\n')
            .filter((line) => !/^\s*\/\//u.test(line))
            .join('\n');
        const settings = JSON.parse(withoutLineComments);
        const zedUrl = settings?.context_servers?.[PROJECT_MCP_SERVER_NAME]?.url;

        if (zedUrl !== PROJECT_MCP_SERVER_URL) {
            failures.push(
                `.zed/settings.json context_servers.${PROJECT_MCP_SERVER_NAME}.url is ${JSON.stringify(zedUrl)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            );
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`.zed/settings.json is not parseable as JSON: ${detail}`);
    }

    if (!agentsSkillsLayoutExists) {
        failures.push('.agents/skills layout is missing while .zed/settings.json exists');
    }

    return failures;
}

/**
 * The one MCP server the repo declares for contributors. `packages/website` both serves
 * this endpoint and publishes the discovery card, so the URL exists as two JSON copies
 * neither of which can import a constant - this file is what keeps them honest.
 *
 * The name and classification also live in `ACCEPTED_SHADOW_MCP_ENTRIES` in
 * `packages/blit386/scripts/security/mcp-preflight.mjs` (the monthly governance audit's
 * allowlist) - two files independently comparing against the same literal with no clean
 * import path between them, so keep both in sync by hand.
 */
const PROJECT_MCP_SERVER_NAME = 'blit386-docs';

/** Claude Code's transport discriminant for a remote streamable-HTTP MCP server. */
const PROJECT_MCP_SERVER_TYPE = 'http';

/**
 * The pinned endpoint, asserted literally rather than by comparing the two JSON copies to
 * each other. Parity alone would accept a coordinated edit that aims both files at some
 * other host, and every contributor's agent queries whatever this names - with the responses
 * landing in agent context. Changing it therefore has to touch this file too, where the
 * diff reads as what it is.
 *
 * Changing the endpoint is a deliberate four-file edit: here, the root `.mcp.json`,
 * `packages/website/public/.well-known/mcp/server-card.json`, and `.zed/settings.json`
 * (`context_servers`, since Zed does not read `.mcp.json`).
 */
const PROJECT_MCP_SERVER_URL = 'https://blit386.dev/mcp';

const CLAUDE_RULES_DIR = join(REPO_ROOT, '.claude', 'rules');
const CURSOR_RULES_DIR = join(REPO_ROOT, '.cursor', 'rules');

/**
 * Sorted basenames (no extension) of files matching `extension` directly under `dir`.
 *
 * @param {string} dir Absolute path to a rules directory.
 * @param {string} extension File extension to match, including the leading dot.
 * @returns {string[]} Sorted basenames, or `[]` when the directory does not exist.
 */
function readRuleNames(dir, extension) {
    if (!existsSync(dir)) {
        return [];
    }

    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
        .map((entry) => basename(entry.name, extension))
        .sort();
}

/**
 * Verifies `.cursor/rules/*.mdc` and `.claude/rules/*.md` define the same set of rule names.
 * Mirrors are condensed summaries, not identical content - Cursor's `.mdc` frontmatter
 * (`description`/`globs`/`alwaysApply`) differs from Claude's `paths:` key - so this checks
 * basename parity rather than file contents, matching the policy this check had before PR #434
 * removed it (it is intentionally scoped to whatever rule files exist on either side today,
 * not a fixed list - `.claude/rules/` has shrunk from 12 files to 2 since 2026-07 as most rule
 * content migrated into CLAUDE.md, and this check tracks that count automatically).
 *
 * @param {string[]} cursorRuleNames Basenames (no extension) of `.cursor/rules/*.mdc`.
 * @param {string[]} claudeRuleNames Basenames (no extension) of `.claude/rules/*.md`.
 * @returns {string[]} Human-readable failure messages (empty when in parity).
 */
export function findRulesParityFailures(cursorRuleNames, claudeRuleNames) {
    const cursorSet = new Set(cursorRuleNames);
    const claudeSet = new Set(claudeRuleNames);
    const failures = [];

    for (const name of cursorSet) {
        if (!claudeSet.has(name)) {
            failures.push(`.cursor/rules/${name}.mdc has no matching .claude/rules/${name}.md`);
        }
    }

    for (const name of claudeSet) {
        if (!cursorSet.has(name)) {
            failures.push(`.claude/rules/${name}.md has no matching .cursor/rules/${name}.mdc`);
        }
    }

    return failures.sort();
}

/**
 * Whether git would ignore the root `.mcp.json` if it were removed and re-added.
 *
 * Asking git is the only honest way to answer this. Matching `.gitignore` text for the
 * `!/.mcp.json` negation looks equivalent but is not: gitignore resolves last-match-wins, so a
 * later `*.json` or a second bare `.mcp.json` line re-ignores the file while the negation is
 * still sitting there in the text. Both cases were verified to slip past a text-based check.
 *
 * `--no-index` is what makes the question meaningful for a file that is already tracked -
 * without it git short-circuits on the index and always answers "not ignored".
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @returns {boolean | null} `true`/`false` per git, or `null` when git could not answer.
 */
/**
 * Whether git would ignore `relPath` if it were removed and re-added.
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @param {string} relPath Project-relative path (forward slashes).
 * @returns {boolean | null} `true`/`false` per git, or `null` when git could not answer.
 */
export function isPathIgnoredByGit(repoRoot, relPath) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', relPath], {
        cwd: repoRoot,
    });

    // 0 = ignored, 1 = not ignored, anything else (or a spawn failure) = git could not answer.
    if (result.error || (result.status !== 0 && result.status !== 1)) {
        return null;
    }

    return result.status === 0;
}

/** @param {string} repoRoot Absolute path to the repository root. */
export function isRootMcpIgnoredByGit(repoRoot) {
    return isPathIgnoredByGit(repoRoot, '.mcp.json');
}

/**
 * Verifies the tracked root `.mcp.json` still declares the blit386.dev docs server, that its
 * URL has not drifted from the website's `.well-known` discovery card, and that git does not
 * ignore the file. The ignore check is the important one: without it the file can silently
 * fall back out of git and every contributor quietly loses the server.
 *
 * The file contents are passed in as strings, and the ignore state as an already-resolved
 * boolean, so the function stays pure and unit-testable without touching disk or shelling
 * out; parse errors become failure messages rather than throws.
 *
 * @param {string | null} mcpConfigContent Contents of the root `.mcp.json`, or `null` when missing.
 * @param {string | null} serverCardContent Contents of the website's MCP discovery card, or `null` when missing.
 * @param {boolean | null} rootMcpIsIgnored Git's verdict from {@link isRootMcpIgnoredByGit}; `null` when unknown.
 * @returns {string[]} Human-readable failure messages (empty when the config is consistent).
 */
export function findProjectMcpFailures(mcpConfigContent, serverCardContent, rootMcpIsIgnored) {
    if (mcpConfigContent === null) {
        return ['.mcp.json is missing'];
    }

    const failures = [];

    if (rootMcpIsIgnored === true) {
        failures.push(
            '.mcp.json is ignored by git - check .gitignore for a rule matching it after the `!/.mcp.json` negation',
        );
    }

    /** @type {Record<string, unknown>} */
    let server;

    try {
        const parsed = JSON.parse(mcpConfigContent);
        const servers = parsed?.mcpServers;

        if (servers === null || typeof servers !== 'object') {
            failures.push('.mcp.json has no mcpServers object');
            return failures;
        }

        if (!Object.hasOwn(servers, PROJECT_MCP_SERVER_NAME)) {
            failures.push(`.mcp.json does not declare the \`${PROJECT_MCP_SERVER_NAME}\` server`);
            return failures;
        }

        server = servers[PROJECT_MCP_SERVER_NAME] ?? {};
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`.mcp.json is not parseable as JSON: ${detail}`);
        return failures;
    }

    if (server.type !== PROJECT_MCP_SERVER_TYPE) {
        failures.push(
            `.mcp.json entry \`${PROJECT_MCP_SERVER_NAME}\` has type ${JSON.stringify(server.type)}, expected "${PROJECT_MCP_SERVER_TYPE}"`,
        );
    }

    if (serverCardContent === null) {
        failures.push('packages/website/public/.well-known/mcp/server-card.json is missing');
        return failures;
    }

    try {
        const card = JSON.parse(serverCardContent);

        // Pinning both copies to the literal subsumes a parity check: if each equals the
        // pinned URL they equal each other, and a coordinated change fails on both counts.
        if (server.url !== PROJECT_MCP_SERVER_URL) {
            failures.push(
                `.mcp.json declares URL ${JSON.stringify(server.url)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            );
        }

        if (card.url !== PROJECT_MCP_SERVER_URL) {
            failures.push(
                `discovery card declares URL ${JSON.stringify(card.url)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            );
        }

        if (card.serverInfo?.name !== PROJECT_MCP_SERVER_NAME) {
            failures.push(
                `discovery card names ${JSON.stringify(card.serverInfo?.name)}, but .mcp.json declares \`${PROJECT_MCP_SERVER_NAME}\``,
            );
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`server-card.json is not parseable as JSON: ${detail}`);
    }

    return failures;
}

/**
 * Verifies `.cursor/mcp.json` declares the pinned `blit386-docs` server, using Cursor's own
 * schema for a remote server - which is not Claude's schema. `packages/kit/src/adapters.ts`
 * (`MCP_SERVER_ENTRY`) documents why: for Cursor a `type` field marks a *local stdio* server, so
 * a remote HTTP entry must omit it entirely, unlike the root `.mcp.json` (Claude Code), which
 * requires `"type": "http"`. This is why `.cursor/mcp.json` cannot be a symlink to the root
 * `.mcp.json` the way `.agents/skills/*` symlinks into `.claude/skills/*` - the two files are
 * shaped differently on purpose and would misconfigure one assistant or the other if unified.
 *
 * @param {string | null} cursorMcpContent Contents of `.cursor/mcp.json`, or `null` when missing.
 * @returns {string[]} Human-readable failure messages (empty when the config is consistent).
 */
export function findCursorMcpFailures(cursorMcpContent) {
    if (cursorMcpContent === null) {
        return ['.cursor/mcp.json is missing'];
    }

    const failures = [];

    /** @type {Record<string, unknown>} */
    let server;

    try {
        const parsed = JSON.parse(cursorMcpContent);
        const servers = parsed?.mcpServers;

        if (servers === null || typeof servers !== 'object') {
            failures.push('.cursor/mcp.json has no mcpServers object');
            return failures;
        }

        if (!Object.hasOwn(servers, PROJECT_MCP_SERVER_NAME)) {
            failures.push(`.cursor/mcp.json does not declare the \`${PROJECT_MCP_SERVER_NAME}\` server`);
            return failures;
        }

        server = servers[PROJECT_MCP_SERVER_NAME] ?? {};
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`.cursor/mcp.json is not parseable as JSON: ${detail}`);
        return failures;
    }

    if (Object.hasOwn(server, 'type')) {
        failures.push(
            `.cursor/mcp.json entry \`${PROJECT_MCP_SERVER_NAME}\` must not have a \`type\` field for a remote server (Cursor reserves it for local stdio servers)`,
        );
    }

    if (server.url !== PROJECT_MCP_SERVER_URL) {
        failures.push(
            `.cursor/mcp.json declares URL ${JSON.stringify(server.url)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
        );
    }

    return failures;
}

/**
 * Agent hook directories the monorepo dogfoods. Presence of individual scripts is
 * `sync:maintainer-agents:check`; this check only asserts each on-disk `*.cjs` /
 * `*.sh` under these dirs is a symlink into `packages/kit/content/hooks/`.
 * MANUAL-SYNC HAZARD: prefixes match `packages/kit/src/ownership.ts`.
 */
export const MAINTAINER_HOOK_DIRS = [
    '.agents/hooks',
    '.codex/hooks',
    '.gemini/hooks',
    '.github/hooks',
    '.opencode/hooks',
];

/**
 * One dogfood config file's structural contract. Byte drift is
 * `sync-maintainer-agents.mjs --check`; this only asserts shape.
 * `format` defaults to `'json'`.
 *
 * @typedef {{ text: string, missing: string }} MaintainerNeedle
 * @typedef {{
 *   path: string,
 *   format?: 'json' | 'raw',
 *   mcp?: { container: 'mcpServers' | 'mcp', urlKey: 'url' | 'httpUrl' | 'serverUrl', type?: string, forbidKeys?: string[] },
 *   needles?: MaintainerNeedle[],
 *   requireAll?: { texts: string[], missing: string },
 *   bashDeny?: string,
 *   forbidSymlink?: boolean,
 * }} MaintainerConfigSpec
 */

/** @type {readonly MaintainerConfigSpec[]} */
export const MAINTAINER_CONFIG_SPECS = [
    {
        path: '.agents/mcp_config.json',
        mcp: { container: 'mcpServers', urlKey: 'serverUrl', forbidKeys: ['url', 'httpUrl'] },
    },
    {
        path: '.agents/hooks.json',
        needles: [
            {
                text: 'antigravity-guard.cjs',
                missing: '.agents/hooks.json does not wire antigravity-guard.cjs',
            },
        ],
    },
    {
        path: '.codex/config.toml',
        format: 'raw',
        needles: [
            {
                text: `[mcp_servers.${PROJECT_MCP_SERVER_NAME}]`,
                missing: `.codex/config.toml does not declare [mcp_servers.${PROJECT_MCP_SERVER_NAME}]`,
            },
            {
                text: `url = "${PROJECT_MCP_SERVER_URL}"`,
                missing: `.codex/config.toml does not pin url = ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            },
        ],
    },
    {
        path: '.codex/hooks.json',
        needles: [{ text: 'codex-guard.cjs', missing: '.codex/hooks.json does not wire codex-guard.cjs' }],
    },
    {
        path: '.gemini/settings.json',
        mcp: { container: 'mcpServers', urlKey: 'httpUrl', forbidKeys: ['url'] },
        needles: [{ text: 'shell-guard.cjs', missing: '.gemini/settings.json does not wire shell-guard.cjs' }],
    },
    {
        path: '.github/hooks/blit.json',
        needles: [{ text: 'copilot-hook.cjs', missing: '.github/hooks/blit.json does not wire copilot-hook.cjs' }],
        requireAll: {
            texts: ['"bash"', '"powershell"'],
            missing: '.github/hooks/blit.json must declare both bash and powershell commands',
        },
    },
    {
        path: 'opencode.json',
        mcp: { container: 'mcp', urlKey: 'url', type: 'remote' },
        bashDeny: 'git reset --hard*',
    },
    {
        path: '.opencode/plugins/kit-guard.ts',
        format: 'raw',
        forbidSymlink: true,
        needles: [
            {
                text: 'pnpm install',
                missing: '.opencode/plugins/kit-guard.ts does not contain the rendered `pnpm install` command',
            },
        ],
    },
];

/**
 * Structural failures for one maintainer config file against its {@link MaintainerConfigSpec}.
 *
 * @param {MaintainerConfigSpec} spec
 * @param {string | null} content File contents, or `null` when missing.
 * @param {{ isSymlink?: boolean | null }} [disk] Optional on-disk facts (symlink bit for kit-guard).
 * @returns {string[]}
 */
export function findMaintainerConfigFailures(spec, content, disk = {}) {
    if (content === null) {
        return [`${spec.path} is missing`];
    }

    /** @type {string[]} */
    const failures = [];

    if (spec.forbidSymlink === true && disk.isSymlink === true) {
        failures.push(`${spec.path} must be a regular file (the adapter renders {{pmInstall}} into it)`);
    }

    if (spec.format !== 'raw') {
        /** @type {Record<string, unknown>} */
        let parsed;

        try {
            parsed = JSON.parse(content);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);

            return [`${spec.path} is not parseable as JSON: ${detail}`];
        }

        if (spec.mcp) {
            const container = parsed[spec.mcp.container];

            if (container === null || typeof container !== 'object') {
                failures.push(`${spec.path} has no ${spec.mcp.container} object`);

                return failures;
            }

            if (!Object.hasOwn(container, PROJECT_MCP_SERVER_NAME)) {
                failures.push(`${spec.path} does not declare the \`${PROJECT_MCP_SERVER_NAME}\` server`);

                return failures;
            }

            const server = /** @type {Record<string, unknown>} */ (container[PROJECT_MCP_SERVER_NAME] ?? {});
            const urlValue = server[spec.mcp.urlKey];

            if (urlValue !== PROJECT_MCP_SERVER_URL) {
                failures.push(
                    `${spec.path} declares ${spec.mcp.urlKey} ${JSON.stringify(urlValue)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
                );
            }

            if (spec.mcp.type !== undefined && server.type !== spec.mcp.type) {
                failures.push(
                    `${spec.path} entry \`${PROJECT_MCP_SERVER_NAME}\` has type ${JSON.stringify(server.type)}, expected ${JSON.stringify(spec.mcp.type)}`,
                );
            }

            for (const key of spec.mcp.forbidKeys ?? []) {
                if (Object.hasOwn(server, key)) {
                    failures.push(
                        `${spec.path} must use \`${spec.mcp.urlKey}\` for a remote server (forbids \`${key}\`)`,
                    );
                }
            }
        }

        if (spec.bashDeny !== undefined) {
            const bash = /** @type {Record<string, unknown> | undefined} */ (parsed.permission?.bash);

            if (bash?.[spec.bashDeny] !== 'deny') {
                failures.push(`${spec.path} permission.bash does not deny \`${spec.bashDeny}\``);
            }
        }
    }

    for (const needle of spec.needles ?? []) {
        if (!content.includes(needle.text)) {
            failures.push(needle.missing);
        }
    }

    if (spec.requireAll?.texts.some((text) => !content.includes(text))) {
        failures.push(spec.requireAll.missing);
    }

    return failures;
}

/**
 * Verifies each maintainer hook script is a working symlink into `packages/kit/content/hooks/<same-name>`.
 *
 * @param {Array<{ path: string, isSymlink: boolean, resolvedBasename: string | null }>} entries
 * @returns {string[]}
 */
export function findMaintainerHookSymlinkFailures(entries) {
    const failures = [];

    for (const entry of entries) {
        if (!entry.isSymlink) {
            failures.push(`${entry.path} is not a symlink`);
            continue;
        }

        if (entry.resolvedBasename === null) {
            failures.push(`${entry.path} is a broken symlink or does not resolve under packages/kit/content/hooks/`);
            continue;
        }

        const expectedBasename = basename(entry.path);

        if (entry.resolvedBasename !== expectedBasename) {
            failures.push(
                `${entry.path} resolves to ${entry.resolvedBasename}, expected packages/kit/content/hooks/${expectedBasename}`,
            );
        }
    }

    return failures.sort();
}

/**
 * @param {string} root Absolute repo root.
 * @param {string} kitHooksDir Absolute path to `packages/kit/content/hooks`.
 * @param {string} relPath Project-relative hook script path.
 * @returns {{ path: string, isSymlink: boolean, resolvedBasename: string | null }}
 */
function readMaintainerHookSymlinkEntry(root, kitHooksDir, relPath) {
    const abs = join(root, relPath);

    try {
        const stat = lstatSync(abs);

        if (!stat.isSymbolicLink()) {
            return { path: relPath, isSymlink: false, resolvedBasename: null };
        }

        const target = realpathSync(abs);

        if (dirname(target) !== kitHooksDir) {
            return { path: relPath, isSymlink: true, resolvedBasename: null };
        }

        return { path: relPath, isSymlink: true, resolvedBasename: basename(target) };
    } catch {
        return { path: relPath, isSymlink: false, resolvedBasename: null };
    }
}

/**
 * Structural checks for the maintainer dogfood configs. Byte drift against the kit
 * adapters is `scripts/sync-maintainer-agents.mjs --check`. Returns unprefixed
 * messages; the caller tags them with {@link collect}.
 *
 * @param {string} root Absolute repo root.
 * @returns {string[]}
 */
export function checkMaintainerAgentConfigs(root) {
    const kitHooksDir = join(root, 'packages', 'kit', 'content', 'hooks');
    /** @type {string[]} */
    const failures = [];

    if (isPathIgnoredByGit(root, '.codex/hooks.json') === true) {
        failures.push(
            '.codex/hooks.json is ignored by git - check .gitignore for a rule matching it after the `!.codex/hooks.json` negation',
        );
    }

    for (const spec of MAINTAINER_CONFIG_SPECS) {
        const abs = join(root, spec.path);
        const content = readFileIfExists(abs);
        /** @type {{ isSymlink?: boolean | null }} */
        const disk = {};

        if (spec.forbidSymlink === true && existsSync(abs)) {
            disk.isSymlink = lstatSync(abs).isSymbolicLink();
        }

        failures.push(...findMaintainerConfigFailures(spec, content, disk));
    }

    const hookEntries = listMaintainerHookScriptPaths(root).map((relPath) =>
        readMaintainerHookSymlinkEntry(root, kitHooksDir, relPath),
    );

    failures.push(...findMaintainerHookSymlinkFailures(hookEntries));

    return failures;
}

/**
 * Project-relative `*.cjs` / `*.sh` paths currently under {@link MAINTAINER_HOOK_DIRS}.
 *
 * @param {string} root Absolute repo root.
 * @returns {string[]}
 */
function listMaintainerHookScriptPaths(root) {
    /** @type {string[]} */
    const paths = [];

    for (const dir of MAINTAINER_HOOK_DIRS) {
        const absDir = join(root, dir);

        if (!existsSync(absDir)) {
            continue;
        }

        for (const name of readdirSync(absDir)) {
            if (/\.(?:cjs|sh)$/u.test(name)) {
                paths.push(`${dir}/${name}`);
            }
        }
    }

    return paths.sort();
}

/**
 * Computes the skill name a resolved symlink target represents. The target must be a directory that is a
 * *direct* child of `.claude/skills/` - a nested path or a file that merely shares a basename with a skill
 * directory does not count as a valid link, even though its basename would otherwise match.
 *
 * @param {string} resolvedTargetPath Absolute, symlink-resolved path (`fs.realpathSync` output).
 * @param {boolean} targetIsDirectory Whether `resolvedTargetPath` is a directory.
 * @param {string} claudeSkillsDir Absolute path to `.claude/skills/`.
 * @returns {string | null} The skill directory name, or `null` when the target is not a direct child directory.
 */
export function resolveSkillSymlinkTarget(resolvedTargetPath, targetIsDirectory, claudeSkillsDir) {
    if (!targetIsDirectory) {
        return null;
    }

    if (dirname(resolvedTargetPath) !== claudeSkillsDir) {
        return null;
    }

    return basename(resolvedTargetPath);
}

/**
 * @param {string} agentsSkillsDir
 * @param {string} claudeSkillsDir
 * @returns {Array<{ name: string, isSymlink: boolean, resolvedName: string | null }>}
 */
function readAgentsSkillEntries(agentsSkillsDir, claudeSkillsDir) {
    return readdirSync(agentsSkillsDir, { withFileTypes: true }).map((entry) => {
        if (!entry.isSymbolicLink()) {
            return { name: entry.name, isSymlink: false, resolvedName: null };
        }

        const linkPath = join(agentsSkillsDir, entry.name);

        try {
            const target = realpathSync(linkPath);
            const targetIsDirectory = statSync(target).isDirectory();

            return {
                name: entry.name,
                isSymlink: true,
                resolvedName: resolveSkillSymlinkTarget(target, targetIsDirectory, claudeSkillsDir),
            };
        } catch {
            return { name: entry.name, isSymlink: true, resolvedName: null };
        }
    });
}

/** @param {string} claudeSkillsDir @returns {string[]} Directory names under `.claude/skills/` (dotfiles excluded). */
function readClaudeSkillDirNames(claudeSkillsDir) {
    return readdirSync(claudeSkillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
}

/**
 * Runs the symlink and Zed-settings checks against the repo root - the only place
 * `.claude/skills`, `.agents/skills`, and `.zed/settings.json` live in this monorepo.
 *
 * @param {string} root Absolute path to the repo root.
 * @returns {string[]} Human-readable failure messages.
 */
export function checkRootSkillsLayout(root) {
    const agentsSkillsDir = join(root, '.agents', 'skills');
    const claudeSkillsDir = join(root, '.claude', 'skills');
    const zedSettingsPath = join(root, '.zed', 'settings.json');
    const claudeSkillsDirExists = existsSync(claudeSkillsDir);

    const agentsSkillsLayoutExists = existsSync(agentsSkillsDir);
    const agentsSkillEntries = agentsSkillsLayoutExists ? readAgentsSkillEntries(agentsSkillsDir, claudeSkillsDir) : [];
    const claudeSkillDirNames = claudeSkillsDirExists ? readClaudeSkillDirNames(claudeSkillsDir) : [];
    const zedSettingsContent = readFileIfExists(zedSettingsPath);

    return [
        ...(claudeSkillsDirExists ? [] : ['.claude/skills directory is missing']),
        ...(agentsSkillsLayoutExists
            ? findSkillsSymlinkFailures(agentsSkillEntries, claudeSkillDirNames)
            : ['.agents/skills directory is missing']),
        ...findZedSettingsFailures(zedSettingsContent, agentsSkillsLayoutExists),
    ];
}

/**
 * Runs the AGENTS.md -> CLAUDE.md pointer check against one root (the repo root or a
 * package that carries its own AGENTS.md / CLAUDE.md).
 *
 * @param {string} root Absolute path to the root to check.
 * @returns {string[]} Human-readable failure messages.
 */
function checkAgentsPointer(root) {
    const agentsMdPath = join(root, 'AGENTS.md');
    const claudeMdPath = join(root, 'CLAUDE.md');

    const agentsMdContent = readFileIfExists(agentsMdPath);
    const claudeMdExists = existsSync(claudeMdPath);

    return findAgentsPointerFailures(agentsMdContent, claudeMdExists);
}

/**
 * A package counts as its own agent-config root if it carries either marker - not just
 * CLAUDE.md, so a package with AGENTS.md but a missing CLAUDE.md still gets checked (that
 * missing-pointer-target case is exactly what findAgentsPointerFailures exists to catch).
 * `.claude/rules` alone (no CLAUDE.md/AGENTS.md) does not make a package its own root - only
 * the AGENTS.md <-> CLAUDE.md pointer is package-level in this monorepo.
 */
const AGENT_CONFIG_MARKERS = ['CLAUDE.md', 'AGENTS.md'];

/**
 * @param {string} packagesDir Absolute path to a `packages/` directory.
 * @returns {string[]} Directory names directly under packagesDir that carry their own agent config.
 */
export function discoverPackageAgentRoots(packagesDir) {
    if (!existsSync(packagesDir)) {
        return [];
    }

    return readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => AGENT_CONFIG_MARKERS.some((marker) => existsSync(join(packagesDir, name, marker))))
        .sort();
}

/** @returns {string[]} All failure messages across the repo root skills layout and every AGENTS.md <-> CLAUDE.md pointer. */
function runAllChecks() {
    const failures = [];

    collect(failures, '.', checkRootSkillsLayout(REPO_ROOT));
    collect(failures, '.', checkAgentsPointer(REPO_ROOT));

    const copilotInstructionsPath = join(REPO_ROOT, '.github', 'copilot-instructions.md');
    const copilotContent = readFileIfExists(copilotInstructionsPath);

    const agentsMdExists = existsSync(join(REPO_ROOT, 'AGENTS.md'));
    const claudeMdExists = existsSync(join(REPO_ROOT, 'CLAUDE.md'));

    collect(failures, '.', findCopilotPointerFailures(copilotContent, agentsMdExists, claudeMdExists));

    collect(
        failures,
        '.',
        findProjectMcpFailures(
            readFileIfExists(join(REPO_ROOT, '.mcp.json')),
            readFileIfExists(
                join(REPO_ROOT, 'packages', 'website', 'public', '.well-known', 'mcp', 'server-card.json'),
            ),
            isRootMcpIgnoredByGit(REPO_ROOT),
        ),
    );

    collect(
        failures,
        '.',
        findRulesParityFailures(readRuleNames(CURSOR_RULES_DIR, '.mdc'), readRuleNames(CLAUDE_RULES_DIR, '.md')),
    );

    collect(failures, '.', findCursorMcpFailures(readFileIfExists(join(REPO_ROOT, '.cursor', 'mcp.json'))));

    collect(failures, '.', checkMaintainerAgentConfigs(REPO_ROOT));

    for (const packageName of discoverPackageAgentRoots(join(REPO_ROOT, 'packages'))) {
        const root = join(REPO_ROOT, 'packages', packageName);
        collect(failures, `packages/${packageName}`, checkAgentsPointer(root));
    }

    return failures;
}

function main() {
    const failures = runAllChecks();

    if (failures.length > 0) {
        console.error('Agent config drift check failed:');

        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }

        process.exit(1);
    }

    console.log(
        'Agent config OK (skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings, project .mcp.json, cursor rules parity, cursor .mcp.json, maintainer agent dogfood).',
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
