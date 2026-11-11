/** The project MCP server pin across `.mcp.json` and the website's discovery card. Part of `agents:check`. */
import { spawnSync } from 'node:child_process';

import { gitEnv } from '../git-env.mjs';

/**
 * The one MCP server the repo declares for contributors. `packages/website` both serves
 * this endpoint and publishes the discovery card, so the URL exists as two JSON copies
 * neither of which can import a constant - this file is what keeps them honest.
 *
 * The name and classification also live in `ACCEPTED_SHADOW_MCP_ENTRIES` in
 * `packages/blit386/scripts/security/mcp-preflight.mjs` (the monthly governance audit's
 * allowlist) - two files independently comparing against the same literal with no clean
 * import path between them, so keep both in sync by hand.
 */
export const PROJECT_MCP_SERVER_NAME = 'blit386-docs';

/** Claude Code's transport discriminant for a remote streamable-HTTP MCP server. */
const PROJECT_MCP_SERVER_TYPE = 'http';

/**
 * The pinned endpoint, asserted literally rather than by comparing the two JSON copies to
 * each other. Parity alone would accept a coordinated edit that aims both files at some
 * other host, and every contributor's agent queries whatever this names - with the responses
 * landing in agent context. Changing it therefore has to touch this file too, where the
 * diff reads as what it is.
 *
 * Changing the endpoint is a deliberate five-file edit: here, the root `.mcp.json`,
 * `packages/website/public/.well-known/mcp/server-card.json`, `.zed/settings.json`
 * (`context_servers`, since Zed does not read `.mcp.json`), and `ACCEPTED_SHADOW_MCP_ENTRIES` in
 * `packages/blit386/scripts/security/mcp-preflight.mjs` (the governance gate's own copy).
 */
export const PROJECT_MCP_SERVER_URL = 'https://blit386.dev/mcp';

/**
 * Whether git would ignore `relPath` if it were removed and re-added.
 *
 * Asking git is the only honest way to answer this. Matching `.gitignore` text for a `!` negation
 * looks equivalent but is not: gitignore resolves last-match-wins, so a later `*.json` or a second
 * bare rule re-ignores the file while the negation is still sitting there in the text.
 *
 * `--no-index` is what makes the question meaningful for a file that is already tracked -
 * without it git short-circuits on the index and always answers "not ignored".
 *
 * @param {string} repoRoot Absolute path to the repository root.
 * @param {string} relPath Project-relative path (forward slashes).
 * @returns {boolean | null} `true`/`false` per git, or `null` when git could not answer.
 */
export function isPathIgnoredByGit(repoRoot, relPath) {
    // gitEnv(): under `.husky/pre-push`, GIT_DIR outranks cwd and would check the pushing
    // worktree instead of the throwaway fixture (or the real root when called from main()).
    const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', relPath], {
        cwd: repoRoot,
        env: gitEnv(),
    });

    // 0 = ignored, 1 = not ignored, anything else (or a spawn failure) = git could not answer.
    if (result.error || (result.status !== 0 && result.status !== 1)) {
        return null;
    }

    return result.status === 0;
}

/** @param {string} repoRoot Absolute path to the repository root. */
export function isRootMcpIgnoredByGit(repoRoot) {
    return isPathIgnoredByGit(repoRoot, '.mcp.json');
}

/**
 * Verifies the tracked root `.mcp.json` still declares the blit386.dev docs server, that its
 * URL has not drifted from the website's `.well-known` discovery card, and that git does not
 * ignore the file. The ignore check is the important one: without it the file can silently
 * fall back out of git and every contributor quietly loses the server.
 *
 * The file contents are passed in as strings, and the ignore state as an already-resolved
 * boolean, so the function stays pure and unit-testable without touching disk or shelling
 * out; parse errors become failure messages rather than throws.
 *
 * @param {string | null} mcpConfigContent Contents of the root `.mcp.json`, or `null` when missing.
 * @param {string | null} serverCardContent Contents of the website's MCP discovery card, or `null` when missing.
 * @param {boolean | null} rootMcpIsIgnored Git's verdict from {@link isRootMcpIgnoredByGit}; `null` when unknown.
 * @returns {string[]} Human-readable failure messages (empty when the config is consistent).
 */
export function findProjectMcpFailures(mcpConfigContent, serverCardContent, rootMcpIsIgnored) {
    if (mcpConfigContent === null) {
        return ['.mcp.json is missing'];
    }

    const failures = [];

    if (rootMcpIsIgnored === true) {
        failures.push(
            '.mcp.json is ignored by git - check .gitignore for a rule matching it after the `!/.mcp.json` negation',
        );
    }

    /** @type {Record<string, unknown>} */
    let server;

    try {
        const parsed = JSON.parse(mcpConfigContent);
        const servers = parsed?.mcpServers;

        if (servers === null || typeof servers !== 'object') {
            failures.push('.mcp.json has no mcpServers object');
            return failures;
        }

        if (!Object.hasOwn(servers, PROJECT_MCP_SERVER_NAME)) {
            failures.push(`.mcp.json does not declare the \`${PROJECT_MCP_SERVER_NAME}\` server`);
            return failures;
        }

        server = servers[PROJECT_MCP_SERVER_NAME] ?? {};
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`.mcp.json is not parseable as JSON: ${detail}`);
        return failures;
    }

    if (server.type !== PROJECT_MCP_SERVER_TYPE) {
        failures.push(
            `.mcp.json entry \`${PROJECT_MCP_SERVER_NAME}\` has type ${JSON.stringify(server.type)}, expected "${PROJECT_MCP_SERVER_TYPE}"`,
        );
    }

    if (serverCardContent === null) {
        failures.push('packages/website/public/.well-known/mcp/server-card.json is missing');
        return failures;
    }

    try {
        const card = JSON.parse(serverCardContent);

        // Pinning both copies to the literal subsumes a parity check: if each equals the
        // pinned URL they equal each other, and a coordinated change fails on both counts.
        if (server.url !== PROJECT_MCP_SERVER_URL) {
            failures.push(
                `.mcp.json declares URL ${JSON.stringify(server.url)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            );
        }

        if (card.url !== PROJECT_MCP_SERVER_URL) {
            failures.push(
                `discovery card declares URL ${JSON.stringify(card.url)}, expected the pinned ${JSON.stringify(PROJECT_MCP_SERVER_URL)}`,
            );
        }

        if (card.serverInfo?.name !== PROJECT_MCP_SERVER_NAME) {
            failures.push(
                `discovery card names ${JSON.stringify(card.serverInfo?.name)}, but .mcp.json declares \`${PROJECT_MCP_SERVER_NAME}\``,
            );
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`server-card.json is not parseable as JSON: ${detail}`);
    }

    return failures;
}
