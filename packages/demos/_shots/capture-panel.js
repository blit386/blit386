/**
 * The dev-only capture controls above the gallery: pick demos, poses, and variants, run them
 * through capture.js, show progress, and save through save.js.
 */

import { COMMITTED_VARIANTS, posesFor, VARIANTS } from './poses.js';

/**
 * @param {string} value
 * @param {boolean} checked
 * @returns {HTMLLabelElement}
 */
function checkboxLabel(value, checked) {
    const label = document.createElement('label');
    const box = document.createElement('input');

    box.type = 'checkbox';
    box.value = value;
    box.checked = checked;
    label.append(box, ` ${value}`);

    return label;
}

/**
 * @param {HTMLElement} root - The #shots-capture section.
 * @param {{
 *   demos: Array<{ slug: string }>,
 *   onRun: (jobs: Array<{ slug: string, pose: object, variant: string }>) => Promise<void>,
 *   onSave: () => Promise<void>,
 * }} hooks
 */
function createCapturePanel(root, hooks) {
    root.hidden = false;
    root.innerHTML = `
        <div class="shots-row">
            <strong>Capture</strong>
            <label><input type="checkbox" data-role="all-demos"/> all demos</label>
            <span data-role="variants"></span>
        </div>
        <div class="shots-demos" data-role="demos"></div>
        <div class="shots-row">
            <button type="button" data-role="run">Capture selected (c)</button>
            <button type="button" data-role="run-all">Capture all (Shift+C)</button>
            <button type="button" data-role="save" disabled>Save to public/shots</button>
            <span data-role="progress" aria-live="polite"></span>
        </div>`;

    const demoList = root.querySelector('[data-role="demos"]');
    const variantBox = root.querySelector('[data-role="variants"]');
    const progress = root.querySelector('[data-role="progress"]');
    const saveButton = root.querySelector('[data-role="save"]');

    demoList.append(...hooks.demos.map((demo) => checkboxLabel(demo.slug, false)));
    variantBox.append(...VARIANTS.map((variant) => checkboxLabel(variant, COMMITTED_VARIANTS.includes(variant))));

    root.querySelector('[data-role="all-demos"]').addEventListener('change', (event) => {
        for (const box of demoList.querySelectorAll('input')) {
            box.checked = event.target.checked;
        }
    });

    function selectedSlugs() {
        return [...demoList.querySelectorAll('input:checked')].map((box) => box.value);
    }

    function selectedVariants() {
        return [...variantBox.querySelectorAll('input:checked')].map((box) => box.value);
    }

    function jobsFor(slugs) {
        const variants = selectedVariants();

        return slugs.flatMap((slug) =>
            posesFor(slug).flatMap((pose) => variants.map((variant) => ({ slug, pose, variant }))),
        );
    }

    let running = false;

    function setButtons(disabled) {
        for (const button of root.querySelectorAll('[data-role="run"], [data-role="run-all"]')) {
            button.disabled = disabled;
        }
    }

    // One run at a time: two loops would fight over the single iframe and mislabel frames.
    async function run(slugs) {
        if (running) {
            progress.textContent = 'capture already running';
            return;
        }

        if (slugs.length === 0) {
            progress.textContent = 'pick at least one demo';
            return;
        }

        running = true;
        setButtons(true);

        try {
            await hooks.onRun(jobsFor(slugs));
            saveButton.disabled = false;
        } finally {
            running = false;
            setButtons(false);
        }
    }

    async function save() {
        try {
            await hooks.onSave();
        } catch (error) {
            progress.textContent = `save failed: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    root.querySelector('[data-role="run"]').addEventListener('click', () => run(selectedSlugs()));
    root.querySelector('[data-role="run-all"]').addEventListener('click', () =>
        run(hooks.demos.map((demo) => demo.slug)),
    );
    saveButton.addEventListener('click', save);

    return {
        setProgress(text) {
            progress.textContent = text;
        },
        runSlugs: run,
        selectedVariants,
    };
}

export { createCapturePanel };
