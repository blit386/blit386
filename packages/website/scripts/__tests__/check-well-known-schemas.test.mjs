import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { checkAllWellKnownFiles, WELL_KNOWN_FILES, validateWellKnownContent } from '../check-well-known-schemas.mjs';

const VALID_AGENT_SKILLS_INDEX = {
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
        {
            name: 'blit386-docs',
            type: 'skill-md',
            description: 'Navigate and query the BLIT386 documentation site.',
            url: '/.well-known/agent-skills/blit386-docs/SKILL.md',
            digest: `sha256:${'a'.repeat(64)}`,
        },
    ],
};

const VALID_SERVER_CARD = {
    serverInfo: { name: 'blit386-docs', version: '1.0.0' },
    description: 'Documentation server.',
    url: 'https://blit386.dev/mcp',
    transport: { type: 'streamable-http' },
    capabilities: { tools: true },
};

const VALID_API_CATALOG = {
    linkset: [
        {
            anchor: 'https://blit386.dev/mcp',
            'service-doc': [{ href: 'https://blit386.dev/mcp-server', type: 'text/html' }],
        },
    ],
};

const VALID_OAUTH_AUTHORIZATION_SERVER = {
    issuer: 'https://blit386.dev/',
    agent_auth: {
        skill: 'https://blit386.dev/auth.md',
        identity_types_supported: ['anonymous'],
        identity_assertion: { assertion_types_supported: [] },
    },
};

const VALID_OAUTH_PROTECTED_RESOURCE = {
    resource: 'https://blit386.dev/',
    resource_name: 'BLIT386 Documentation',
    scopes_supported: [],
};

/** @param {string} label */
function schemaFor(label) {
    const file = WELL_KNOWN_FILES.find((entry) => entry.label === label);
    assert.ok(file, `no WELL_KNOWN_FILES entry for ${label}`);
    return file.schema;
}

/**
 * Asserts `failures` holds exactly one message and it matches `pattern`.
 *
 * @param {string[]} failures
 * @param {RegExp} pattern
 */
function assertSingleFailureMatches(failures, pattern) {
    assert.equal(failures.length, 1);
    const [message = ''] = failures;
    assert.match(message, pattern);
}

describe('check-well-known-schemas', () => {
    describe('agent-skills index', () => {
        const schema = schemaFor('.well-known/agent-skills/index.json');

        test('passes for a valid manifest', () => {
            assert.deepEqual(validateWellKnownContent(schema, VALID_AGENT_SKILLS_INDEX), []);
        });

        test('fails on a malformed digest', () => {
            const invalid = {
                ...VALID_AGENT_SKILLS_INDEX,
                skills: [{ ...VALID_AGENT_SKILLS_INDEX.skills[0], digest: 'sha256:not-hex' }],
            };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /64 hex characters/);
        });

        test('fails on an empty skills array', () => {
            const invalid = { ...VALID_AGENT_SKILLS_INDEX, skills: [] };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /skills must not be empty/);
        });

        test('fails on a wrong $schema version', () => {
            const invalid = {
                ...VALID_AGENT_SKILLS_INDEX,
                $schema: 'https://schemas.agentskills.io/discovery/0.1.0/schema.json',
            };
            assert.equal(validateWellKnownContent(schema, invalid).length, 1);
        });
    });

    describe('server-card', () => {
        const schema = schemaFor('.well-known/mcp/server-card.json');

        test('passes for a valid card', () => {
            assert.deepEqual(validateWellKnownContent(schema, VALID_SERVER_CARD), []);
        });

        test('fails when serverInfo.version is missing', () => {
            const invalid = { ...VALID_SERVER_CARD, serverInfo: { name: 'blit386-docs' } };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /serverInfo\.version/);
        });

        test('fails when url is not absolute', () => {
            const invalid = { ...VALID_SERVER_CARD, url: '/mcp' };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /absolute URL/);
        });
    });

    describe('api-catalog', () => {
        const schema = schemaFor('.well-known/api-catalog');

        test('passes for a valid linkset', () => {
            assert.deepEqual(validateWellKnownContent(schema, VALID_API_CATALOG), []);
        });

        test('fails on an empty linkset', () => {
            assertSingleFailureMatches(validateWellKnownContent(schema, { linkset: [] }), /linkset must not be empty/);
        });

        test('fails when a service-doc href is relative', () => {
            const invalid = {
                linkset: [
                    { anchor: 'https://blit386.dev/mcp', 'service-doc': [{ href: '/mcp-server', type: 'text/html' }] },
                ],
            };
            assert.equal(validateWellKnownContent(schema, invalid).length, 1);
        });
    });

    describe('oauth-authorization-server', () => {
        const schema = schemaFor('.well-known/oauth-authorization-server');

        test('passes for a valid document', () => {
            assert.deepEqual(validateWellKnownContent(schema, VALID_OAUTH_AUTHORIZATION_SERVER), []);
        });

        test('passes without the agent_auth extension', () => {
            assert.deepEqual(validateWellKnownContent(schema, { issuer: 'https://blit386.dev/' }), []);
        });

        test('fails when issuer is missing', () => {
            const invalid = { agent_auth: VALID_OAUTH_AUTHORIZATION_SERVER.agent_auth };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /issuer/);
        });
    });

    describe('oauth-protected-resource', () => {
        const schema = schemaFor('.well-known/oauth-protected-resource');

        test('passes for a valid document', () => {
            assert.deepEqual(validateWellKnownContent(schema, VALID_OAUTH_PROTECTED_RESOURCE), []);
        });

        test('fails when resource is missing', () => {
            const invalid = { resource_name: 'BLIT386 Documentation' };
            assertSingleFailureMatches(validateWellKnownContent(schema, invalid), /resource/);
        });
    });

    describe('checkAllWellKnownFiles', () => {
        test('reports a missing file by label rather than throwing', () => {
            const failures = checkAllWellKnownFiles([
                {
                    label: 'does-not-exist.json',
                    path: '/nonexistent/does-not-exist.json',
                    schema: schemaFor('.well-known/mcp/server-card.json'),
                },
            ]);
            assertSingleFailureMatches(failures, /does-not-exist\.json: file does not exist/);
        });

        test('passes against the real repo files', () => {
            assert.deepEqual(checkAllWellKnownFiles(WELL_KNOWN_FILES), []);
        });
    });
});
