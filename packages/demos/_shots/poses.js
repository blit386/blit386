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
    'reduced-motion': [
        { id: 'warp', at: 4.5 },
        { id: 'cruise', at: 1 },
    ],
    'synth-toy': [
        { id: 'start', at: 1 },
        { id: 'playing', at: 1, keys: ['Digit1'] },
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
    isKnownPose,
    jobsFor,
    OUTPUT_VARIANT,
    POSES_BY_SLUG,
    posesFor,
    validatePoses,
    VARIANTS,
};
