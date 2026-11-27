import type { ReactNode } from 'react';
import { PromptBoxClient } from './prompt-box-client';

/**
 * In `content/index.mdx` this wraps an `<include>` of `public/prompt.txt`, so the page's markdown (llms.txt, markdown
 * negotiation, the MCP server) carries the prompt as a fenced block. The page shows the editable box instead, read
 * from the same file. Dropping `children` here, in a server component, keeps them out of the browser payload too.
 */
export function PromptBox(_props: { children?: ReactNode }) {
    return <PromptBoxClient />;
}
