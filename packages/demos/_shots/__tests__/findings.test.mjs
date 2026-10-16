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

    it('starts empty from corrupt JSON', () => {
        const storage = fakeStorage();

        storage.setItem('blit386-shots-findings', '{not json');

        const findings = createFindings(storage);

        assert.deepEqual(findings.flaggedKeys(), []);
        assert.equal(findings.toMarkdown(), '\n');
    });

    it('drops stored values of the wrong shape and keeps the valid ones', () => {
        const storage = fakeStorage();

        storage.setItem(
            'blit386-shots-findings',
            JSON.stringify({ flagged: ['basics/start', 7, null], notes: ['not', 'an', 'object'] }),
        );

        const findings = createFindings(storage);

        assert.deepEqual(findings.flaggedKeys(), ['basics/start']);
        assert.deepEqual(findings.notesFor('basics/start'), []);

        storage.setItem(
            'blit386-shots-findings',
            JSON.stringify({ flagged: 'x', notes: { 'a/b': ['ok', 3], 'c/d': 'no' } }),
        );

        const again = createFindings(storage);

        assert.deepEqual(again.flaggedKeys(), []);
        assert.deepEqual(again.notesFor('a/b'), ['ok']);
        assert.deepEqual(again.notesFor('c/d'), []);
    });

    it('keeps working in memory when storage refuses a write', () => {
        const storage = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError');
            },
        };
        const findings = createFindings(storage);

        findings.toggleFlag('basics/start');
        findings.addNote('basics/start', 'tight');

        assert.deepEqual(findings.flaggedKeys(), ['basics/start']);
        assert.deepEqual(findings.notesFor('basics/start'), ['tight']);
    });
});
