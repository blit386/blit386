#!/usr/bin/env node
/**
 * Builds `docs/reference-deprecations.md` – the deprecation timeline – from `@blit386/kit`'s
 * migration registry (`packages/kit/src/migrations/registry.ts`, built to
 * `packages/kit/dist/migrations/registry.js`).
 *
 * The registry is the single source of truth (see its own top-of-file comment): each `Migration`
 * mirrors one dated section of this doc, and each `Rename`'s optional `section` /
 * `removalTarget` / `receiverClasses` fields (see `packages/kit/src/migrations/types.ts`) drive
 * how it renders here. A migration with no renames carrying a `section` (an `importPath`-only
 * rename, or an empty `renames` array) is naturally excluded – no special-casing by migration id
 * or rename kind.
 *
 * Usage:
 *   node scripts/gen-deprecations.mjs            # write docs/reference-deprecations.md
 *   node scripts/gen-deprecations.mjs --check    # report drift, write nothing, exit 1
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildKitBuildCommand, isKitBuilt } from '../../../scripts/ensure-kit-built.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = join(ROOT, 'docs');
const OUTPUT_FILE = join(DOCS_DIR, 'reference-deprecations.md');
const KIT_REGISTRY_URL = new URL('../../kit/dist/migrations/registry.js', import.meta.url);

/** "Generated, do not edit" header note, matching `sync-docs-from-engine.mjs`'s wording style. */
export const GENERATED_HEADER = `<!-- generated:start -->

<!-- prettier-ignore -->
> [!NOTE]
> This file is generated. Never hand-edit it: edit \`packages/kit/src/migrations/registry.ts\` and
> run \`pnpm run api:deprecations\` to regenerate it. \`pnpm run api:deprecations:check\` fails when
> this file drifts from the registry.

<!-- generated:end -->`;

const BANNER = `<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/reference/deprecations, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->`;

const INTRO =
    'Central tracker for public API compatibility aliases and planned removals.\n\n' +
    'Use this file as the single source of truth when pruning old names.';

const REMOVAL_CHECKLIST = `### Removal checklist

- Search for \`@deprecated Deprecated since\` in \`src/\` (every public alias uses that versioned form).
- Remove aliases only after confirming downstream demos/apps have migrated.

<Callout title="Public aliases only">

This tracker lists public compatibility aliases only. Internal deprecated helpers that used to live beside overlay
layout functions and \`RenderPaletteUsage\` re-exports were removed rather than carried forward – search \`@deprecated\` in
\`src/\` for anything that remains outside this list.

</Callout>`;

const SEE_ALSO = `## See also

<Cards>
  <Card title="API: Core" href="/docs/api/core">Current BT getters and HardwareSettings fields.</Card>
  <Card title="Input Guide" href="/docs/guides/input">Current input API names.</Card>
  <Card title="Overlay Guide" href="/docs/guides/overlay">Current overlay configure flags.</Card>
  <Card title="Developer Experience" href="https://github.com/blit386/blit386/blob/main/docs/developer-experience-guide.md">Boolean naming and migration policy.</Card>
</Cards>`;

/**
 * Renders one rename as one or more arrow bullets (`- \`from\` → \`to\``), expanding
 * `receiverClasses` into one class-qualified bullet per entry, in array order.
 *
 * @param {import('../../kit/src/migrations/types.ts').Rename} rename – Rename to render.
 * @returns {string[]} One or more markdown bullet lines.
 */
export function renderRenameBullets(rename) {
    if (rename.kind === 'objectKey') {
        return [`- \`${rename.from}\` → \`${rename.to}\``];
    }

    if (rename.kind === 'memberCall' && rename.receiver) {
        return [`- \`${rename.receiver}.${rename.from}()\` → \`${rename.receiver}.${rename.to}()\``];
    }

    if (rename.kind === 'method' && rename.receiverClasses && rename.receiverClasses.length > 0) {
        return rename.receiverClasses.map((cls) => `- \`${cls}.${rename.from}()\` → \`${cls}.${rename.to}()\``);
    }

    return [`- \`${rename.from}\` → \`${rename.to}\``];
}

/**
 * Groups one migration's renames by their `section` field, preserving first-seen order. Renames
 * with no `section` (an `importPath`-only rename's sole entry) are skipped rather than special-
 * cased by kind.
 *
 * @param {import('../../kit/src/migrations/types.ts').Migration} migration – Migration to group.
 * @returns {Array<{ section: string, removalTarget: string | undefined, bullets: string[] }>}
 *   One entry per group, in encounter order. Empty when the migration has no sectioned renames.
 */
export function groupMigrationSections(migration) {
    const groups = [];
    const bySection = new Map();

    for (const rename of migration.renames) {
        if (!rename.section) {
            continue;
        }

        let group = bySection.get(rename.section);

        if (!group) {
            group = { section: rename.section, removalTarget: rename.removalTarget, bullets: [] };
            bySection.set(rename.section, group);
            groups.push(group);
        }

        group.bullets.push(...renderRenameBullets(rename));
    }

    return groups;
}

/**
 * Renders one migration's `## <date> – compatibility aliases added` block, or `null` when it has
 * no sectioned renames (excluded from the doc entirely, matching the current hand-written file's
 * omission of `importPath`-only and empty-`renames` migrations).
 *
 * @param {import('../../kit/src/migrations/types.ts').Migration} migration – Migration to render.
 * @returns {string | null} Rendered markdown block, or `null` if excluded.
 */
export function renderMigrationBlock(migration) {
    const groups = groupMigrationSections(migration);

    if (groups.length === 0) {
        return null;
    }

    const sections = groups.map((group) => {
        const removalLine = group.removalTarget ? `Removal target: ${group.removalTarget}\n\n` : '';

        return `### ${group.section}\n\n${removalLine}${group.bullets.join('\n')}`;
    });

    return (
        `## ${migration.date} – compatibility aliases added\n\n` +
        'These aliases were introduced to preserve backward compatibility after the API naming refactor.\n\n' +
        sections.join('\n\n')
    );
}

/**
 * Renders the full `docs/reference-deprecations.md` contents from the migration registry.
 *
 * @param {readonly import('../../kit/src/migrations/types.ts').Migration[]} migrations – Migrations, oldest first.
 * @returns {string} Full markdown document, `\n`-terminated.
 */
export function renderDeprecationsMarkdown(migrations) {
    const migrationBlocks = migrations.map(renderMigrationBlock).filter((block) => block !== null);

    const parts = [
        '# Deprecation Timeline',
        GENERATED_HEADER,
        BANNER,
        INTRO,
        ...migrationBlocks,
        REMOVAL_CHECKLIST,
        SEE_ALSO,
    ];

    return `${parts.join('\n\n')}\n`;
}

/**
 * Parses CLI flags into a plain options object. Pure (no `process` access) so it is unit
 * testable without spawning the script.
 *
 * @param {string[]} argv – `process.argv.slice(2)`-style argument list.
 * @returns {{ isCheck: boolean }} Parsed CLI options.
 */
export function parseCliArgs(argv) {
    return { isCheck: argv.includes('--check') };
}

/**
 * Path relative to the repo root, for readable console output.
 *
 * @param {string} filePath – Absolute file path.
 * @returns {string} Repo-relative path.
 */
function relativeToRoot(filePath) {
    return filePath.startsWith(ROOT) ? filePath.slice(ROOT.length + 1) : filePath;
}

/**
 * Runs `--check`: regenerates the doc in memory and diffs it against the committed
 * `docs/reference-deprecations.md`, exiting non-zero on drift. Mirrors `gen-api-history.mjs --check`.
 *
 * @param {string} desiredMarkdown – Freshly generated markdown (already `\n`-terminated).
 */
function runCheck(desiredMarkdown) {
    const relativeOutput = relativeToRoot(OUTPUT_FILE);
    const current = existsSync(OUTPUT_FILE) ? readFileSync(OUTPUT_FILE, 'utf8') : null;

    if (current === desiredMarkdown) {
        console.log(`${relativeOutput} is up to date.`);

        return;
    }

    console.error(`${relativeOutput} is out of date.`);
    console.error('Run `pnpm run api:deprecations` to regenerate it.');
    process.exit(1);
}

/** Builds the kit if `packages/kit/dist/migrations/registry.js` is missing, then re-verifies it. */
function ensureKitBuilt() {
    if (isKitBuilt()) {
        return;
    }

    const { command, args, cwd } = buildKitBuildCommand();
    const result = spawnSync(command, args, { stdio: 'inherit', cwd });

    if (result.status !== 0 || !isKitBuilt()) {
        console.error('Could not build @blit386/kit; packages/kit/dist/migrations/registry.js is still missing.');
        process.exit(result.status || 1);
    }
}

/** CLI entry point. */
async function main() {
    const { isCheck } = parseCliArgs(process.argv.slice(2));

    ensureKitBuilt();

    const { MIGRATIONS } = await import(KIT_REGISTRY_URL);
    const markdown = renderDeprecationsMarkdown(MIGRATIONS);

    if (isCheck) {
        runCheck(markdown);

        return;
    }

    writeFileSync(OUTPUT_FILE, markdown);
    console.log(`Wrote ${relativeToRoot(OUTPUT_FILE)}.`);
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    await main();
}
