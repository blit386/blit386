/**
 * Finding the kit's package root – the only place either answer is implemented.
 *
 * There are two of them because there are two genuinely different questions, and code that asks the
 * wrong one is silently wrong rather than broken:
 *
 *   - `kitRoot()` – "the kit containing me". For code that ships inside the kit and must find
 *     itself: the `blit` CLI running from a generated game's `node_modules`, and the kit's own
 *     `package.json` readers in `./env`. Node resolution would be wrong here, because a hoisted
 *     sibling copy could answer instead of the kit actually executing.
 *
 *   - `resolveKitRoot(fromUrl)` – "the kit this package depends on". For code outside the kit acting
 *     on the kit npm installed beside it: `create-blit386`, which copies that kit's `content/` into
 *     a new game and pins its version in the generated `package.json`. Bundle-relative would be
 *     wrong here, because if `@blit386/kit` were ever inlined into the caller's bundle it would
 *     quietly return the caller's own root.
 *
 * Both are re-exported through `./adapters`, the kit's only published subpath.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * This package's npm name.
 *
 * Load-bearing twice over: the marker `findKitRootFrom` walks up looking for, and the specifier
 * `resolveKitRoot` hands to Node resolution. One constant so the two can never disagree.
 */
export const KIT_PACKAGE_NAME = '@blit386/kit';

/**
 * Walk up from `startFile` to the nearest directory holding a `package.json` named `@blit386/kit`.
 *
 * Deliberately not `new URL('../package.json', import.meta.url)`: that assumes the emitted file sits
 * exactly one level below the package root, which holds for `dist/adapters.js` and `dist/cli.js` but
 * not for `dist/migrations/registry.js` – and tsup folds this module into whichever entries import
 * it. A wrong nesting level would return `dist/` and read a package.json that is not there, so the
 * walk looks for the kit by name instead and throws when it runs out of parents.
 *
 * @param startFile – Absolute path of the module doing the asking.
 * @returns Absolute path of the kit package root.
 * @throws If no `@blit386/kit` package.json is found on the way up.
 */
function findKitRootFrom(startFile: string): string {
    let dir = dirname(startFile);

    for (;;) {
        const candidate = join(dir, 'package.json');

        if (existsSync(candidate)) {
            try {
                const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: unknown };

                if (pkg.name === KIT_PACKAGE_NAME) {
                    return dir;
                }
            } catch {
                // An unreadable or malformed package.json belongs to somebody else; keep walking.
            }
        }

        const parent = dirname(dir);

        if (parent === dir) {
            throw new Error(
                `kitRoot(): no ${KIT_PACKAGE_NAME} package.json above ${startFile} – this module was ` +
                    'bundled into another package. Callers outside the kit want resolveKitRoot(import.meta.url).',
            );
        }

        dir = parent;
    }
}

/** Memoized answer for `kitRoot()` – the walk cannot change within a process. */
let selfRoot: string | undefined;

/**
 * The package root of the kit containing this module (the folder with its package.json and `content/`).
 *
 * @returns Absolute path of the kit package root.
 */
export function kitRoot(): string {
    selfRoot ??= findKitRootFrom(fileURLToPath(import.meta.url));

    return selfRoot;
}

/**
 * The package root of the kit that `fromUrl`'s package depends on, via Node resolution.
 *
 * Pass `import.meta.url`. Because resolution starts from the caller, the answer is the same kit any
 * `import … from '@blit386/kit/adapters'` in that same file already loaded – so a caller's content
 * root cannot disagree with the adapters module it is calling into.
 *
 * @param fromUrl – The calling module's URL (`import.meta.url`).
 * @returns Absolute path of the resolved kit package root.
 * @throws `MODULE_NOT_FOUND` if the caller has no resolvable `@blit386/kit` dependency.
 */
export function resolveKitRoot(fromUrl: string | URL): string {
    return dirname(createRequire(fromUrl).resolve(`${KIT_PACKAGE_NAME}/package.json`));
}
