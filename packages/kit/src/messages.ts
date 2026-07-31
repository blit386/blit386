/**
 * Centralized user-facing strings and a tiny color helper for the `blit` CLI.
 *
 * Voice follows the BLIT386 Tier-1 guide: plain English, one idea per line, a concrete next step, no jargon,
 * no emoji. The audience may be a complete beginner.
 */

// Color is opt-out (NO_COLOR) and only used on a real terminal, so piped/redirected output stays clean.
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY === true;

function wrap(open: number, close: number, text: string): string {
    return useColor ? `[${open}m${text}[${close}m` : text;
}

export const color = {
    bold: (s: string): string => wrap(1, 22, s),
    dim: (s: string): string => wrap(2, 22, s),
    red: (s: string): string => wrap(31, 39, s),
    green: (s: string): string => wrap(32, 39, s),
    yellow: (s: string): string => wrap(33, 39, s),
    cyan: (s: string): string => wrap(36, 39, s),
};

export const ui = {
    heading: (s: string): string => color.bold(color.cyan(s)),
    success: (s: string): string => `${color.green('OK')}  ${s}`,
    warn: (s: string): string => `${color.yellow('!')}   ${s}`,
    info: (s: string): string => `${color.dim('-')}   ${s}`,
    error: (s: string): string => `${color.red('x')}   ${s}`,
};

/** Friendly, non-scary nudge shown when a project is not under version control. */
export const NO_GIT_NAG = [
    'Your game is not saved with version control yet.',
    'If a BLIT386 update ever changes something, you could lose your work.',
    'Run `git init` to start saving snapshots, or keep a copy of your folder somewhere safe before upgrading.',
].join('\n');

/** Pointer used after a major version bump, where commands may have been renamed. */
export const DEPRECATIONS_URL = 'https://blit386.dev/docs/reference/deprecations';
