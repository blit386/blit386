/**
 * `replaceManagedRegion`: swaps the kit-managed block of a shared file in place. User notes outside the markers are
 * free text, so a marker quoted in a sentence must never move the splice point, and a file without exactly one
 * marker pair on lines of their own returns null so the caller writes a conflict copy.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { replaceManagedRegion } from '../dist/adapters.js';

const START = '<!-- blit-kit:managed:start -->';
const END = '<!-- blit-kit:managed:end -->';

const region = (body) => `${START}\n${body}\n${END}`;
const count = (text, needle) => text.split(needle).length - 1;

describe('replaceManagedRegion', () => {
    it('replaces the region in place and keeps the text around it', () => {
        const existing = `notes\n${region('old')}\ntail\n`;
        const result = replaceManagedRegion(existing, region('new'));

        assert.equal(result, `notes\n${region('new')}\ntail\n`);
    });

    it('stays at one region, idempotently, when notes above it mention the end marker', () => {
        const existing = `see \`${END}\` below\n\n${region('old')}\n`;
        const first = replaceManagedRegion(existing, region('new'));
        const second = replaceManagedRegion(first, region('new'));

        assert.equal(count(first, START), 1);
        assert.equal(count(first, 'new'), 1);
        assert.ok(first.startsWith(`see \`${END}\` below\n`));
        assert.equal(second, first);
    });

    it('ignores an end marker mentioned in the notes of the regenerated file', () => {
        const regenerated = `mention ${END}\n${region('new')}`;
        const result = replaceManagedRegion(region('old'), regenerated);

        assert.equal(result, region('new'));
    });

    it('returns null when the existing file has no end marker after its start', () => {
        assert.equal(replaceManagedRegion(`${END}\n${START}\nbody\n`, region('new')), null);
        assert.equal(replaceManagedRegion(`${START}\nbody\n`, region('new')), null);
    });

    it('returns null when the regenerated file has no end marker after its start', () => {
        assert.equal(replaceManagedRegion(region('old'), `${END}\n${START}\nbody\n`), null);
    });

    it('keeps notes that mention the start marker above or below the region', () => {
        const existing = `begins at \`${START}\`\n${region('old')}\nafter \`${START}\`\n`;
        const result = replaceManagedRegion(existing, region('new'));

        assert.equal(result, `begins at \`${START}\`\n${region('new')}\nafter \`${START}\`\n`);
    });

    it('keeps notes that mention both markers above the region', () => {
        const existing = `wrap it in \`${START}\` and \`${END}\`\n${region('old')}\n`;
        const result = replaceManagedRegion(existing, region('new'));

        assert.equal(result, `wrap it in \`${START}\` and \`${END}\`\n${region('new')}\n`);
    });

    it('returns null when a marker stands on its own line in the notes, so the region is ambiguous', () => {
        assert.equal(replaceManagedRegion(`${region('old')}\nexample:\n${region('sample')}\n`, region('new')), null);
        assert.equal(replaceManagedRegion(`${START}\n${END}\n${region('old')}\n`, region('new')), null);
    });

    it('accepts CRLF line endings on the marker lines', () => {
        const result = replaceManagedRegion(`notes\r\n${START}\r\nold\r\n${END}\r\ntail\r\n`, region('new'));

        assert.equal(result, `notes\r\n${region('new')}\r\ntail\r\n`);
    });
});
