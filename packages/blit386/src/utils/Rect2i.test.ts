/**
 * Unit tests for {@link Rect2i}.
 *
 * Exercises integer construction, derived edge and center properties,
 * allocation-free output helpers, geometric queries, mutation helpers, and the
 * rectangle arithmetic used across rendering and collision code.
 */

import { describe, expect, it } from 'vitest';

import { Rect2i } from './Rect2i';
import { Vector2i } from './Vector2i';

describe('Rect2i', () => {
    describe('constructor', () => {
        it('should default to (0, 0, 0, 0)', () => {
            const r = new Rect2i();

            expect(r.x).toBe(0);
            expect(r.y).toBe(0);
            expect(r.width).toBe(0);
            expect(r.height).toBe(0);
        });

        it('should pass through integer values unchanged', () => {
            const r = new Rect2i(10, 20, 100, 200);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(100);
            expect(r.height).toBe(200);
        });

        it('should truncate positive floats toward zero', () => {
            const r = new Rect2i(1.9, 2.7, 3.1, 4.99);

            expect(r.x).toBe(1);
            expect(r.y).toBe(2);
            expect(r.width).toBe(3);
            expect(r.height).toBe(4);
        });

        it('should truncate negative floats toward zero', () => {
            const r = new Rect2i(-1.7, -2.9, -3.1, -4.5);

            expect(r.x).toBe(-1);
            expect(r.y).toBe(-2);
            expect(r.width).toBe(-3);
            expect(r.height).toBe(-4);
        });
    });

    describe('right', () => {
        it('should return x + width', () => {
            const r = new Rect2i(10, 20, 100, 50);

            expect(r.right).toBe(110);
        });

        it('should handle negative x', () => {
            const r = new Rect2i(-5, 0, 20, 10);

            expect(r.right).toBe(15);
        });
    });

    describe('bottom', () => {
        it('should return y + height', () => {
            const r = new Rect2i(10, 20, 100, 50);

            expect(r.bottom).toBe(70);
        });

        it('should handle negative y', () => {
            const r = new Rect2i(0, -10, 20, 30);

            expect(r.bottom).toBe(20);
        });
    });

    describe('centerX', () => {
        it('should return truncated center for even width', () => {
            const r = new Rect2i(0, 0, 100, 50);

            expect(r.centerX).toBe(50);
        });

        it('should truncate toward zero for odd width', () => {
            const r = new Rect2i(0, 0, 11, 10);

            expect(r.centerX).toBe(5);
        });

        it('should handle offset position', () => {
            const r = new Rect2i(10, 0, 20, 10);

            expect(r.centerX).toBe(20);
        });
    });

    describe('centerY', () => {
        it('should return truncated center for even height', () => {
            const r = new Rect2i(0, 0, 50, 100);

            expect(r.centerY).toBe(50);
        });

        it('should truncate toward zero for odd height', () => {
            const r = new Rect2i(0, 0, 10, 11);

            expect(r.centerY).toBe(5);
        });

        it('should handle offset position', () => {
            const r = new Rect2i(0, 10, 10, 20);

            expect(r.centerY).toBe(20);
        });
    });

    describe('min', () => {
        it('should return Vector2i(x, y)', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const m = r.min;

            expect(m.x).toBe(5);
            expect(m.y).toBe(10);
        });

        it('should return a new Vector2i instance each time', () => {
            const r = new Rect2i(5, 10, 100, 200);

            const m1 = r.min;
            const m2 = r.min;

            expect(m1).not.toBe(m2);
            expect(m1.x).toBe(m2.x);
            expect(m1.y).toBe(m2.y);
        });
    });

    describe('max', () => {
        it('should return Vector2i(x + width, y + height)', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const m = r.max;

            expect(m.x).toBe(105);
            expect(m.y).toBe(210);
        });

        it('should handle zero-size rect', () => {
            const r = new Rect2i(5, 10, 0, 0);
            const m = r.max;

            expect(m.x).toBe(5);
            expect(m.y).toBe(10);
        });
    });

    describe('center', () => {
        it('should return Vector2i at the center', () => {
            const r = new Rect2i(0, 0, 100, 200);
            const c = r.center;

            expect(c.x).toBe(50);
            expect(c.y).toBe(100);
        });

        it('should truncate toward zero for odd dimensions', () => {
            const r = new Rect2i(0, 0, 11, 13);
            const c = r.center;

            expect(c.x).toBe(5);
            expect(c.y).toBe(6);
        });

        it('should account for position offset', () => {
            const r = new Rect2i(10, 20, 100, 200);
            const c = r.center;

            expect(c.x).toBe(60);
            expect(c.y).toBe(120);
        });
    });

    describe('position getter', () => {
        it('should return Vector2i(x, y)', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const p = r.position;

            expect(p.x).toBe(15);
            expect(p.y).toBe(25);
        });

        it('should create a new Vector2i each time', () => {
            const r = new Rect2i(15, 25, 100, 200);

            expect(r.position).not.toBe(r.position);
        });
    });

    describe('position setter', () => {
        it('should set x and y from a vector', () => {
            const r = new Rect2i(0, 0, 100, 200);

            r.position = new Vector2i(10, 20);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(100);
            expect(r.height).toBe(200);
        });

        it('should truncate to integer', () => {
            const r = new Rect2i(0, 0, 100, 200);

            r.position = Vector2i.fromXYUnchecked(1.9, 2.7);

            expect(r.x).toBe(1);
            expect(r.y).toBe(2);
        });
    });

    describe('size getter', () => {
        it('should return Vector2i(width, height)', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const s = r.size;

            expect(s.x).toBe(100);
            expect(s.y).toBe(200);
        });

        it('should create a new Vector2i each time', () => {
            const r = new Rect2i(15, 25, 100, 200);

            expect(r.size).not.toBe(r.size);
        });
    });

    describe('size setter', () => {
        it('should set width and height from a vector', () => {
            const r = new Rect2i(10, 20, 0, 0);
            r.size = new Vector2i(50, 60);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(50);
            expect(r.height).toBe(60);
        });

        it('should truncate to integer', () => {
            const r = new Rect2i(0, 0, 0, 0);

            r.size = Vector2i.fromXYUnchecked(7.8, 9.3);

            expect(r.width).toBe(7);
            expect(r.height).toBe(9);
        });
    });

    describe('minTo', () => {
        it('should write min to the output vector', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const out = new Vector2i();

            r.minTo(out);

            expect(out.x).toBe(5);
            expect(out.y).toBe(10);
        });

        it('should return the output vector for chaining', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const out = new Vector2i();
            const result = r.minTo(out);

            expect(result).toBe(out);
        });
    });

    describe('maxTo', () => {
        it('should write max to the output vector', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const out = new Vector2i();

            r.maxTo(out);

            expect(out.x).toBe(105);
            expect(out.y).toBe(210);
        });

        it('should return the output vector for chaining', () => {
            const r = new Rect2i(5, 10, 100, 200);
            const out = new Vector2i();

            expect(r.maxTo(out)).toBe(out);
        });
    });

    describe('centerTo', () => {
        it('should write center to the output vector', () => {
            const r = new Rect2i(0, 0, 100, 200);
            const out = new Vector2i();

            r.centerTo(out);

            expect(out.x).toBe(50);
            expect(out.y).toBe(100);
        });

        it('should truncate toward zero for odd dimensions', () => {
            const r = new Rect2i(0, 0, 11, 13);
            const out = new Vector2i();

            r.centerTo(out);

            expect(out.x).toBe(5);
            expect(out.y).toBe(6);
        });

        it('should return the output vector for chaining', () => {
            const r = new Rect2i(0, 0, 100, 200);
            const out = new Vector2i();

            expect(r.centerTo(out)).toBe(out);
        });
    });

    describe('positionTo', () => {
        it('should write position to the output vector', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const out = new Vector2i();

            r.positionTo(out);

            expect(out.x).toBe(15);
            expect(out.y).toBe(25);
        });

        it('should return the output vector for chaining', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const out = new Vector2i();

            expect(r.positionTo(out)).toBe(out);
        });
    });

    describe('sizeTo', () => {
        it('should write size to the output vector', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const out = new Vector2i();

            r.sizeTo(out);

            expect(out.x).toBe(100);
            expect(out.y).toBe(200);
        });

        it('should return the output vector for chaining', () => {
            const r = new Rect2i(15, 25, 100, 200);
            const out = new Vector2i();

            expect(r.sizeTo(out)).toBe(out);
        });
    });

    describe('isContaining', () => {
        it('should return true for a point inside', () => {
            const r = new Rect2i(0, 0, 100, 100);

            expect(r.isContaining(new Vector2i(50, 50))).toBe(true);
        });

        it('should return true for a point on the min edge (inclusive)', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContaining(new Vector2i(10, 20))).toBe(true);
        });

        it('should return false for a point on the max edge (exclusive)', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContaining(new Vector2i(110, 120))).toBe(false);
            expect(r.isContaining(new Vector2i(110, 50))).toBe(false);
            expect(r.isContaining(new Vector2i(50, 120))).toBe(false);
        });

        it('should return false for a point outside', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContaining(new Vector2i(0, 0))).toBe(false);
            expect(r.isContaining(new Vector2i(200, 200))).toBe(false);
        });
    });

    describe('containsXY', () => {
        it('should return true for a point inside', () => {
            const r = new Rect2i(0, 0, 100, 100);

            expect(r.isContainingXY(50, 50)).toBe(true);
        });

        it('should return true for min edge (inclusive)', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContainingXY(10, 20)).toBe(true);
        });

        it('should return false for max edge (exclusive)', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContainingXY(110, 120)).toBe(false);
        });

        it('should return false for a point outside', () => {
            const r = new Rect2i(10, 20, 100, 100);

            expect(r.isContainingXY(0, 0)).toBe(false);
        });
    });

    describe('isIntersecting', () => {
        it('should return true for overlapping rects', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(50, 50, 100, 100);

            expect(a.isIntersecting(b)).toBe(true);
            expect(b.isIntersecting(a)).toBe(true);
        });

        it('should return false for adjacent rects (no overlap)', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(100, 0, 100, 100);

            expect(a.isIntersecting(b)).toBe(false);
        });

        it('should return true when one rect is fully inside another', () => {
            const outer = new Rect2i(0, 0, 100, 100);
            const inner = new Rect2i(20, 20, 10, 10);

            expect(outer.isIntersecting(inner)).toBe(true);
            expect(inner.isIntersecting(outer)).toBe(true);
        });

        it('should return false for non-overlapping rects', () => {
            const a = new Rect2i(0, 0, 10, 10);
            const b = new Rect2i(50, 50, 10, 10);

            expect(a.isIntersecting(b)).toBe(false);
        });
    });

    describe('intersection', () => {
        it('should return the overlapping region', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(50, 50, 100, 100);
            const result = a.intersection(b);

            expect(result).not.toBeNull();
            expect(result?.x).toBe(50);
            expect(result?.y).toBe(50);
            expect(result?.width).toBe(50);
            expect(result?.height).toBe(50);
        });

        it('should return null when rects do not overlap', () => {
            const a = new Rect2i(0, 0, 10, 10);
            const b = new Rect2i(20, 20, 10, 10);
            expect(a.intersection(b)).toBeNull();
        });

        it('should handle fully contained rect', () => {
            const outer = new Rect2i(0, 0, 100, 100);
            const inner = new Rect2i(20, 30, 10, 15);
            const result = outer.intersection(inner);

            expect(result).not.toBeNull();
            expect(result?.x).toBe(20);
            expect(result?.y).toBe(30);
            expect(result?.width).toBe(10);
            expect(result?.height).toBe(15);
        });
    });

    describe('intersectTo', () => {
        it('should write intersection to output rect and return true', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(50, 50, 100, 100);
            const out = new Rect2i();
            const result = a.intersectTo(b, out);

            expect(result).toBe(true);
            expect(out.x).toBe(50);
            expect(out.y).toBe(50);
            expect(out.width).toBe(50);
            expect(out.height).toBe(50);
        });

        it('should return false and leave output unchanged when no overlap', () => {
            const a = new Rect2i(0, 0, 10, 10);
            const b = new Rect2i(20, 20, 10, 10);
            const out = new Rect2i(99, 99, 99, 99);
            const result = a.intersectTo(b, out);

            expect(result).toBe(false);
            expect(out.x).toBe(99);
            expect(out.y).toBe(99);
            expect(out.width).toBe(99);
            expect(out.height).toBe(99);
        });
    });

    describe('intersectionDepth', () => {
        it('should return overlap depth for overlapping rects', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(80, 70, 100, 100);
            const depth = a.intersectionDepth(b);

            expect(depth.x).toBe(20);
            expect(depth.y).toBe(30);
        });

        it('should return positive depth regardless of overlap direction', () => {
            const a = new Rect2i(80, 70, 100, 100);
            const b = new Rect2i(0, 0, 100, 100);
            const depth = a.intersectionDepth(b);

            expect(depth.x).toBe(20);
            expect(depth.y).toBe(30);
        });
    });

    describe('intersectionDepthTo', () => {
        it('should write depth to the output vector', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(80, 70, 100, 100);
            const out = new Vector2i();

            a.intersectionDepthTo(b, out);

            expect(out.x).toBe(20);
            expect(out.y).toBe(30);
        });

        it('should return the output vector for chaining', () => {
            const a = new Rect2i(0, 0, 100, 100);
            const b = new Rect2i(80, 70, 100, 100);
            const out = new Vector2i();

            expect(a.intersectionDepthTo(b, out)).toBe(out);
        });
    });

    describe('isEqual', () => {
        it('should return true for identical rects', () => {
            const a = new Rect2i(10, 20, 30, 40);
            const b = new Rect2i(10, 20, 30, 40);

            expect(a.isEqual(b)).toBe(true);
        });

        it('should return false when any component differs', () => {
            const base = new Rect2i(10, 20, 30, 40);

            expect(base.isEqual(new Rect2i(99, 20, 30, 40))).toBe(false);
            expect(base.isEqual(new Rect2i(10, 99, 30, 40))).toBe(false);
            expect(base.isEqual(new Rect2i(10, 20, 99, 40))).toBe(false);
            expect(base.isEqual(new Rect2i(10, 20, 30, 99))).toBe(false);
        });
    });

    describe('clone', () => {
        it('should create an independent copy', () => {
            const original = new Rect2i(10, 20, 30, 40);
            const copy = original.clone();

            expect(copy.x).toBe(10);
            expect(copy.y).toBe(20);
            expect(copy.width).toBe(30);
            expect(copy.height).toBe(40);
            expect(copy).not.toBe(original);
        });

        it('should not be affected by changes to the original', () => {
            const original = new Rect2i(10, 20, 30, 40);
            const copy = original.clone();

            original.x = 999;

            expect(copy.x).toBe(10);
        });
    });

    describe('cloneTo', () => {
        it('should write all components to the output rect', () => {
            const source = new Rect2i(10, 20, 30, 40);
            const out = new Rect2i();
            source.cloneTo(out);
            expect(out.x).toBe(10);
            expect(out.y).toBe(20);
            expect(out.width).toBe(30);
            expect(out.height).toBe(40);
        });

        it('should return the output rect for chaining', () => {
            const source = new Rect2i(10, 20, 30, 40);
            const out = new Rect2i();

            expect(source.cloneTo(out)).toBe(out);
        });
    });

    describe('toString', () => {
        it('should format as Rect2i(x, y, width, height)', () => {
            const r = new Rect2i(10, 20, 30, 40);

            expect(r.toString()).toBe('Rect2i(10, 20, 30, 40)');
        });

        it('should handle negative values', () => {
            const r = new Rect2i(-5, -10, 20, 30);

            expect(r.toString()).toBe('Rect2i(-5, -10, 20, 30)');
        });

        it('should handle zero rect', () => {
            const r = new Rect2i();

            expect(r.toString()).toBe('Rect2i(0, 0, 0, 0)');
        });
    });

    describe('set', () => {
        it('should set all components', () => {
            const r = new Rect2i();

            r.set(10, 20, 30, 40);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(30);
            expect(r.height).toBe(40);
        });

        it('should truncate floats toward zero', () => {
            const r = new Rect2i();

            r.set(1.9, -2.7, 3.1, 4.99);

            expect(r.x).toBe(1);
            expect(r.y).toBe(-2);
            expect(r.width).toBe(3);
            expect(r.height).toBe(4);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i();
            const result = r.set(10, 20, 30, 40);

            expect(result).toBe(r);
        });
    });

    describe('setPosition', () => {
        it('should set x and y only', () => {
            const r = new Rect2i(0, 0, 100, 200);

            r.setPosition(10, 20);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(100);
            expect(r.height).toBe(200);
        });

        it('should truncate floats', () => {
            const r = new Rect2i();

            r.setPosition(1.7, -2.3);

            expect(r.x).toBe(1);
            expect(r.y).toBe(-2);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i();

            expect(r.setPosition(10, 20)).toBe(r);
        });
    });

    describe('setSize', () => {
        it('should set width and height only', () => {
            const r = new Rect2i(10, 20, 0, 0);

            r.setSize(100, 200);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(100);
            expect(r.height).toBe(200);
        });

        it('should truncate floats', () => {
            const r = new Rect2i();

            r.setSize(5.9, 6.1);

            expect(r.width).toBe(5);
            expect(r.height).toBe(6);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i();

            expect(r.setSize(100, 200)).toBe(r);
        });
    });

    describe('copyFrom', () => {
        it('should copy all values from another rect', () => {
            const source = new Rect2i(10, 20, 30, 40);
            const target = new Rect2i();

            target.copyFrom(source);

            expect(target.x).toBe(10);
            expect(target.y).toBe(20);
            expect(target.width).toBe(30);
            expect(target.height).toBe(40);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i();

            expect(r.copyFrom(new Rect2i(1, 2, 3, 4))).toBe(r);
        });

        it('should not link the two rects', () => {
            const source = new Rect2i(10, 20, 30, 40);
            const target = new Rect2i();

            target.copyFrom(source);

            source.x = 999;
            expect(target.x).toBe(10);
        });
    });

    describe('translate', () => {
        it('should move the rect by the given offset', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.translate(5, -3);

            expect(r.x).toBe(15);
            expect(r.y).toBe(17);
            expect(r.width).toBe(30);
            expect(r.height).toBe(40);
        });

        it('should truncate float offsets', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.translate(1.9, -2.7);

            expect(r.x).toBe(11);
            expect(r.y).toBe(18);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i();

            expect(r.translate(5, 5)).toBe(r);
        });
    });

    describe('expand', () => {
        it('should expand on all sides by the given amount', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.expand(5);

            expect(r.x).toBe(5);
            expect(r.y).toBe(15);
            expect(r.width).toBe(40);
            expect(r.height).toBe(50);
        });

        it('should shrink with negative amount', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.expand(-2);

            expect(r.x).toBe(12);
            expect(r.y).toBe(22);
            expect(r.width).toBe(26);
            expect(r.height).toBe(36);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i(10, 20, 30, 40);

            expect(r.expand(5)).toBe(r);
        });
    });

    describe('expandXY', () => {
        it('should expand with different horizontal and vertical amounts', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.expandXY(5, 3);

            expect(r.x).toBe(5);
            expect(r.y).toBe(17);
            expect(r.width).toBe(40);
            expect(r.height).toBe(46);
        });

        it('should handle mixed positive and negative values', () => {
            const r = new Rect2i(10, 20, 30, 40);

            r.expandXY(2, -3);

            expect(r.x).toBe(8);
            expect(r.y).toBe(23);
            expect(r.width).toBe(34);
            expect(r.height).toBe(34);
        });

        it('should return this for chaining', () => {
            const r = new Rect2i(10, 20, 30, 40);

            expect(r.expandXY(5, 3)).toBe(r);
        });
    });

    describe('chaining mutations', () => {
        it('should support chaining multiple mutation methods', () => {
            const r = new Rect2i().set(0, 0, 100, 100).translate(10, 20).expand(5);

            expect(r.x).toBe(5);
            expect(r.y).toBe(15);
            expect(r.width).toBe(110);
            expect(r.height).toBe(110);
        });
    });

    describe('zero', () => {
        it('should return a rect at (0, 0, 0, 0)', () => {
            const r = Rect2i.zero();

            expect(r.x).toBe(0);
            expect(r.y).toBe(0);
            expect(r.width).toBe(0);
            expect(r.height).toBe(0);
        });

        it('should return the same frozen singleton', () => {
            const a = Rect2i.zero();
            const b = Rect2i.zero();

            expect(a).toBe(b);
        });

        it('should be frozen (immutable)', () => {
            const r = Rect2i.zero();

            expect(Object.isFrozen(r)).toBe(true);
        });
    });

    describe('fromMinMax', () => {
        it('should create a rect from two corner vectors', () => {
            const min = new Vector2i(10, 20);
            const max = new Vector2i(50, 80);
            const r = Rect2i.fromMinMax(min, max);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(40);
            expect(r.height).toBe(60);
        });

        it('should handle zero-size rect (min equals max)', () => {
            const p = new Vector2i(10, 20);
            const r = Rect2i.fromMinMax(p, p);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(0);
            expect(r.height).toBe(0);
        });
    });

    describe('fromMinMaxXY', () => {
        it('should create a rect from raw coordinates', () => {
            const r = Rect2i.fromMinMaxXY(10, 20, 50, 80);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(40);
            expect(r.height).toBe(60);
        });

        it('should truncate float coordinates', () => {
            const r = Rect2i.fromMinMaxXY(1.9, 2.7, 10.1, 20.5);

            expect(r.x).toBe(1);
            expect(r.y).toBe(2);
            expect(r.width).toBe(9);
            expect(r.height).toBe(18);
        });

        it('should handle negative coordinates', () => {
            const r = Rect2i.fromMinMaxXY(-10, -20, 10, 20);

            expect(r.x).toBe(-10);
            expect(r.y).toBe(-20);
            expect(r.width).toBe(20);
            expect(r.height).toBe(40);
        });
    });

    describe('fromCenterSize', () => {
        it('should create a centered rect from vectors', () => {
            const center = new Vector2i(50, 50);
            const size = new Vector2i(20, 30);
            const r = Rect2i.fromCenterSize(center, size);

            expect(r.x).toBe(40);
            expect(r.y).toBe(35);
            expect(r.width).toBe(20);
            expect(r.height).toBe(30);
        });

        it('should truncate half-size toward zero for odd dimensions', () => {
            const center = new Vector2i(50, 50);
            const size = new Vector2i(11, 13);
            const r = Rect2i.fromCenterSize(center, size);

            expect(r.x).toBe(45);
            expect(r.y).toBe(44);
            expect(r.width).toBe(11);
            expect(r.height).toBe(13);
        });
    });

    describe('fromCenterSizeXY', () => {
        it('should create a centered rect from raw coordinates', () => {
            const r = Rect2i.fromCenterSizeXY(50, 50, 20, 30);

            expect(r.x).toBe(40);
            expect(r.y).toBe(35);
            expect(r.width).toBe(20);
            expect(r.height).toBe(30);
        });

        it('should truncate float inputs', () => {
            const r = Rect2i.fromCenterSizeXY(50.9, 50.1, 20.7, 30.3);

            expect(r.x).toBe(40);
            expect(r.y).toBe(35);
            expect(r.width).toBe(20);
            expect(r.height).toBe(30);
        });

        it('should handle the origin center', () => {
            const r = Rect2i.fromCenterSizeXY(0, 0, 10, 10);

            expect(r.x).toBe(-5);
            expect(r.y).toBe(-5);
            expect(r.width).toBe(10);
            expect(r.height).toBe(10);
        });
    });

    describe('fromValuesUnchecked', () => {
        it('should create a rect without truncation', () => {
            const r = Rect2i.fromValuesUnchecked(10, 20, 30, 40);

            expect(r.x).toBe(10);
            expect(r.y).toBe(20);
            expect(r.width).toBe(30);
            expect(r.height).toBe(40);
        });

        it('should preserve integer values without extra truncation', () => {
            const r = Rect2i.fromValuesUnchecked(1, 2, 3, 4);

            expect(r.x).toBe(1);
            expect(r.y).toBe(2);
            expect(r.width).toBe(3);
            expect(r.height).toBe(4);
        });

        it('should produce a valid Rect2i instance', () => {
            const r = Rect2i.fromValuesUnchecked(10, 20, 30, 40);
            expect(r).toBeInstanceOf(Rect2i);
            expect(r.right).toBe(40);
            expect(r.bottom).toBe(60);
        });
    });
});
