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
    // Cycles clean/CRT output every two seconds; land mid-CRT and mid-clean.
    'crt-toggle': [
        { id: 'clean', at: 1 },
        { id: 'crt', at: 3.5 },
    ],
    'palette-exposure-fade': [
        { id: 'start', at: 0 },
        { id: 'bright', at: 7 },
    ],
    'snake-game': [
        { id: 'start', at: 0 },
        { id: 'crawl', at: 7 },
    ],
    starfield: [{ id: 'spread', at: 6 }],
    'reduced-motion': [
        { id: 'cruise', at: 1 },
        { id: 'warp', at: 4.5 },
    ],
    'synth-toy': [
        { id: 'start', at: 1 },
        { id: 'playing', at: 1, keys: ['Digit1'] },
    ],
    'pointer-paint': [
        { id: 'start', at: 1 },
        { id: 'hover-clear', at: 1, pointer: { x: 40, y: 180 } },
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
const VARIANTS = ['display', 'output', 'uidebug', 'software', 'touch'];
const COMMITTED_VARIANTS = ['display', 'uidebug'];

/**
 * @param {string} slug
 * @returns {Pose[]}
 */
function posesFor(slug) {
    return POSES_MAP.get(slug) ?? DEFAULT_POSES;
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

export { COMMITTED_VARIANTS, DEFAULT_POSES, POSES_BY_SLUG, posesFor, validatePoses, VARIANTS };
