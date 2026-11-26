/**
 * Environment guards for the scaffolder.
 *
 * Two checks run before any prompt: the Node version must meet the engine floor, and the wizard only starts when a
 * real interactive terminal is attached. Without one, `detectCallingAgents` names the AI assistant running this
 * process, if any. All are pure helpers here so they can be unit-tested without spawning the CLI. The CLI wiring lives
 * in index.ts.
 */

import { fileURLToPath } from 'node:url';

import { AGENT_KINDS, type AgentKind, compareVersions, nodeFloor } from '@blit386/kit/adapters';

/**
 * Minimum Node.js version the engine (and therefore a scaffolded game) supports: this package's own `engines.node`
 * floor, read at runtime so the friendly check cannot drift from the floor npm enforces. `dist/` sits one level below
 * the package root, both in the repo and once published. Generated games get it as their `engines.node` too.
 */
export const NODE_FLOOR = nodeFloor(fileURLToPath(new URL('..', import.meta.url)));

/** True when `current` is greater than or equal to `floor`, compared part by part (pre-release tags ignored). */
export function meetsNodeFloor(current: string, floor: string = NODE_FLOOR): boolean {
    return compareVersions(current, floor) >= 0;
}

/** True only when both stdin and stdout are TTYs, i.e. a human can answer prompts. */
export function isInteractive(): boolean {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * The variable each AI assistant sets in the shell its agent runs commands in, from that assistant's own docs or source
 * (checked 2026-11-25). Antigravity and Zed set none that could be confirmed, so they are only reachable through
 * `--agent`.
 */
const AGENT_ENV_MARKERS: Partial<Record<AgentKind, (env: NodeJS.ProcessEnv) => boolean>> = {
    // code.claude.com/docs/en/env-vars. IDE extensions also set it in human terminals, but those are TTYs.
    claude: (env) => env.CLAUDECODE === '1',

    // cursor.com/docs/agent/terminal (the docs do not state the value).
    cursor: (env) => Boolean(env.CURSOR_AGENT),

    // openai/codex protocol/src/shell_environment.rs.
    codex: (env) => Boolean(env.CODEX_THREAD_ID),

    // microsoft/vscode aiAgentEnv.ts (agent mode) and the github/copilot-cli changelog.
    copilot: (env) => env.COPILOT_AGENT === '1' || env.COPILOT_CLI === '1',

    // google-gemini/gemini-cli shellExecutionService.ts.
    gemini: (env) => env.GEMINI_CLI === '1',

    // opencode packages/core/src/tool/plugin/shell.ts.
    opencode: (env) => env.OPENCODE === '1',
};

/**
 * The AI assistants whose agent appears to be running this process, in `AGENT_KINDS` order. Always empty under CI: a
 * CI job cannot be told apart from an agent by the missing TTY alone, and it must never get assistant files unasked.
 */
export function detectCallingAgents(env: NodeJS.ProcessEnv = process.env): AgentKind[] {
    if (env.CI) {
        return [];
    }
    return AGENT_KINDS.filter((kind) => AGENT_ENV_MARKERS[kind]?.(env) ?? false);
}

/** Wrap a path in double quotes when it contains whitespace, so a pasted `cd` line works in sh, cmd and PowerShell. */
export function quoteIfSpaced(path: string): string {
    return /\s/.test(path) ? `"${path}"` : path;
}
