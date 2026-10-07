// Formats the one file an AI assistant just edited, instead of the whole project.
// Shared by the Claude Code PostToolUse hook, the Cursor afterFileEdit hook, and the Antigravity and
// Codex PostToolUse hooks: each sends a JSON payload on stdin that names the file (Claude:
// tool_input.file_path, Cursor: file_path, Antigravity: toolCall.args.TargetFile). Codex sends the
// raw apply_patch text in tool_input.command instead, so its files are parsed out of the patch and
// resolved against the payload's cwd (the session's working directory, not always the project root).
// GitHub Copilot's entry (copilot-hook.cjs) requires this file instead of running it, because only it knows
// which Copilot tools edit files; `formatFile` is exported for that, and the stdin handling below runs only
// when this file is the script node was started with.
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

/** Format one edited file with the tool that owns its type; anything else is left as written. */
function formatFile(root, file) {
    const target = insideProject(root, file);
    const extension = target === null ? '' : path.extname(target).toLowerCase();

    if (BIOME_EXTENSIONS.has(extension)) {
        runTool(root, '@biomejs/biome', 'biome', ['format', '--write', target]);
    } else if (PRETTIER_EXTENSIONS.has(extension)) {
        runTool(root, 'prettier', 'prettier', ['--write', target]);
    }
}

// .claude/hooks/, .cursor/hooks/, .agents/hooks/, .codex/hooks/ or .github/hooks/ - the project root is two levels up.
const root = realpathSync(path.resolve(__dirname, '..', '..'));

/** Read the edited file from the hook payload on stdin and format it. Never throws. */
function formatFromPayload() {
    try {
        const payload = JSON.parse(readFileSync(0, 'utf8'));
        const file = payload?.tool_input?.file_path ?? payload?.file_path ?? payload?.toolCall?.args?.TargetFile;

        if (typeof file === 'string') {
            formatFile(root, file);
        } else if (typeof payload?.tool_input?.command === 'string') {
            // Codex apply_patch: every Codex payload carries `cwd`, and `path.resolve` throws without it (nothing is
            // formatted). A deleted file, or the old name of a moved one, no longer exists and is skipped.
            const { patchPaths } = require('./guard-core.cjs');

            for (const patched of patchPaths(payload.tool_input.command)) {
                formatFile(root, path.resolve(payload.cwd, patched));
            }
        }
    } catch {
        // No readable payload, or no usable file path in it - nothing to format.
    }
}

if (require.main === module) {
    formatFromPayload();
}

module.exports = { formatFile: (file) => formatFile(root, file) };
