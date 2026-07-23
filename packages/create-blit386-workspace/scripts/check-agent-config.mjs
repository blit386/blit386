#!/usr/bin/env node
/**
 * Light maintainer agent-config drift check for create-blit386.
 *
 * Only verifies `.agents/skills/*` symlink integrity: every entry must be a
 * working symlink into `.claude/skills/<same-name>`, and every
 * `.claude/skills/*` directory must have a matching symlink.
 *
 * Intentionally does NOT check Cursor <-> Claude rules basename parity.
 * This repo keeps Cursor-only rules (`claude-canonical`, `rtk-and-pnpm`); that
 * asymmetry is deliberate. Cursor command <-> Claude skill content parity is
 * owned by `scripts/sync-cursor-commands.mjs` instead.
 *
 * This is read-only - it never writes fixes, only reports drift.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_SKILLS_DIR = join(ROOT, '.agents', 'skills');
const CLAUDE_SKILLS_DIR = join(ROOT, '.claude', 'skills');

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

/** @returns {Array<{ name: string, isSymlink: boolean, resolvedName: string | null }>} */
function readAgentsSkillEntries() {
    if (!existsSync(AGENTS_SKILLS_DIR)) {
        return [];
    }

    return readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true }).map((entry) => {
        if (!entry.isSymbolicLink()) {
            return { name: entry.name, isSymlink: false, resolvedName: null };
        }

        const linkPath = join(AGENTS_SKILLS_DIR, entry.name);

        try {
            const target = realpathSync(linkPath);
            const targetIsDirectory = statSync(target).isDirectory();

            return {
                name: entry.name,
                isSymlink: true,
                resolvedName: resolveSkillSymlinkTarget(target, targetIsDirectory, CLAUDE_SKILLS_DIR),
            };
        } catch {
            return { name: entry.name, isSymlink: true, resolvedName: null };
        }
    });
}

/** @returns {string[]} Directory names under `.claude/skills/` (dotfiles like `.DS_Store` excluded). */
function readClaudeSkillDirNames() {
    return readdirSync(CLAUDE_SKILLS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => entry.name)
        .sort();
}

/** @returns {string[]} All failure messages (empty when config is in sync). */
function runAllChecks() {
    if (!existsSync(CLAUDE_SKILLS_DIR)) {
        return ['.claude/skills directory is missing'];
    }

    if (!existsSync(AGENTS_SKILLS_DIR)) {
        return ['.agents/skills directory is missing'];
    }

    return findSkillsSymlinkFailures(readAgentsSkillEntries(), readClaudeSkillDirNames());
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

    console.log('Agent config OK (.agents/skills symlinks match .claude/skills).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
