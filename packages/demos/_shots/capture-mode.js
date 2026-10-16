/**
 * Capture mode of the /shots page (dev server only, loaded by shots.js behind
 * `import.meta.env.DEV`): wires the capture panel, the iframe driver, saving, the
 * `window.__shotsCapture` hook, and the headless `?auto` protocol.
 */

import { DEMO_ORDER } from '../plugins/demo-order.js';
import { captureAll, createFrameAdapter, errorText } from './capture.js';
import { createCapturePanel } from './capture-panel.js';
import { imagePath, mergeManifest } from './manifest.js';
import { isKnownPose, jobsFor } from './poses.js';
import { entriesFromResults, pickShotsDirectory, saveRun } from './save.js';

const DEFAULT_AUTO_VARIANTS = 'display,uidebug';

function csv(value) {
    return (value ?? '').split(',').filter(Boolean);
}

/**
 * Base64 of a blob, in chunks so a large PNG never overflows the argument limit of apply().
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
async function toBase64(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';

    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }

    return btoa(binary);
}

/**
 * @param {{
 *   manifest: object,
 *   demos: Array<{ slug: string }>,
 *   demoBase: string,
 *   pageSuffix: string,
 *   gallery: { setEntries: Function },
 *   liveImages: Map<string, string>,
 *   liveImageKey: (slug: string, pose: string, variant: string) => string,
 *   setStatus: (text: string) => void,
 * }} shell
 * @returns {Promise<void>} Resolves when an `?auto` run finishes (immediately without `?auto`).
 */
async function startCaptureMode(shell) {
    const { demos, gallery, liveImages, liveImageKey, setStatus } = shell;
    const frame = createFrameAdapter(document.getElementById('shots-frame'));
    let currentManifest = shell.manifest;
    // What the last save wrote: a failed image is in currentManifest (the gallery shows it) but not here.
    let savedManifest = shell.manifest;
    /** @type {Array<object>} */
    let unsaved = [];
    let directory = null;

    function engineVersion() {
        return document.body.dataset.engineVersion ?? '';
    }

    function mergedWith(results) {
        return mergeManifest(currentManifest, entriesFromResults(results), DEMO_ORDER, {
            engineVersion: engineVersion(),
            isKnownPose,
        });
    }

    async function runJobs(jobs) {
        const results = [];

        await captureAll(
            frame,
            jobs,
            (result) => {
                results.push(result);
                panel.setProgress(
                    `${results.length}/${jobs.length} ${result.slug}/${result.pose} ${result.variant} ${result.ok ? 'ok' : `FAILED ${result.error}`}`,
                );

                if (result.ok) {
                    const key = liveImageKey(result.slug, result.pose, result.variant);
                    const previous = liveImages.get(key);

                    if (previous) {
                        URL.revokeObjectURL(previous);
                    }

                    liveImages.set(key, URL.createObjectURL(result.blob));
                }

                gallery.setEntries(mergedWith(results).entries);
            },
            { demoBase: shell.demoBase, pageSuffix: shell.pageSuffix },
        );

        currentManifest = mergedWith(results);
        unsaved = [...unsaved, ...results];
        setStatus(`${results.filter((result) => result.ok).length}/${results.length} captured, unsaved`);

        return results;
    }

    const panel = createCapturePanel(document.getElementById('shots-capture'), {
        demos,
        onRun: runJobs,
        onSave: async () => {
            directory ??= await pickShotsDirectory();

            const { manifest, failed } = await saveRun(directory, unsaved, savedManifest, {
                engineVersion: engineVersion(),
            });

            savedManifest = manifest;
            // A failed image stays unsaved so the next Save retries it; a failed manifest is rewritten then too.
            unsaved = failed.flatMap((item) => (item.result ? [item.result] : []));

            if (failed.length > 0) {
                throw new Error(`could not write ${failed.map((item) => `${item.path} (${item.error})`).join(', ')}`);
            }

            setStatus(
                directory
                    ? `saved ${savedManifest.entries.length} entries to public/shots`
                    : 'downloaded the images and manifest.json; move them into public/shots',
            );
        },
    });

    // Keyboard entry point (c / Shift+C in gallery.js) - keys are tile keys `<slug>/<pose>`.
    window.__shotsCapture = (keys) => {
        const slugs = [...new Set(keys.map((key) => key.slice(0, key.indexOf('/'))))];

        return panel.runSlugs(slugs);
    };

    const params = new URLSearchParams(location.search);

    if (params.has('auto')) {
        try {
            await runAuto(params);
        } catch (error) {
            // Fail fast: the driver polls __shotsResult and would otherwise wait out its timeout.
            window.__shotsResult = { manifest: null, images: [], failures: [`auto: ${errorText(error)}`] };
            throw error;
        }
    }

    // Headless protocol for scripts/capture-demo-shots.mjs: /shots?auto&demos=a,b&variants=display,uidebug
    async function runAuto(query) {
        const slugs = csv(query.get('demos'));
        const variants = csv(query.get('variants') ?? DEFAULT_AUTO_VARIANTS);
        const targets = slugs.length > 0 ? slugs : demos.map((demo) => demo.slug);
        const results = await runJobs(jobsFor(targets, variants));
        const images = [];

        for (const result of results.filter((item) => item.ok)) {
            images.push({
                path: imagePath(result.slug, result.pose, result.variant),
                base64: await toBase64(result.blob),
            });
        }

        window.__shotsResult = {
            manifest: mergedWith(results),
            images,
            failures: results
                .filter((result) => !result.ok)
                .map((result) => `${result.slug}/${result.pose}/${result.variant}: ${result.error}`),
        };
    }
}

export { startCaptureMode };
