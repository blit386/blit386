#!/usr/bin/env node
/**
 * Cross-check that every URL/endpoint this site advertises to agents – in
 * `public/webmcp.js`, the agent-skills `SKILL.md`, and the well-known JSON files –
 * actually resolves in the *built* output.
 *
 * This is deliberately more than a 404 check. The bug BT-247 fixed
 * (`925033c8`) was a dead `/api/search` endpoint that returned HTTP 200 with
 * someone else's content – a plain status check would not have caught it. So this
 * boots the real built worker (`wrangler dev` against `dist/server/wrangler.json`,
 * the same config `pnpm run start` uses) and, for `/mcp`, sends the exact JSON-RPC
 * calls `webmcp.js` itself makes and asserts the response actually contains results,
 * not just a 200.
 *
 * `/mcp` cannot be checked any other way: it is Hono middleware registered by a
 * Fumapress plugin (`src/mcp-server.ts`), not a static file, and it reads its docs
 * corpus from the Cloudflare `ASSETS` binding at request time – there is no static
 * route manifest to inspect and no dist/ file to check for existence.
 *
 * Requires a build to have already run (`pnpm run build`) – see `preflight` in
 * package.json for the ordering.
 *
 * Usage:
 *   node scripts/check-well-known-urls.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(PACKAGE_ROOT, 'public');
const DIST_SERVER_WRANGLER_CONFIG = join(PACKAGE_ROOT, 'dist', 'server', 'wrangler.json');

const SITE_ORIGIN_PATTERN = /https:\/\/blit386\.dev(\/[^\s"'`)|]*)?/gu;
const BACKTICK_ROOT_PATH_PATTERN = /`(\/[a-zA-Z0-9/_-]+)`/gu;
const FETCH_CALL_PATTERN = /fetch\(\s*['"]([^'"]+)['"]/gu;

const SERVER_READY_TIMEOUT_MS = 30_000;
const SERVER_POLL_INTERVAL_MS = 300;
const SERVER_SHUTDOWN_GRACE_MS = 3_000;
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Normalizes an absolute `https://blit386.dev/...` URL, or an already-relative path,
 * to a site-relative path starting with `/`.
 *
 * @param {string} pathOrUrl
 * @returns {string}
 */
export function normalizeToSitePath(pathOrUrl) {
    const match = /^https:\/\/blit386\.dev(\/.*)?$/u.exec(pathOrUrl);
    if (match) {
        return match[1] && match[1].length > 0 ? match[1] : '/';
    }
    return pathOrUrl;
}

/**
 * Extracts every literal string argument passed to `fetch(...)` in a JS source string.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractFetchPaths(source) {
    return [...source.matchAll(FETCH_CALL_PATTERN)].map((match) => match[1]).filter((path) => path !== undefined);
}

/**
 * Extracts advertised URLs/paths from Markdown source: absolute `https://blit386.dev/...`
 * links (table cells, code blocks) and backtick-wrapped root-relative paths
 * (e.g. `` `/docs/getting-started` ``) in prose bullet lists.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractMarkdownPaths(source) {
    const absolute = [...source.matchAll(SITE_ORIGIN_PATTERN)].map((match) => match[0]);
    const backticked = [...source.matchAll(BACKTICK_ROOT_PATH_PATTERN)]
        .map((match) => match[1])
        .filter((path) => path !== undefined);
    return [...absolute, ...backticked];
}

/**
 * Recursively walks a parsed JSON value, collecting every string that is an
 * absolute `https://blit386.dev/...` URL.
 *
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function extractJsonUrls(value, out = []) {
    if (typeof value === 'string') {
        if (/^https:\/\/blit386\.dev(\/.*)?$/u.test(value)) {
            out.push(value);
        }
        return out;
    }
    if (Array.isArray(value)) {
        for (const entry of value) extractJsonUrls(entry, out);
        return out;
    }
    if (value && typeof value === 'object') {
        for (const entry of Object.values(value)) extractJsonUrls(entry, out);
    }
    return out;
}

/**
 * Builds the deduped, normalized, sorted list of every path advertised across
 * `webmcp.js`, `SKILL.md`, and the well-known JSON files.
 *
 * @param {{ webmcpSource: string, skillMdSource: string, jsonDocs: unknown[] }} sources
 * @returns {string[]}
 */
export function collectAdvertisedPaths({ webmcpSource, skillMdSource, jsonDocs }) {
    const raw = [
        ...extractFetchPaths(webmcpSource),
        ...extractMarkdownPaths(skillMdSource),
        ...jsonDocs.flatMap((doc) => extractJsonUrls(doc)),
    ];
    return [...new Set(raw.map(normalizeToSitePath))].sort();
}

/**
 * Reads the real repo sources and returns the advertised-path list. Split out from
 * `collectAdvertisedPaths` (pure) so tests exercise the pure function against
 * fixtures without touching disk.
 *
 * @returns {string[]}
 */
function collectAdvertisedPathsFromRepo() {
    const webmcpSource = readFileSync(join(PUBLIC_DIR, 'webmcp.js'), 'utf8');
    const skillMdSource = readFileSync(
        join(PUBLIC_DIR, '.well-known', 'agent-skills', 'blit386-docs', 'SKILL.md'),
        'utf8',
    );
    const jsonDocPaths = [
        join(PUBLIC_DIR, '.well-known', 'mcp', 'server-card.json'),
        join(PUBLIC_DIR, '.well-known', 'api-catalog'),
        join(PUBLIC_DIR, '.well-known', 'oauth-authorization-server'),
        join(PUBLIC_DIR, '.well-known', 'oauth-protected-resource'),
    ];
    const jsonDocs = jsonDocPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')));

    return collectAdvertisedPaths({ webmcpSource, skillMdSource, jsonDocs });
}

/** @returns {Promise<number>} A free TCP port on 127.0.0.1. */
function getFreePort() {
    return new Promise((resolvePort, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : null;
            server.close(() => (port ? resolvePort(port) : reject(new Error('could not allocate a free port'))));
        });
    });
}

/**
 * Spawns `wrangler dev` against the built worker on `port` and resolves once it is
 * ready. Rejects (and lets the caller kill the child) if it never becomes ready.
 *
 * @param {number} port
 * @returns {{ child: import('node:child_process').ChildProcess, ready: Promise<void> }}
 */
function startWranglerDev(port) {
    const child = spawn(
        'pnpm',
        [
            'exec',
            'wrangler',
            'dev',
            '--config',
            DIST_SERVER_WRANGLER_CONFIG,
            '--port',
            String(port),
            '--ip',
            '127.0.0.1',
        ],
        {
            cwd: PACKAGE_ROOT,
            env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' },
            stdio: ['ignore', 'pipe', 'pipe'],
        },
    );

    let output = '';
    child.stdout?.on('data', (chunk) => (output += String(chunk)));
    child.stderr?.on('data', (chunk) => (output += String(chunk)));

    const ready = (async () => {
        const baseUrl = `http://127.0.0.1:${port}`;
        const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;

        while (Date.now() < deadline) {
            if (child.exitCode !== null) {
                throw new Error(`wrangler dev exited early (code ${child.exitCode}):\n${output}`);
            }
            try {
                const res = await fetch(baseUrl, { signal: AbortSignal.timeout(2_000) });
                if (res.ok || res.status === 404) return;
            } catch {
                // Not up yet – keep polling.
            }
            await new Promise((r) => setTimeout(r, SERVER_POLL_INTERVAL_MS));
        }

        throw new Error(`wrangler dev did not become ready within ${SERVER_READY_TIMEOUT_MS}ms:\n${output}`);
    })();

    return { child, ready };
}

/** @param {import('node:child_process').ChildProcess} child */
async function stopWranglerDev(child) {
    if (child.exitCode !== null) return;

    child.kill('SIGTERM');
    const exited = await Promise.race([
        new Promise((r) => child.once('exit', () => r(true))),
        new Promise((r) => setTimeout(() => r(false), SERVER_SHUTDOWN_GRACE_MS)),
    ]);
    if (!exited) child.kill('SIGKILL');
}

/** @param {unknown} error @returns {string} */
function describeError(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Sends the two JSON-RPC calls `webmcp.js` itself makes to `/mcp` and asserts each
 * response carries real content, not just a 200.
 *
 * @param {string} baseUrl
 * @returns {Promise<string[]>} Failure messages (empty when both calls succeed).
 */
async function checkMcpEndpoint(baseUrl) {
    /** @type {string[]} */
    const failures = [];

    /** @param {string} name @param {Record<string, unknown>} args */
    const call = async (name, args) => {
        let res;

        try {
            res = await fetch(`${baseUrl}/mcp`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'tools/call',
                    params: { name, arguments: args },
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            failures.push(`/mcp tools/call ${name}: request failed (${describeError(error)})`);
            return;
        }

        if (!res.ok) {
            failures.push(`/mcp tools/call ${name}: HTTP ${res.status}`);
            return;
        }
        const body = await res.json();
        if (body.error) {
            failures.push(`/mcp tools/call ${name}: JSON-RPC error ${body.error.code} ${body.error.message}`);
            return;
        }
        const text = body.result?.content?.[0]?.text;
        if (typeof text !== 'string' || text.length === 0) {
            failures.push(`/mcp tools/call ${name}: response has no result.content[0].text`);
        }
    };

    await call('search_docs', { query: 'palette' });
    await call('get_docs_summary', {});

    return failures;
}

/**
 * GETs a site-relative path and asserts it resolves with a non-empty body.
 *
 * @param {string} baseUrl
 * @param {string} path
 * @returns {Promise<string[]>}
 */
async function checkStaticPath(baseUrl, path) {
    let res;

    try {
        res = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        return [`${path}: request failed (${describeError(error)})`];
    }

    if (!res.ok) {
        return [`${path}: HTTP ${res.status}`];
    }
    const body = await res.text();
    if (body.length === 0) {
        return [`${path}: resolved with an empty body`];
    }
    return [];
}

async function main() {
    if (!existsSync(DIST_SERVER_WRANGLER_CONFIG)) {
        console.error(
            `check:well-known-urls requires a build first – ${DIST_SERVER_WRANGLER_CONFIG} does not exist. Run "pnpm run build".`,
        );
        process.exit(1);
    }

    const paths = collectAdvertisedPathsFromRepo();
    const port = await getFreePort();
    const { child, ready } = startWranglerDev(port);
    const baseUrl = `http://127.0.0.1:${port}`;
    const failures = [];

    try {
        await ready;

        for (const path of paths) {
            if (path === '/mcp') {
                failures.push(...(await checkMcpEndpoint(baseUrl)));
            } else {
                failures.push(...(await checkStaticPath(baseUrl, path)));
            }
        }
    } finally {
        await stopWranglerDev(child);
    }

    if (failures.length > 0) {
        console.error('Advertised-URL reachability check failed:');
        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }
        process.exit(1);
    }

    console.log(`Advertised URLs OK (${paths.length} paths checked: ${paths.join(', ')}).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main().catch((error) => {
        console.error(`check:well-known-urls failed: ${describeError(error)}`);
        process.exit(1);
    });
}
