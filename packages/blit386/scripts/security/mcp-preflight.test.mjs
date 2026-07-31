import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    buildMcpServerReport,
    classifyMcpServer,
    collectRecommendedFallbacks,
    criticalMcpUsable,
    discoverMcpConfigPaths,
    isRunlayerManagedEntry,
    parseArgs,
    runMcpPreflight,
    scanMcpConfigFile,
    statusIndicatesAuthRequired,
    statusIndicatesError,
} from './mcp-preflight.mjs';

const FIXTURE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MCPS_FIXTURE = path.join(FIXTURE_ROOT, 'mcps');

describe('mcp-preflight status helpers', () => {
    it('detects auth-required status text', () => {
        assert.equal(statusIndicatesAuthRequired('You must call the `mcp_auth` tool for authentication.'), true);
    });

    it('detects errored status text', () => {
        assert.equal(statusIndicatesError('The MCP server errored and is unavailable.'), true);
    });
});

describe('classifyMcpServer', () => {
    it('classifies healthy when non-auth tools exist', () => {
        const result = classifyMcpServer(MCPS_FIXTURE, 'healthy-server');
        assert.equal(result.status, 'healthy');
        assert.equal(result.toolCount, 1);
    });

    it('classifies auth_required from STATUS.md', () => {
        const result = classifyMcpServer(MCPS_FIXTURE, 'auth-server');
        assert.equal(result.status, 'auth_required');
    });

    it('classifies errored from STATUS.md', () => {
        const result = classifyMcpServer(MCPS_FIXTURE, 'errored-server');
        assert.equal(result.status, 'errored');
    });

    it('classifies absent when server directory is missing', () => {
        const result = classifyMcpServer(MCPS_FIXTURE, 'missing-server');
        assert.equal(result.status, 'absent');
    });
});

describe('governance classification', () => {
    it('flags Runlayer-managed entries', () => {
        const config = scanMcpConfigFile(path.join(FIXTURE_ROOT, 'governance', 'runlayer.mcp.json'));
        assert.equal(config.servers[0]?.classification, 'runlayer-managed');
    });

    it('flags shadow remote and stdio entries', () => {
        const config = scanMcpConfigFile(path.join(FIXTURE_ROOT, 'governance', 'shadow.mcp.json'));
        const byName = Object.fromEntries(config.servers.map((server) => [server.name, server.classification]));
        assert.equal(byName['shadow-remote'], 'shadow-remote');
        assert.equal(byName['shadow-stdio'], 'shadow-stdio');
    });

    it('detects runlayer command entries', () => {
        assert.equal(
            isRunlayerManagedEntry({ command: 'runlayer', args: ['run', '00000000-0000-0000-0000-000000000000'] }),
            true,
        );
    });
});

describe('runMcpPreflight', () => {
    it('collects fallbacks when critical MCP is absent and allowFallback is set', () => {
        const report = runMcpPreflight({
            mcpsDir: MCPS_FIXTURE,
            repoRoot: FIXTURE_ROOT,
            allowFallback: true,
        });

        assert.equal(report.summary.proceed, true);
        assert.equal(report.summary.criticalUsable, false);
        assert.ok(report.summary.recommendedFallbacks.length > 0);
    });

    it('fails proceed when critical MCP is absent and allowFallback is false', () => {
        const report = runMcpPreflight({
            mcpsDir: MCPS_FIXTURE,
            repoRoot: FIXTURE_ROOT,
            allowFallback: false,
        });

        assert.equal(report.summary.proceed, false);
    });

    it('supports governance-only mode without MCP server checks', () => {
        const previousCwd = process.cwd();
        const searchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-'));
        const tempDir = path.join(searchRoot, 'repo');
        fs.mkdirSync(tempDir);

        try {
            process.chdir(searchRoot);
            fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', 'shadow.mcp.json'), path.join(tempDir, '.mcp.json'));

            const report = runMcpPreflight({
                mcpsDir: MCPS_FIXTURE,
                repoRoot: tempDir,
                governanceOnly: true,
            });

            assert.equal(report.governanceOnly, true);
            assert.equal(report.mcpServers.length, 0);
            assert.equal(report.summary.criticalUsable, false);
            assert.equal(report.summary.proceed, true);
            assert.ok(report.governance.shadowCount >= 2);
        } finally {
            process.chdir(previousCwd);
        }
    });
});

describe('registry helpers', () => {
    it('builds report entries for all registered security MCP servers', () => {
        const report = buildMcpServerReport(MCPS_FIXTURE);
        assert.equal(report.length, 3);
        assert.ok(report.some((server) => server.tier === 'critical'));
    });

    it('aggregates recommended fallbacks for unusable servers', () => {
        const report = buildMcpServerReport(MCPS_FIXTURE);
        const fallbacks = collectRecommendedFallbacks(report);
        assert.ok(fallbacks.length > 0);
        assert.equal(criticalMcpUsable(report), false);
    });
});

describe('parseArgs', () => {
    it('requires mcps-dir to be provided explicitly', () => {
        const args = parseArgs(['--allow-fallback']);
        assert.equal(args.mcpsDir, null);
        assert.equal(args.allowFallback, true);
    });

    it('parses governance and output flags', () => {
        const args = parseArgs([
            '--mcps-dir',
            '/tmp/mcps',
            '--governance-only',
            '--include-user-config',
            '--output-json',
            '/tmp/report.json',
        ]);
        assert.equal(args.mcpsDir, '/tmp/mcps');
        assert.equal(args.governanceOnly, true);
        assert.equal(args.includeUserConfig, true);
        assert.equal(args.outputJsonPath, '/tmp/report.json');
    });
});

describe('scanMcpConfigFile error handling', () => {
    it('returns empty servers and error message for malformed JSON', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-bad-json-'));
        const configPath = path.join(tempDir, '.mcp.json');
        fs.writeFileSync(configPath, '{ not valid json');

        const config = scanMcpConfigFile(configPath);
        assert.equal(config.servers.length, 0);
        assert.ok(config.error);
    });
});

describe('discoverMcpConfigPaths', () => {
    it('finds repo-local MCP config files', () => {
        const previousCwd = process.cwd();
        const searchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-search-root-'));
        const tempDir = path.join(searchRoot, 'repo');
        fs.mkdirSync(tempDir);

        try {
            process.chdir(searchRoot);
            fs.copyFileSync(
                path.join(FIXTURE_ROOT, 'governance', 'runlayer.mcp.json'),
                path.join(tempDir, '.mcp.json'),
            );

            const configs = discoverMcpConfigPaths(tempDir);
            assert.equal(configs.length, 1);
            assert.equal(configs[0]?.servers[0]?.name, 'managed');
            assert.equal(configs[0]?.error, null);
        } finally {
            process.chdir(previousCwd);
        }
    });
});
