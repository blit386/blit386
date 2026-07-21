#!/usr/bin/env node
/**
 * Verify the agent-facing config surface has not drifted:
 *
 *   - `.cursor/rules/*.mdc` <-> `.claude/rules/*.md` parity (a rule added to
 *     one side must exist on the other, by basename).
 *   - `.agents/skills/*` symlink integrity - every entry must be a working
 *     symlink into `.claude/skills/<same-name>`, and every `.claude/skills/*`
 *     directory must have a matching symlink.
 *   - AGENTS.md still points at an existing CLAUDE.md.
 *
 * This is read-only - unlike `sync-doc-banners.mjs` it never writes fixes,
 * it only reports drift for a human (or `pnpm run rules:sync`-style script)
 * to resolve.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CURSOR_RULES_DIR = join(ROOT, '.cursor', 'rules');
const CLAUDE_RULES_DIR = join(ROOT, '.claude', 'rules');
const AGENTS_SKILLS_DIR = join(ROOT, '.agents', 'skills');
const CLAUDE_SKILLS_DIR = join(ROOT, '.claude', 'skills');
const AGENTS_MD_PATH = join(ROOT, 'AGENTS.md');
const CLAUDE_MD_PATH = join(ROOT, 'CLAUDE.md');

/**
 * Verifies `.cursor/rules/*.mdc` and `.claude/rules/*.md` define the same set
 * of rule names. Mirrors are condensed summaries, not identical content, so
 * this checks basename parity rather than file contents.
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
 * @param {boolean} claudeMdExists Whether CLAUDE.md exists at the repo root.
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

/** @param {string} dir @param {string} ext @returns {string[]} Sorted basenames (extension stripped) of files matching `ext` in `dir`. */
function readRuleNames(dir, ext) {
    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name) === ext)
        .map((entry) => basename(entry.name, ext))
        .sort();
}

/** @returns {Array<{ name: string, isSymlink: boolean, resolvedName: string | null }>} */
function readAgentsSkillEntries() {
    return readdirSync(AGENTS_SKILLS_DIR, { withFileTypes: true }).map((entry) => {
        if (!entry.isSymbolicLink()) {
            return { name: entry.name, isSymlink: false, resolvedName: null };
        }

        const linkPath = join(AGENTS_SKILLS_DIR, entry.name);

        try {
            const target = realpathSync(linkPath);
            const relativeToClaudeSkills = relative(CLAUDE_SKILLS_DIR, target);
            const isInsideClaudeSkills = relativeToClaudeSkills !== '' && !relativeToClaudeSkills.startsWith('..');

            return {
                name: entry.name,
                isSymlink: true,
                resolvedName: isInsideClaudeSkills ? basename(target) : null,
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

/** @returns {string[]} All failure messages across the three checks (empty when config is in sync). */
function runAllChecks() {
    const cursorRuleNames = readRuleNames(CURSOR_RULES_DIR, '.mdc');
    const claudeRuleNames = readRuleNames(CLAUDE_RULES_DIR, '.md');
    const agentsSkillEntries = readAgentsSkillEntries();
    const claudeSkillDirNames = readClaudeSkillDirNames();
    const agentsMdContent = existsSync(AGENTS_MD_PATH) ? readFileSync(AGENTS_MD_PATH, 'utf8') : null;
    const claudeMdExists = existsSync(CLAUDE_MD_PATH);

    return [
        ...findRulesParityFailures(cursorRuleNames, claudeRuleNames),
        ...findSkillsSymlinkFailures(agentsSkillEntries, claudeSkillDirNames),
        ...findAgentsPointerFailures(agentsMdContent, claudeMdExists),
    ];
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

    console.log('Agent config OK (rules parity, skills symlinks, AGENTS.md <-> CLAUDE.md pointer).');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
