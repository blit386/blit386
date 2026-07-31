#!/usr/bin/env node
/**
 * Verify the agent-facing config surface has not drifted, for the repo root and
 * every package that carries its own AGENTS.md / CLAUDE.md / .claude/.agents
 * layout (each absorbed repo kept its own when merged into packages/*):
 *
 *   - `.agents/skills/*` symlink integrity - every entry must be a working
 *     symlink into `.claude/skills/<same-name>`, and every `.claude/skills/*`
 *     directory must have a matching symlink.
 *   - AGENTS.md still points at an existing CLAUDE.md.
 *   - `.zed/settings.json` is present, parseable as JSON, and consistent with
 *     the `.agents/skills` layout.
 *   - Repo root only: `.github/copilot-instructions.md` points at both
 *     AGENTS.md and CLAUDE.md. GitHub only reads the top-level `.github/`, so
 *     this check does not apply to package roots.
 *
 * This is read-only - unlike `sync-doc-banners.mjs` it never writes fixes,
 * it only reports drift for a human (or `pnpm run rules:sync`-style script)
 * to resolve.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

/** @param {string} agentsSkillsDir @param {string} claudeSkillsDir
 * @returns {Array<{ name: string, isSymlink: boolean, resolvedName: string | null }>} */
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
 * Runs the symlink, AGENTS.md-pointer, and Zed-settings checks against one root
 * (the repo root or a package that carries its own AGENTS.md / CLAUDE.md / .claude layout).
 *
 * @param {string} root Absolute path to the root to check.
 * @returns {string[]} Human-readable failure messages, prefixed with the root's relative path.
 */
function checkRoot(root) {
    const agentsSkillsDir = join(root, '.agents', 'skills');
    const claudeSkillsDir = join(root, '.claude', 'skills');
    const agentsMdPath = join(root, 'AGENTS.md');
    const claudeMdPath = join(root, 'CLAUDE.md');
    const zedSettingsPath = join(root, '.zed', 'settings.json');

    const claudeSkillsDirExists = existsSync(claudeSkillsDir);
    if (!claudeSkillsDirExists) {
        return ['.claude/skills directory is missing'];
    }

    const agentsSkillsLayoutExists = existsSync(agentsSkillsDir);
    const agentsSkillEntries = agentsSkillsLayoutExists ? readAgentsSkillEntries(agentsSkillsDir, claudeSkillsDir) : [];
    const claudeSkillDirNames = readClaudeSkillDirNames(claudeSkillsDir);
    const agentsMdContent = existsSync(agentsMdPath) ? readFileSync(agentsMdPath, 'utf8') : null;
    const claudeMdExists = existsSync(claudeMdPath);
    const zedSettingsContent = existsSync(zedSettingsPath) ? readFileSync(zedSettingsPath, 'utf8') : null;

    const failures = [
        ...(agentsSkillsLayoutExists
            ? findSkillsSymlinkFailures(agentsSkillEntries, claudeSkillDirNames)
            : ['.agents/skills directory is missing']),
        ...findAgentsPointerFailures(agentsMdContent, claudeMdExists),
        ...findZedSettingsFailures(zedSettingsContent, agentsSkillsLayoutExists),
    ];

    return failures;
}

/**
 * A package counts as its own agent-config root if it carries any of these markers - not just
 * CLAUDE.md, so a package with AGENTS.md but a missing CLAUDE.md still gets checked (that
 * missing-pointer-target case is exactly what findAgentsPointerFailures exists to catch).
 */
const AGENT_CONFIG_MARKERS = ['CLAUDE.md', 'AGENTS.md', '.agents', '.claude', '.zed'];

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

/** @returns {string[]} All failure messages across the repo root and every package agent-config root. */
function runAllChecks() {
    const failures = [];

    for (const failure of checkRoot(REPO_ROOT)) {
        failures.push(`[.] ${failure}`);
    }

    const copilotInstructionsPath = join(REPO_ROOT, '.github', 'copilot-instructions.md');
    const copilotContent = existsSync(copilotInstructionsPath) ? readFileSync(copilotInstructionsPath, 'utf8') : null;
    const agentsMdExists = existsSync(join(REPO_ROOT, 'AGENTS.md'));
    const claudeMdExists = existsSync(join(REPO_ROOT, 'CLAUDE.md'));
    for (const failure of findCopilotPointerFailures(copilotContent, agentsMdExists, claudeMdExists)) {
        failures.push(`[.] ${failure}`);
    }

    for (const packageName of discoverPackageAgentRoots(join(REPO_ROOT, 'packages'))) {
        const root = join(REPO_ROOT, 'packages', packageName);
        for (const failure of checkRoot(root)) {
            failures.push(`[packages/${packageName}] ${failure}`);
        }
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
        'Agent config OK (skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings).',
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
