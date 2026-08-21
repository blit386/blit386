#!/usr/bin/env node
/**
 * Validate the shape of every agent-facing `.well-known` file this site publishes:
 * the agent-skills discovery index (0.2.0), the MCP server-card, the RFC 9727
 * api-catalog linkset, and the two OAuth discovery documents (RFC 8414 / RFC 9728).
 *
 * None of these files declare a live, fetchable JSON Schema except the agent-skills
 * index (`$schema: https://schemas.agentskills.io/discovery/0.2.0/schema.json`), and
 * fetching that over the network would make this check non-deterministic. Every
 * schema here is instead hand-encoded from the relevant spec / the shape this repo
 * already ships, using `zod` (already a direct dependency of this package).
 *
 * This only checks structure – it does not check that any advertised URL actually
 * resolves. See `check-well-known-urls.mjs` for that.
 *
 * Usage:
 *   node scripts/check-well-known-schemas.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WELL_KNOWN_DIR = join(PACKAGE_ROOT, 'public', '.well-known');

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ABSOLUTE_URL_PATTERN = /^https?:\/\//u;

/** Agent-skills discovery manifest (`.well-known/agent-skills/index.json`), spec version 0.2.0. */
const AgentSkillsIndexSchema = z.object({
    $schema: z.literal('https://schemas.agentskills.io/discovery/0.2.0/schema.json'),
    skills: z
        .array(
            z.object({
                name: z.string().min(1),
                type: z.literal('skill-md'),
                description: z.string().min(1),
                url: z.string().min(1),
                digest: z.string().regex(SHA256_DIGEST_PATTERN, 'must be "sha256:" followed by 64 hex characters'),
            }),
        )
        .min(1, 'skills must not be empty'),
});

/** MCP server-card (`.well-known/mcp/server-card.json`). */
const ServerCardSchema = z.object({
    serverInfo: z.object({
        name: z.string().min(1),
        version: z.string().min(1),
    }),
    description: z.string().min(1),
    url: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
    transport: z.object({
        type: z.string().min(1),
    }),
    capabilities: z.record(z.string(), z.boolean()),
});

/** RFC 9727 api-catalog linkset (`.well-known/api-catalog`, no file extension). */
const ApiCatalogSchema = z.object({
    linkset: z
        .array(
            z.object({
                anchor: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
                'service-doc': z
                    .array(
                        z.object({
                            href: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
                            type: z.string().min(1),
                        }),
                    )
                    .optional(),
            }),
        )
        .min(1, 'linkset must not be empty'),
});

/** RFC 8414 authorization server metadata, plus this site's `agent_auth` extension. */
const OauthAuthorizationServerSchema = z.object({
    issuer: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
    agent_auth: z
        .object({
            skill: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
            identity_types_supported: z.array(z.string()),
            identity_assertion: z.object({
                assertion_types_supported: z.array(z.string()),
            }),
        })
        .optional(),
});

/** RFC 9728 protected resource metadata. */
const OauthProtectedResourceSchema = z.object({
    resource: z.string().regex(ABSOLUTE_URL_PATTERN, 'must be an absolute URL'),
    resource_name: z.string().min(1).optional(),
    scopes_supported: z.array(z.string()).optional(),
});

/**
 * One schema-validated well-known file: its repo-relative path (for error messages),
 * its path on disk under `public/.well-known`, and the zod schema it must satisfy.
 *
 * @typedef {{ label: string, path: string, schema: z.ZodType }} WellKnownFile
 */

/** @type {WellKnownFile[]} */
export const WELL_KNOWN_FILES = [
    {
        label: '.well-known/agent-skills/index.json',
        path: join(WELL_KNOWN_DIR, 'agent-skills', 'index.json'),
        schema: AgentSkillsIndexSchema,
    },
    {
        label: '.well-known/mcp/server-card.json',
        path: join(WELL_KNOWN_DIR, 'mcp', 'server-card.json'),
        schema: ServerCardSchema,
    },
    {
        label: '.well-known/api-catalog',
        path: join(WELL_KNOWN_DIR, 'api-catalog'),
        schema: ApiCatalogSchema,
    },
    {
        label: '.well-known/oauth-authorization-server',
        path: join(WELL_KNOWN_DIR, 'oauth-authorization-server'),
        schema: OauthAuthorizationServerSchema,
    },
    {
        label: '.well-known/oauth-protected-resource',
        path: join(WELL_KNOWN_DIR, 'oauth-protected-resource'),
        schema: OauthProtectedResourceSchema,
    },
];

/**
 * Validates one well-known file's already-parsed JSON content against its schema.
 *
 * @param {z.ZodType} schema
 * @param {unknown} content
 * @returns {string[]} Human-readable failure messages (empty when valid).
 */
export function validateWellKnownContent(schema, content) {
    const result = schema.safeParse(content);

    if (result.success) {
        return [];
    }

    return result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `${path}: ${issue.message}`;
    });
}

/**
 * Reads and validates every file in `WELL_KNOWN_FILES` against its schema.
 *
 * @param {WellKnownFile[]} files
 * @returns {string[]} Human-readable failure messages, prefixed with the file label.
 */
export function checkAllWellKnownFiles(files) {
    const failures = [];

    for (const file of files) {
        if (!existsSync(file.path)) {
            failures.push(`${file.label}: file does not exist`);
            continue;
        }

        let content;

        try {
            content = JSON.parse(readFileSync(file.path, 'utf8'));
        } catch (error) {
            failures.push(`${file.label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
            continue;
        }

        for (const message of validateWellKnownContent(file.schema, content)) {
            failures.push(`${file.label}: ${message}`);
        }
    }

    return failures;
}

function main() {
    const failures = checkAllWellKnownFiles(WELL_KNOWN_FILES);

    if (failures.length > 0) {
        console.error('Well-known artifact schema check failed:');

        for (const failure of failures) {
            console.error(`  - ${failure}`);
        }

        process.exit(1);
    }

    console.log(`Well-known artifact schemas OK (${WELL_KNOWN_FILES.length} files checked).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
