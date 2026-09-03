#!/usr/bin/env node
/**
 * Verify the agent-facing config surface has not drifted. There is one `.claude/`
 * (hooks, skills, settings) for the whole monorepo, at the repo root only – a
 * package never carries its own `.claude/skills`, `.agents/skills`, or
 * `.zed/settings.json`. A package may still carry its own `.claude/rules/` for
 * package-scoped rules, and every package carries its own AGENTS.md / CLAUDE.md.
 *
 * Repo root only:
 *   - `.agents/skills/*` symlink integrity – every entry must be a working
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
 *
 * Repo root and every package that carries an AGENTS.md or CLAUDE.md:
 *   - AGENTS.md still points at an existing CLAUDE.md.
 *
 * This is read-only – unlike `sync-doc-banners.mjs` it never writes fixes,
 * it only reports drift for a human (or `pnpm run rules:sync`-style script)
 * to resolve.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
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
 * Verifies `.zed/settings.json` exists, parses as JSON, and that the `.agents/skills`
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
        JSON.parse(withoutLineComments);
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
 * neither of which can import a constant – this file is what keeps them honest.
 *
 * The name and classification also live in `ACCEPTED_SHADOW_MCP_ENTRIES` in
 * `packages/blit386/scripts/security/mcp-preflight.mjs` (the monthly governance audit's
 * allowlist) – two files independently comparing against the same literal with no clean
 * import path between them, so keep both in sync by hand.
 */
const PROJECT_MCP_SERVER_NAME = 'blit386-docs';

/** Claude Code's transport discriminant for a remote streamable-HTTP MCP server. */
const PROJECT_MCP_SERVER_TYPE = 'http';

/**
 * The pinned endpoint, asserted literally rather than by comparing the two JSON copies to
 * each other. Parity alone would accept a coordinated edit that aims both files at some
 * other host, and every contributor's agent queries whatever this names – with the responses
 * landing in agent context. Changing it therefore has to touch this file too, where the
 * diff reads as what it is.
 *
 * Changing the endpoint is a deliberate three-file edit: here, the root `.mcp.json`, and
 * `packages/website/public/.well-known/mcp/server-card.json`.
 */
const PROJECT_MCP_SERVER_URL = 'https://blit386.dev/mcp';

/**
 * Whether git would ignore the root `.mcp.json` if it were removed and re-added.
 *
 * Asking git is the only honest way to answer this. Matching `.gitignore` text for the
 * `!/.mcp.json` negation looks equivalent but is not: gitignore resolves last-match-wins, so a
 * later `*.json` or a second bare `.mcp.json` line re-ignores the file while the negation is
 * still sitting there in the text. Both cases were verified to slip past a text-based check.
 *
 * `--no-index` is what makes the question meaningful for a file that is already tracked –
 * without it git short-circuits on the index and always answers "not ignored".
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @returns {boolean | null} `true`/`false` per git, or `null` when git could not answer.
 */
export function isRootMcpIgnoredByGit(repoRoot) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', '.mcp.json'], {
        cwd: repoRoot,
    });

    // 0 = ignored, 1 = not ignored, anything else (or a spawn failure) = git could not answer.
    if (result.error || (result.status !== 0 && result.status !== 1)) {
        return null;
    }

    return result.status === 0;
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
            '.mcp.json is ignored by git – check .gitignore for a rule matching it after the `!/.mcp.json` negation',
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
 * Runs the symlink and Zed-settings checks against the repo root – the only place
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
 * A package counts as its own agent-config root if it carries either marker – not just
 * CLAUDE.md, so a package with AGENTS.md but a missing CLAUDE.md still gets checked (that
 * missing-pointer-target case is exactly what findAgentsPointerFailures exists to catch).
 * `.claude/rules` alone (no CLAUDE.md/AGENTS.md) does not make a package its own root – only
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
        'Agent config OK (skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings, project .mcp.json).',
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
