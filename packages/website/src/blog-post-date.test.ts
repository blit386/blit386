/**
 * Covers `getPostDate`, the frontmatter `date` reader `feedPlugin` and the blog index share.
 *
 * The function exists because `date` crosses the Vite dev/RSC boundary as an ISO string rather
 * than the `Date` the framework adapter looks for, so both representations have to work. The
 * epoch case is the one worth keeping: `0` is a valid timestamp and a falsy number, so a
 * truthiness check instead of a `NaN` check would silently drop it.
 */

import { describe, expect, it } from 'vitest';
import { getPostDate } from './blog-post-date';

describe('getPostDate', () => {
    describe('accepts', () => {
        it('a Date instance, returned unchanged', () => {
            const date = new Date('2026-07-04T12:00:00.000Z');

            expect(getPostDate({ data: { date } })).toBe(date);
        });

        it('an ISO string', () => {
            expect(getPostDate({ data: { date: '2026-07-04' } })?.toISOString()).toBe('2026-07-04T00:00:00.000Z');
        });

        it('an epoch number', () => {
            expect(getPostDate({ data: { date: 1_767_225_600_000 } })?.getTime()).toBe(1_767_225_600_000);
        });

        it('the epoch itself, which is falsy but valid', () => {
            expect(getPostDate({ data: { date: 0 } })?.toISOString()).toBe('1970-01-01T00:00:00.000Z');
        });
    });

    describe('rejects', () => {
        it.each([
            ['an invalid Date instance', new Date('nope')],
            ['a string that cannot be parsed', 'not a date'],
            ['NaN', Number.NaN],
            ['null', null],
            ['a boolean', true],
            ['an object', {}],
        ])('%s', (_label, date) => {
            expect(getPostDate({ data: { date } })).toBeUndefined();
        });

        it('frontmatter with no date field', () => {
            expect(getPostDate({ data: {} })).toBeUndefined();
        });

        it.each([
            ['null data', null],
            ['undefined data', undefined],
        ])('%s', (_label, data) => {
            expect(getPostDate({ data })).toBeUndefined();
        });
    });
});
