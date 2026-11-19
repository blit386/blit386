/**
 * The optional CI template pins `actions/checkout` and `actions/setup-node` by commit SHA. Renovate keeps this repo's
 * own workflows current and, through `renovate.json`, this template in the same PR, so this test holds the template to
 * the SHAs those workflows use. (`agent-copilot.test.mjs` already holds the kit's Copilot setup workflow to the template.)
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

test("renovate.json's copilot.ts regex manager still matches both action pins", () => {
    const root = join(here, '..', '..', '..');
    const config = JSON.parse(readFileSync(join(root, 'renovate.json'), 'utf8'));
    const manager = config.customManagers.find((m) => m.managerFilePatterns.some((p) => p.includes('copilot')));
    assert.ok(manager, 'renovate.json has a custom manager for copilot.ts');

    const source = readFileSync(join(root, 'packages', 'kit', 'src', 'adapters', 'copilot.ts'), 'utf8');
    const names = [...source.matchAll(new RegExp(manager.matchStrings[0], 'g'))].map((m) => m.groups.depName);
    assert.deepEqual(names.sort(), ['actions/checkout', 'actions/setup-node']);
});

test("renovate.json's package.json.tmpl regex manager matches every literal devDependency of both templates", () => {
    const root = join(here, '..', '..', '..');
    const config = JSON.parse(readFileSync(join(root, 'renovate.json'), 'utf8'));
    const manager = config.customManagers.find((m) =>
        m.managerFilePatterns.some((p) => p.includes('package\\.json\\.tmpl')),
    );
    assert.ok(manager, 'renovate.json has a custom manager for the package.json templates');

    for (const language of ['js', 'ts']) {
        const text = readFileSync(join(here, '..', 'templates', language, 'package.json.tmpl'), 'utf8');
        const matched = [...text.matchAll(new RegExp(manager.matchStrings[0], 'g'))].map((m) => m.groups.depName);
        const literal = Object.entries(JSON.parse(text).devDependencies)
            .filter(([, range]) => !range.includes('{{'))
            .map(([name]) => name);
        assert.deepEqual(
            matched.sort(),
            literal.sort(),
            `${language}/package.json.tmpl devDependencies Renovate can see`,
        );
    }
});
