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

import { classifyFile, generateClaudeAdapter, generateCursorAdapter, kitRoot } from '../dist/adapters.js';

const here = dirname(fileURLToPath(import.meta.url));

/** The website's published server card – the canonical definition these adapters mirror. */
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
    // "harmonize" the shapes to make this test pass – fix the adapter instead.
    assert.equal(card.transport.type, 'streamable-http');
    assert.equal(claude.mcpServers[name].type, 'http', 'Claude Code needs the http alias of streamable-http');
    assert.ok(!('type' in cursor.mcpServers[name]), 'Cursor infers the transport from url; a type would mark stdio');
});

test('both MCP configs are kit-owned, so agents sync keeps them current', () => {
    assert.equal(classifyFile('.mcp.json'), 'kit-owned');
    assert.equal(classifyFile('.cursor/mcp.json'), 'kit-owned');
});
