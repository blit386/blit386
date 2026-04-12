/**
 * Error Preview - Visual testing tool for all engine error messages.
 *
 * This is a developer utility, not a regular demo. It uses previewWebGPUErrors()
 * to cycle through every distinct error message the engine can display, so you
 * can check layout, line breaks, and wording without needing to simulate actual
 * failures in a real browser.
 *
 * Navigation:
 *   - Click the << Prev / Next >> buttons
 *   - Press the Left / Right arrow keys
 */

import { previewWebGPUErrors } from 'blit-tech';

// Module scripts run after the DOM is parsed, so no DOMContentLoaded guard needed.
previewWebGPUErrors();
