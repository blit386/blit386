/** Maintainer dogfood configs, Cursor's hand-maintained hooks, and the Claude hook wiring. Part of `agents:check`. */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { readFileIfExists, realpathSyncIfExists } from './fs.mjs';
import { isPathIgnoredByGit, PROJECT_MCP_SERVER_NAME, PROJECT_MCP_SERVER_URL } from './mcp.mjs';

/**
 * Hook directories whose kit symlinks are maintained by hand, so no sync script byte-checks them:
 * every `*.cjs` here must be a working symlink into `packages/kit/content/hooks/`. The generated
 * agents' hook dirs are not listed: `sync:maintainer-agents:check` already compares every symlink
 * it plans there. `.cursor/hooks/format-and-check.sh` is the repo's own script, not a kit link.
 */
const HAND_MAINTAINED_HOOK_DIRS = ['.cursor/hooks'];

/**
 * One dogfood config file's structural contract. Byte drift is
 * `sync-maintainer-agents.mjs --check`; this only asserts shape.
 * `format` defaults to `'json'`.
 *
 * `wholeLines` matches `text` as complete lines, so a commented-out copy cannot satisfy it; CRLF is normalized first.
 *
 * @typedef {{ text: string, missing: string, wholeLines?: boolean }} MaintainerNeedle
 * @typedef {{
 *   path: string,
 *   format?: 'json' | 'raw',
 *   mcp?: { container: 'mcpServers' | 'mcp', urlKey: 'url' | 'httpUrl' | 'serverUrl', type?: string, forbidKeys?: string[], forbidReason?: string },
 *   needles?: MaintainerNeedle[],
 *   requireAll?: { texts: string[], missing: string },
 *   bashDeny?: string,
 *   forbidSymlink?: boolean,
 * }} MaintainerConfigSpec
 */

/** @type {readonly MaintainerConfigSpec[]} */
export const MAINTAINER_CONFIG_SPECS = [
    {
        path: '.agents/mcp_config.json',
        mcp: { container: 'mcpServers', urlKey: 'serverUrl', forbidKeys: ['url', 'httpUrl'] },
    },
    {
        // Cursor's own remote-server schema, which is not Claude's: a `type` field marks a *local stdio*
        // server there, so a remote HTTP entry must omit it (see `MCP_SERVER_ENTRY` in
        // `packages/kit/src/adapters/shared.ts`). That is why this file cannot be a symlink to the root
        // `.mcp.json`, which requires `"type": "http"` for Claude Code.
        path: '.cursor/mcp.json',
        mcp: {
            container: 'mcpServers',
            urlKey: 'url',
            forbidKeys: ['type'],
            forbidReason: 'Cursor reserves it for local stdio servers',
        },
    },
    {
        path: '.cursor/hooks.json',
        needles: [{ text: 'shell-safety.cjs', missing: '.cursor/hooks.json does not wire shell-safety.cjs' }],
    },
    {
        path: '.agents/hooks.json',
        needles: [
            {
                text: 'antigravity-guard.cjs',
                missing: '.agents/hooks.json does not wire antigravity-guard.cjs',
            },
        ],
    },
    {
        path: '.codex/config.toml',
        format: 'raw',
        needles: [
            {
                // One needle so a different url under the header plus the pinned line in a comment cannot pass.
                wholeLines: true,
                text: `[mcp_servers.${PROJECT_MCP_SERVER_NAME}]\nurl = "${PROJECT_MCP_SERVER_URL}"`,
                missing: `.codex/config.toml does not pin url = ${JSON.stringify(PROJECT_MCP_SERVER_URL)} directly under [mcp_servers.${PROJECT_MCP_SERVER_NAME}]`,
            },
        ],
    },
    {
        path: '.codex/hooks.json',
        needles: [{ text: 'codex-guard.cjs', missing: '.codex/hooks.json does not wire codex-guard.cjs' }],
    },
    {
        path: '.gemini/settings.json',
        mcp: { container: 'mcpServers', urlKey: 'httpUrl', forbidKeys: ['url'] },
        needles: [{ text: 'shell-guard.cjs', missing: '.gemini/settings.json does not wire shell-guard.cjs' }],
    },
    {
        path: '.github/hooks/blit.json',
        needles: [{ text: 'copilot-hook.cjs', missing: '.github/hooks/blit.json does not wire copilot-hook.cjs' }],
        requireAll: {
            texts: ['"bash"', '"powershell"'],
            missing: '.github/hooks/blit.json must declare both bash and powershell commands',
        },
    },
    {
        path: 'opencode.json',
        mcp: { container: 'mcp', urlKey: 'url', type: 'remote' },
        bashDeny: 'git reset *--hard*',
    },
    {
        path: '.opencode/plugins/kit-guard.ts',
        format: 'raw',
        forbidSymlink: true,
        needles: [
            {
                text: 'pnpm install',
                missing: '.opencode/plugins/kit-guard.ts does not contain the rendered `pnpm install` command',
            },
        ],
    },
];

/**
 * Structural failures for one maintainer config file against its {@link MaintainerConfigSpec}.
 *
 * @param {MaintainerConfigSpec} spec
 * @param {string | null} content File contents, or `null` when missing.
 * @param {{ isSymlink?: boolean | null }} [disk] Optional on-disk facts (symlink bit for kit-guard).
 * @returns {string[]}
 */
export function findMaintainerConfigFailures(spec, content, disk = {}) {
    if (content === null) {
        return [`${spec.path} is missing`];
    }

    /** @type {string[]} */
    const failures = [];

    if (spec.forbidSymlink === true && disk.isSymlink === true) {
        failures.push(`${spec.path} must be a regular file (the adapter renders {{pmInstall}} into it)`);
    }

    if (spec.format !== 'raw') {
        /** @type {Record<string, unknown>} */
        let parsed;

        try {
            parsed = JSON.parse(content);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);

            return [`${spec.path} is not parseable as JSON: ${detail}`];
        }

        if (spec.mcp) {
            const container = parsed?.[spec.mcp.container];

            if (container === null || typeof container !== 'object') {
                failures.push(`${spec.path} has no ${spec.mcp.container} object`);

                return failures;
            }

            if (!Object.hasOwn(container, PROJECT_MCP_SERVER_NAME)) {
                failures.push(`${spec.path} does not declare the \`${PROJECT_MCP_SERVER_NAME}\` server`);

                return failures;
            }

            const server = /** @type {Record<string, unknown>} */ (container[PROJECT_MCP_SERVER_NAME] ?? {});
            const urlValue = server[spec.mcp.urlKey];

            if (urlValue !== PROJECT_MCP_SERVER_URL) {
                failures.push(
                    `${spec.path} declares ${spec.mcp.urlKey} ${JSON.stringify(urlValue)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
                );
            }

            if (spec.mcp.type !== undefined && server.type !== spec.mcp.type) {
                failures.push(
                    `${spec.path} entry \`${PROJECT_MCP_SERVER_NAME}\` has type ${JSON.stringify(server.type)}, expected ${JSON.stringify(spec.mcp.type)}`,
                );
            }

            for (const key of spec.mcp.forbidKeys ?? []) {
                if (Object.hasOwn(server, key)) {
                    failures.push(
                        `${spec.path} must use \`${spec.mcp.urlKey}\` for a remote server (forbids \`${key}\`${spec.mcp.forbidReason ? `: ${spec.mcp.forbidReason}` : ''})`,
                    );
                }
            }
        }

        if (spec.bashDeny !== undefined) {
            const bash = /** @type {Record<string, unknown> | undefined} */ (parsed?.permission?.bash);

            if (bash?.[spec.bashDeny] !== 'deny') {
                failures.push(`${spec.path} permission.bash does not deny \`${spec.bashDeny}\``);
            }
        }
    }

    for (const needle of spec.needles ?? []) {
        const found = needle.wholeLines
            ? `\n${content.replaceAll('\r\n', '\n')}\n`.includes(`\n${needle.text}\n`)
            : content.includes(needle.text);

        if (!found) {
            failures.push(needle.missing);
        }
    }

    if (spec.requireAll?.texts.some((text) => !content.includes(text))) {
        failures.push(spec.requireAll.missing);
    }

    return failures;
}

/**
 * Verifies each hand-maintained hook script is a working symlink into `packages/kit/content/hooks/<same-name>`.
 *
 * @param {Array<{ path: string, isSymlink: boolean, resolvedBasename: string | null }>} entries
 * @returns {string[]}
 */
export function findMaintainerHookSymlinkFailures(entries) {
    const failures = [];

    for (const entry of entries) {
        if (!entry.isSymlink) {
            failures.push(`${entry.path} is not a symlink`);
            continue;
        }

        if (entry.resolvedBasename === null) {
            failures.push(`${entry.path} is a broken symlink or does not resolve under packages/kit/content/hooks/`);
            continue;
        }

        const expectedBasename = basename(entry.path);

        if (entry.resolvedBasename !== expectedBasename) {
            failures.push(
                `${entry.path} resolves to ${entry.resolvedBasename}, expected packages/kit/content/hooks/${expectedBasename}`,
            );
        }
    }

    return failures.sort();
}

/**
 * @param {string} root Absolute repo root.
 * @param {string} kitHooksDir Absolute path to `packages/kit/content/hooks`.
 * @param {string} relPath Project-relative hook script path.
 * @returns {{ path: string, isSymlink: boolean, resolvedBasename: string | null }}
 */
function readMaintainerHookSymlinkEntry(root, kitHooksDir, relPath) {
    const abs = join(root, relPath);

    if (!lstatSync(abs).isSymbolicLink()) {
        return { path: relPath, isSymlink: false, resolvedBasename: null };
    }

    try {
        const target = realpathSync(abs);

        if (dirname(target) !== kitHooksDir) {
            return { path: relPath, isSymlink: true, resolvedBasename: null };
        }

        return { path: relPath, isSymlink: true, resolvedBasename: basename(target) };
    } catch {
        // lstat succeeded above, so a realpath failure means a dangling link.
        return { path: relPath, isSymlink: true, resolvedBasename: null };
    }
}

/**
 * Structural checks for the maintainer dogfood configs. Byte drift against the kit
 * adapters is `scripts/sync-maintainer-agents.mjs --check`. Returns unprefixed
 * messages; the caller tags them with {@link collect}.
 *
 * @param {string} root Absolute repo root.
 * @returns {string[]}
 */
export function checkMaintainerAgentConfigs(root) {
    // Resolved once: link targets come from realpathSync, so a symlinked root (macOS /tmp) must not skew the compare.
    const kitHooksDir = realpathSyncIfExists(join(root, 'packages', 'kit', 'content', 'hooks'));
    /** @type {string[]} */
    const failures = [];

    if (isPathIgnoredByGit(root, '.codex/hooks.json') === true) {
        failures.push(
            '.codex/hooks.json is ignored by git - check .gitignore for a rule matching it after the `!.codex/hooks.json` negation',
        );
    }

    for (const spec of MAINTAINER_CONFIG_SPECS) {
        const abs = join(root, spec.path);
        const content = readFileIfExists(abs);
        /** @type {{ isSymlink?: boolean | null }} */
        const disk = {};

        if (spec.forbidSymlink === true && existsSync(abs)) {
            disk.isSymlink = lstatSync(abs).isSymbolicLink();
        }

        failures.push(...findMaintainerConfigFailures(spec, content, disk));
    }

    const hookEntries = listHandMaintainedHookScriptPaths(root).map((relPath) =>
        readMaintainerHookSymlinkEntry(root, kitHooksDir, relPath),
    );

    failures.push(...findMaintainerHookSymlinkFailures(hookEntries));

    return failures;
}

/**
 * Project-relative `*.cjs` paths currently under {@link HAND_MAINTAINED_HOOK_DIRS}.
 *
 * @param {string} root Absolute repo root.
 * @returns {string[]}
 */
function listHandMaintainedHookScriptPaths(root) {
    /** @type {string[]} */
    const paths = [];

    for (const dir of HAND_MAINTAINED_HOOK_DIRS) {
        const absDir = join(root, dir);

        if (!existsSync(absDir)) {
            continue;
        }

        for (const name of readdirSync(absDir)) {
            if (name.endsWith('.cjs')) {
                paths.push(`${dir}/${name}`);
            }
        }
    }

    return paths.sort();
}

/**
 * Runs the command `.claude/settings.json` wires for `Edit|MultiEdit|Write` against a real-shaped
 * `.env` payload (`tool_input.file_path`) and expects the block exit code 2, so a payload-shape
 * regression in that hook fails CI.
 *
 * @param {string} root Repo root.
 * @returns {string[]} Failure messages.
 */
export function checkClaudeProtectFilesHook(root) {
    const content = readFileIfExists(join(root, '.claude', 'settings.json'));

    if (content === null) {
        return ['.claude/settings.json is missing'];
    }

    let commands;

    try {
        commands = (JSON.parse(content).hooks?.PreToolUse ?? [])
            .filter((entry) => entry.matcher === 'Edit|MultiEdit|Write')
            .flatMap((entry) => entry.hooks ?? [])
            .map((hook) => hook.command)
            .filter((command) => typeof command === 'string');
    } catch (error) {
        return [`.claude/settings.json is not parseable as JSON: ${error instanceof Error ? error.message : error}`];
    }

    if (commands.length === 0) {
        return ['.claude/settings.json has no PreToolUse command for Edit|MultiEdit|Write'];
    }

    const payload = JSON.stringify({ tool_name: 'Write', tool_input: { file_path: join(root, '.env'), content: 'x' } });
    const statuses = commands.map(
        (command) =>
            spawnSync('sh', ['-c', command], {
                input: payload,
                encoding: 'utf8',
                env: { ...process.env, CLAUDE_PROJECT_DIR: root },
                timeout: 10_000,
            }).status,
    );

    // Claude Code blocks the edit when any wired hook exits 2, so one blocker is enough.
    return statuses.includes(2)
        ? []
        : [
              `.claude/settings.json Edit|MultiEdit|Write hooks exited ${statuses.map((status) => status ?? 'by timeout').join(', ')} for a .env payload, expected one to exit 2`,
          ];
}

/**
 * Runs the commands `.claude/settings.json` wires for `Bash` against a real-shaped hard-reset
 * payload and expects the block exit code 2. The guard is the kit's `shell-safety.cjs`, run in
 * place (BT-646), so a kit refactor that moves it - or breaks its payload handling - fails CI
 * instead of silently turning the repo's shell guard off.
 *
 * @param {string} root Repo root.
 * @returns {string[]} Failure messages.
 */
export function checkClaudeShellSafetyHook(root) {
    const content = readFileIfExists(join(root, '.claude', 'settings.json'));

    if (content === null) {
        return ['.claude/settings.json is missing'];
    }

    let commands;

    try {
        commands = (JSON.parse(content).hooks?.PreToolUse ?? [])
            .filter((entry) => entry.matcher === 'Bash')
            .flatMap((entry) => entry.hooks ?? [])
            .map((hook) => hook.command)
            .filter((command) => typeof command === 'string');
    } catch (error) {
        return [`.claude/settings.json is not parseable as JSON: ${error instanceof Error ? error.message : error}`];
    }

    if (commands.length === 0) {
        return ['.claude/settings.json has no PreToolUse command for Bash'];
    }

    const payload = JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git reset --hard' },
    });
    const statuses = commands.map(
        (command) =>
            spawnSync('sh', ['-c', command], {
                input: payload,
                encoding: 'utf8',
                env: { ...process.env, CLAUDE_PROJECT_DIR: root },
                timeout: 10_000,
            }).status,
    );

    // Claude Code blocks the call when any wired hook exits 2; the rtk rewrite hook beside the guard never does.
    return statuses.includes(2)
        ? []
        : [
              `.claude/settings.json Bash hooks exited ${statuses.map((status) => status ?? 'by timeout').join(', ')} for a hard-reset payload, expected one to exit 2`,
          ];
}

/** Config files whose hook commands name repo scripts: Claude's via `$CLAUDE_PROJECT_DIR/`, Cursor's root-relative. */
export const HOOK_COMMAND_CONFIGS = ['.claude/settings.json', '.cursor/hooks.json'];
const CLAUDE_PROJECT_DIR_PATTERN = /\$\{?CLAUDE_PROJECT_DIR\}?\//gu;
const HOOK_SCRIPT_PATTERN = /\.(?:[cm]?js|sh)$/u;

/** @param {unknown} value @returns {string[]} Every string under a `command` key, at any depth. */
function hookCommands(value) {
    if (Array.isArray(value)) {
        return value.flatMap(hookCommands);
    }

    if (value === null || typeof value !== 'object') {
        return [];
    }

    return Object.entries(value).flatMap(([key, child]) =>
        key === 'command' && typeof child === 'string' ? [child] : hookCommands(child),
    );
}

/**
 * Script paths a hook config's commands run that do not exist, so a kit rename cannot leave a hook
 * pointing at nothing (Cursor runs a missing file without exiting 2, which fails open).
 *
 * @param {string} configPath Repo-relative config path, for messages.
 * @param {string | null} content Config contents, or `null` when missing (reported elsewhere).
 * @param {(relPath: string) => boolean} exists Whether a repo-relative path exists.
 * @returns {string[]}
 */
export function findHookScriptPathFailures(configPath, content, exists) {
    if (content === null) {
        return [];
    }

    let commands;

    try {
        commands = hookCommands(JSON.parse(content));
    } catch (error) {
        return [`${configPath} is not parseable as JSON: ${error instanceof Error ? error.message : error}`];
    }

    return commands
        .flatMap((command) => command.replace(CLAUDE_PROJECT_DIR_PATTERN, '').split(/\s+/u))
        .map((token) => token.replaceAll(/["']/gu, ''))
        .filter((token) => token.includes('/') && HOOK_SCRIPT_PATTERN.test(token) && !exists(token))
        .map((path) => `${configPath} runs ${path}, which does not exist`);
}
