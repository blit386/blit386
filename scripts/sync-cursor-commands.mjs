#!/usr/bin/env node
/**
 * Generate Cursor slash-command equivalents of the `.claude/skills/*` skills.
 *
 * Cursor has no notion of a Claude Code skill, but it does support project
 * commands: any `.cursor/commands/<name>.md` becomes a `/<name>` slash
 * command. This script mirrors every `.claude/skills/<name>/SKILL.md` into
 * `.cursor/commands/<name>.md`, stripping the YAML frontmatter (Claude reads
 * `name`/`description` from it to discover and trigger the skill; a Cursor
 * command is invoked by filename, so the frontmatter would otherwise render
 * as literal text). This is not the kit's transform: `@blit386/kit`'s
 * `generateCursorAdapter` keeps frontmatter on the `.cursor/skills/*` it scaffolds, and the
 * kit's own private `stripFrontmatter` only trims `.claude/rules/` bodies. It is a separate copy
 * on purpose - importing it would make this build-free pre-commit script depend on `packages/kit/dist`.
 * Any `../`-prefixed link target is also
 * re-relativized: `.cursor/commands/` sits one directory level shallower than
 * `.claude/skills/<name>/`, so a straight copy of a link like
 * `../../../docs/security/security-runbook.md` would point one level above
 * the repo root.
 *
 * This script is the single owner of `.cursor/commands/*.md`. It also
 * removes any command file that no longer has a matching skill, so a
 * retired skill cannot leave a stale command behind.
 *
 * Usage:
 *   node scripts/sync-cursor-commands.mjs            # write commands (local + pre-commit)
 *   node scripts/sync-cursor-commands.mjs --check    # report drift, write nothing, exit 1 (CI)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportSyncDrift } from './lib/report-sync-drift.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Repo-relative directory holding the `.claude/skills/<name>/SKILL.md` sources. */
const SKILLS_DIR_REL = '.claude/skills';

/** Repo-relative directory a `.cursor/commands/<name>.md` file lives in (used for link re-relativizing). */
const COMMANDS_DIR_REL = '.cursor/commands';

/** @param {string} root Absolute repo root. */
const skillsDir = (root) => join(root, SKILLS_DIR_REL);

/** @param {string} root Absolute repo root. */
const commandsDir = (root) => join(root, COMMANDS_DIR_REL);

/** A path prefix common to every re-relativized link computation; its name is arbitrary. */
const LINK_MATH_ROOT = '/repo';

/**
 * Strips YAML frontmatter (a `---`...`---` block at the top) from a markdown file. Content without
 * frontmatter, or with an unterminated opening `---`, is returned unchanged. The opening line must be
 * exactly `---` (a bare `startsWith` check would also match ordinary Markdown that merely begins with
 * those three characters, like `---not-frontmatter`).
 *
 * @param {string} content Raw markdown content.
 * @returns {string} Content with any leading frontmatter block removed.
 */
export function stripFrontmatter(content) {
    const firstLineEnd = content.indexOf('\n');
    const firstLine = (firstLineEnd === -1 ? content : content.slice(0, firstLineEnd)).replace(/\r$/u, '');

    if (firstLine !== '---' || firstLineEnd === -1) {
        return content;
    }

    const rest = content.slice(firstLineEnd + 1);
    const closingMatch = rest.match(/^---\s*(?:\r?\n|$)/mu);
    if (!closingMatch || closingMatch.index === undefined) {
        return content;
    }

    const bodyStart = firstLineEnd + 1 + closingMatch.index + closingMatch[0].length;

    return content.slice(bodyStart).replace(/^\r?\n/u, '');
}

/**
 * Re-relativizes markdown link targets that climb above the skill's own directory (`../foo`) so they
 * still resolve once the content moves from `.claude/skills/<name>/SKILL.md` to `.cursor/commands/<name>.md`
 * - a directory one level shallower. Only targets starting with `../` are touched; closer-in targets,
 * anchors, absolute URLs, and non-link text (including code-sample text like `[![...](...)](...)`, whose
 * literal `...` target never starts with `../`) are left untouched.
 *
 * @param {string} content Markdown content (already frontmatter-stripped).
 * @param {string} skillDirRelPath Repo-relative directory the content originally lived in (`.claude/skills/<name>`).
 * @returns {string} Content with `../`-prefixed link targets re-relativized to `.cursor/commands/`.
 */
export function rewriteParentLinks(content, skillDirRelPath) {
    const sourceAbsDir = posix.join(LINK_MATH_ROOT, skillDirRelPath);
    const destAbsDir = posix.join(LINK_MATH_ROOT, COMMANDS_DIR_REL);

    return content.replace(/(\]\()(\.\.\/\S+?)(\s+["'][^"')]*["'])?(\))/gu, (_match, open, target, title, close) => {
        const resolved = posix.resolve(sourceAbsDir, target);

        return `${open}${posix.relative(destAbsDir, resolved)}${title ?? ''}${close}`;
    });
}

/**
 * Computes the `.cursor/commands/<name>.md` content this script owns for each skill.
 *
 * @param {Array<{ name: string, skillMdContent: string }>} skills One entry per `.claude/skills/<name>`.
 * @returns {Array<{ name: string, content: string }>} Desired command name/content pairs.
 */
export function buildCommandFiles(skills) {
    return skills.map(({ name, skillMdContent }) => ({
        name,
        content: rewriteParentLinks(stripFrontmatter(skillMdContent), `.claude/skills/${name}`),
    }));
}

/**
 * Finds `.cursor/commands/*.md` basenames that no longer have a matching `.claude/skills/*` directory.
 *
 * @param {string[]} existingCommandNames Basenames (no extension) of `.cursor/commands/*.md`.
 * @param {string[]} skillNames Directory names under `.claude/skills/`.
 * @returns {string[]} Sorted orphan basenames.
 */
export function findOrphanCommandNames(existingCommandNames, skillNames) {
    const skillSet = new Set(skillNames);

    return existingCommandNames.filter((name) => !skillSet.has(name)).sort();
}

/** @returns {string[]} Sorted directory names under `.claude/skills/` that contain a SKILL.md. */
export function readSkillNames(root = ROOT) {
    const dir = skillsDir(root);

    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(dir, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort();
}

/** @returns {string[]} Basenames (no extension) of `.cursor/commands/*.md` files on disk. */
export function readExistingCommandNames(root = ROOT) {
    const dir = commandsDir(root);

    if (!existsSync(dir)) {
        return [];
    }

    return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => basename(entry.name, '.md'));
}

/**
 * Mirror skills into `.cursor/commands` under `root`, or report drift in check mode.
 *
 * @param {{ isCheck: boolean, root?: string }} options
 * @returns {number} Process exit code: 1 when `isCheck` found drift, else 0.
 */
export function syncCursorCommands({ isCheck, root = ROOT }) {
    const skillNames = readSkillNames(root);
    const commandFiles = buildCommandFiles(
        skillNames.map((name) => ({
            name,
            skillMdContent: readFileSync(join(skillsDir(root), name, 'SKILL.md'), 'utf8'),
        })),
    );
    const orphanNames = findOrphanCommandNames(readExistingCommandNames(root), skillNames);
    const drifted = [];

    for (const file of commandFiles) {
        const filePath = join(commandsDir(root), `${file.name}.md`);
        const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;

        if (current === file.content) {
            continue;
        }

        drifted.push(`.cursor/commands/${file.name}.md`);

        if (!isCheck) {
            mkdirSync(commandsDir(root), { recursive: true });
            writeFileSync(filePath, file.content);
        }
    }

    for (const orphanName of orphanNames) {
        drifted.push(`.cursor/commands/${orphanName}.md (orphaned, no matching .claude/skills/${orphanName})`);

        if (!isCheck) {
            rmSync(join(commandsDir(root), `${orphanName}.md`));
        }
    }

    return reportSyncDrift({
        drifted,
        total: commandFiles.length,
        isCheck,
        noun: 'cursor command',
        syncScript: 'sync:cursor-commands',
    });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = syncCursorCommands({ isCheck: process.argv.includes('--check') });
}
