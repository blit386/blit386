/** `blit agents add <agent>`: set up one AI assistant's files in a project that did not pick it at scaffold time. */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { AGENT_ADAPTERS, generateAgentFiles, readKitVersion } from '../adapters';
import { isSafeRelPath, sha256Text } from '../fs-safety';
import { kitRoot } from '../kit-root';
import { ui } from '../messages';
import { type AgentKind, classifyFile, hasAgentFiles, isKitManaged, ZED_SETTINGS_JSON } from '../ownership';
import { readManifest } from '../read-manifest';
import { CONFIG_MERGES, zedHandMergeHint } from './agents-merge';
import { fallbackVars, writeBase, writeManifest, writeRel } from './agents-sync';

/**
 * Set up one AI assistant's files in `root`. All-or-nothing: if any generated file would collide with
 * an existing untracked user file, nothing is written except `.new` copies and the manifest is left
 * untouched (so a later `sync` cannot clobber the user files). A config path in `CONFIG_MERGES` (the MCP
 * and settings files, JSON or TOML) is the one exception: a clean merge with the user's existing file is
 * written and tracked like any other generated file instead of counting as a collision. Returns the
 * number of colliding files that need the user's attention; 0 means the assistant was set up cleanly.
 */
export function runAddAgent(root: string, agent: AgentKind, out: (line: string) => void): number {
    const result = readManifest(root, out);

    if (!result.ok) {
        return result.exitCode;
    }

    const manifest = result.manifest;
    const label = AGENT_ADAPTERS[agent].label;

    if (hasAgentFiles(manifest.files, agent)) {
        out(ui.info(`${label} is already set up in this project.`));
        out(ui.info('Run `npx blit agents sync` to update its files from the latest kit.'));
        return 0;
    }

    const kr = kitRoot();
    const vars = manifest.vars ?? fallbackVars(root);

    const entryByPath = new Map(manifest.files.map((e) => [e.path, e] as const));

    // A user-owned generated file (`.claude/launch.json`) that already exists is the user's: drop it
    // here so it is neither a collision that aborts the setup nor overwritten below. A path the
    // manifest already tracks can only be a shared one another assistant set up (the agent's own
    // paths are untracked, or `hasAgentFiles` would have stopped us above); `sync` keeps those fresh,
    // so `add` leaves them alone rather than clobbering an edited copy.
    const generated = generateAgentFiles(kr, vars, [agent]).filter(
        (file) =>
            !entryByPath.has(file.path) &&
            (classifyFile(file.path) !== 'user-owned' || !existsSync(resolve(root, file.path))),
    );

    // A generated path that already exists on disk but is not tracked in the manifest belongs to the
    // user. For a config in `CONFIG_MERGES` (the MCP and settings files), try a merge first: the kit's
    // server can usually be added next to whatever the user already registered without touching their
    // entries. Only a real conflict (same server key, different content) or an existing file the merge
    // cannot read falls through to the collision path below.
    const mergedPaths = new Set<string>();
    // `kitContent` is what the kit itself generated, before any merge with a user's file. A merged path keeps it as
    // its `.blit/base/` ancestor, not the merged text: with the merged text as the base the file would look
    // unmodified, and the next `sync` would overwrite it with the kit-only version and drop the user's entries.
    const preparedGenerated = generated.map((file) => {
        const unmerged = { ...file, kitContent: file.content };
        const merge = CONFIG_MERGES[file.path];

        if (
            merge === undefined ||
            !isSafeRelPath(file.path, root) ||
            !existsSync(resolve(root, file.path)) ||
            entryByPath.has(file.path)
        ) {
            return unmerged;
        }

        const onDisk = readFileSync(resolve(root, file.path), 'utf8');
        const mergedContent = merge(onDisk, file.content);

        if (mergedContent === null) {
            return unmerged;
        }

        mergedPaths.add(file.path);

        return { ...unmerged, content: mergedContent };
    });

    // Setting up the assistant must be all-or-nothing: if we wrote only the non-colliding files, the
    // assistant would be half-present, and a later `sync` would regenerate the colliding path, find no
    // manifest entry, and overwrite the very user file we are protecting here. So if anything still
    // collides after the merge attempt above, save the kit versions beside the originals and stop
    // without touching the project or the manifest.
    const collisions = preparedGenerated.filter(
        (file) =>
            isSafeRelPath(file.path, root) &&
            existsSync(resolve(root, file.path)) &&
            !entryByPath.has(file.path) &&
            !mergedPaths.has(file.path),
    );

    if (collisions.length > 0) {
        for (const file of collisions) {
            if (writeRel(root, `${file.path}.new`, file.content)) {
                out(ui.warn(`${file.path} already exists, so I saved the kit version as ${file.path}.new.`));

                const hint =
                    file.path === ZED_SETTINGS_JSON
                        ? zedHandMergeHint(readFileSync(resolve(root, file.path), 'utf8'), file.content)
                        : null;

                if (hint !== null) {
                    out(ui.info(hint));
                }
            } else {
                out(ui.warn(`Skipping unsafe path: ${file.path}.new`));
            }
        }

        out('');
        out(ui.info('I did not change those files or set up the assistant.'));
        out(ui.info('Move or merge the originals, then run the command again.'));

        return collisions.length;
    }

    // No collisions: every generated path is new, so writing them all and refreshing the manifest leaves
    // the set consistent for the next `sync`.
    const kitVersion = readKitVersion(kr);
    const added: string[] = [];

    // Lock in the resolved vars so future syncs regenerate deterministically (older manifests lacked them).
    if (manifest.vars === undefined) {
        manifest.vars = vars;
    }

    for (const file of preparedGenerated) {
        const relPath = file.path;

        if (!isSafeRelPath(relPath, root)) {
            out(ui.warn(`Skipping unsafe path: ${relPath}`));
            continue;
        }

        const fileClass = classifyFile(relPath);

        writeRel(root, relPath, file.content);
        if (isKitManaged(fileClass)) {
            writeBase(root, relPath, file.kitContent, out);
        }
        entryByPath.set(relPath, {
            path: relPath,
            class: fileClass,
            kitVersion,
            sha256: sha256Text(file.content),
        });
        added.push(relPath);
    }

    writeManifest(root, manifest, manifest.kitVersion, entryByPath.values());

    for (const path of added) {
        out(ui.success(mergedPaths.has(path) ? `Merged ${path}.` : `Added ${path}.`));
    }

    out('');
    if (added.length === 0) {
        out(ui.info(`There were no ${label} files to add.`));
        return 0;
    }

    out(ui.success(`Set up ${label}.`));
    out(ui.info('Run `npx blit agents sync` later to keep these files up to date.'));

    return 0;
}
