import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { readFileIfExists, realpathSyncIfExists } from './fs.mjs';
import { PROJECT_MCP_SERVER_NAME, PROJECT_MCP_SERVER_URL } from './mcp.mjs';

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
    return readdirSync(agentsSkillsDir, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'))
        .map((entry) => {
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
    const claudeSkillsDir = realpathSyncIfExists(join(root, '.claude', 'skills'));
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
