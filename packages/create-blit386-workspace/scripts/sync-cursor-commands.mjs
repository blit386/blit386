#!/usr/bin/env node
/**
 * Generate Cursor slash-command equivalents of the maintainer `.claude/skills/*`
 * skills (the `cbt-*` set).
 *
 * Cursor has no notion of a Claude Code skill, but it does support project
 * commands: any `.cursor/commands/<name>.md` becomes a `/<name>` slash
 * command. This script mirrors every `.claude/skills/<name>/SKILL.md` into
 * `.cursor/commands/<name>.md`, stripping the YAML frontmatter (Claude reads
 * `name`/`description` from it to discover and trigger the skill; a Cursor
 * command is invoked by filename, so the frontmatter would otherwise render
 * as literal text). This is the same transform `@blit386/kit` applies when
 * scaffolding a Cursor-flavored game - see `generateCursorAdapter` in
 * `packages/kit/src/adapters.ts`. Any `../`-prefixed link target is also
 * re-relativized: `.cursor/commands/` sits one directory level shallower than
 * `.claude/skills/<name>/`, so a straight copy of a link like
 * `../../../docs/foo.md` would point one level above the repo root.
 *
 * This script is the single owner of maintainer `.cursor/commands/*.md`. It
 * also removes any command file that no longer has a matching skill, so a
 * retired skill cannot leave a stale command behind. It does not touch the
 * kit IR that emits Cursor commands into scaffolded games.
 *
 * Usage:
 *   node scripts/sync-cursor-commands.mjs            # write commands (local)
 *   node scripts/sync-cursor-commands.mjs --check    # report drift, write nothing, exit 1 (CI)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, '.claude', 'skills');
const COMMANDS_DIR = join(ROOT, '.cursor', 'commands');

/** Repo-relative directory a `.cursor/commands/<name>.md` file lives in (used for link re-relativizing). */
const COMMANDS_DIR_REL = '.cursor/commands';

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
function readSkillNames() {
    return readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(SKILLS_DIR, entry.name, 'SKILL.md')))
        .map((entry) => entry.name)
        .sort();
}

/** @returns {string[]} Basenames (no extension) of `.cursor/commands/*.md` files on disk. */
function readExistingCommandNames() {
    if (!existsSync(COMMANDS_DIR)) {
        return [];
    }

    return readdirSync(COMMANDS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => basename(entry.name, '.md'));
}

function main() {
    const isCheck = process.argv.includes('--check');
    const skillNames = readSkillNames();
    const commandFiles = buildCommandFiles(
        skillNames.map((name) => ({
            name,
            skillMdContent: readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8'),
        })),
    );
    const orphanNames = findOrphanCommandNames(readExistingCommandNames(), skillNames);
    /** @type {string[]} */
    const updated = [];
    /** @type {string[]} */
    const removed = [];

    for (const file of commandFiles) {
        const filePath = join(COMMANDS_DIR, `${file.name}.md`);
        const current = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;

        if (current === file.content) {
            continue;
        }

        updated.push(`.cursor/commands/${file.name}.md`);

        if (!isCheck) {
            mkdirSync(COMMANDS_DIR, { recursive: true });
            writeFileSync(filePath, file.content);
        }
    }

    for (const orphanName of orphanNames) {
        removed.push(`.cursor/commands/${orphanName}.md (orphaned, no matching .claude/skills/${orphanName})`);

        if (!isCheck) {
            rmSync(join(COMMANDS_DIR, `${orphanName}.md`));
        }
    }

    const drifted = [...updated, ...removed];

    if (isCheck) {
        if (drifted.length > 0) {
            console.error(`\n${drifted.length} cursor command(s) out of date:`);

            for (const entry of drifted) {
                console.error(`  ${entry}`);
            }

            console.error('\nRun `pnpm run sync:cursor-commands` to update them.');
            process.exit(1);
        }

        console.log(`All ${commandFiles.length} cursor command(s) up to date.`);

        return;
    }

    if (drifted.length === 0) {
        console.log(`All ${commandFiles.length} cursor command(s) already up to date.`);

        return;
    }

    for (const entry of updated) {
        console.log(`updated ${entry}`);
    }

    for (const entry of removed) {
        console.log(`removed ${entry}`);
    }

    const parts = [];
    if (updated.length > 0) {
        parts.push(`${updated.length} updated`);
    }
    if (removed.length > 0) {
        parts.push(`${removed.length} removed`);
    }

    console.log(`\n${parts.join(', ')} (${commandFiles.length} skill command(s) on disk).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
