/**
 * The software backend's three frame-capture slots and the one PNG export they share.
 */

/** A canvas the software backend can export: the output canvas or the logical one. */
type ExportCanvas = OffscreenCanvas | HTMLCanvasElement;

/** Promise callbacks of a capture waiting for the next frame. */
type Pending = {
    resolve: (blob: Blob) => void;
    reject: (reason: Error) => void;
};

/** `captureFrame`: the upscaled output canvas. */
const OUTPUT = 0;

/** `captureFrameAtDisplaySize`: the logical canvas. */
const DISPLAY = 1;

/** `captureFrameForShortcut`: the logical canvas, from the slot reserved for F9 / Shift+F9. */
const SHORTCUT = 2;

/** Public method behind each slot, for the "already in progress" message. */
const METHODS = ['captureFrame', 'captureFrameAtDisplaySize', 'captureFrameForShortcut'] as const;

/** Shown when a capture settles before the renderer has a canvas to export. */
const NOT_INITIALIZED_MESSAGE = "Can't save this frame - the renderer hasn't finished initializing yet.";

/**
 * One pending capture per slot. A new request in a slot rejects the one it replaces; the
 * other slots are untouched, so an agent's capture and an F9 press never cancel each other.
 */
export class SoftwareFrameCaptures {
    /** Pending capture per slot, indexed by {@link OUTPUT}, {@link DISPLAY}, {@link SHORTCUT}. */
    private readonly slots: Array<Pending | null> = [null, null, null];

    /**
     * Registers a capture of the next frame's output canvas.
     *
     * @returns Promise for the PNG.
     */
    output(): Promise<Blob> {
        return this.request(OUTPUT);
    }

    /**
     * Registers a capture of the next frame's logical canvas.
     *
     * @returns Promise for the PNG.
     */
    display(): Promise<Blob> {
        return this.request(DISPLAY);
    }

    /**
     * Registers a logical-canvas capture from the F9 / Shift+F9 slot.
     *
     * @returns Promise for the PNG.
     */
    shortcut(): Promise<Blob> {
        return this.request(SHORTCUT);
    }

    /**
     * Rejects every pending capture with `message`.
     *
     * @param message - Rejection message.
     */
    rejectAll(message: string): void {
        for (let slot = OUTPUT; slot <= SHORTCUT; slot++) {
            this.take(slot)?.reject(new Error(message));
        }
    }

    /** Rejects every pending capture because the frame ended before the renderer had a canvas. */
    rejectUninitialized(): void {
        this.rejectAll(NOT_INITIALIZED_MESSAGE);
    }

    /**
     * Settles every pending capture from the frame just presented: the output slot from
     * `output`, both logical slots from one shared export of `logical`.
     *
     * @param output - Upscaled output canvas.
     * @param logical - Logical-resolution canvas, or `null` before init.
     */
    settle(output: ExportCanvas, logical: ExportCanvas | null): void {
        const outputRequest = this.take(OUTPUT);

        if (outputRequest) {
            exportPng(output).then(outputRequest.resolve).catch(outputRequest.reject);
        }

        const display = this.take(DISPLAY);
        const shortcut = this.take(SHORTCUT);

        if (display || shortcut) {
            const png = exportPng(logical);

            for (const request of [display, shortcut]) {
                if (request) {
                    png.then(request.resolve).catch(request.reject);
                }
            }
        }
    }

    /**
     * Registers a pending capture in `slot`, rejecting the one it replaces.
     *
     * @param slot - Slot index.
     * @returns Promise for the PNG.
     */
    private request(slot: number): Promise<Blob> {
        // eslint-disable-next-line security/detect-object-injection
        const method = METHODS[slot] as string;

        this.take(slot)?.reject(
            new Error(
                `A capture is already in progress. Wait for the first ${method}() to finish before requesting another.`,
            ),
        );

        return new Promise<Blob>((resolve, reject) => {
            // eslint-disable-next-line security/detect-object-injection
            this.slots[slot] = { resolve, reject };
        });
    }

    /**
     * Clears `slot` and returns what was pending there.
     *
     * @param slot - Slot index.
     * @returns The pending capture, or `null`.
     */
    private take(slot: number): Pending | null {
        // eslint-disable-next-line security/detect-object-injection
        const pending = this.slots[slot] ?? null;

        // eslint-disable-next-line security/detect-object-injection
        this.slots[slot] = null;

        return pending;
    }
}

/**
 * Exports a canvas as PNG, through `convertToBlob` for an `OffscreenCanvas` and `toBlob` otherwise.
 *
 * @param canvas - Canvas to export, or `null` before init.
 * @returns Promise for the PNG; rejects with a user-facing message when export is impossible.
 */
function exportPng(canvas: ExportCanvas | null): Promise<Blob> {
    if (!canvas) {
        return Promise.reject(new Error(NOT_INITIALIZED_MESSAGE));
    }

    // typeof first: instanceof would throw where the OffscreenCanvas global does not exist.
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        return canvas.convertToBlob({ type: 'image/png' }).catch((error: unknown) => {
            throw error instanceof Error ? error : new Error(String(error));
        });
    }

    const element = canvas as HTMLCanvasElement;

    if (typeof element.toBlob !== 'function') {
        return Promise.reject(
            new Error("Can't save this frame - your browser doesn't support canvas image export. Try Chrome or Edge."),
        );
    }

    return new Promise<Blob>((resolve, reject) => {
        element.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(
                    new Error(
                        "Can't save this frame - something went wrong exporting the canvas image. Try again on the next frame.",
                    ),
                );
            }
        }, 'image/png');
    });
}
