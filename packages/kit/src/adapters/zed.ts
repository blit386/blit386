/**
 * The Zed adapter: `.zed/settings.json`.
 */

import { ZED_SETTINGS_JSON } from '../ownership';
import { type GeneratedFile, MCP_SERVER_NAME, MCP_SERVER_URL } from './shared';

/**
 * Generate the Zed adapter files: `.zed/settings.json` only (kit-owned, merged with the user's own settings).
 *
 * Zed's built-in agent reads `AGENTS.md` and the shared `.agents/skills/` folder natively, so the persona and skills
 * need nothing here. The settings turn format-on-save on (the agent's edits are formatted on save too), name Biome as
 * the JavaScript, TypeScript, and JSON formatter, matching the starter's `format` script (needs the Biome extension),
 * and register the docs MCP server.
 *
 * Deliberately absent: an `agent` key (`agent.tool_permissions` is honored only in the user's own settings, so a
 * project copy would be silently ignored - `AGENTS.md` teaches the hard rules and a paste-in snippet instead), and the
 * `.rules` / `.cursorrules` / `.windsurfrules` / `.clinerules` files (Zed reads only the first match of that list,
 * and each of them would hide `AGENTS.md`).
 *
 * @returns The generated Zed files.
 */
export function generateZedAdapter(): GeneratedFile[] {
    const biome = { formatter: { language_server: { name: 'biome' } } };
    const settings = {
        format_on_save: 'on',
        languages: { JavaScript: biome, TypeScript: biome, JSON: biome, JSONC: biome },
        context_servers: { [MCP_SERVER_NAME]: { url: MCP_SERVER_URL } },
    };

    return [{ path: ZED_SETTINGS_JSON, content: `${JSON.stringify(settings, null, 2)}\n` }];
}
