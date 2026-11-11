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
 *     are wired, and git does not ignore `.codex/hooks.json`. Missing scripts,
 *     hook symlinks and byte drift are `sync:maintainer-agents:check`.
 *   - Cursor's hand-maintained hooks: `.cursor/hooks.json` wires
 *     `shell-safety.cjs`, and every `.cursor/hooks/*.cjs` is a working symlink
 *     into `packages/kit/content/hooks/`.
 *   - Every script a hook command in `.claude/settings.json` or
 *     `.cursor/hooks.json` runs exists.
 *
 * Repo root and every package that carries an AGENTS.md or CLAUDE.md:
 *   - AGENTS.md still points at an existing CLAUDE.md.
 *
 * This is read-only - unlike `sync-doc-banners.mjs` it never writes fixes,
 * it only reports drift for a human to resolve. The checks live by surface in
 * `scripts/lib/agent-config/` (`skills`, `mcp`, `maintainer`); this file runs them.
 *
 * Usage:
 *   node scripts/check-agent-config.mjs
 */
import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFileIfExists } from './lib/agent-config/fs.mjs';
import {
    checkClaudeProtectFilesHook,
    checkClaudeShellSafetyHook,
    checkMaintainerAgentConfigs,
    findHookScriptPathFailures,
    HOOK_COMMAND_CONFIGS,
} from './lib/agent-config/maintainer.mjs';
import { findProjectMcpFailures, isRootMcpIgnoredByGit } from './lib/agent-config/mcp.mjs';
import { checkRootSkillsLayout } from './lib/agent-config/skills.mjs';

// The checks live by surface under scripts/lib/agent-config/; re-exported so this stays the one entry point.
export {
    checkClaudeProtectFilesHook,
    checkClaudeShellSafetyHook,
    checkMaintainerAgentConfigs,
    findHookScriptPathFailures,
    findMaintainerConfigFailures,
    findMaintainerHookSymlinkFailures,
    MAINTAINER_CONFIG_SPECS,
} from './lib/agent-config/maintainer.mjs';
export { findProjectMcpFailures, isPathIgnoredByGit, isRootMcpIgnoredByGit } from './lib/agent-config/mcp.mjs';
export {
    checkRootSkillsLayout,
    findSkillsSymlinkFailures,
    findZedSettingsFailures,
    resolveSkillSymlinkTarget,
} from './lib/agent-config/skills.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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

    collect(failures, '.', checkMaintainerAgentConfigs(REPO_ROOT));
    collect(failures, '.', checkClaudeProtectFilesHook(REPO_ROOT));
    collect(failures, '.', checkClaudeShellSafetyHook(REPO_ROOT));

    for (const configPath of HOOK_COMMAND_CONFIGS) {
        collect(
            failures,
            '.',
            findHookScriptPathFailures(configPath, readFileIfExists(join(REPO_ROOT, configPath)), (relPath) =>
                existsSync(join(REPO_ROOT, relPath)),
            ),
        );
    }

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
        'Agent config OK (skills symlinks, AGENTS.md <-> CLAUDE.md pointers, Copilot instructions, Zed settings, project .mcp.json, cursor rules parity, maintainer agent dogfood, cursor hooks, hook script paths).',
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
