/**
 * Unit tests for {@link Random}.
 */

import { describe, expect, it } from 'vitest';

import { Random } from './Random';
import { Rect2i } from './Rect2i';
import { Rng } from './Rng';
import { Vector2i } from './Vector2i';

describe('Random', () => {
    describe('constructor and seed', () => {
        it('should produce the same sequence for the same seed', () => {
            const a = new Random(1234);
            const b = new Random(1234);

            const sequenceA = Array.from({ length: 20 }, () => a.next());
            const sequenceB = Array.from({ length: 20 }, () => b.next());

            expect(sequenceA).toEqual(sequenceB);
        });

        it('should produce different sequences for different seeds', () => {
            const a = new Random(1);
            const b = new Random(2);

            expect(Array.from({ length: 10 }, () => a.next())).not.toEqual(Array.from({ length: 10 }, () => b.next()));
        });

        it('should restart the sequence when reseeded', () => {
            const rng = new Random(99);
            const first = Array.from({ length: 5 }, () => rng.next());

            rng.seed(99);

            expect(Array.from({ length: 5 }, () => rng.next())).toEqual(first);
        });

        it('should accept a seed of 0', () => {
            const rng = new Random(0);

            expect(rng.next()).toBeGreaterThanOrEqual(0);
            expect(rng.next()).toBeLessThan(1);
        });

        it('should report the seed passed to the constructor as seedValue', () => {
            const rng = new Random(1234);

            expect(rng.seedValue).toBe(1234);
        });

        it('should report the seed passed to seed() as seedValue', () => {
            const rng = new Random(1234);

            rng.seed(99);

            expect(rng.seedValue).toBe(99);
        });

        it('should normalize a negative constructor seed to unsigned 32-bit', () => {
            const rng = new Random(-1);

            expect(rng.seedValue).toBe(0xffff_ffff);
        });

        it('should normalize an overflowing seed() value to unsigned 32-bit', () => {
            const rng = new Random(0);

            rng.seed(2 ** 32 + 1);

            expect(rng.seedValue).toBe(1);
        });

        it('should report a reproducible seedValue for a time-seeded generator', () => {
            const timeSeeded = new Random();
            const reported = timeSeeded.seedValue;
            const firstSequence = Array.from({ length: 10 }, () => timeSeeded.next());

            expect(reported).toBeDefined();
            expect(timeSeeded.seedValue).toBe(reported);

            const reseeded = new Random(reported as number);

            expect(Array.from({ length: 10 }, () => reseeded.next())).toEqual(firstSequence);
        });
    });

    describe('next', () => {
        it('should return values in [0, 1)', () => {
            const rng = new Random(1);

            for (let i = 0; i < 1000; i++) {
                const value = rng.next();

                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(1);
            }
        });

        it('should match Rng mulberry32 for the same seed', () => {
            const random = new Random(42);
            const rng = new Rng(42);

            for (let i = 0; i < 50; i++) {
                expect(random.next()).toBe(rng.next());
            }
        });
    });

    describe('float', () => {
        it('should return values in [min, max)', () => {
            const rng = new Random(7);

            for (let i = 0; i < 500; i++) {
                const value = rng.float(10, 20);

                expect(value).toBeGreaterThanOrEqual(10);
                expect(value).toBeLessThan(20);
            }
        });
    });

    describe('int', () => {
        it('should return integers in [0, maxExclusive)', () => {
            const rng = new Random(3);

            for (let i = 0; i < 500; i++) {
                const value = rng.int(6);

                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(6);
            }
        });

        it('should return integers in [min, maxExclusive)', () => {
            const rng = new Random(3);

            for (let i = 0; i < 500; i++) {
                const value = rng.int(10, 20);

                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(10);
                expect(value).toBeLessThan(20);
            }
        });

        it('should throw when maxExclusive <= min', () => {
            const rng = new Random(1);

            expect(() => rng.int(5, 5)).toThrow(RangeError);
            expect(() => rng.int(0)).toThrow(RangeError);
        });
    });

    describe('intInclusive', () => {
        it('should return integers in [min, max]', () => {
            const rng = new Random(3);

            for (let i = 0; i < 500; i++) {
                const value = rng.intInclusive(1, 6);

                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(1);
                expect(value).toBeLessThanOrEqual(6);
            }
        });

        it('should be able to return the inclusive max bound', () => {
            const rng = new Random(3);
            const values = new Set(Array.from({ length: 2000 }, () => rng.intInclusive(0, 1)));

            expect(values.has(0)).toBe(true);
            expect(values.has(1)).toBe(true);
        });

        it('should throw when max < min', () => {
            expect(() => new Random(1).intInclusive(5, 4)).toThrow(RangeError);
        });
    });

    describe('bool and sign', () => {
        it('should return both true and false over many draws', () => {
            const rng = new Random(11);
            const values = new Set(Array.from({ length: 200 }, () => rng.bool()));

            expect(values.has(true)).toBe(true);
            expect(values.has(false)).toBe(true);
        });

        it('should return both -1 and 1 from sign', () => {
            const rng = new Random(11);
            const values = new Set(Array.from({ length: 200 }, () => rng.sign()));

            expect(values.has(-1)).toBe(true);
            expect(values.has(1)).toBe(true);
        });
    });

    describe('pick', () => {
        it('should return an element from the array', () => {
            const rng = new Random(5);
            const items = ['a', 'b', 'c'] as const;

            for (let i = 0; i < 50; i++) {
                expect(items).toContain(rng.pick(items));
            }
        });

        it('should throw on an empty array', () => {
            expect(() => new Random(1).pick([])).toThrow(RangeError);
        });
    });

    describe('shuffle', () => {
        it('should preserve the multiset', () => {
            const rng = new Random(8);
            const source = [1, 2, 2, 3, 4, 5];
            const shuffled = rng.shuffle(source);

            expect(shuffled).toHaveLength(source.length);
            expect([...shuffled].sort((a, b) => a - b)).toEqual([...source].sort((a, b) => a - b));
            expect(source).toEqual([1, 2, 2, 3, 4, 5]);
        });

        it('should mutate in place with shuffleInPlace', () => {
            const rng = new Random(8);
            const arr = [1, 2, 3, 4, 5];
            const result = rng.shuffleInPlace(arr);

            expect(result).toBe(arr);
            expect([...arr].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        });
    });

    describe('weighted', () => {
        it('should only return items with positive weight', () => {
            const rng = new Random(9);
            const items = ['a', 'b', 'c'];
            const weights = [0, 1, 0];

            for (let i = 0; i < 50; i++) {
                expect(rng.weighted(items, weights)).toBe('b');
            }
        });

        it('should throw on length mismatch or zero total', () => {
            const rng = new Random(1);

            expect(() => rng.weighted(['a'], [1, 2])).toThrow(RangeError);
            expect(() => rng.weighted([], [])).toThrow(RangeError);
            expect(() => rng.weighted(['a', 'b'], [0, 0])).toThrow(RangeError);
        });
    });

    describe('angle and gaussian', () => {
        it('should return angles in [0, 2π)', () => {
            const rng = new Random(4);

            for (let i = 0; i < 200; i++) {
                const value = rng.angle();

                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(Math.PI * 2);
            }
        });

        it('should return finite gaussian samples', () => {
            const rng = new Random(4);

            for (let i = 0; i < 100; i++) {
                expect(Number.isFinite(rng.gaussian(10, 2))).toBe(true);
            }
        });
    });

    describe('insideRect and pointInRange', () => {
        it('should keep insideRect points inside the half-open rectangle', () => {
            const rng = new Random(11);
            const rect = new Rect2i(10, 20, 5, 7);

            for (let i = 0; i < 500; i++) {
                expect(rect.isContaining(rng.insideRect(rect))).toBe(true);
            }
        });

        it('should keep pointInRange points in the half-open per-axis range', () => {
            const rng = new Random(12);
            const min = new Vector2i(3, -2);
            const max = new Vector2i(8, 4);

            for (let i = 0; i < 500; i++) {
                const point = rng.pointInRange(min, max);

                expect(point.x).toBeGreaterThanOrEqual(min.x);
                expect(point.x).toBeLessThan(max.x);
                expect(point.y).toBeGreaterThanOrEqual(min.y);
                expect(point.y).toBeLessThan(max.y);
            }
        });

        it('should mutate and return out from insideRectTo and pointInRangeTo', () => {
            const rng = new Random(13);
            const rect = new Rect2i(0, 0, 4, 4);
            const min = new Vector2i(1, 2);
            const max = new Vector2i(5, 6);
            const outRect = new Vector2i(99, 99);
            const outRange = new Vector2i(99, 99);

            expect(rng.insideRectTo(rect, outRect)).toBe(outRect);
            expect(rect.isContaining(outRect)).toBe(true);

            expect(rng.pointInRangeTo(min, max, outRange)).toBe(outRange);
            expect(outRange.x).toBeGreaterThanOrEqual(min.x);
            expect(outRange.x).toBeLessThan(max.x);
            expect(outRange.y).toBeGreaterThanOrEqual(min.y);
            expect(outRange.y).toBeLessThan(max.y);
        });

        it('should draw the same sequence for allocating and *To variants', () => {
            const rect = new Rect2i(2, 3, 6, 5);
            const min = new Vector2i(-1, 0);
            const max = new Vector2i(4, 3);
            const a = new Random(42);
            const b = new Random(42);
            const out = new Vector2i();

            for (let i = 0; i < 20; i++) {
                const allocatedRect = a.insideRect(rect);
                const writtenRect = b.insideRectTo(rect, out);

                expect(writtenRect.x).toBe(allocatedRect.x);
                expect(writtenRect.y).toBe(allocatedRect.y);

                const allocatedRange = a.pointInRange(min, max);
                const writtenRange = b.pointInRangeTo(min, max, out);

                expect(writtenRange.x).toBe(allocatedRange.x);
                expect(writtenRange.y).toBe(allocatedRange.y);
            }
        });

        it('should throw when the rectangle or range is empty', () => {
            const rng = new Random(1);

            expect(() => rng.insideRect(new Rect2i(0, 0, 0, 4))).toThrow(RangeError);
            expect(() => rng.pointInRange(new Vector2i(5, 0), new Vector2i(5, 3))).toThrow(RangeError);
        });
    });

    describe('direction4 and direction8', () => {
        it('should only return the four cardinal unit vectors from direction4', () => {
            const rng = new Random(21);
            const expected = new Set(['1,0', '-1,0', '0,1', '0,-1']);
            const seen = new Set<string>();

            for (let i = 0; i < 200; i++) {
                const d = rng.direction4();

                seen.add(`${d.x},${d.y}`);
            }

            expect(seen).toEqual(expected);
        });

        it('should only return the eight king-move unit vectors from direction8', () => {
            const rng = new Random(22);
            const expected = new Set(['1,0', '-1,0', '0,1', '0,-1', '1,1', '1,-1', '-1,1', '-1,-1']);
            const seen = new Set<string>();

            for (let i = 0; i < 400; i++) {
                const d = rng.direction8();

                seen.add(`${d.x},${d.y}`);
            }

            expect(seen).toEqual(expected);
        });
    });

    describe('getState / setState / clone / fork', () => {
        it('should restore a saved state', () => {
            const rng = new Random(50);

            rng.next();
            rng.next();

            const saved = rng.getState();
            const afterSave = Array.from({ length: 5 }, () => rng.next());

            rng.setState(saved);

            expect(Array.from({ length: 5 }, () => rng.next())).toEqual(afterSave);
        });

        it('should clear seedValue after setState', () => {
            const rng = new Random(50);

            rng.setState(rng.getState());

            expect(rng.seedValue).toBeUndefined();
        });

        it('should clone to an identical stream', () => {
            const parent = new Random(77);

            parent.next();

            const child = parent.clone();

            expect(Array.from({ length: 10 }, () => parent.next())).toEqual(
                Array.from({ length: 10 }, () => child.next()),
            );
        });

        it('should copy seedValue on clone', () => {
            const parent = new Random(77);
            const child = parent.clone();

            expect(child.seedValue).toBe(parent.seedValue);
        });

        it('should copy an undefined seedValue on clone', () => {
            const parent = new Random(77);

            parent.setState(parent.getState());

            const child = parent.clone();

            expect(parent.seedValue).toBeUndefined();
            expect(child.seedValue).toBeUndefined();
        });

        it('should fork to an independent stream and advance the parent', () => {
            const parent = new Random(88);
            const before = parent.getState();
            const child = parent.fork();

            expect(parent.getState()).not.toBe(before);
            expect(child.getState()).not.toBe(parent.getState());

            const parentSeq = Array.from({ length: 10 }, () => parent.next());
            const childSeq = Array.from({ length: 10 }, () => child.next());

            expect(parentSeq).not.toEqual(childSeq);
        });

        it('should never report a seedValue on a forked child, and should not affect the parent', () => {
            const parent = new Random(88);
            const parentSeedBefore = parent.seedValue;

            const child = parent.fork();

            expect(child.seedValue).toBeUndefined();
            expect(parent.seedValue).toBe(parentSeedBefore);
        });

        it('should make fork reproducible for the same parent state', () => {
            const a = new Random(88);
            const b = new Random(88);

            a.next();
            b.next();

            const forkA = a.fork();
            const forkB = b.fork();

            expect(Array.from({ length: 10 }, () => forkA.next())).toEqual(
                Array.from({ length: 10 }, () => forkB.next()),
            );
        });
    });
});
