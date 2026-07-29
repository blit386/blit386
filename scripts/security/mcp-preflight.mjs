import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

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

const MCP_CONFIG_FILENAMES = ['.mcp.json', 'mcp.json'];
const RUNLAYER_URL_PATTERN = /runlayer\.com/i;
const RUNLAYER_COMMAND_PATTERN = /runlayer\s+run\b/i;

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
        const authOnly =
            fs.existsSync(path.join(toolsDir, 'mcp_auth.json')) ||
            (statusMessage !== null && statusIndicatesAuthRequired(statusMessage));
        if (authOnly) {
            return { status: 'auth_required', toolCount: 0, statusMessage };
        }
        if (statusMessage !== null && statusIndicatesError(statusMessage)) {
            return { status: 'errored', toolCount: 0, statusMessage };
        }
        return { status: 'absent', toolCount: 0, statusMessage };
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
    const url = typeof record.url === 'string' ? record.url : '';
    const command = typeof record.command === 'string' ? record.command : '';
    const args = Array.isArray(record.args) ? record.args.join(' ') : '';

    if (RUNLAYER_URL_PATTERN.test(url)) {
        return true;
    }

    const commandLine = `${command} ${args}`.trim();
    return RUNLAYER_COMMAND_PATTERN.test(commandLine);
}

/**
 * @param {string} configPath
 * @returns {{
 *   path: string,
 *   servers: { name: string, classification: 'runlayer-managed' | 'shadow-remote' | 'shadow-stdio' | 'unknown' }[],
 *   error: string | null,
 * }}
 */
export function scanMcpConfigFile(configPath) {
    try {
        const raw = fs.readFileSync(configPath, 'utf8');
        const parsed = JSON.parse(raw);
        const serversObject = parsed.mcpServers;

        if (serversObject === null || typeof serversObject !== 'object') {
            return { path: configPath, servers: [], error: null };
        }

        /** @type {{ name: string, classification: 'runlayer-managed' | 'shadow-remote' | 'shadow-stdio' | 'unknown' }[]} */
        const servers = [];

        for (const [name, entry] of Object.entries(serversObject)) {
            if (isRunlayerManagedEntry(entry)) {
                servers.push({ name, classification: 'runlayer-managed' });
                continue;
            }

            const record = /** @type {Record<string, unknown>} */ (entry ?? {});
            const url = typeof record.url === 'string' ? record.url : '';
            const command = typeof record.command === 'string' ? record.command : '';

            if (url.length > 0) {
                servers.push({ name, classification: 'shadow-remote' });
            } else if (command.length > 0) {
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
    return existing.map((configPath) => scanMcpConfigFile(configPath));
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
            .map((server) => ({ config: config.path, name: server.name, classification: server.classification })),
    );

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
        },
        summary: {
            criticalUsable,
            allowFallback: options.allowFallback ?? false,
            recommendedFallbacks,
            proceed: governanceOnly ? true : criticalUsable || (options.allowFallback ?? false),
        },
    };

    if (options.outputJsonPath) {
        fs.mkdirSync(path.dirname(options.outputJsonPath), { recursive: true });
        fs.writeFileSync(options.outputJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    return report;
}

/**
 * @param {McpPreflightReport} report
 * @returns {string}
 */
export function formatPreflightSummary(report) {
    const lines = ['MCP security preflight', `Generated: ${report.generatedAt}`, `mcps-dir: ${report.mcpsDir}`];

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
    if (report.governance.shadowCount > 0) {
        lines.push('', 'Shadow MCP servers flagged:');
        for (const shadow of report.governance.shadowServers) {
            lines.push(`  - ${shadow.name} (${shadow.classification}) in ${shadow.config}`);
        }
    } else {
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
 *   shadowServers: Array<{ config: string, name: string, classification: string }>,
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
        args: argv,
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

    if (!args.mcpsDir) {
        console.error(
            'Usage: node scripts/security/mcp-preflight.mjs --mcps-dir <mcps-path> [--repo-root <path>] [--include-user-config] [--governance-only] [--allow-fallback] [--output-json <path>]',
        );
        process.exit(1);
    }

    const mcpsDir = path.resolve(args.mcpsDir);
    if (!fs.existsSync(mcpsDir)) {
        console.error(`mcps-dir does not exist: ${mcpsDir}`);
        process.exit(1);
    }

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
