/**
 * Rewrites one child of the homepage's unwrapped `HomeStart` / `PromptBox` for the markdown export (`source.config.ts`,
 * `includeProcessedMarkdown.stringify`). The exporters already print the page title as the one h1, so the headline
 * becomes an h2; the included prompt keeps the file's final newline, which would print as a blank line in the fence.
 * Returns a copy when it changes something, never mutating the tree.
 */
export function rewriteForMarkdown<T extends { type: string }>(child: T): T {
    if (child.type === 'heading' && 'depth' in child && child.depth === 1) {
        return { ...child, depth: 2 };
    }

    if (child.type === 'code' && 'value' in child && typeof child.value === 'string') {
        return { ...child, value: child.value.replace(/\n$/u, '') };
    }

    return child;
}
