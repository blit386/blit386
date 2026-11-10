/**
 * DOM utility helpers for BLIT386 bootstrap.
 *
 * Canvas lookup and error display utilities used by the bootstrap function.
 */

/** Default canvas element ID. */
export const DEFAULT_CANVAS_ID = 'blit386-canvas';

/** Default container element ID for error display. */
export const DEFAULT_CONTAINER_ID = 'canvas-container';

/** Attribute marking the error panel {@link displayError} adds, so a later call replaces only that panel. */
const PANEL_ATTRIBUTE = 'data-bt-error';

/** Messages each container has already shown, so a repeat does no DOM or console work. */
const shownByContainer = new WeakMap<HTMLElement, Set<string>>();

/** Messages already logged without a panel (no container, or a release build). */
// shortcut: never cleared, so a message already seen this page load stays silent after a hot reload.
const loggedMessages = new Set<string>();

/** Container the engine's own runtime errors go to; set by `bootstrap()` from `BootstrapOptions.containerID`. */
let errorContainerID = DEFAULT_CONTAINER_ID;

/**
 * Content that can be displayed in an error message.
 * Use string for plain text or object for text with code formatting.
 */
export type ErrorContent =
    | string
    | {
          text: string;
          code?: string;
      };

/**
 * Appends text to an element, converting newline characters to `<br>` elements.
 * Safe against XSS: all text is inserted via createTextNode, never innerHTML.
 *
 * @param element - Target element to append into.
 * @param text - Plain text, optionally containing newline characters.
 */
function appendTextWithLineBreaks(element: HTMLElement, text: string): void {
    const lines = text.split('\n');

    lines.forEach((line, index) => {
        element.appendChild(document.createTextNode(line));

        if (index < lines.length - 1) {
            element.appendChild(document.createElement('br'));
        }
    });
}

/**
 * Flattens error content to one string for the console and for deduplication.
 *
 * @param content - Plain text, or text with an optional code block.
 * @returns The text, followed by the code on its own line when there is one.
 */
function contentText(content: ErrorContent): string {
    return typeof content === 'string' ? content : `${content.text}\n${content.code ?? ''}`;
}

/**
 * Logs `[BT] title: message` with `console.error` the first time this pair is seen, and does nothing after that.
 *
 * Internal: the engine's release-build path for runtime errors, and {@link displayError}'s fallback when the
 * container is missing. Not part of the `BLIT386.ts` export block.
 *
 * @param title - Error heading.
 * @param content - Error content.
 */
export function logErrorOnce(title: string, content: ErrorContent): void {
    const message = contentText(content);
    const key = `${title}\n${message}`;

    if (loggedMessages.has(key)) {
        return;
    }

    loggedMessages.add(key);
    console.error(`[BT] ${title}: ${message}`);
}

/**
 * Sets the container the engine's runtime errors (bad draw calls, calls made too early) are shown in.
 *
 * Internal: called by `bootstrap()` with the resolved `BootstrapOptions.containerID`.
 *
 * @param containerID - Container element ID.
 */
export function setErrorContainerID(containerID: string): void {
    errorContainerID = containerID;
}

/**
 * Returns the container ID set by {@link setErrorContainerID}, `'canvas-container'` until then.
 *
 * @returns Container element ID.
 */
export function getErrorContainerID(): string {
    return errorContainerID;
}

/**
 * Displays an error message in the page UI.
 * Adds a styled error box to the container, pinned to the top of the viewport, and logs the message once with
 * `console.error`. Leaves everything else in the container (the game's canvas) in place, replaces its own previous
 * box, and does nothing for a message this container already showed, so a call made every frame costs nothing after
 * the first.
 *
 * SECURITY: This function renders content safely using createTextNode to prevent XSS attacks.
 * All text (including code) is treated as plain text, not interpreted as markup.
 *
 * @since 1.0.3
 * @changed 1.8.1 Keeps the container's other children (the canvas) instead of emptying it, shows each distinct message
 *   once per container, and logs it once with `console.error`.
 * @param title - Error heading text displayed prominently.
 * @param content - Error message content (string or object with optional code formatting).
 * @param containerID - ID of the container element. Default: 'canvas-container'
 *
 * @example
 * displayError(
 *     'Canvas Error',
 *     'Failed to find canvas element with id: ' + userProvidedId
 * );
 *
 * @example
 * displayError(
 *     'Initialization Error',
 *     { text: 'An error occurred:', code: error.message }
 * );
 */
export function displayError(title: string, content: ErrorContent, containerID: string = DEFAULT_CONTAINER_ID): void {
    const container = document.getElementById(containerID);

    if (!container) {
        logErrorOnce(title, content);
        return;
    }

    const message = contentText(content);
    const key = `${title}\n${message}`;
    let shown = shownByContainer.get(container);

    if (!shown) {
        shown = new Set();
        shownByContainer.set(container, shown);
    }

    if (shown.has(key)) {
        return;
    }

    shown.add(key);
    console.error(`[BT] ${title}: ${message}`);

    // Create error elements using DOM methods for safety.
    const errorDiv = document.createElement('div');

    errorDiv.setAttribute(PANEL_ATTRIBUTE, '');

    // Fixed to the viewport so the container's own layout (a flex row around the canvas) never reflows.
    errorDiv.style.cssText = `
        position: fixed;
        top: 16px;
        left: 16px;
        right: 16px;
        z-index: 2147483647;
        box-sizing: border-box;
        padding: 40px;
        text-align: center;
        color: white;
        background: oklch(44.4% 0.177 26.899);
        box-shadow: 0 0 0 4px black inset;
        max-width: 640px;
        margin: 0 auto;
        font-family: monospace;
    `;

    const heading = document.createElement('h2');
    const msg = document.createElement('p');

    heading.style.cssText = 'margin: 0 0 28px; font-size: 18px;';
    msg.style.cssText = 'margin: 0; line-height: 1.8; text-align: left; white-space: pre-wrap;';

    heading.textContent = title;

    // Handle content - either plain string or object with code formatting.
    // appendTextWithLineBreaks is used instead of textContent so that \n produces
    // visible line breaks, making numbered step lists readable in the error panel.
    if (typeof content === 'string') {
        appendTextWithLineBreaks(msg, content);
    } else {
        appendTextWithLineBreaks(msg, content.text);

        if (content.code) {
            // Add code block using DOM for safety.
            const codeBlock = document.createElement('code');

            codeBlock.style.cssText =
                'display: block; margin-top: 10px; padding: 10px; ' +
                'background: #1a0000; border: 1px solid #ff0000; ' +
                'font-family: monospace; font-size: 12px; ' +
                'text-align: left; overflow-x: auto; white-space: pre-wrap; word-break: break-all;';

            codeBlock.textContent = content.code; // Safe - uses textContent

            msg.appendChild(codeBlock);
        }
    }

    errorDiv.appendChild(heading);
    errorDiv.appendChild(msg);

    container.querySelector(`:scope > [${PANEL_ATTRIBUTE}]`)?.remove();
    container.prepend(errorDiv);
}

/**
 * Retrieves a canvas element from the DOM by ID.
 * Validates that the element exists and is a canvas element.
 *
 * @since 1.0.3
 * @param canvasID - ID of the canvas element. Default: 'blit386-canvas'
 * @returns The canvas element if found and valid, null otherwise.
 *
 * @example
 * const canvas = getCanvas('my-demo-canvas');
 * if (!canvas) {
 *     displayError('Canvas Error', 'Failed to find a canvas element.');
 *     return;
 * }
 */
export function getCanvas(canvasID: string = DEFAULT_CANVAS_ID): HTMLCanvasElement | null {
    const element = document.getElementById(canvasID);
    let canvas: HTMLCanvasElement | null = null;

    if (!element) {
        console.error(`[BT] Canvas element with id '${canvasID}' not found`);
    } else if (!(element instanceof HTMLCanvasElement)) {
        console.error(`[BT] Element with id '${canvasID}' is not a canvas element`);
    } else {
        canvas = element;
    }

    return canvas;
}
