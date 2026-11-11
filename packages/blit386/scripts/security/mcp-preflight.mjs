import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import { PNPM_ARG_SEPARATOR } from '../../../../scripts/lib/pnpm-arg-separator.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '../..');

/** @typedef {'critical' | 'recommended'} McpTier */
/** @typedef {'healthy' | 'auth_required' | 'errored' | 'absent'} McpStatus */

/**
 * Security MCP servers checked before agent security runs.
 * @type {{ id: string, tier: McpTier, fallbacks: string[] }[]}
 */
export const SECURITY_MCP_REGISTRY = [
    {
        id: 'plugin-opsera-devsecops-opsera',
        tier: 'critical',
        fallbacks: [
            'pnpm security:audit',
            'pnpm security:audit:prod',
            'pnpm lint',
            'docs/security/security-runbook.md (SAST/compliance fallbacks)',
        ],
    },
    {
        id: 'plugin-jfrog-jfrog',
        tier: 'recommended',
        fallbacks: [
            'pnpm security:audit',
            'pnpm security:audit:prod',
            'pnpm outdated --format json',
            'npm view <pkg> version',
        ],
    },
    {
        id: 'plugin-semgrep-plugin-semgrep',
        tier: 'recommended',
        fallbacks: ['pnpm lint', 'rg security patterns (see runbook)', 'semgrep CLI only if already installed'],
    },
];

/**
 * Shadow MCP entries accepted by governance policy. Matched on name + classification + exact URL
 * + a tracked repo-root config path. Manual-sync hazard: the URL also lives in
 * PROJECT_MCP_SERVER_URL in ../../../../scripts/lib/agent-config/mcp.mjs and in the "Accepted MCP
 * entries" table of docs/security/security-runbook.md - change all three together.
 * @type {{ name: string, classification: string, url: string }[]}
 */
export const ACCEPTED_SHADOW_MCP_ENTRIES = [
    { name: 'blit386-docs', classification: 'shadow-remote', url: 'https://blit386.dev/mcp' },
];

const MCP_CONFIG_FILENAMES = ['.mcp.json', 'mcp.json'];

/** @typedef {{ key: string, format: 'json' | 'jsonc' | 'codex-toml' }} McpConfigFormat */

/** @type {McpConfigFormat} */
const MCP_JSON_FORMAT = { key: 'mcpServers', format: 'json' };

/**
 * Other tracked agent configs that can declare MCP servers, scanned at the repo root only.
 * Each is generated or pinned by the kit adapters; `agents:check` pins their blit386-docs URL.
 * Manual sync: the `paths` filter in .github/workflows/mcp-governance-audit.yml lists these files.
 * @type {{ file: string, format: McpConfigFormat }[]}
 */
const AGENT_MCP_CONFIGS = [
    { file: '.cursor/mcp.json', format: MCP_JSON_FORMAT },
    { file: '.agents/mcp_config.json', format: MCP_JSON_FORMAT },
    { file: '.gemini/settings.json', format: MCP_JSON_FORMAT },
    { file: 'opencode.json', format: { key: 'mcp', format: 'json' } },
    { file: '.zed/settings.json', format: { key: 'context_servers', format: 'jsonc' } },
    { file: '.codex/config.toml', format: { key: 'mcp_servers', format: 'codex-toml' } },
];
const RUNLAYER_DOMAIN = 'runlayer.com';
const RUNLAYER_BINARY = 'runlayer';

/**
 * @param {string} statusText
 * @returns {boolean}
 */
export function statusIndicatesAuthRequired(statusText) {
    const lower = statusText.toLowerCase();
    return (
        lower.includes('authentication') ||
        lower.includes('mcp_auth') ||
        lower.includes('needs authentication') ||
        lower.includes('must call the `mcp_auth`')
    );
}

/**
 * @param {string} statusText
 * @returns {boolean}
 */
export function statusIndicatesError(statusText) {
    const lower = statusText.toLowerCase();
    return lower.includes('errored') || lower.includes('unavailable') || lower.includes('error');
}

/**
 * Classify one MCP server directory under the session's MCP tool-state folder.
 *
 * @param {string} mcpsDir
 * @param {string} serverId
 * @returns {{ status: McpStatus, toolCount: number, statusMessage: string | null }}
 */
export function classifyMcpServer(mcpsDir, serverId) {
    const serverDir = path.join(mcpsDir, serverId);

    if (!fs.existsSync(serverDir)) {
        return { status: 'absent', toolCount: 0, statusMessage: null };
    }

    const statusPath = path.join(serverDir, 'STATUS.md');
    let statusMessage = null;

    if (fs.existsSync(statusPath)) {
        statusMessage = fs.readFileSync(statusPath, 'utf8').trim();
        if (statusIndicatesError(statusMessage)) {
            return { status: 'errored', toolCount: 0, statusMessage };
        }
        if (statusIndicatesAuthRequired(statusMessage)) {
            return { status: 'auth_required', toolCount: 0, statusMessage };
        }
    }

    const toolsDir = path.join(serverDir, 'tools');
    let toolCount = 0;

    if (fs.existsSync(toolsDir)) {
        toolCount = fs
            .readdirSync(toolsDir)
            .filter((name) => name.endsWith('.json') && name !== 'mcp_auth.json').length;
    }

    if (toolCount === 0) {
        // STATUS.md error and auth text already returned above; only the auth tool file is left.
        const status = fs.existsSync(path.join(toolsDir, 'mcp_auth.json')) ? 'auth_required' : 'absent';
        return { status, toolCount: 0, statusMessage };
    }

    return { status: 'healthy', toolCount, statusMessage };
}

/**
 * @param {unknown} entry
 * @returns {boolean}
 */
export function isRunlayerManagedEntry(entry) {
    if (entry === null || typeof entry !== 'object') {
        return false;
    }

    const record = /** @type {Record<string, unknown>} */ (entry);

    // Managed only over https to runlayer.com or a subdomain of it, by parsed hostname - never on
    // a substring anywhere in the URL (BT-763: `https://attacker.example/runlayer.com/mcp`).
    if (typeof record.url === 'string' && URL.canParse(record.url)) {
        const { protocol, hostname } = new URL(record.url);
        const host = hostname.toLowerCase();
        if (protocol === 'https:' && (host === RUNLAYER_DOMAIN || host.endsWith(`.${RUNLAYER_DOMAIN}`))) {
            return true;
        }
    }

    // Managed only when the command itself is the runlayer binary and its first argument is
    // `run` - a shell whose script merely mentions `runlayer run` stays a shadow stdio server.
    return (
        typeof record.command === 'string' &&
        path.basename(record.command) === RUNLAYER_BINARY &&
        Array.isArray(record.args) &&
        record.args[0] === 'run'
    );
}

/**
 * @param {string} line A trimmed TOML line that opens with `[`.
 * @param {number} lineNumber
 * @returns {string | null} The server name for `[mcp_servers.<name>]`, or null for a table whose
 *   keys are not read (a server's `env` / `tools` sub-table, or an unrelated table).
 */
function codexServerTableName(line, lineNumber) {
    // Bare dotted names, or mcp_servers."<name>" without escapes. Anything else that opens with
    // `[` (a trailing comment, `[[...]]`, an escaped key) cannot be read safely.
    const header = /^\[(mcp_servers\.(?:"[^"\\]+"|[\w-]+)(?:\.[\w-]+)*|[\w.-]+)\]$/u.exec(line);
    if (!header) {
        throw new Error(`line ${lineNumber}: unsupported TOML table header`);
    }
    const tableName = header[1] ?? '';
    const server = /^mcp_servers\.(?:"([^"]+)"|([\w-]+))$/u.exec(tableName);
    if (server) {
        return server[1] ?? server[2] ?? '';
    }
    if (/^mcp_servers\.(?:"[^"]+"|[\w-]+)\./u.test(tableName) || !tableName.startsWith('mcp_servers')) {
        return null;
    }
    throw new Error(`line ${lineNumber}: unsupported mcp_servers table [${tableName}]`);
}

/**
 * Reads the `[mcp_servers.<name>]` tables of a Codex `config.toml` into a plain object.
 * shortcut: only single-line bare `key = value` pairs with JSON-compatible values (basic strings,
 * string arrays, numbers, booleans) and plain table headers are read; any other line anywhere in
 * the file throws, so the gate fails closed. Swap for a real TOML parser if Codex configs grow
 * beyond that.
 *
 * @param {string} raw
 * @returns {{ mcp_servers: Record<string, Record<string, unknown>> }}
 */
export function parseCodexMcpServers(raw) {
    /** @type {Map<string, Record<string, unknown>>} */
    const servers = new Map();
    /** @type {Record<string, unknown> | null} */
    let current = null;

    for (const [index, rawLine] of raw.split('\n').entries()) {
        const line = rawLine.trim();
        const lineNumber = index + 1;
        if (line === '' || line.startsWith('#')) {
            continue;
        }

        if (line.startsWith('[')) {
            const serverName = codexServerTableName(line, lineNumber);
            current = null;
            if (serverName !== null) {
                if (servers.has(serverName)) {
                    throw new Error(`line ${lineNumber}: duplicate table [mcp_servers.${serverName}]`);
                }
                current = {};
                servers.set(serverName, current);
            }
            continue;
        }

        // Pairs: a bare key only, so a dotted or quoted key can never smuggle in mcp_servers.
        const pair = /^([\w-]+)\s*=\s*(.+)$/u.exec(line);
        if (!pair || pair[1] === 'mcp_servers') {
            throw new Error(`line ${lineNumber}: unsupported TOML line`);
        }
        // Every value must parse, in any table, so a multi-line string can never hide lines.
        let value;
        try {
            value = JSON.parse(pair[2] ?? '');
        } catch {
            throw new Error(`line ${lineNumber}: unsupported TOML value`);
        }
        if (current !== null) {
            current[pair[1] ?? ''] = value;
        }
    }

    return { mcp_servers: Object.fromEntries(servers) };
}

/**
 * @param {string} raw
 * @param {McpConfigFormat['format']} format
 * @returns {unknown}
 */
function parseConfig(raw, format) {
    if (format === 'codex-toml') {
        return parseCodexMcpServers(raw);
    }
    // JSONC: whole-line comments only, as scripts/lib/agent-config/skills.mjs reads Zed settings.
    const text =
        format === 'jsonc'
            ? raw
                  .split('\n')
                  .filter((line) => !/^\s*\/\//u.test(line))
                  .join('\n')
            : raw;
    return JSON.parse(text);
}

/**
 * Reduces one server entry to the url / command / args the classifier needs, across formats:
 * `url`, `serverUrl` (.agents) or `httpUrl` (Gemini) for remote servers, and `command` as a
 * string plus `args`, or as an argv array (OpenCode), for stdio servers.
 *
 * @param {unknown} entry
 * @returns {{ url: string, command: string, args: unknown[], ambiguous: boolean }}
 */
function normalizeEntry(entry) {
    const record = entry !== null && typeof entry === 'object' ? /** @type {Record<string, unknown>} */ (entry) : {};
    const isPresent = (/** @type {unknown} */ value) => value !== undefined && value !== null;
    const urlValues = [record.url, record.serverUrl, record.httpUrl].filter(isPresent);
    const [command, ...argv] = Array.isArray(record.command) ? record.command : [record.command];
    const normalized = {
        url: typeof urlValues[0] === 'string' ? urlValues[0] : '',
        command: typeof command === 'string' ? command : '',
        args: Array.isArray(record.command) ? argv : Array.isArray(record.args) ? record.args : [],
    };
    // Two URL keys, or a URL and a command: which one a client uses differs per client, so the
    // gate cannot know what it is approving. Presence counts, not type - Zed writes `command` as
    // an object, and a value this gate cannot read must still block.
    const ambiguous = urlValues.length > 1 || (urlValues.length === 1 && isPresent(record.command));
    return { ...normalized, ambiguous };
}

/**
 * @param {string} configPath
 * @param {McpConfigFormat} [configFormat]
 * @returns {{
 *   path: string,
 *   servers: { name: string, classification: 'runlayer-managed' | 'shadow-remote' | 'shadow-stdio' | 'unknown', url?: string }[],
 *   error: string | null,
 * }}
 */
export function scanMcpConfigFile(configPath, configFormat = MCP_JSON_FORMAT) {
    try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = /** @type {Record<string, unknown> | null} */ (parseConfig(raw, configFormat.format));
        const serversObject = parsed?.[configFormat.key];

        if (serversObject === undefined) {
            return { path: configPath, servers: [], error: null };
        }
        if (serversObject === null || typeof serversObject !== 'object' || Array.isArray(serversObject)) {
            return { path: configPath, servers: [], error: `${configFormat.key} is not an object` };
        }

        /** @type {{ name: string, classification: 'runlayer-managed' | 'shadow-remote' | 'shadow-stdio' | 'unknown', url?: string }[]} */
        const servers = [];

        for (const [name, rawEntry] of Object.entries(serversObject)) {
            const entry = normalizeEntry(rawEntry);
            if (entry.ambiguous) {
                servers.push({ name, classification: 'unknown' });
            } else if (isRunlayerManagedEntry(entry)) {
                servers.push({ name, classification: 'runlayer-managed' });
            } else if (entry.url.length > 0) {
                servers.push({ name, classification: 'shadow-remote', url: entry.url });
            } else if (entry.command.length > 0) {
                servers.push({ name, classification: 'shadow-stdio' });
            } else {
                servers.push({ name, classification: 'unknown' });
            }
        }

        return { path: configPath, servers, error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { path: configPath, servers: [], error: message };
    }
}

/**
 * @param {string} repoRoot
 * @param {{ includeUserConfig?: boolean }} [options]
 * @returns {{ path: string, servers: { name: string, classification: string }[] }[]}
 */
export function discoverMcpConfigPaths(repoRoot, options = {}) {
    /** @type {string[]} */
    const candidates = [];

    for (const name of MCP_CONFIG_FILENAMES) {
        candidates.push(path.join(repoRoot, name));
    }

    const parentRoot = path.resolve(repoRoot, '..');
    for (const name of MCP_CONFIG_FILENAMES) {
        candidates.push(path.join(parentRoot, name));
    }

    if (options.includeUserConfig) {
        const homeDir = process.env.HOME ?? os.homedir();
        if (homeDir) {
            for (const name of MCP_CONFIG_FILENAMES) {
                candidates.push(path.join(homeDir, name));
            }
        }
    }

    const existing = [...new Set(candidates)].filter((candidate) => fs.existsSync(candidate));
    const agentConfigs = AGENT_MCP_CONFIGS.map((config) => ({
        ...config,
        file: path.join(repoRoot, config.file),
    })).filter((config) => fs.existsSync(config.file));
    return [
        ...existing.map((configPath) => scanMcpConfigFile(configPath)),
        ...agentConfigs.map((config) => scanMcpConfigFile(config.file, config.format)),
    ];
}

/**
 * @param {string} mcpsDir
 * @returns {import('./mcp-preflight.mjs').McpPreflightReport['mcpServers']}
 */
export function buildMcpServerReport(mcpsDir) {
    return SECURITY_MCP_REGISTRY.map((entry) => {
        const classification = classifyMcpServer(mcpsDir, entry.id);
        return {
            id: entry.id,
            tier: entry.tier,
            status: classification.status,
            toolCount: classification.toolCount,
            statusMessage: classification.statusMessage,
            fallbacks: [...entry.fallbacks],
            usable: classification.status === 'healthy',
        };
    });
}

/**
 * @param {ReturnType<typeof buildMcpServerReport>} mcpServers
 * @returns {boolean}
 */
export function criticalMcpUsable(mcpServers) {
    return mcpServers.filter((server) => server.tier === 'critical').every((server) => server.usable);
}

/**
 * @param {ReturnType<typeof buildMcpServerReport>} mcpServers
 * @returns {string[]}
 */
export function collectRecommendedFallbacks(mcpServers) {
    const fallbacks = new Set();
    for (const server of mcpServers) {
        if (!server.usable) {
            for (const fallback of server.fallbacks) {
                fallbacks.add(fallback);
            }
        }
    }
    return [...fallbacks];
}

/**
 * @param {{
 *   mcpsDir: string,
 *   repoRoot?: string,
 *   includeUserConfig?: boolean,
 *   governanceOnly?: boolean,
 *   allowFallback?: boolean,
 *   outputJsonPath?: string,
 * }} options
 * @returns {McpPreflightReport}
 */
export function runMcpPreflight(options) {
    const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
    const governanceOnly = options.governanceOnly ?? false;
    const mcpServers = governanceOnly ? [] : buildMcpServerReport(options.mcpsDir);
    const governance = discoverMcpConfigPaths(repoRoot, {
        includeUserConfig: options.includeUserConfig ?? false,
    });

    const shadowServers = governance.flatMap((config) =>
        config.servers
            .filter((server) => server.classification.startsWith('shadow'))
            .map((server) => ({
                config: config.path,
                name: server.name,
                classification: server.classification,
                url: server.url ?? '',
            })),
    );

    // Accepted only in the repo's own tracked configs, never in a parent-directory or $HOME one.
    const trackedConfigPaths = ['.mcp.json', ...AGENT_MCP_CONFIGS.map((config) => config.file)].map((file) =>
        path.join(repoRoot, file),
    );
    const isAcceptedShadow = (
        /** @type {{ config: string, name: string, classification: string, url: string }} */ server,
    ) =>
        trackedConfigPaths.includes(server.config) &&
        ACCEPTED_SHADOW_MCP_ENTRIES.some(
            (entry) =>
                entry.name === server.name &&
                entry.classification === server.classification &&
                entry.url === server.url,
        );
    const acceptedShadowServers = shadowServers.filter(isAcceptedShadow);
    const unacceptedShadowServers = shadowServers.filter((server) => !isAcceptedShadow(server));

    // Fail closed: a config the gate cannot read, or an entry it cannot classify, blocks.
    const blockingConfigs = governance.flatMap((config) => {
        if (config.error !== null) {
            return [{ path: config.path, reason: `unreadable: ${config.error}` }];
        }
        const unknown = config.servers.filter((server) => server.classification === 'unknown');
        return unknown.length > 0
            ? [
                  {
                      path: config.path,
                      reason: `unclassifiable entries: ${unknown.map((server) => server.name).join(', ')}`,
                  },
              ]
            : [];
    });

    const criticalUsable = governanceOnly ? false : criticalMcpUsable(mcpServers);
    const recommendedFallbacks = governanceOnly ? [] : collectRecommendedFallbacks(mcpServers);

    /** @type {McpPreflightReport} */
    const report = {
        generatedAt: new Date().toISOString(),
        mcpsDir: options.mcpsDir,
        repoRoot,
        governanceOnly,
        mcpServers,
        governance: {
            configs: governance.map((config) => ({
                path: config.path,
                serverNames: config.servers.map((server) => server.name),
                readError: config.error,
                shadowServers: config.servers
                    .filter((server) => server.classification.startsWith('shadow'))
                    .map((server) => ({ name: server.name, classification: server.classification })),
            })),
            shadowCount: shadowServers.length,
            shadowServers,
            acceptedShadowServers,
            unacceptedShadowServers,
            blockingConfigs,
        },
        summary: {
            criticalUsable,
            allowFallback: options.allowFallback ?? false,
            recommendedFallbacks,
            proceed: governanceOnly
                ? unacceptedShadowServers.length === 0 && blockingConfigs.length === 0
                : criticalUsable || (options.allowFallback ?? false),
        },
    };

    if (options.outputJsonPath) {
        fs.mkdirSync(path.dirname(options.outputJsonPath), { recursive: true });
        fs.writeFileSync(options.outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    return report;
}

/**
 * Appends a titled list to `lines`, or nothing when the list is empty.
 * @param {string[]} lines
 * @param {string} title
 * @param {string[]} items
 */
function pushSection(lines, title, items) {
    if (items.length > 0) {
        lines.push('', title, ...items);
    }
}

/**
 * @param {McpPreflightReport} report
 * @returns {string}
 */
export function formatPreflightSummary(report) {
    const lines = ['MCP security preflight', `Generated: ${report.generatedAt}`];
    if (report.mcpsDir) {
        lines.push(`mcps-dir: ${report.mcpsDir}`);
    }

    if (report.governanceOnly) {
        lines.push('', 'Governance-only mode');
    } else {
        lines.push('', 'Security MCP servers:');
        for (const server of report.mcpServers) {
            lines.push(
                `  - ${server.id} [${server.tier}] status=${server.status} tools=${server.toolCount} usable=${server.usable}`,
            );
        }
        if (report.summary.recommendedFallbacks.length > 0) {
            lines.push('', 'Recommended fallbacks:');
            for (const fallback of report.summary.recommendedFallbacks) {
                lines.push(`  - ${fallback}`);
            }
        }
    }

    lines.push('', 'MCP config governance:');
    for (const config of report.governance.configs) {
        const names = config.serverNames.length > 0 ? config.serverNames.join(', ') : '(none)';
        if (config.readError) {
            lines.push(`  - ${config.path}: (read error: ${config.readError})`);
        } else {
            lines.push(`  - ${config.path}: ${names}`);
        }
    }
    const shadowLine = (/** @type {{ config: string, name: string, classification: string }} */ shadow) =>
        `  - ${shadow.name} (${shadow.classification}) in ${shadow.config}`;
    pushSection(lines, 'Accepted shadow MCP entries:', report.governance.acceptedShadowServers.map(shadowLine));
    pushSection(
        lines,
        'Unaccepted shadow MCP entries flagged:',
        report.governance.unacceptedShadowServers.map(shadowLine),
    );
    pushSection(
        lines,
        'Unclassifiable or unreadable MCP configs:',
        report.governance.blockingConfigs.map((blocking) => `  - ${blocking.path}: ${blocking.reason}`),
    );
    if (report.governance.shadowCount === 0) {
        lines.push('', 'No shadow MCP servers flagged in scanned configs.');
    }

    lines.push('', `Proceed: ${report.summary.proceed}`);
    return lines.join('\n');
}

/**
 * @typedef {Object} McpPreflightReport
 * @property {string} generatedAt
 * @property {string} mcpsDir
 * @property {string} repoRoot
 * @property {boolean} governanceOnly
 * @property {Array<{
 *   id: string,
 *   tier: McpTier,
 *   status: McpStatus,
 *   toolCount: number,
 *   statusMessage: string | null,
 *   fallbacks: string[],
 *   usable: boolean,
 * }>} mcpServers
 * @property {{
 *   configs: Array<{ path: string, serverNames: string[], readError: string | null, shadowServers: Array<{ name: string, classification: string }> }>,
 *   shadowCount: number,
 *   shadowServers: Array<{ config: string, name: string, classification: string, url: string }>,
 *   acceptedShadowServers: Array<{ config: string, name: string, classification: string, url: string }>,
 *   unacceptedShadowServers: Array<{ config: string, name: string, classification: string, url: string }>,
 *   blockingConfigs: Array<{ path: string, reason: string }>,
 * }} governance
 * @property {{
 *   criticalUsable: boolean,
 *   allowFallback: boolean,
 *   recommendedFallbacks: string[],
 *   proceed: boolean,
 * }} summary
 */

/**
 * @param {string[]} argv
 * @returns {{
 *   mcpsDir: string | null,
 *   repoRoot: string,
 *   includeUserConfig: boolean,
 *   governanceOnly: boolean,
 *   allowFallback: boolean,
 *   outputJsonPath: string | null,
 * }}
 */
export function parseArgs(argv) {
    const { values } = nodeParseArgs({
        // pnpm forwards the separator of `pnpm run security:mcp-preflight -- <args>`; past a `--`,
        // node:util parseArgs would read every flag as a positional.
        args: argv.filter((arg) => arg !== PNPM_ARG_SEPARATOR),
        options: {
            'allow-fallback': { type: 'boolean' },
            'governance-only': { type: 'boolean' },
            'include-user-config': { type: 'boolean' },
            'mcps-dir': { type: 'string' },
            'output-json': { type: 'string' },
            'repo-root': { type: 'string' },
        },
        strict: false,
    });

    const outputJson = values['output-json'];

    return {
        mcpsDir: values['mcps-dir'] ?? null,
        repoRoot: path.resolve(values['repo-root'] ?? DEFAULT_REPO_ROOT),
        includeUserConfig: values['include-user-config'] ?? false,
        governanceOnly: values['governance-only'] ?? false,
        allowFallback: values['allow-fallback'] ?? false,
        outputJsonPath: typeof outputJson === 'string' && outputJson.length > 0 ? path.resolve(outputJson) : null,
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.mcpsDir && !args.governanceOnly) {
        console.error(
            'Usage: node scripts/security/mcp-preflight.mjs --mcps-dir <mcps-path> [--repo-root <path>] [--include-user-config] [--governance-only] [--allow-fallback] [--output-json <path>]\n' +
                '--mcps-dir is required unless --governance-only is set (governance-only never reads it).',
        );
        process.exit(1);
    }

    // A missing or nonexistent mcps-dir is not fatal here: classifyMcpServer already reports
    // each security MCP as 'absent' for a directory that does not exist, so --allow-fallback
    // governs whether that is acceptable - deliberately not a hard exit, so a total MCP-session
    // outage degrades the same way a single missing server already does.
    const mcpsDir = args.mcpsDir ? path.resolve(args.mcpsDir) : '';

    const report = runMcpPreflight({
        mcpsDir,
        repoRoot: args.repoRoot,
        includeUserConfig: args.includeUserConfig,
        governanceOnly: args.governanceOnly,
        allowFallback: args.allowFallback,
        outputJsonPath: args.outputJsonPath ?? undefined,
    });

    console.log(formatPreflightSummary(report));
    console.log('');
    console.log(JSON.stringify(report, null, 2));

    if (!report.summary.proceed) {
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
