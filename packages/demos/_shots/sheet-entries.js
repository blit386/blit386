/**
 * Which captures the public demo sheet (the site index) shows, kept free of the DOM so it is
 * unit-testable.
 *
 * One tile per nav-visible demo, in nav order: the demo's first pose that captured cleanly and
 * has a display image. Lint findings and the other variants are left out, so the shared gallery
 * renders no review badges, and one entry per demo means it never shows a stack count.
 */

/**
 * @param {unknown[]} manifestEntries - `entries` from public/shots/manifest.json, unchecked.
 * @param {Array<{ slug: string, navLabel: string }>} demos - Nav-visible demos, in nav order.
 * @returns {Array<object>} Manifest entries ready for createGallery().setEntries(), each with a `label`.
 */
function sheetEntries(manifestEntries, demos) {
    return demos.flatMap((demo) => {
        const entry = manifestEntries.find(
            (row) =>
                row?.slug === demo.slug &&
                typeof row.pose === 'string' &&
                !row.error &&
                typeof row.variants?.display === 'string',
        );

        return entry
            ? [{ ...entry, variants: { display: entry.variants.display }, lint: [], label: demo.navLabel }]
            : [];
    });
}

/**
 * Entries whose label or slug contains the query, ignoring case and surrounding spaces. Matching
 * the label too means "pipboy crt" finds `crt-pipboy`, which a slug-only filter would miss.
 *
 * @param {Array<{ slug: string, label: string }>} entries - From sheetEntries().
 * @param {string} query - The filter box's value.
 * @returns {Array<object>}
 */
function filterSheetEntries(entries, query) {
    // An empty needle matches every entry, so a cleared box needs no special case.
    const needle = query.trim().toLowerCase();

    return entries.filter((entry) => entry.label.toLowerCase().includes(needle) || entry.slug.includes(needle));
}

export { filterSheetEntries, sheetEntries };
