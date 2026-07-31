/**
 * Unit tests for {@link Vector2i}.
 *
 * Covers integer coercion, property aliases, shared directional singletons,
 * arithmetic, comparisons, distance and length helpers, mutation APIs, and the
 * zero-allocation patterns used throughout the engine.
 */

import { describe, expect, it } from 'vitest';

import { Vector2i } from './Vector2i';

describe('Vector2i', () => {
    describe('Constructor', () => {
        it('should default to (0, 0)', () => {
            const v = new Vector2i();

            expect(v.x).toBe(0);
            expect(v.y).toBe(0);
        });

        it('should accept integer values', () => {
            const v = new Vector2i(3, 7);

            expect(v.x).toBe(3);
            expect(v.y).toBe(7);
        });

        it('should truncate positive floats toward zero', () => {
            const v = new Vector2i(3.7, 9.9);

            expect(v.x).toBe(3);
            expect(v.y).toBe(9);
        });

        it('should truncate negative floats toward zero', () => {
            const v = new Vector2i(-2.3, -5.8);

            expect(v.x).toBe(-2);
            expect(v.y).toBe(-5);
        });

        it('should handle negative integer values', () => {
            const v = new Vector2i(-10, -20);

            expect(v.x).toBe(-10);
            expect(v.y).toBe(-20);
        });

        it('should handle a single argument with y defaulting to 0', () => {
            const v = new Vector2i(5);

            expect(v.x).toBe(5);
            expect(v.y).toBe(0);
        });
    });

    describe('Property Aliases', () => {
        it('should return x as width', () => {
            const v = new Vector2i(42, 99);

            expect(v.width).toBe(42);
            expect(v.width).toBe(v.x);
        });

        it('should return y as height', () => {
            const v = new Vector2i(42, 99);

            expect(v.height).toBe(99);
            expect(v.height).toBe(v.y);
        });

        it('should set x via width setter and truncate floats', () => {
            const v = new Vector2i(0, 0);

            v.width = 7.9;

            expect(v.x).toBe(7);
            expect(v.width).toBe(7);
        });

        it('should set y via height setter and truncate floats', () => {
            const v = new Vector2i(0, 0);

            v.height = -3.6;

            expect(v.y).toBe(-3);
            expect(v.height).toBe(-3);
        });

        it('should set integer values via width/height without change', () => {
            const v = new Vector2i(0, 0);

            v.width = 100;
            v.height = 200;

            expect(v.x).toBe(100);
            expect(v.y).toBe(200);
        });
    });

    describe('Static Singletons', () => {
        it('should return (0, 0) for zero()', () => {
            const v = Vector2i.zero();

            expect(v.x).toBe(0);
            expect(v.y).toBe(0);
        });

        it('should return the same instance for zero()', () => {
            expect(Vector2i.zero()).toBe(Vector2i.zero());
        });

        it('should return a frozen object for zero()', () => {
            expect(Object.isFrozen(Vector2i.zero())).toBe(true);
        });

        it('should return (1, 1) for one()', () => {
            const v = Vector2i.one();

            expect(v.x).toBe(1);
            expect(v.y).toBe(1);
        });

        it('should return the same instance for one()', () => {
            expect(Vector2i.one()).toBe(Vector2i.one());
        });

        it('should return a frozen object for one()', () => {
            expect(Object.isFrozen(Vector2i.one())).toBe(true);
        });

        it('should return (0, -1) for up()', () => {
            const v = Vector2i.up();
            expect(v.x).toBe(0);
            expect(v.y).toBe(-1);
        });

        it('should return a frozen object for up()', () => {
            expect(Object.isFrozen(Vector2i.up())).toBe(true);
        });

        it('should return (0, 1) for down()', () => {
            const v = Vector2i.down();

            expect(v.x).toBe(0);
            expect(v.y).toBe(1);
        });

        it('should return a frozen object for down()', () => {
            expect(Object.isFrozen(Vector2i.down())).toBe(true);
        });

        it('should return (-1, 0) for left()', () => {
            const v = Vector2i.left();

            expect(v.x).toBe(-1);
            expect(v.y).toBe(0);
        });

        it('should return a frozen object for left()', () => {
            expect(Object.isFrozen(Vector2i.left())).toBe(true);
        });

        it('should return (1, 0) for right()', () => {
            const v = Vector2i.right();

            expect(v.x).toBe(1);
            expect(v.y).toBe(0);
        });

        it('should return a frozen object for right()', () => {
            expect(Object.isFrozen(Vector2i.right())).toBe(true);
        });
    });

    describe('Arithmetic', () => {
        describe('add', () => {
            it('should add two vectors', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(7, 11);
                const result = a.add(b);

                expect(result.x).toBe(10);
                expect(result.y).toBe(16);
            });

            it('should not mutate the originals', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(7, 11);

                a.add(b);

                expect(a.x).toBe(3);
                expect(a.y).toBe(5);
                expect(b.x).toBe(7);
                expect(b.y).toBe(11);
            });

            it('should handle negative values', () => {
                const a = new Vector2i(-10, 20);
                const b = new Vector2i(5, -30);
                const result = a.add(b);

                expect(result.x).toBe(-5);
                expect(result.y).toBe(-10);
            });
        });

        describe('addXY', () => {
            it('should add raw x,y to vector', () => {
                const v = new Vector2i(10, 20);
                const result = v.addXY(5, -3);

                expect(result.x).toBe(15);
                expect(result.y).toBe(17);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(10, 20);
                const result = v.addXY(1.9, 2.1);

                expect(result.x).toBe(11);
                expect(result.y).toBe(22);
            });

            it('should not mutate the original', () => {
                const v = new Vector2i(10, 20);

                v.addXY(5, 5);

                expect(v.x).toBe(10);
                expect(v.y).toBe(20);
            });
        });

        describe('sub', () => {
            it('should subtract vectors', () => {
                const a = new Vector2i(10, 20);
                const b = new Vector2i(3, 7);
                const result = a.sub(b);

                expect(result.x).toBe(7);
                expect(result.y).toBe(13);
            });

            it('should not mutate the originals', () => {
                const a = new Vector2i(10, 20);
                const b = new Vector2i(3, 7);

                a.sub(b);

                expect(a.x).toBe(10);
                expect(b.x).toBe(3);
            });

            it('should handle resulting negative values', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(10, 20);

                const result = a.sub(b);

                expect(result.x).toBe(-7);
                expect(result.y).toBe(-15);
            });
        });

        describe('subXY', () => {
            it('should subtract raw x,y from vector', () => {
                const v = new Vector2i(10, 20);
                const result = v.subXY(3, 7);

                expect(result.x).toBe(7);
                expect(result.y).toBe(13);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(10, 20);
                const result = v.subXY(1.9, 2.1);

                expect(result.x).toBe(9);
                expect(result.y).toBe(18);
            });

            it('should not mutate the original', () => {
                const v = new Vector2i(10, 20);

                v.subXY(3, 7);

                expect(v.x).toBe(10);
                expect(v.y).toBe(20);
            });
        });

        describe('mul', () => {
            it('should multiply by a scalar', () => {
                const v = new Vector2i(3, 5);
                const result = v.mul(4);

                expect(result.x).toBe(12);
                expect(result.y).toBe(20);
            });

            it('should truncate results with noninteger scalar', () => {
                const v = new Vector2i(3, 5);
                const result = v.mul(1.5);

                expect(result.x).toBe(4);
                expect(result.y).toBe(7);
            });

            it('should handle zero scalar', () => {
                const v = new Vector2i(3, 5);
                const result = v.mul(0);

                expect(result.x).toBe(0);
                expect(result.y).toBe(0);
            });

            it('should handle negative scalar', () => {
                const v = new Vector2i(3, 5);
                const result = v.mul(-2);

                expect(result.x).toBe(-6);
                expect(result.y).toBe(-10);
            });
        });

        describe('mulVec', () => {
            it('should perform component-wise multiplication', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(2, 4);
                const result = a.mulVec(b);

                expect(result.x).toBe(6);
                expect(result.y).toBe(20);
            });

            it('should handle negative components', () => {
                const a = new Vector2i(3, -5);
                const b = new Vector2i(-2, 4);
                const result = a.mulVec(b);

                expect(result.x).toBe(-6);
                expect(result.y).toBe(-20);
            });

            it('should handle zero components', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(0, 0);
                const result = a.mulVec(b);

                expect(result.x).toBe(0);
                expect(result.y).toBe(0);
            });
        });

        describe('div', () => {
            it('should divide by a scalar and truncate toward zero', () => {
                const v = new Vector2i(10, 20);
                const result = v.div(3);

                expect(result.x).toBe(3);
                expect(result.y).toBe(6);
            });

            it('should truncate negative results toward zero', () => {
                const v = new Vector2i(-7, 7);
                const result = v.div(2);

                expect(result.x).toBe(-3);
                expect(result.y).toBe(3);
            });

            it('should throw on zero divisor', () => {
                const v = new Vector2i(10, 20);

                expect(() => v.div(0)).toThrow("Can't divide by zero. Use a non-zero number for Vector2i.div.");
            });

            it('should handle division by negative scalar', () => {
                const v = new Vector2i(10, 20);
                const result = v.div(-3);

                expect(result.x).toBe(-3);
                expect(result.y).toBe(-6);
            });
        });

        describe('negate', () => {
            it('should negate positive components', () => {
                const v = new Vector2i(3, 5);
                const result = v.negate();
                expect(result.x).toBe(-3);
                expect(result.y).toBe(-5);
            });

            it('should negate negative components', () => {
                const v = new Vector2i(-3, -5);
                const result = v.negate();

                expect(result.x).toBe(3);
                expect(result.y).toBe(5);
            });

            it('should handle zero vector', () => {
                const v = new Vector2i(0, 0);
                const result = v.negate();

                // -0 from fromXYUnchecked(-0, -0) is numerically equal to 0
                expect(result.x + 0).toBe(0);
                expect(result.y + 0).toBe(0);
            });
        });

        describe('abs', () => {
            it('should return absolute values', () => {
                const v = new Vector2i(-3, -5);
                const result = v.abs();

                expect(result.x).toBe(3);
                expect(result.y).toBe(5);
            });

            it('should keep positive values unchanged', () => {
                const v = new Vector2i(3, 5);
                const result = v.abs();

                expect(result.x).toBe(3);
                expect(result.y).toBe(5);
            });

            it('should handle mixed signs', () => {
                const v = new Vector2i(-3, 5);
                const result = v.abs();

                expect(result.x).toBe(3);
                expect(result.y).toBe(5);
            });
        });

        describe('min', () => {
            it('should return component-wise minimum', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const result = a.min(b);

                expect(result.x).toBe(3);
                expect(result.y).toBe(5);
            });

            it('should handle negative values', () => {
                const a = new Vector2i(-5, 10);
                const b = new Vector2i(-3, -2);
                const result = a.min(b);

                expect(result.x).toBe(-5);
                expect(result.y).toBe(-2);
            });

            it('should handle equal vectors', () => {
                const a = new Vector2i(4, 4);
                const b = new Vector2i(4, 4);
                const result = a.min(b);

                expect(result.x).toBe(4);
                expect(result.y).toBe(4);
            });
        });

        describe('max', () => {
            it('should return component-wise maximum', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const result = a.max(b);

                expect(result.x).toBe(7);
                expect(result.y).toBe(10);
            });

            it('should handle negative values', () => {
                const a = new Vector2i(-5, 10);
                const b = new Vector2i(-3, -2);
                const result = a.max(b);

                expect(result.x).toBe(-3);
                expect(result.y).toBe(10);
            });

            it('should handle equal vectors', () => {
                const a = new Vector2i(4, 4);
                const b = new Vector2i(4, 4);
                const result = a.max(b);

                expect(result.x).toBe(4);
                expect(result.y).toBe(4);
            });
        });

        describe('clamp', () => {
            it('should clamp values within range', () => {
                const v = new Vector2i(15, -5);
                const result = v.clamp(0, 10);

                expect(result.x).toBe(10);
                expect(result.y).toBe(0);
            });

            it('should leave values already in range unchanged', () => {
                const v = new Vector2i(5, 7);
                const result = v.clamp(0, 10);

                expect(result.x).toBe(5);
                expect(result.y).toBe(7);
            });

            it('should truncate float bounds', () => {
                const v = new Vector2i(15, -5);
                const result = v.clamp(0.9, 10.9);

                expect(result.x).toBe(10);
                expect(result.y).toBe(0);
            });
        });

        describe('clampVec', () => {
            it('should clamp to vector bounds', () => {
                const v = new Vector2i(15, -5);
                const minV = new Vector2i(0, 0);
                const maxV = new Vector2i(10, 10);
                const result = v.clampVec(minV, maxV);

                expect(result.x).toBe(10);
                expect(result.y).toBe(0);
            });

            it('should allow asymmetric clamping per component', () => {
                const v = new Vector2i(50, -50);
                const minV = new Vector2i(-10, -20);
                const maxV = new Vector2i(20, 30);
                const result = v.clampVec(minV, maxV);

                expect(result.x).toBe(20);
                expect(result.y).toBe(-20);
            });

            it('should leave values already in bounds unchanged', () => {
                const v = new Vector2i(5, 5);
                const minV = new Vector2i(0, 0);
                const maxV = new Vector2i(10, 10);
                const result = v.clampVec(minV, maxV);

                expect(result.x).toBe(5);
                expect(result.y).toBe(5);
            });
        });

        describe('dot', () => {
            it('should compute dot product', () => {
                const a = new Vector2i(3, 4);
                const b = new Vector2i(2, 5);

                expect(a.dot(b)).toBe(26);
            });

            it('should return zero for perpendicular vectors', () => {
                const a = new Vector2i(1, 0);
                const b = new Vector2i(0, 1);

                expect(a.dot(b)).toBe(0);
            });

            it('should return negative for opposite-facing vectors', () => {
                const a = new Vector2i(1, 0);
                const b = new Vector2i(-1, 0);

                expect(a.dot(b)).toBe(-1);
            });
        });

        describe('cross', () => {
            it('should compute 2D cross-product', () => {
                const a = new Vector2i(3, 4);
                const b = new Vector2i(2, 5);

                expect(a.cross(b)).toBe(7);
            });

            it('should return zero for parallel vectors', () => {
                const a = new Vector2i(2, 4);
                const b = new Vector2i(1, 2);

                expect(a.cross(b)).toBe(0);
            });

            it('should return negative for clockwise winding', () => {
                const a = new Vector2i(1, 0);
                const b = new Vector2i(0, -1);

                expect(a.cross(b)).toBe(-1);
            });
        });

        describe('perpendicular', () => {
            it('should rotate 90 degrees counter-clockwise', () => {
                const v = new Vector2i(1, 0);
                const result = v.perpendicular();

                // -0 from fromXYUnchecked(-0, x) is numerically equal to 0
                expect(result.x + 0).toBe(0);
                expect(result.y).toBe(1);
            });

            it('should rotate (3, 4) to (-4, 3)', () => {
                const v = new Vector2i(3, 4);
                const result = v.perpendicular();

                expect(result.x).toBe(-4);
                expect(result.y).toBe(3);
            });

            it('should produce a vector with dot product zero', () => {
                const v = new Vector2i(5, 7);
                const perp = v.perpendicular();

                expect(v.dot(perp)).toBe(0);
            });
        });

        describe('perpendicularCW', () => {
            it('should rotate 90 degrees clockwise', () => {
                const v = new Vector2i(1, 0);
                const result = v.perpendicularCW();

                expect(result.x).toBe(0);
                expect(result.y).toBe(-1);
            });

            it('should rotate (3, 4) to (4, -3)', () => {
                const v = new Vector2i(3, 4);
                const result = v.perpendicularCW();

                expect(result.x).toBe(4);
                expect(result.y).toBe(-3);
            });

            it('should produce a vector with dot product zero', () => {
                const v = new Vector2i(5, 7);
                const perp = v.perpendicularCW();

                expect(v.dot(perp)).toBe(0);
            });
        });
    });

    describe('Zero-Allocation Output ("To" methods)', () => {
        describe('addTo', () => {
            it('should write the sum to the output vector', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(7, 11);
                const out = new Vector2i();

                a.addTo(b, out);

                expect(out.x).toBe(10);
                expect(out.y).toBe(16);
            });

            it('should return the output vector', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(7, 11);
                const out = new Vector2i();
                const returned = a.addTo(b, out);

                expect(returned).toBe(out);
            });

            it('should not mutate the source vectors', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(7, 11);
                const out = new Vector2i();

                a.addTo(b, out);

                expect(a.x).toBe(3);
                expect(b.x).toBe(7);
            });
        });

        describe('subTo', () => {
            it('should write the difference to the output vector', () => {
                const a = new Vector2i(10, 20);
                const b = new Vector2i(3, 7);
                const out = new Vector2i();

                a.subTo(b, out);

                expect(out.x).toBe(7);
                expect(out.y).toBe(13);
            });

            it('should return the output vector', () => {
                const a = new Vector2i(10, 20);
                const b = new Vector2i(3, 7);
                const out = new Vector2i();

                expect(a.subTo(b, out)).toBe(out);
            });
        });

        describe('mulTo', () => {
            it('should write the scaled result to the output vector', () => {
                const v = new Vector2i(3, 5);
                const out = new Vector2i();

                v.mulTo(4, out);

                expect(out.x).toBe(12);
                expect(out.y).toBe(20);
            });

            it('should truncate noninteger results', () => {
                const v = new Vector2i(3, 5);
                const out = new Vector2i();

                v.mulTo(1.5, out);

                expect(out.x).toBe(4);
                expect(out.y).toBe(7);
            });

            it('should return the output vector', () => {
                const v = new Vector2i(3, 5);
                const out = new Vector2i();

                expect(v.mulTo(2, out)).toBe(out);
            });
        });

        describe('divTo', () => {
            it('should write the divided result to the output vector', () => {
                const v = new Vector2i(10, 20);
                const out = new Vector2i();

                v.divTo(3, out);

                expect(out.x).toBe(3);
                expect(out.y).toBe(6);
            });

            it('should throw on zero divisor', () => {
                const v = new Vector2i(10, 20);
                const out = new Vector2i();

                expect(() => v.divTo(0, out)).toThrow(
                    "Can't divide by zero. Use a non-zero number for Vector2i.divTo.",
                );
            });

            it('should return the output vector', () => {
                const v = new Vector2i(10, 20);
                const out = new Vector2i();

                expect(v.divTo(2, out)).toBe(out);
            });
        });

        describe('cloneTo', () => {
            it('should copy values to the output vector', () => {
                const v = new Vector2i(42, 99);
                const out = new Vector2i();

                v.cloneTo(out);

                expect(out.x).toBe(42);
                expect(out.y).toBe(99);
            });

            it('should return the output vector', () => {
                const v = new Vector2i(42, 99);
                const out = new Vector2i();

                expect(v.cloneTo(out)).toBe(out);
            });
        });

        describe('negateTo', () => {
            it('should write negated values to the output vector', () => {
                const v = new Vector2i(3, -5);
                const out = new Vector2i();

                v.negateTo(out);

                expect(out.x).toBe(-3);
                expect(out.y).toBe(5);
            });

            it('should return the output vector', () => {
                const v = new Vector2i(3, -5);
                const out = new Vector2i();

                expect(v.negateTo(out)).toBe(out);
            });
        });

        describe('absTo', () => {
            it('should write absolute values to the output vector', () => {
                const v = new Vector2i(-3, -5);
                const out = new Vector2i();

                v.absTo(out);

                expect(out.x).toBe(3);
                expect(out.y).toBe(5);
            });

            it('should return the output vector', () => {
                const v = new Vector2i(-3, -5);
                const out = new Vector2i();

                expect(v.absTo(out)).toBe(out);
            });
        });

        describe('minTo', () => {
            it('should write component-wise minimum to the output vector', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const out = new Vector2i();

                a.minTo(b, out);

                expect(out.x).toBe(3);
                expect(out.y).toBe(5);
            });

            it('should return the output vector', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const out = new Vector2i();

                expect(a.minTo(b, out)).toBe(out);
            });
        });

        describe('maxTo', () => {
            it('should write component-wise maximum to the output vector', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const out = new Vector2i();

                a.maxTo(b, out);

                expect(out.x).toBe(7);
                expect(out.y).toBe(10);
            });

            it('should return the output vector', () => {
                const a = new Vector2i(3, 10);
                const b = new Vector2i(7, 5);
                const out = new Vector2i();

                expect(a.maxTo(b, out)).toBe(out);
            });
        });

        describe('clampTo', () => {
            it('should write clamped values to the output vector', () => {
                const v = new Vector2i(15, -5);
                const out = new Vector2i();

                v.clampTo(0, 10, out);

                expect(out.x).toBe(10);
                expect(out.y).toBe(0);
            });

            it('should return the output vector', () => {
                const v = new Vector2i(15, -5);
                const out = new Vector2i();

                expect(v.clampTo(0, 10, out)).toBe(out);
            });

            it('should truncate float bounds', () => {
                const v = new Vector2i(15, -5);
                const out = new Vector2i();

                v.clampTo(0.9, 10.9, out);

                expect(out.x).toBe(10);
                expect(out.y).toBe(0);
            });
        });
    });

    describe('In-Place Mutations', () => {
        describe('addInPlace', () => {
            it('should add another vector in place', () => {
                const v = new Vector2i(3, 5);
                v.addInPlace(new Vector2i(7, 11));

                expect(v.x).toBe(10);
                expect(v.y).toBe(16);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(3, 5);
                const returned = v.addInPlace(new Vector2i(1, 1));

                expect(returned).toBe(v);
            });

            it('should support chaining', () => {
                const v = new Vector2i(1, 1);

                v.addInPlace(new Vector2i(2, 2)).addInPlace(new Vector2i(3, 3));

                expect(v.x).toBe(6);
                expect(v.y).toBe(6);
            });
        });

        describe('addXYInPlace', () => {
            it('should add raw x,y in place', () => {
                const v = new Vector2i(3, 5);

                v.addXYInPlace(7, 11);

                expect(v.x).toBe(10);
                expect(v.y).toBe(16);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(3, 5);

                v.addXYInPlace(1.9, 2.1);

                expect(v.x).toBe(4);
                expect(v.y).toBe(7);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(3, 5);

                expect(v.addXYInPlace(1, 1)).toBe(v);
            });
        });

        describe('subInPlace', () => {
            it('should subtract another vector in place', () => {
                const v = new Vector2i(10, 20);

                v.subInPlace(new Vector2i(3, 7));

                expect(v.x).toBe(7);
                expect(v.y).toBe(13);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(10, 20);

                expect(v.subInPlace(new Vector2i(3, 7))).toBe(v);
            });
        });

        describe('subXYInPlace', () => {
            it('should subtract raw x,y in place', () => {
                const v = new Vector2i(10, 20);

                v.subXYInPlace(3, 7);

                expect(v.x).toBe(7);
                expect(v.y).toBe(13);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(10, 20);

                v.subXYInPlace(1.9, 2.1);

                expect(v.x).toBe(9);
                expect(v.y).toBe(18);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(10, 20);

                expect(v.subXYInPlace(3, 7)).toBe(v);
            });
        });

        describe('mulInPlace', () => {
            it('should multiply by scalar in place', () => {
                const v = new Vector2i(3, 5);

                v.mulInPlace(4);

                expect(v.x).toBe(12);
                expect(v.y).toBe(20);
            });

            it('should truncate noninteger results', () => {
                const v = new Vector2i(3, 5);

                v.mulInPlace(1.5);

                expect(v.x).toBe(4);
                expect(v.y).toBe(7);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(3, 5);

                expect(v.mulInPlace(2)).toBe(v);
            });
        });

        describe('mulVecInPlace', () => {
            it('should perform component-wise multiplication in place', () => {
                const v = new Vector2i(3, 5);

                v.mulVecInPlace(new Vector2i(2, 4));

                expect(v.x).toBe(6);
                expect(v.y).toBe(20);
            });

            it('should handle zero components', () => {
                const v = new Vector2i(3, 5);

                v.mulVecInPlace(new Vector2i(0, 0));

                expect(v.x).toBe(0);
                expect(v.y).toBe(0);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(3, 5);

                expect(v.mulVecInPlace(new Vector2i(2, 4))).toBe(v);
            });
        });

        describe('divInPlace', () => {
            it('should divide by scalar in place', () => {
                const v = new Vector2i(10, 20);

                v.divInPlace(3);

                expect(v.x).toBe(3);
                expect(v.y).toBe(6);
            });

            it('should throw on zero divisor', () => {
                const v = new Vector2i(10, 20);

                expect(() => v.divInPlace(0)).toThrow(
                    "Can't divide by zero. Use a non-zero number for Vector2i.divInPlace.",
                );
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(10, 20);

                expect(v.divInPlace(2)).toBe(v);
            });
        });

        describe('negateInPlace', () => {
            it('should negate components in place', () => {
                const v = new Vector2i(3, -5);

                v.negateInPlace();

                expect(v.x).toBe(-3);
                expect(v.y).toBe(5);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(3, -5);

                expect(v.negateInPlace()).toBe(v);
            });
        });

        describe('absInPlace', () => {
            it('should apply absolute value in place', () => {
                const v = new Vector2i(-3, -5);

                v.absInPlace();

                expect(v.x).toBe(3);
                expect(v.y).toBe(5);
            });

            it('should leave positive values unchanged', () => {
                const v = new Vector2i(3, 5);

                v.absInPlace();

                expect(v.x).toBe(3);
                expect(v.y).toBe(5);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(-3, -5);

                expect(v.absInPlace()).toBe(v);
            });
        });

        describe('minInPlace', () => {
            it('should set to a component-wise minimum in place', () => {
                const v = new Vector2i(7, 3);

                v.minInPlace(new Vector2i(5, 10));

                expect(v.x).toBe(5);
                expect(v.y).toBe(3);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(7, 3);

                expect(v.minInPlace(new Vector2i(5, 10))).toBe(v);
            });
        });

        describe('maxInPlace', () => {
            it('should set to a component-wise maximum in place', () => {
                const v = new Vector2i(7, 3);

                v.maxInPlace(new Vector2i(5, 10));

                expect(v.x).toBe(7);
                expect(v.y).toBe(10);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(7, 3);

                expect(v.maxInPlace(new Vector2i(5, 10))).toBe(v);
            });
        });

        describe('clampInPlace', () => {
            it('should clamp components in place', () => {
                const v = new Vector2i(15, -5);

                v.clampInPlace(0, 10);

                expect(v.x).toBe(10);
                expect(v.y).toBe(0);
            });

            it('should leave values in the range unchanged', () => {
                const v = new Vector2i(5, 7);

                v.clampInPlace(0, 10);

                expect(v.x).toBe(5);
                expect(v.y).toBe(7);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(15, -5);

                expect(v.clampInPlace(0, 10)).toBe(v);
            });
        });

        describe('clampVecInPlace', () => {
            it('should clamp to vector bounds in place', () => {
                const v = new Vector2i(15, -5);

                v.clampVecInPlace(new Vector2i(0, 0), new Vector2i(10, 10));

                expect(v.x).toBe(10);
                expect(v.y).toBe(0);
            });

            it('should allow asymmetric clamping', () => {
                const v = new Vector2i(50, -50);

                v.clampVecInPlace(new Vector2i(-10, -20), new Vector2i(20, 30));

                expect(v.x).toBe(20);
                expect(v.y).toBe(-20);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(15, -5);

                expect(v.clampVecInPlace(new Vector2i(0, 0), new Vector2i(10, 10))).toBe(v);
            });
        });

        describe('set', () => {
            it('should set both components', () => {
                const v = new Vector2i(0, 0);

                v.set(42, 99);

                expect(v.x).toBe(42);
                expect(v.y).toBe(99);
            });

            it('should truncate float values', () => {
                const v = new Vector2i(0, 0);

                v.set(3.7, -2.3);

                expect(v.x).toBe(3);
                expect(v.y).toBe(-2);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(0, 0);

                expect(v.set(1, 2)).toBe(v);
            });
        });

        describe('copyFrom', () => {
            it('should copy values from another vector', () => {
                const v = new Vector2i(0, 0);
                const source = new Vector2i(42, 99);

                v.copyFrom(source);

                expect(v.x).toBe(42);
                expect(v.y).toBe(99);
            });

            it('should not create a link between vectors', () => {
                const v = new Vector2i(0, 0);
                const source = new Vector2i(42, 99);

                v.copyFrom(source);

                source.x = 100;

                expect(v.x).toBe(42);
            });

            it('should return this for chaining', () => {
                const v = new Vector2i(0, 0);

                expect(v.copyFrom(new Vector2i(1, 2))).toBe(v);
            });
        });
    });

    describe('Distance', () => {
        describe('magnitude', () => {
            it('should return 5 for (3, 4)', () => {
                const v = new Vector2i(3, 4);

                expect(v.magnitude()).toBe(5);
            });

            it('should return 0 for zero vector', () => {
                const v = new Vector2i(0, 0);

                expect(v.magnitude()).toBe(0);
            });

            it('should handle negative components', () => {
                const v = new Vector2i(-3, -4);

                expect(v.magnitude()).toBe(5);
            });
        });

        describe('sqrMagnitude', () => {
            it('should return 25 for (3, 4)', () => {
                const v = new Vector2i(3, 4);

                expect(v.sqrMagnitude()).toBe(25);
            });

            it('should return 0 for zero vector', () => {
                const v = new Vector2i(0, 0);

                expect(v.sqrMagnitude()).toBe(0);
            });

            it('should handle (1, 1)', () => {
                const v = new Vector2i(1, 1);

                expect(v.sqrMagnitude()).toBe(2);
            });
        });

        describe('distanceTo', () => {
            it('should compute Euclidean distance', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 4);

                expect(a.distanceTo(b)).toBe(5);
            });

            it('should return 0 for the same position', () => {
                const a = new Vector2i(5, 5);
                const b = new Vector2i(5, 5);

                expect(a.distanceTo(b)).toBe(0);
            });

            it('should be symmetric', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(a.distanceTo(b)).toBe(b.distanceTo(a));
            });
        });

        describe('distanceToXY', () => {
            it('should compute distance to raw coordinates', () => {
                const v = new Vector2i(0, 0);

                expect(v.distanceToXY(3, 4)).toBe(5);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(0, 0);

                expect(v.distanceToXY(3.9, 4.1)).toBe(5);
            });

            it('should handle negative coordinates', () => {
                const v = new Vector2i(0, 0);

                expect(v.distanceToXY(-3, -4)).toBe(5);
            });
        });

        describe('sqrDistanceTo', () => {
            it('should compute squared distance', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 4);

                expect(a.sqrDistanceTo(b)).toBe(25);
            });

            it('should return 0 for the same position', () => {
                const a = new Vector2i(5, 5);

                expect(a.sqrDistanceTo(new Vector2i(5, 5))).toBe(0);
            });

            it('should be symmetric', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(a.sqrDistanceTo(b)).toBe(b.sqrDistanceTo(a));
            });
        });

        describe('sqrDistanceToXY', () => {
            it('should compute squared distance to raw coordinates', () => {
                const v = new Vector2i(0, 0);

                expect(v.sqrDistanceToXY(3, 4)).toBe(25);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(0, 0);

                expect(v.sqrDistanceToXY(3.9, 4.1)).toBe(25);
            });

            it('should handle negative coordinates', () => {
                const v = new Vector2i(1, 1);

                expect(v.sqrDistanceToXY(-2, -3)).toBe(25);
            });
        });

        describe('manhattanDistanceTo', () => {
            it('should compute Manhattan distance', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(a.manhattanDistanceTo(b)).toBe(7);
            });

            it('should return 0 for the same position', () => {
                const a = new Vector2i(5, 5);

                expect(a.manhattanDistanceTo(new Vector2i(5, 5))).toBe(0);
            });

            it('should handle negative offsets', () => {
                const a = new Vector2i(5, 5);
                const b = new Vector2i(2, 1);

                expect(a.manhattanDistanceTo(b)).toBe(7);
            });
        });

        describe('manhattanDistanceToXY', () => {
            it('should compute Manhattan distance to raw coordinates', () => {
                const v = new Vector2i(1, 2);

                expect(v.manhattanDistanceToXY(4, 6)).toBe(7);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(0, 0);

                expect(v.manhattanDistanceToXY(3.9, 4.1)).toBe(7);
            });

            it('should handle negative coordinates', () => {
                const v = new Vector2i(0, 0);

                expect(v.manhattanDistanceToXY(-3, -4)).toBe(7);
            });
        });

        describe('chebyshevDistanceTo', () => {
            it('should compute Chebyshev distance', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(a.chebyshevDistanceTo(b)).toBe(4);
            });

            it('should return 0 for the same position', () => {
                const a = new Vector2i(5, 5);

                expect(a.chebyshevDistanceTo(new Vector2i(5, 5))).toBe(0);
            });

            it('should pick the larger component difference', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 3);

                expect(a.chebyshevDistanceTo(b)).toBe(10);
            });
        });

        describe('chebyshevDistanceToXY', () => {
            it('should compute Chebyshev distance to raw coordinates', () => {
                const v = new Vector2i(1, 2);

                expect(v.chebyshevDistanceToXY(4, 6)).toBe(4);
            });

            it('should truncate float arguments', () => {
                const v = new Vector2i(0, 0);

                expect(v.chebyshevDistanceToXY(3.9, 4.1)).toBe(4);
            });

            it('should handle negative coordinates', () => {
                const v = new Vector2i(0, 0);

                expect(v.chebyshevDistanceToXY(-3, -10)).toBe(10);
            });
        });
    });

    describe('Normalization', () => {
        describe('normalized', () => {
            it('should return zero vector for zero input', () => {
                const v = new Vector2i(0, 0);
                const result = v.normalized();

                expect(result.x).toBe(0);
                expect(result.y).toBe(0);
            });

            it('should normalize (10, 0) to (1, 0)', () => {
                const v = new Vector2i(10, 0);
                const result = v.normalized();

                expect(result.x).toBe(1);
                expect(result.y).toBe(0);
            });

            it('should normalize (0, -10) to (0, -1)', () => {
                const v = new Vector2i(0, -10);
                const result = v.normalized();

                expect(result.x).toBe(0);
                expect(result.y).toBe(-1);
            });

            it('should normalize (-50, 0) to (-1, 0)', () => {
                const v = new Vector2i(-50, 0);
                const result = v.normalized();

                expect(result.x).toBe(-1);
                expect(result.y).toBe(0);
            });

            it('should normalize diagonal vectors to approximate direction', () => {
                const v = new Vector2i(10, 10);
                const result = v.normalized();

                expect(result.x).toBe(1);
                expect(result.y).toBe(1);
            });
        });
    });

    describe('Comparison', () => {
        describe('isEqual', () => {
            it('should return true for equal vectors', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(3, 5);

                expect(a.isEqual(b)).toBe(true);
            });

            it('should return false for different x', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(4, 5);

                expect(a.isEqual(b)).toBe(false);
            });

            it('should return false for different y', () => {
                const a = new Vector2i(3, 5);
                const b = new Vector2i(3, 6);

                expect(a.isEqual(b)).toBe(false);
            });

            it('should return true for two zero vectors', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(0, 0);

                expect(a.isEqual(b)).toBe(true);
            });
        });

        describe('isEqualXY', () => {
            it('should return true for matching coordinates', () => {
                const v = new Vector2i(3, 5);

                expect(v.isEqualXY(3, 5)).toBe(true);
            });

            it('should return false for non-matching coordinates', () => {
                const v = new Vector2i(3, 5);

                expect(v.isEqualXY(4, 5)).toBe(false);
            });

            it('should truncate float arguments before comparing', () => {
                const v = new Vector2i(3, 5);

                expect(v.isEqualXY(3.9, 5.1)).toBe(true);
            });

            it('should handle negative truncation correctly', () => {
                const v = new Vector2i(-2, -5);

                expect(v.isEqualXY(-2.3, -5.8)).toBe(true);
            });
        });

        describe('isZero', () => {
            it('should return true for (0, 0)', () => {
                const v = new Vector2i(0, 0);

                expect(v.isZero()).toBe(true);
            });

            it('should return false for (1, 0)', () => {
                const v = new Vector2i(1, 0);

                expect(v.isZero()).toBe(false);
            });

            it('should return false for (0, 1)', () => {
                const v = new Vector2i(0, 1);

                expect(v.isZero()).toBe(false);
            });

            it('should return false for (-1, -1)', () => {
                const v = new Vector2i(-1, -1);

                expect(v.isZero()).toBe(false);
            });
        });
    });

    describe('Utility', () => {
        describe('clone', () => {
            it('should create an independent copy', () => {
                const v = new Vector2i(42, 99);
                const c = v.clone();

                expect(c.x).toBe(42);
                expect(c.y).toBe(99);
            });

            it('should not be the same reference', () => {
                const v = new Vector2i(42, 99);
                const c = v.clone();

                expect(c).not.toBe(v);
            });

            it('should not link the clone to the original', () => {
                const v = new Vector2i(42, 99);
                const c = v.clone();

                c.x = 0;

                expect(v.x).toBe(42);
            });
        });

        describe('toString', () => {
            it('should format as (x, y)', () => {
                const v = new Vector2i(3, 5);

                expect(v.toString()).toBe('(3, 5)');
            });

            it('should handle negative values', () => {
                const v = new Vector2i(-3, -5);

                expect(v.toString()).toBe('(-3, -5)');
            });

            it('should handle zero vector', () => {
                const v = new Vector2i(0, 0);

                expect(v.toString()).toBe('(0, 0)');
            });
        });
    });

    describe('Static Factories', () => {
        describe('fromXYUnchecked', () => {
            it('should create a vector without truncation', () => {
                const v = Vector2i.fromXYUnchecked(3, 5);

                expect(v.x).toBe(3);
                expect(v.y).toBe(5);
            });

            it('should NOT truncate float values', () => {
                const v = Vector2i.fromXYUnchecked(3.7, 5.2);

                expect(v.x).toBe(3.7);
                expect(v.y).toBe(5.2);
            });

            it('should create a proper Vector2i instance', () => {
                const v = Vector2i.fromXYUnchecked(1, 2);

                expect(v).toBeInstanceOf(Vector2i);
            });
        });

        describe('fromFloat', () => {
            it('should truncate positive floats', () => {
                const v = Vector2i.fromFloat(3.7, 5.2);

                expect(v.x).toBe(3);
                expect(v.y).toBe(5);
            });

            it('should truncate negative floats toward zero', () => {
                const v = Vector2i.fromFloat(-3.7, -5.2);

                expect(v.x).toBe(-3);
                expect(v.y).toBe(-5);
            });

            it('should pass through integer values', () => {
                const v = Vector2i.fromFloat(10, 20);

                expect(v.x).toBe(10);
                expect(v.y).toBe(20);
            });
        });

        describe('distance', () => {
            it('should compute static distance between two vectors', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 4);

                expect(Vector2i.distance(a, b)).toBe(5);
            });

            it('should return 0 for the same point', () => {
                const a = new Vector2i(7, 7);

                expect(Vector2i.distance(a, a)).toBe(0);
            });

            it('should be symmetric', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(Vector2i.distance(a, b)).toBe(Vector2i.distance(b, a));
            });
        });

        describe('sqrDistance', () => {
            it('should compute squared distance between two vectors', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 4);

                expect(Vector2i.sqrDistance(a, b)).toBe(25);
            });

            it('should return 0 for the same point', () => {
                const a = new Vector2i(7, 7);

                expect(Vector2i.sqrDistance(a, a)).toBe(0);
            });

            it('should be symmetric', () => {
                const a = new Vector2i(1, 2);
                const b = new Vector2i(4, 6);

                expect(Vector2i.sqrDistance(a, b)).toBe(Vector2i.sqrDistance(b, a));
            });
        });

        describe('dotProduct', () => {
            it('should compute static dot product', () => {
                const a = new Vector2i(3, 4);
                const b = new Vector2i(2, 5);

                expect(Vector2i.dotProduct(a, b)).toBe(26);
            });

            it('should return zero for perpendicular vectors', () => {
                const a = new Vector2i(1, 0);
                const b = new Vector2i(0, 1);

                expect(Vector2i.dotProduct(a, b)).toBe(0);
            });

            it('should match the instance dot method', () => {
                const a = new Vector2i(3, 4);
                const b = new Vector2i(2, 5);

                expect(Vector2i.dotProduct(a, b)).toBe(a.dot(b));
            });
        });

        describe('lerp', () => {
            it('should return a when t = 0', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 20);
                const result = Vector2i.lerp(a, b, 0);

                expect(result.x).toBe(0);
                expect(result.y).toBe(0);
            });

            it('should return b when t = 1', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 20);
                const result = Vector2i.lerp(a, b, 1);

                expect(result.x).toBe(10);
                expect(result.y).toBe(20);
            });

            it('should return the truncated midpoint when t = 0.5', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 20);
                const result = Vector2i.lerp(a, b, 0.5);

                expect(result.x).toBe(5);
                expect(result.y).toBe(10);
            });

            it('should truncate noninteger results', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 7);
                const result = Vector2i.lerp(a, b, 0.5);

                expect(result.x).toBe(1);
                expect(result.y).toBe(3);
            });

            it('should handle negative coordinates', () => {
                const a = new Vector2i(-10, -20);
                const b = new Vector2i(10, 20);
                const result = Vector2i.lerp(a, b, 0.5);
                expect(result.x).toBe(0);
                expect(result.y).toBe(0);
            });
        });

        describe('lerpTo', () => {
            it('should write an interpolated result to the output vector', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 20);
                const out = new Vector2i();

                Vector2i.lerpTo(a, b, 0.5, out);

                expect(out.x).toBe(5);
                expect(out.y).toBe(10);
            });

            it('should return the output vector', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(10, 20);
                const out = new Vector2i();

                expect(Vector2i.lerpTo(a, b, 0.5, out)).toBe(out);
            });

            it('should truncate noninteger results', () => {
                const a = new Vector2i(0, 0);
                const b = new Vector2i(3, 7);
                const out = new Vector2i();

                Vector2i.lerpTo(a, b, 0.5, out);

                expect(out.x).toBe(1);
                expect(out.y).toBe(3);
            });

            it('should return a when t = 0', () => {
                const a = new Vector2i(5, 10);
                const b = new Vector2i(15, 30);
                const out = new Vector2i();

                Vector2i.lerpTo(a, b, 0, out);

                expect(out.x).toBe(5);
                expect(out.y).toBe(10);
            });

            it('should return b when t = 1', () => {
                const a = new Vector2i(5, 10);
                const b = new Vector2i(15, 30);
                const out = new Vector2i();

                Vector2i.lerpTo(a, b, 1, out);

                expect(out.x).toBe(15);
                expect(out.y).toBe(30);
            });
        });
    });
});
