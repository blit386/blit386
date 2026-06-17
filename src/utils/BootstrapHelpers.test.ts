// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_CANVAS_ID, DEFAULT_CONTAINER_ID, displayError, getCanvas } from './BootstrapHelpers';

describe('BootstrapHelpers', () => {
    describe('Constants', () => {
        it('should have DEFAULT_CANVAS_ID equal to blit386-canvas', () => {
            expect(DEFAULT_CANVAS_ID).toBe('blit386-canvas');
        });

        it('should have DEFAULT_CONTAINER_ID equal to canvas-container', () => {
            expect(DEFAULT_CONTAINER_ID).toBe('canvas-container');
        });
    });

    describe('getCanvas', () => {
        it('should return null for a missing element', () => {
            const result = getCanvas('nonexistent-canvas-id');
            expect(result).toBeNull();
        });

        it('should return the canvas element for a valid canvas', () => {
            const canvas = document.createElement('canvas');
            canvas.id = DEFAULT_CANVAS_ID;
            document.body.appendChild(canvas);

            try {
                const result = getCanvas(DEFAULT_CANVAS_ID);
                expect(result).toBe(canvas);
                expect(result).toBeInstanceOf(HTMLCanvasElement);
            } finally {
                document.body.removeChild(canvas);
            }
        });

        it("should return null when the element isn't a canvas", () => {
            const div = document.createElement('div');
            div.id = DEFAULT_CANVAS_ID;
            document.body.appendChild(div);

            try {
                const result = getCanvas(DEFAULT_CANVAS_ID);
                expect(result).toBeNull();
            } finally {
                document.body.removeChild(div);
            }
        });
    });

    describe('displayError', () => {
        beforeEach(() => {
            const container = document.createElement('div');
            container.id = DEFAULT_CONTAINER_ID;
            document.body.appendChild(container);
        });

        afterEach(() => {
            const container = document.getElementById(DEFAULT_CONTAINER_ID);

            if (container) {
                document.body.removeChild(container);
            }
        });

        it('should render title and string message in the container', () => {
            displayError('Test Error', 'Something went wrong');
            const container = document.getElementById(DEFAULT_CONTAINER_ID);
            expect(container?.querySelector('h2')?.textContent).toBe('Test Error');
            expect(container?.querySelector('p')?.textContent).toBe('Something went wrong');
        });

        it('should render object content with text and code block', () => {
            displayError('Error Title', { text: 'An error occurred', code: 'stack trace here' });
            const container = document.getElementById(DEFAULT_CONTAINER_ID);
            expect(container?.querySelector('h2')?.textContent).toBe('Error Title');
            expect(container?.querySelector('code')?.textContent).toBe('stack trace here');
        });

        it('should render object content without a code block when code is omitted', () => {
            displayError('Error Title', { text: 'An error occurred' });
            const container = document.getElementById(DEFAULT_CONTAINER_ID);
            expect(container?.querySelector('code')).toBeNull();
        });

        it("should fall back to console.error when the container isn't found", () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            displayError('Error', 'Message', 'nonexistent-container-id');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});
