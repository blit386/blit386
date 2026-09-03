import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-preflight.mjs');

/**
 * Runs the script's own CLI entry point end-to-end (not just its exported functions), so
 * main()'s argv-validation branches and process.exit codes are exercised for real.
 * @param {string[]} args
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function runCli(args) {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8' });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

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

    it('fails proceed in governance-only mode when shadow entries are unaccepted', () => {
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
            assert.equal(report.summary.proceed, false);
            assert.ok(report.governance.shadowCount >= 2);
            assert.equal(report.governance.acceptedShadowServers.length, 0);
            assert.ok(report.governance.unacceptedShadowServers.length >= 2);
        } finally {
            process.chdir(previousCwd);
        }
    });

    it('proceeds in governance-only mode when only the accepted shadow entry is present', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-accepted-'));

        fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', 'accepted.mcp.json'), path.join(tempDir, '.mcp.json'));

        const report = runMcpPreflight({
            mcpsDir: MCPS_FIXTURE,
            repoRoot: tempDir,
            governanceOnly: true,
        });

        assert.equal(report.summary.proceed, true);
        assert.equal(report.governance.acceptedShadowServers.length, 1);
        assert.equal(report.governance.acceptedShadowServers[0]?.name, 'blit386-docs');
        assert.equal(report.governance.unacceptedShadowServers.length, 0);
    });

    it('fails proceed in governance-only mode when an unaccepted entry sits alongside the accepted one', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-mixed-'));

        fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', 'mixed.mcp.json'), path.join(tempDir, '.mcp.json'));

        const report = runMcpPreflight({
            mcpsDir: MCPS_FIXTURE,
            repoRoot: tempDir,
            governanceOnly: true,
        });

        assert.equal(report.summary.proceed, false);
        assert.equal(report.governance.acceptedShadowServers.length, 1);
        assert.equal(report.governance.unacceptedShadowServers.length, 1);
        assert.equal(report.governance.unacceptedShadowServers[0]?.name, 'shadow-remote');
    });

    it('degrades gracefully when mcps-dir does not exist at all, honoring allowFallback', () => {
        const missingMcpsDir = path.join(os.tmpdir(), 'mcp-preflight-does-not-exist', String(Date.now()));

        const report = runMcpPreflight({
            mcpsDir: missingMcpsDir,
            repoRoot: FIXTURE_ROOT,
            allowFallback: true,
        });

        assert.equal(report.summary.proceed, true);
        assert.equal(report.summary.criticalUsable, false);
        assert.ok(report.mcpServers.every((server) => server.status === 'absent'));
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

describe('CLI (main)', () => {
    it('exits 1 with a usage message when --mcps-dir is missing and --governance-only is not set', () => {
        const result = runCli([]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, /--mcps-dir is required unless --governance-only is set/);
    });

    it('exits 0 in governance-only mode with no --mcps-dir when only the accepted entry is present', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-cli-accepted-'));
        fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', 'accepted.mcp.json'), path.join(tempDir, '.mcp.json'));

        const result = runCli(['--governance-only', '--repo-root', tempDir]);

        assert.equal(result.status, 0);
        assert.match(result.stdout, /Proceed: true/);
        assert.match(result.stdout, /Accepted shadow MCP entries:/);
    });

    it('exits 1 in governance-only mode with no --mcps-dir when an unaccepted shadow entry is present', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-cli-shadow-'));
        fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', 'shadow.mcp.json'), path.join(tempDir, '.mcp.json'));

        const result = runCli(['--governance-only', '--repo-root', tempDir]);

        assert.equal(result.status, 1);
        assert.match(result.stdout, /Proceed: false/);
        assert.match(result.stdout, /Unaccepted shadow MCP entries flagged:/);
    });

    it('exits 0 in full mode when --mcps-dir does not exist and --allow-fallback is set', () => {
        const missingMcpsDir = path.join(os.tmpdir(), 'mcp-preflight-cli-does-not-exist', String(Date.now()));

        const result = runCli(['--mcps-dir', missingMcpsDir, '--repo-root', FIXTURE_ROOT, '--allow-fallback']);

        assert.equal(result.status, 0);
        assert.match(result.stdout, /Proceed: true/);
        assert.match(result.stdout, /status=absent/);
    });

    it('exits 1 in full mode when the critical MCP is unusable and --allow-fallback is not set', () => {
        const result = runCli(['--mcps-dir', MCPS_FIXTURE, '--repo-root', FIXTURE_ROOT]);

        assert.equal(result.status, 1);
        assert.match(result.stdout, /Proceed: false/);
    });
});
