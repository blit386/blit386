// @vitest-environment happy-dom

/**
 * Unit tests for {@link applyCanvasLayoutStyles}.
 */

import { describe, expect, it } from 'vitest';

import { applyCanvasLayoutStyles } from './CanvasLayoutStyles';
import { Vector2i } from './Vector2i';

describe('applyCanvasLayoutStyles', () => {
    it('sets display aspect and max size CSS variables on #canvas-container', () => {
        const container = document.createElement('div');
        const canvas = document.createElement('canvas');

        container.id = 'canvas-container';
        container.appendChild(canvas);
        document.body.appendChild(container);

        applyCanvasLayoutStyles(canvas, {
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(640, 480),
            maxCanvasSize: new Vector2i(960, 720),
        });

        expect(container.style.getPropertyValue('--canvas-aspect-w')).toBe('640');
        expect(container.style.getPropertyValue('--canvas-aspect-h')).toBe('480');
        expect(container.style.getPropertyValue('--canvas-max-w')).toBe('960px');
        expect(container.style.getPropertyValue('--canvas-max-h')).toBe('720px');
        expect(canvas.style.getPropertyValue('max-width')).toBe('960px');
        expect(canvas.style.getPropertyValue('max-height')).toBe('720px');
    });

    it('uses displaySize for aspect when drawingBufferSize is omitted', () => {
        const container = document.createElement('div');
        const canvas = document.createElement('canvas');

        container.id = 'canvas-container';
        container.appendChild(canvas);

        applyCanvasLayoutStyles(canvas, {
            displaySize: new Vector2i(400, 300),
            maxCanvasSize: new Vector2i(800, 600),
        });

        expect(container.style.getPropertyValue('--canvas-aspect-w')).toBe('400');
        expect(container.style.getPropertyValue('--canvas-aspect-h')).toBe('300');
        expect(canvas.style.width).toBe('');
    });

    it('clears inline width/height when drawingBufferSize is removed on second call', () => {
        const container = document.createElement('div');
        const canvas = document.createElement('canvas');

        container.id = 'canvas-container';
        container.appendChild(canvas);

        applyCanvasLayoutStyles(canvas, {
            displaySize: new Vector2i(320, 240),
            drawingBufferSize: new Vector2i(640, 480),
            maxCanvasSize: new Vector2i(960, 720),
        });

        applyCanvasLayoutStyles(canvas, {
            displaySize: new Vector2i(320, 240),
            maxCanvasSize: new Vector2i(960, 720),
        });

        expect(container.style.getPropertyValue('--canvas-aspect-w')).toBe('320');
        expect(container.style.getPropertyValue('--canvas-aspect-h')).toBe('240');
        expect(canvas.style.width).toBe('');
        expect(canvas.style.height).toBe('');
    });
});
