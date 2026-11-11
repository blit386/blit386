/**
 * The optional CI template pins `actions/checkout` and `actions/setup-node` by commit SHA. Renovate keeps this repo's
 * own workflows current but does not scan `templates/`, so this test holds the template to the SHAs those workflows
 * use. (`agent-copilot.test.mjs` already holds the kit's Copilot setup workflow to the template.)
 */

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { here } from './helpers.mjs';

const PINNED_ACTION = /^\s*uses: (actions\/(?:checkout|setup-node))@(\S+)/gm;

/** Every `action -> sha` pair of checkout and setup-node in a workflow text. */
function pins(text) {
    return [...text.matchAll(PINNED_ACTION)].map(([, action, sha]) => [action, sha]);
}

test('the optional CI template pins the same action SHAs as the repo workflows', () => {
    const workflows = join(here, '..', '..', '..', '.github', 'workflows');
    const repoShas = new Map();

    for (const name of readdirSync(workflows).filter((file) => file.endsWith('.yml'))) {
        for (const [action, sha] of pins(readFileSync(join(workflows, name), 'utf8'))) {
            repoShas.set(action, new Set([...(repoShas.get(action) ?? []), sha]));
        }
    }

    const template = readFileSync(
        join(here, '..', 'templates', 'optional', 'ci', 'github', 'workflows', 'ci.yml'),
        'utf8',
    );
    const templatePins = pins(template);
    assert.equal(templatePins.length, 2, 'the template uses checkout and setup-node');

    for (const [action, sha] of templatePins) {
        const shas = [...(repoShas.get(action) ?? [])];
        assert.equal(shas.length, 1, `the repo workflows should agree on one ${action} SHA, found: ${shas.join(', ')}`);
        assert.equal(sha, shas[0], `${action} in the template should match the repo workflows`);
    }
});
