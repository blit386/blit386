// Formats the one file an AI assistant just edited, instead of the whole project.
// Shared by the Claude Code PostToolUse hook and the Cursor afterFileEdit hook: both send a
// JSON payload on stdin that names the file (Claude: tool_input.file_path, Cursor: file_path).
// Biome formats code and JSON, Prettier formats Markdown and YAML - the same split as the
// project's `format` script. Never fails the edit: a formatter problem leaves the file as written.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');

const BIOME_EXTENSIONS = new Set(['.js', '.cjs', '.mjs', '.ts', '.json', '.jsonc']);
const PRETTIER_EXTENSIONS = new Set(['.md', '.mdx', '.mdc', '.yml', '.yaml']);

/** Absolute path of `file` when it exists inside `root`, else null. */
function insideProject(root, file) {
    const target = path.resolve(root, file);
    if (!existsSync(target)) {
        return null;
    }

    const real = realpathSync(target);

    return real.startsWith(root + path.sep) ? real : null;
}

/**
 * Runs an installed formatter through Node by the `bin` entry in its package.json, so no package
 * manager or shell is needed (and Windows needs no `.cmd` shim).
 */
function runTool(root, packageName, binName, args) {
    try {
        const packageDir = path.join(root, 'node_modules', packageName);
        const { bin } = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
        const entry = path.join(packageDir, typeof bin === 'string' ? bin : bin[binName]);

        spawnSync(process.execPath, [entry, ...args], { cwd: root, stdio: 'ignore', windowsHide: true });
    } catch {
        // The formatter is not installed in this project - leave the file as written.
    }
}

// .claude/hooks/ or .cursor/hooks/ - the project root is two levels up.
const root = realpathSync(path.resolve(__dirname, '..', '..'));

try {
    const payload = JSON.parse(readFileSync(0, 'utf8'));
    const target = insideProject(root, payload?.tool_input?.file_path ?? payload?.file_path ?? '');
    const extension = target === null ? '' : path.extname(target).toLowerCase();

    if (BIOME_EXTENSIONS.has(extension)) {
        runTool(root, '@biomejs/biome', 'biome', ['format', '--write', target]);
    } else if (PRETTIER_EXTENSIONS.has(extension)) {
        runTool(root, 'prettier', 'prettier', ['--write', target]);
    }
} catch {
    // No readable payload, or no usable file path in it - nothing to format.
}
