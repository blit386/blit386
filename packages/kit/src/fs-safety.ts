/**
 * Filesystem-safety primitives shared by every `blit` command that reads or writes project files by a
 * path recorded in `.blit/manifest.json`: symlink detection, project-root containment, and the SHA-256
 * hashing used to detect drift from a tracked file's last known content.
 *
 * A leaf module on purpose: no imports beyond node builtins, so both `commands/agents.ts` and
 * `commands/clean.ts` can depend on it without a cycle. Kept as one implementation rather than two
 * copies because a symlink-safety bug fixed in one copy and not the other is exactly the kind of drift
 * these checks exist to prevent.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

/** SHA-256 hex digest of a string. */
export function sha256Text(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}

/** SHA-256 hex digest of a file's contents. */
export function sha256(filePath: string): string {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * True if `absPath` (assumed to resolve under `root`) is reached through a symlink at any existing
 * path segment – the file itself or any of its parent directories. Checked with `lstatSync`, which
 * does not follow symlinks, so a symlink pointing outside `root` (or to a file outside it) is caught
 * even when it resolves to something that exists. A segment that does not exist yet is not a symlink
 * and is treated as safe – the caller is about to create it, not read or write through it.
 */
export function hasSymlinkedSegment(absPath: string, root: string): boolean {
    const rel = relative(root, absPath);

    if (rel === '' || rel.startsWith(`..${sep}`)) {
        return false;
    }

    let current = root;

    for (const segment of rel.split(sep)) {
        current = join(current, segment);

        let stat;

        try {
            stat = lstatSync(current);
        } catch {
            return false;
        }

        if (stat.isSymbolicLink()) {
            return true;
        }
    }

    return false;
}

/**
 * Reject manifest paths that are absolute, escape the project root via `..` segments, or are reached
 * through a symlink (the file itself or a parent directory) – lexical safety alone would still let a
 * symlink swapped in after scaffolding redirect a read or write outside the project.
 */
export function isSafeRelPath(relPath: string, root: string): boolean {
    if (isAbsolute(relPath) || normalize(relPath).startsWith(`..${sep}`)) {
        return false;
    }

    const abs = resolve(root, relPath);

    if (abs !== root && !abs.startsWith(root + sep)) {
        return false;
    }

    return !hasSymlinkedSegment(abs, root);
}
