import { copyFileSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Move every page from `<distDir>/demos/` up to `distDir` and remove the folder.
 * A missing `demos/` folder (dev mode) is a no-op; any other failure, including a nested
 * subdirectory, throws so the build fails instead of shipping a half-flattened site.
 * Also rewrites asset paths in HTML files (../assets/ -> ./assets/).
 * @param {string} distDir
 */
export function flattenDemos(distDir) {
    const demosDir = join(distDir, 'demos');

    let entries;

    try {
        entries = readdirSync(demosDir, { withFileTypes: true });
    } catch (error) {
        // Only a missing demos directory is expected (dev mode); anything else fails the build.
        if (error.code === 'ENOENT') return;

        throw error;
    }

    // Demo pages are flat files. A nested directory has no defined flattened location, so fail
    // before touching anything rather than ship a half-flattened site.
    const nested = entries.filter((entry) => entry.isDirectory());

    if (nested.length > 0) {
        throw new Error(
            `flatten-demos: unexpected subdirectory in dist/demos: ${nested.map((entry) => entry.name).join(', ')}`,
        );
    }

    for (const { name: file } of entries) {
        const srcPath = join(demosDir, file);
        const destPath = join(distDir, file);

        // For HTML files, rewrite asset paths before copying.
        if (file.endsWith('.html')) {
            let content = readFileSync(srcPath, 'utf-8');

            // Every page moves from demos/<slug>.html up to the dist/ root, so any
            // `../` reference Vite emitted for the old location (hashed assets,
            // copied fonts, public-dir links like the favicon) must become `./`.
            // No legitimate `../` survives flattening, so this is safe to apply
            // wholesale rather than naming each directory.
            content = content.replace(/(\ssrc|\shref)="\.\.\//g, '$1="./');

            writeFileSync(destPath, content);
        } else {
            copyFileSync(srcPath, destPath);
        }
        unlinkSync(srcPath);
    }

    // Remove empty demos directory.
    rmSync(demosDir, { recursive: true });
}
