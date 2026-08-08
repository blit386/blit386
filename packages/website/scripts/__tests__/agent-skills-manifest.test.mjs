import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));
const MANIFEST_PATH = fileURLToPath(new URL('../../public/.well-known/agent-skills/index.json', import.meta.url));

describe('agent-skills manifest digests', () => {
    test('every entry digest matches a fresh hash of its url target', async () => {
        const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

        assert.ok(Array.isArray(manifest.skills), 'manifest.skills must be an array');
        assert.ok(manifest.skills.length > 0, 'manifest.skills must not be empty');

        for (const skill of manifest.skills) {
            const targetPath = fileURLToPath(new URL(`.${skill.url}`, `file://${PUBLIC_DIR}`));
            const content = await readFile(targetPath);
            const actualDigest = `sha256:${createHash('sha256').update(content).digest('hex')}`;

            assert.equal(
                skill.digest,
                actualDigest,
                `stale digest for '${skill.name}' (${skill.url}): manifest declares '${skill.digest}', file hashes to '${actualDigest}'`,
            );
        }
    });
});
