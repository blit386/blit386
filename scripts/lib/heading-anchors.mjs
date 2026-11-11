/**
 * The heading ids a published Markdown page carries, computed the way blit386.dev computes them:
 * fumadocs' `remark-heading` runs `github-slugger` over each heading's plain text, numbering a
 * repeat (`usage`, `usage-1`). GitHub's own Markdown view uses the same slugger, so one rule
 * covers both places a docs link can land.
 *
 * Shared on purpose: `packages/demos/scripts/check-demo-comment-links.mjs` checks the `#fragment`
 * of every docs link in a demo header against it, and the root `docs:links` check
 * (`scripts/check-markdown-links.mjs`) does the same for every relative link in repo Markdown.
 *
 * shortcut: a line-based ATX scan, not a Markdown parser. Setext headings, headings inside lists
 * or block quotes, inline HTML or JSX in a heading, and fumadocs' `[#custom-id]` suffix are not
 * handled; none occur in the docs today. Upgrade to a remark pass if a page starts using one.
 * Markup that does reach the slugger is harmless: it keeps only letters, digits, `-` and `_`.
 */
import GithubSlugger from 'github-slugger';

const FENCE_PATTERN = /^ {0,3}(?:```|~~~)/u;
// Up to three spaces of indent, 1-6 hashes, the text, then an optional closing run of hashes.
const HEADING_PATTERN = /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;
// The page shows a link's text, not its target, so the id is built from the text alone.
const LINK_PATTERN = /!?\[([^\]]*)\]\([^)]*\)/gu;

/**
 * @param {string} markdown Page source.
 * @returns {Set<string>} Every heading id on the page, in document order.
 */
export function headingAnchors(markdown) {
    const slugger = new GithubSlugger();
    const anchors = new Set();
    let inFence = false;

    for (const line of markdown.split('\n')) {
        if (FENCE_PATTERN.test(line)) {
            inFence = !inFence;
            continue;
        }

        const text = inFence ? undefined : line.match(HEADING_PATTERN)?.[1];

        if (text !== undefined) {
            anchors.add(slugger.slug(text.replace(LINK_PATTERN, '$1')));
        }
    }

    return anchors;
}
