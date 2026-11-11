/**
 * Shared agent adapters for Claude Code, Cursor, Antigravity, Codex, GitHub Copilot, Gemini CLI, OpenCode, and Zed.
 *
 * Single source of truth: both `create-blit386` (scaffold-time write-to-disk) and `blit agents sync` /
 * `blit agents add` (generate-to-memory) import these generators. They return `{ path, content }`
 * pairs; callers write to disk or apply the ownership model as needed.
 */

import type { TemplateVars } from './manifest';
import { AGENT_SPECS, type AgentKind, type AgentSpec, sharedSkillsWanted } from './ownership';
import { generateAntigravityAdapter } from './adapters/antigravity';
import { generateClaudeAdapter } from './adapters/claude';
import { generateCodexAdapter } from './adapters/codex';
import { generateCopilotAdapter } from './adapters/copilot';
import { generateCursorAdapter } from './adapters/cursor';
import { generateGeminiAdapter } from './adapters/gemini';
import { generateOpenCodeAdapter } from './adapters/opencode';
import { type GeneratedFile, generateSharedSkills } from './adapters/shared';
import { generateZedAdapter } from './adapters/zed';

// Ownership classification lives in its own leaf module (the generators in `./adapters/` build every
// path they emit from its constants), re-exported here because `./adapters` is the kit's only published
// subpath - create-blit386 imports these from '@blit386/kit/adapters'.
export {
    AGENT_KINDS,
    AGENT_SPECS,
    type AgentKind,
    type AgentSpec,
    type FileClass,
    classifyFile,
    GAME_FILE_JS,
    GAME_FILE_TS,
    hasAgentFiles,
    isKitManaged,
    SHARED_SKILLS_DIR,
} from './ownership';

// Kit-root resolution lives in its own leaf module so `./env` and the CLI commands can import it
// without pulling in the generators, re-exported here because `./adapters` is the kit's only published
// subpath - create-blit386 imports `resolveKitRoot` from '@blit386/kit/adapters'. The two answers are
// not interchangeable; `./kit-root` documents which question each one asks.
export { KIT_PACKAGE_NAME, kitRoot, nodeFloor, resolveKitRoot } from './kit-root';

// The version comparison behind `blit doctor`'s Node check, re-exported so create-blit386 checks the same floor the
// same way instead of keeping its own parser.
export { compareVersions } from './env';

// The `.blit/manifest.json` location and shape live in their own leaf module, re-exported for the
// same reason: create-blit386 stamps the manifest that `blit agents sync` later reads back, so both
// sides must see one declaration.
export {
    BASE_DIR,
    BLIT_DIR,
    type BlitManifest,
    MANIFEST_FILE,
    type ManifestEntry,
    type ReadBlitManifest,
    type ReadManifestEntry,
    type TemplateVars,
} from './manifest';

// The generators and the shared pieces callers use live under `./adapters/`, one module per agent plus `shared.ts`;
// this barrel is the tsup entry and the kit's only published subpath, so every public name is re-exported here.
export {
    agentsFile,
    collectDocs,
    type GeneratedFile,
    generateSharedSkills,
    MCP_SERVER_NAME,
    readKitVersion,
    render,
    replaceManagedRegion,
} from './adapters/shared';
export { generateClaudeAdapter } from './adapters/claude';
export { generateCursorAdapter } from './adapters/cursor';
export { generateGeminiAdapter } from './adapters/gemini';
export { generateAntigravityAdapter } from './adapters/antigravity';
export { generateCodexAdapter } from './adapters/codex';
export { generateCopilotAdapter } from './adapters/copilot';
export { generateOpenCodeAdapter } from './adapters/opencode';
export { generateZedAdapter } from './adapters/zed';

/** One agent's registry entry: its data from `AGENT_SPECS` plus the generator that renders its private files. */
export interface AgentAdapter extends AgentSpec {
    /** Render the agent's private files from the kit IR (shared files come from `generateAgentFiles`). */
    readonly generate: (root: string, vars: TemplateVars) => GeneratedFile[];
}

/**
 * The agent registry: one entry per `AgentKind`. Scaffold, `blit agents sync`, and `blit agents add` all dispatch
 * through it (via `generateAgentFiles`), so adding an agent is one `AGENT_SPECS` entry plus one generator module in
 * `./adapters/`, wired in here.
 */
export const AGENT_ADAPTERS: Record<AgentKind, AgentAdapter> = {
    claude: { ...AGENT_SPECS.claude, generate: generateClaudeAdapter },
    cursor: { ...AGENT_SPECS.cursor, generate: generateCursorAdapter },
    gemini: { ...AGENT_SPECS.gemini, generate: generateGeminiAdapter },
    antigravity: { ...AGENT_SPECS.antigravity, generate: generateAntigravityAdapter },
    codex: { ...AGENT_SPECS.codex, generate: generateCodexAdapter },
    copilot: { ...AGENT_SPECS.copilot, generate: generateCopilotAdapter },
    opencode: { ...AGENT_SPECS.opencode, generate: generateOpenCodeAdapter },
    zed: { ...AGENT_SPECS.zed, generate: generateZedAdapter },
};

/**
 * Every agent file the kit emits for a set of assistants: each one's private files, plus the shared skills folder
 * once when any of them reads it. The single place shared output is deduplicated - scaffold, sync, and add all call
 * this rather than the per-agent generators. A shared exact path (`AgentSpec.readsSharedFiles`, e.g. `.mcp.json` from
 * both Claude Code and Copilot) is generated byte-identically by each reader and kept once; two readers disagreeing on
 * its content is a kit bug, so it throws rather than picking one.
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @param agents - The assistants to generate for.
 * @returns The generated files, each path at most once.
 */
export function generateAgentFiles(root: string, vars: TemplateVars, agents: readonly AgentKind[]): GeneratedFile[] {
    const byPath = new Map<string, GeneratedFile>();

    for (const file of agents.flatMap((agent) => AGENT_ADAPTERS[agent].generate(root, vars))) {
        const earlier = byPath.get(file.path);
        if (earlier !== undefined && earlier.content !== file.content) {
            throw new Error(`Two agent adapters generate ${file.path} with different content.`);
        }

        byPath.set(file.path, file);
    }

    const files = [...byPath.values()];

    return sharedSkillsWanted(agents) ? [...files, ...generateSharedSkills(root, vars)] : files;
}
