/**
 * Guards the documentation-MCP configuration the adapters emit into every generated game.
 *
 * The server name and URL in `src/adapters.ts` are a deliberate copy of the canonical definition in
 * the website package, which the kit cannot import across the package boundary. These tests compare
 * the two, so an edit on either side that is not mirrored on the other fails here instead of shipping
 * a generated game that points at a dead endpoint.
 *
 * Imports the built dist module; the package `pretest` script runs `pnpm run build` first.
 */

import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    classifyFile,
    generateAntigravityAdapter,
    generateClaudeAdapter,
    generateCursorAdapter,
    generateGeminiAdapter,
    kitRoot,
} from '../dist/adapters.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The website's published server card - the canonical definition these adapters mirror. */
const SERVER_CARD_PATH = join(here, '..', '..', 'website', 'public', '.well-known', 'mcp', 'server-card.json');

/** `packages/website` is not part of the published kit tarball, so skip rather than throw outside the monorepo. */
const hasServerCard = existsSync(SERVER_CARD_PATH);

/** Template vars are irrelevant to the MCP config, but the generators require them. */
const VARS = {
    pmInstall: 'npm install',
    pmRunDev: 'npm run dev',
    pmRunBuild: 'npm run build',
    pmRunFormat: 'npm run format',
    pmRunLint: 'npm run lint',
};

/** Parse the single MCP config an adapter emits at `path`. */
function readEmittedConfig(generated, path) {
    const file = generated.find((f) => f.path === path);
    assert.ok(file, `adapter should emit ${path}`);
    assert.ok(file.content.endsWith('\n'), `${path} should end with a newline`);
    return JSON.parse(file.content);
}

test('the emitted MCP configs match the website server card', { skip: !hasServerCard }, () => {
    const card = JSON.parse(readFileSync(SERVER_CARD_PATH, 'utf8'));
    const name = card.serverInfo.name;

    const claude = readEmittedConfig(generateClaudeAdapter(kitRoot(), VARS), '.mcp.json');
    const cursor = readEmittedConfig(generateCursorAdapter(kitRoot(), VARS), '.cursor/mcp.json');

    // Each config declares exactly the one server the card describes, at the card's URL.
    assert.deepEqual(Object.keys(claude.mcpServers), [name]);
    assert.deepEqual(Object.keys(cursor.mcpServers), [name]);
    assert.equal(claude.mcpServers[name].url, card.url);
    assert.equal(cursor.mcpServers[name].url, card.url);

    // The two entries differ by one key on purpose. Claude Code skips a remote entry that has a `url`
    // but no `type`; for Cursor a `type` marks a local stdio server and would misread this one. Do not
    // "harmonize" the shapes to make this test pass - fix the adapter instead.
    assert.equal(card.transport.type, 'streamable-http');
    assert.equal(claude.mcpServers[name].type, 'http', 'Claude Code needs the http alias of streamable-http');
    assert.ok(!('type' in cursor.mcpServers[name]), 'Cursor infers the transport from url; a type would mark stdio');

    // Gemini CLI reads `url` as SSE, so the same endpoint goes under `httpUrl`.
    const gemini = readEmittedConfig(generateGeminiAdapter(kitRoot(), VARS), '.gemini/settings.json');
    assert.deepEqual(Object.keys(gemini.mcpServers), [name]);
    assert.equal(gemini.mcpServers[name].httpUrl, card.url);
    assert.ok(!('url' in gemini.mcpServers[name]), 'a url key would make Gemini CLI speak SSE');
});

test('the Claude settings pre-approve the same server .mcp.json declares', () => {
    const generated = generateClaudeAdapter(kitRoot(), VARS);
    const settings = readEmittedConfig(generated, '.claude/settings.json');
    const mcp = readEmittedConfig(generated, '.mcp.json');

    // Pinned to the keys of the emitted .mcp.json (itself checked against the server card above), so a
    // rename cannot leave the approval pointing at a server that no longer exists.
    assert.deepEqual(settings.enabledMcpjsonServers, Object.keys(mcp.mcpServers));
    if (hasServerCard) {
        const card = JSON.parse(readFileSync(SERVER_CARD_PATH, 'utf8'));
        assert.deepEqual(settings.enabledMcpjsonServers, [card.serverInfo.name]);
    }

    // Cursor has no such key; a stray one could break its config.
    const cursor = readEmittedConfig(generateCursorAdapter(kitRoot(), VARS), '.cursor/mcp.json');
    assert.ok(!('enabledMcpjsonServers' in cursor), 'Cursor config must not carry enabledMcpjsonServers');
});

test('both MCP configs are kit-owned, so agents sync keeps them current', () => {
    assert.equal(classifyFile('.mcp.json'), 'kit-owned');
    assert.equal(classifyFile('.cursor/mcp.json'), 'kit-owned');
});

test('Antigravity gets serverUrl, never url or httpUrl, in .agents/mcp_config.json', () => {
    const config = readEmittedConfig(generateAntigravityAdapter(kitRoot(), VARS), '.agents/mcp_config.json');
    const [entry] = Object.values(config.mcpServers);

    assert.deepEqual(Object.keys(config.mcpServers), ['blit386-docs']);
    assert.deepEqual(entry, { serverUrl: 'https://blit386.dev/mcp' });
    assert.equal(classifyFile('.agents/mcp_config.json'), 'kit-owned');
});
