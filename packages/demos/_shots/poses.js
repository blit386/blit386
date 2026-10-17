/**
 * What is worth looking at in each demo - the pose table the /shots capture page and the
 * headless driver both read.
 *
 * A pose is one deterministic moment: seek the engine clock to `at` seconds with BT.renderAt,
 * optionally inject one kind of input, step two ticks so the kit latches it, then capture.
 * The same pose gives the same pixels on every machine, which is what makes before/after
 * diffs meaningful.
 *
 * Demos without an entry get DEFAULT_POSES. Add a row here when you spot a state worth
 * watching (a hover look, a panel that only shows after a key). Keep ids kebab-case: they
 * become file names under public/shots/<slug>/.
 *
 * @typedef {{
 *   id: string,
 *   at: number,
 *   keys?: string[],
 *   pointer?: { x: number, y: number },
 *   touch?: boolean,
 * }} Pose
 */

const POSE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// Ticks stepped after a pose's input: one for ui.tick() to latch it, one for the widget to
// show it. Shared by the /shots capture (capture.js) and the OG card script
// (scripts/capture-og-image.mjs), so a pose with keys looks the same in both.
const INPUT_TICKS = 2;

/** @type {Pose[]} */
const DEFAULT_POSES = [
    { id: 'start', at: 0 },
    { id: 'settled', at: 4 },
];

/** @type {Record<string, Pose[]>} */
const POSES_BY_SLUG = {
    // Types its terminal text out character by character; nothing to see before 9 s.
    'crt-pipboy': [{ id: 'typed', at: 9 }],
    // Cycles clean/CRT output every two seconds; land mid-CRT and mid-clean. The first pose is
    // the one the OG card and the site-index tile show.
    'crt-toggle': [
        { id: 'crt', at: 3.5 },
        { id: 'clean', at: 1 },
    ],
    'palette-exposure-fade': [
        { id: 'bright', at: 7 },
        { id: 'start', at: 0 },
    ],
    'snake-game': [
        { id: 'crawl', at: 7 },
        { id: 'start', at: 0 },
    ],
    starfield: [{ id: 'spread', at: 6 }],
    // At 0 s nothing has spawned yet. 4.85 s lands on the second hop with one spark burst
    // rising, the previous one falling, and the cooldown meter part full.
    animation: [
        { id: 'jump', at: 4.85 },
        { id: 'start', at: 0 },
    ],
    // The sprite starts at an edge and needs time to travel somewhere interesting; the first
    // pose is the one the OG card shows.
    basics: [
        { id: 'moving', at: 6 },
        { id: 'start', at: 0 },
    ],
    'basics-enhanced': [
        { id: 'moving', at: 6 },
        { id: 'start', at: 0 },
    ],
    'audio-basics': [
        { id: 'playing', at: 5 },
        { id: 'start', at: 0 },
    ],
    // Four seconds in with A pressed: the clock is running, the square is partway round,
    // and the snapshot shows a score of 1. It comes first so it also drives the OG card.
    'test-state': [
        { id: 'scored', at: 4, keys: ['KeyA'] },
        { id: 'start', at: 0 },
    ],
    // Pressing J jumps 4000 tiles away: a whole new stretch of ground, while "stored"
    // still reads 0 tiles. It comes first so it also drives the OG card.
    'coordinate-patterns': [
        { id: 'far', at: 1, keys: ['KeyJ'] },
        { id: 'start', at: 0 },
    ],
    // Pressing E copies the left seed over, so the two worlds match and the status line
    // turns green. It comes first so it also drives the OG card. The right seed is picked
    // from a clock-seeded generator, so only a copied pose is the same on every capture.
    'seeded-worlds': [
        { id: 'copied', at: 1, keys: ['KeyE'] },
        { id: 'start', at: 0 },
    ],
    // Pressing C shuffles a copy, so the two card rows differ - the whole point of the
    // first scene. It comes first so it also drives the OG card.
    'random-basics': [
        { id: 'shuffled', at: 1, keys: ['KeyC'] },
        { id: 'start', at: 0 },
    ],
    // Pressing Space ducks the music: the Music slider drops to 0.25 and the Hold meter
    // starts draining. It comes first so it also drives the OG card.
    'audio-buses': [
        { id: 'duck', at: 1, keys: ['Space'] },
        { id: 'start', at: 0 },
    ],
    // Pressing 2 switches the crossfade chart to Track B's eased blend, the most telling of
    // the three profiles; it comes first so it also drives the OG card.
    music: [
        { id: 'blend', at: 1, keys: ['Digit2'] },
        { id: 'start', at: 0 },
    ],
    'reduced-motion': [
        { id: 'warp', at: 4.5 },
        { id: 'cruise', at: 1 },
    ],
    // E plays the Explosion preset and R rolls a recipe in the same step, so the "Last"
    // row and the randomizer readout are both filled. It comes first so it also drives
    // the OG card.
    'synth-toy': [
        { id: 'played', at: 1, keys: ['KeyE', 'KeyR'] },
        { id: 'start', at: 1 },
    ],
    // The crosshair must draw on top of the kit panels; 'hover' parks the pointer over
    // the readouts panel to show it.
    // 'custom' presses 2 for the custom preset: green changed keys and its four calls.
    // 'blit386' presses B, L, I, T, 3, 8, and 6, so the OG card and the site-index tile show
    // those caps lit and the edge panels filled in.
    'keyboard-diagnostic': [
        { id: 'blit386', at: 1, keys: ['KeyB', 'KeyL', 'KeyI', 'KeyT', 'Digit3', 'Digit8', 'Digit6'] },
        { id: 'start', at: 0 },
        { id: 'settled', at: 4 },
    ],
    'input-map-remapping': [
        { id: 'start', at: 0 },
        { id: 'settled', at: 4 },
        { id: 'custom', at: 1, keys: ['Digit2'] },
    ],
    'pointer-basics': [
        { id: 'start', at: 0 },
        { id: 'settled', at: 4 },
        { id: 'hover', at: 1, pointer: { x: 120, y: 60 } },
    ],
    // 'hover' parks the mouse on the red ball, which draws its amber hover ring and the
    // crosshair on top of it.
    'pointer-drag-flick': [
        { id: 'start', at: 0 },
        { id: 'settled', at: 4 },
        { id: 'hover', at: 0, pointer: { x: 81, y: 61 } },
    ],
    'pointer-paint': [
        { id: 'start', at: 1 },
        { id: 'hover-clear', at: 1, pointer: { x: 240, y: 217 } },
    ],
    'gamepad-input': [
        { id: 'start', at: 1 },
        { id: 'touch', at: 1, touch: true },
    ],
};

const POSES_MAP = new Map(Object.entries(POSES_BY_SLUG));
const INPUT_KEYS = ['keys', 'pointer', 'touch'];

// display: the native palette buffer, crisp, the default. output: the drawing buffer with
// display-tier effects (CRT), possibly larger. uidebug: display plus the kit's layout boxes.
// software: display under ?backend=software. touch: display after a touch contact.
const OUTPUT_VARIANT = 'output';
const VARIANTS = ['display', OUTPUT_VARIANT, 'uidebug', 'software', 'touch'];
const COMMITTED_VARIANTS = ['display', 'uidebug'];

/**
 * @param {string} slug
 * @returns {Pose[]}
 */
function posesFor(slug) {
    return POSES_MAP.get(slug) ?? DEFAULT_POSES;
}

/**
 * Every (demo, pose, variant) capture job for the given demos, in pose-then-variant order.
 *
 * @param {string[]} slugs
 * @param {string[]} variants
 * @returns {Array<{ slug: string, pose: Pose, variant: string }>}
 */
function jobsFor(slugs, variants) {
    return slugs.flatMap((slug) =>
        posesFor(slug).flatMap((pose) => variants.map((variant) => ({ slug, pose, variant }))),
    );
}

/**
 * Is `pose` still a pose of `slug`? False for a pose that was renamed or removed from the table.
 *
 * @param {string} slug
 * @param {string} pose
 * @returns {boolean}
 */
function isKnownPose(slug, pose) {
    return posesFor(slug).some((candidate) => candidate.id === pose);
}

/**
 * Problems in a pose table, as messages. Empty when the table is sound.
 *
 * @param {Record<string, Pose[]>} posesBySlug
 * @param {Set<string>} knownSlugs
 * @returns {string[]}
 */
function validatePoses(posesBySlug, knownSlugs) {
    const problems = [];

    for (const [slug, poses] of Object.entries(posesBySlug)) {
        if (!knownSlugs.has(slug)) {
            problems.push(`${slug}: not a demo slug`);
            continue;
        }

        const seen = new Set();

        for (const pose of poses) {
            const label = `${slug}/${pose.id}`;

            if (seen.has(pose.id)) {
                problems.push(`${label}: duplicate pose id`);
            }

            seen.add(pose.id);

            if (!POSE_ID_PATTERN.test(pose.id)) {
                problems.push(`${label}: id must be kebab-case`);
            }

            const inputs = Object.entries(pose).filter(
                ([key, value]) => INPUT_KEYS.includes(key) && value !== undefined,
            );

            if (inputs.length > 1) {
                problems.push(`${label}: at most one of keys, pointer, touch`);
            }

            if (typeof pose.at !== 'number' || !Number.isFinite(pose.at) || pose.at < 0) {
                problems.push(`${label}: at must be a number >= 0`);
            }
        }
    }

    return problems;
}

export {
    COMMITTED_VARIANTS,
    DEFAULT_POSES,
    INPUT_TICKS,
    isKnownPose,
    jobsFor,
    OUTPUT_VARIANT,
    POSES_BY_SLUG,
    posesFor,
    validatePoses,
    VARIANTS,
};
