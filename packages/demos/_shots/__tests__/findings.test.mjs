/**
 * Findings are the hand-off between a review pass and the fix: flags, notes, markdown.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFindings } from '../findings.js';

function fakeStorage() {
    const map = new Map();

    return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}

describe('createFindings', () => {
    it('toggles flags and persists them', () => {
        const storage = fakeStorage();
        const findings = createFindings(storage);

        findings.toggleFlag('basics/start');
        assert.deepEqual(findings.flaggedKeys(), ['basics/start']);

        assert.deepEqual(createFindings(storage).flaggedKeys(), ['basics/start']);

        findings.toggleFlag('basics/start');
        assert.deepEqual(findings.flaggedKeys(), []);
    });

    it('keeps notes per key and exports markdown', () => {
        const findings = createFindings(fakeStorage());

        findings.addNote('synth-toy/playing', 'Loop checkbox hugs the panel rim');
        findings.toggleFlag('basics/start');

        assert.equal(
            findings.toMarkdown(),
            '- basics / start: flagged\n- synth-toy / playing: Loop checkbox hugs the panel rim\n',
        );
    });

    it('ignores an empty note', () => {
        const findings = createFindings(fakeStorage());

        findings.addNote('basics/start', '   ');
        assert.deepEqual(findings.notesFor('basics/start'), []);
    });
});
