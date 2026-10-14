/**
 * The committed public/shots/manifest.json: one entry per (demo, pose), listing which variant
 * images exist, their size, the lint findings, and any capture error. Shared by the page
 * (save.js writes it, shots.js reads it) and the headless driver, so the two never disagree
 * about a path.
 *
 * @typedef {{
 *   slug: string,
 *   pose: string,
 *   variants: Record<string, string>,
 *   width: number,
 *   height: number,
 *   lint: Array<{ rule: string, message: string, rect: { x: number, y: number, w: number, h: number } }>,
 *   error: string | null,
 * }} ManifestEntry
 *
 * @typedef {{ generatedAt: string, engineVersion: string, entries: ManifestEntry[] }} Manifest
 */

/**
 * @param {string} slug
 * @param {string} pose
 * @returns {string}
 */
function entryKey(slug, pose) {
    return `${slug}/${pose}`;
}

/**
 * Image path relative to public/shots/.
 *
 * @param {string} slug
 * @param {string} pose
 * @param {string} variant
 * @returns {string}
 */
function imagePath(slug, pose, variant) {
    return `${slug}/${pose}.${variant}.png`;
}

/**
 * @returns {Manifest}
 */
function emptyManifest() {
    return { generatedAt: '', engineVersion: '', entries: [] };
}

/**
 * Merge freshly captured entries into an existing manifest. An incoming entry replaces the
 * existing one with the same key but keeps variants the new capture did not produce, so a
 * display-only run never deletes a committed uidebug image. Entries are ordered by `order`
 * (DEMO_ORDER), then by incoming pose order, then existing pose order.
 *
 * @param {Manifest} existing
 * @param {ManifestEntry[]} incoming
 * @param {string[]} order
 * @param {{ engineVersion?: string, now?: Date }} [meta]
 * @returns {Manifest}
 */
function mergeManifest(existing, incoming, order, meta = {}) {
    const byKey = new Map(existing.entries.map((entry) => [entryKey(entry.slug, entry.pose), entry]));
    const incomingKeys = [];

    for (const entry of incoming) {
        const key = entryKey(entry.slug, entry.pose);
        const previous = byKey.get(key);

        incomingKeys.push(key);
        byKey.set(key, {
            ...entry,
            variants: { ...(previous ? previous.variants : {}), ...entry.variants },
        });
    }

    const rank = new Map(order.map((slug, index) => [slug, index]));
    const poseRank = new Map([...incomingKeys, ...byKey.keys()].map((key, index) => [key, index]));
    const entries = [...byKey.values()].sort((a, b) => {
        const bySlug = (rank.get(a.slug) ?? order.length) - (rank.get(b.slug) ?? order.length);

        if (bySlug !== 0) {
            return bySlug;
        }

        return poseRank.get(entryKey(a.slug, a.pose)) - poseRank.get(entryKey(b.slug, b.pose));
    });

    return {
        generatedAt: (meta.now ?? new Date()).toISOString(),
        engineVersion: meta.engineVersion ?? existing.engineVersion,
        entries,
    };
}

export { emptyManifest, entryKey, imagePath, mergeManifest };
