/**
 * How `blit agents add` merges the kit's generated config into a user's untracked copy of the same file (the MCP
 * configs, `opencode.json`, `.gemini/settings.json`, `.zed/settings.json`, `.codex/config.toml`) instead of colliding
 * with it. Pure text in, text out; `agents-add.ts` decides what to do with the answer.
 */

import { isDeepStrictEqual } from 'node:util';

import { MCP_SERVER_NAME } from '../adapters';
import {
    ANTIGRAVITY_MCP_JSON,
    CODEX_CONFIG_TOML,
    CURSOR_MCP_JSON,
    GEMINI_SETTINGS_JSON,
    OPENCODE_JSON,
    ROOT_MCP_JSON,
    ZED_SETTINGS_JSON,
} from '../ownership';
import { isObject } from '../read-manifest';
import { maskSource } from '../source-mask';

/** Merges the kit's generated config into a user's untracked copy; null means "collision, do not merge". */
type ConfigMerge = (existingContent: string, generatedContent: string) => string | null;

/** Parse `text` as a JSON object; null when it is not valid JSON or not a plain object. */
function parseJsonObject(text: string): Record<string, unknown> | null {
    try {
        const value: unknown = JSON.parse(text);
        return isObject(value) ? value : null;
    } catch {
        return null;
    }
}

/**
 * Keys whose children are whole MCP server entries: `mcpServers` in `.mcp.json` / `.cursor/mcp.json` /
 * `.agents/mcp_config.json`, `mcp` in `opencode.json`, `context_servers` in `.zed/settings.json`. An entry is trusted
 * as a unit - a server the user already registered under the kit's name is kept only when it is identical to the
 * kit's, never extended or edited key by key, because one extra `command`, `env`, or `headers` changes what the
 * assistant runs or sends.
 */
const MCP_SERVER_MAP_KEYS: readonly string[] = ['mcpServers', 'mcp', 'context_servers'];

/** Merge two server maps: the kit's entries are added, and a same-named entry must already be identical. */
function mergeServerMaps(
    existing: Record<string, unknown>,
    generated: Record<string, unknown>,
): Record<string, unknown> | null {
    for (const [name, entry] of Object.entries(generated)) {
        if (existing[name] !== undefined && !isDeepStrictEqual(existing[name], entry)) {
            return null;
        }
    }

    return { ...existing, ...generated };
}

/**
 * Deep-merge `generated` into `existing`; returns null at the first key both define with different non-object values,
 * or when a server map (`MCP_SERVER_MAP_KEYS`) holds a same-named entry that differs.
 */
function mergeJsonObjects(
    existing: Record<string, unknown>,
    generated: Record<string, unknown>,
): Record<string, unknown> | null {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(generated)) {
        const current = existing[key];

        if (current === undefined) {
            merged[key] = value;
        } else if (isObject(current) && isObject(value)) {
            const inner = MCP_SERVER_MAP_KEYS.includes(key)
                ? mergeServerMaps(current, value)
                : mergeJsonObjects(current, value);

            if (inner === null) {
                return null;
            }

            merged[key] = inner;
        } else if (!isDeepStrictEqual(current, value)) {
            return null;
        }
    }

    return merged;
}

/**
 * Merge the kit's generated JSON config (an MCP config, `opencode.json`, or `.zed/settings.json`) into a pre-existing
 * hand-written one, key by key: the user's entries stay and only what the file lacks is added after them. Order
 * matters for OpenCode - its last matching permission rule wins - so the user's rules keep their place. Returns null -
 * not a crash - when the existing file is not a JSON object or the two disagree on a value (a user's setting is never
 * overridden): the caller falls back to the collision (`.new` + abort) path.
 */
function tryMergeJsonConfig(existingContent: string, generatedContent: string): string | null {
    const existing = parseJsonObject(existingContent);

    if (existing === null) {
        return null;
    }

    const merged = mergeJsonObjects(existing, JSON.parse(generatedContent) as Record<string, unknown>);

    return merged === null ? null : `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * Merge the kit's generated `.gemini/settings.json` into a pre-existing hand-written one: the docs server joins
 * `mcpServers`, the kit's context files join `context.fileName`, and each hook matcher group joins its event's array
 * unless an identical group is already there. Everything else the user set stays untouched. Returns null - the
 * collision path - when the existing file is not a JSON object, one of the keys the kit writes into has the wrong shape,
 * or an MCP server of the kit's name exists with different content.
 */
function tryMergeGeminiSettings(existingContent: string, generatedContent: string): string | null {
    const existing = parseJsonObject(existingContent);

    if (existing === null) {
        return null;
    }

    const generated = JSON.parse(generatedContent) as {
        context: { fileName: string[] };
        mcpServers: Record<string, unknown>;
        hooks: Record<string, unknown[]>;
    };

    const { context, mcpServers, hooks } = existing;

    if (
        (context !== undefined && !isObject(context)) ||
        (mcpServers !== undefined && !isObject(mcpServers)) ||
        (hooks !== undefined && !isObject(hooks))
    ) {
        return null;
    }

    const fileName = context?.fileName;
    const validFileName =
        fileName === undefined ||
        typeof fileName === 'string' ||
        (Array.isArray(fileName) && fileName.every((name) => typeof name === 'string'));

    if (!validFileName) {
        return null;
    }

    const servers = mergeServerMaps(mcpServers ?? {}, generated.mcpServers);

    if (servers === null) {
        return null;
    }

    const mergedHooks: Record<string, unknown> = { ...hooks };

    for (const [event, groups] of Object.entries(generated.hooks)) {
        const current = mergedHooks[event] ?? [];

        if (!Array.isArray(current)) {
            return null;
        }

        mergedHooks[event] = [
            ...current,
            ...groups.filter((group) => !current.some((c) => isDeepStrictEqual(c, group))),
        ];
    }

    const names: string[] = typeof fileName === 'string' ? [fileName] : (fileName ?? []);
    const merged = {
        ...existing,
        context: { ...context, fileName: [...names, ...generated.context.fileName.filter((n) => !names.includes(n))] },
        mcpServers: servers,
        hooks: mergedHooks,
    };

    return `${JSON.stringify(merged, null, 2)}\n`;
}

/**
 * Merge the kit's `.codex/config.toml` into a hand-written one, as text: the kit has no TOML parser, and its part of the
 * file is one table. A file that never names the docs server gets the kit's table appended - a new table at the end is
 * valid TOML whatever precedes it. A file that already holds exactly the kit's table is kept as it is. Anything else
 * naming the server (another URL, extra keys, a dotted or inline spelling) returns null - the collision path - because a
 * second definition of the same table is a TOML error, and Codex refuses to start on a trusted project's broken config.
 */
function tryMergeCodexConfig(existingContent: string, generatedContent: string): string | null {
    const lines = existingContent.split(/\r?\n/).map((line) => line.trim());

    if (!lines.some((line) => line.includes(MCP_SERVER_NAME))) {
        return [existingContent.trimEnd(), generatedContent].filter((part) => part !== '').join('\n\n');
    }

    const settings = (block: string[]) => block.filter((line) => line !== '' && !line.startsWith('#'));
    const kitTable = settings(generatedContent.split('\n'));
    const start = lines.findIndex((line) => line === kitTable[0]);

    if (start === -1) {
        return null;
    }

    const next = lines.findIndex((line, index) => index > start && line.startsWith('['));
    const table = settings(lines.slice(start, next === -1 ? undefined : next));

    return isDeepStrictEqual(table, kitTable) ? existingContent : null;
}

/** Mark every comma that closes a JSONC object or array (`[1, 2,]`) for removal, ignoring commas inside strings. */
function withoutTrailingCommas(text: string, masked: string): string {
    return text.replace(/,(?=\s*[}\]])/g, (comma, offset: number) => (masked[offset] === ',' ? ' ' : comma));
}

/**
 * Merge the kit's `.zed/settings.json` into a hand-written one. Zed reads the file as JSONC, so it may hold comments and
 * trailing commas. A file without comments merges like any JSON config (trailing commas dropped). A file with comments
 * is never re-serialized, because the comments are the user's: the kit's keys are inserted as text before its closing
 * brace when it has none of them, and anything else is the collision path (`zedHandMergeHint` says what to copy).
 */
function tryMergeZedSettings(existingContent: string, generatedContent: string): string | null {
    const masked = maskSource(existingContent);
    const noComments = maskSource(existingContent, true);
    const json = withoutTrailingCommas(noComments, masked);

    if (noComments === existingContent) {
        return tryMergeJsonConfig(json, generatedContent);
    }

    const existing = parseJsonObject(json);
    const kit = JSON.parse(generatedContent) as Record<string, unknown>;

    if (existing === null || Object.keys(kit).some((key) => key in existing)) {
        return null;
    }

    // Insert after the last thing before the closing brace that is not a comment, at the indent the file already uses.
    const close = masked.lastIndexOf('}');
    const at = masked.slice(0, close).trimEnd().length;
    const indent = /\n([ \t]+)\S/.exec(existingContent.slice(0, close))?.[1] ?? '  ';
    const eol = existingContent.includes('\r\n') ? '\r\n' : '\n';
    const entries = Object.entries(kit).map(
        ([key, value]) =>
            `${indent}${JSON.stringify(key)}: ${JSON.stringify(value, null, 2).replaceAll('\n', `${eol}${indent}`)}`,
    );
    const comma = /[{,]$/.test(masked.slice(0, at)) ? '' : ',';

    return `${existingContent.slice(0, at)}${comma}${eol}${entries.join(`,${eol}`)}${existingContent.slice(at)}`;
}

/** For a commented `.zed/settings.json` the kit would not edit, the line that says which keys to copy by hand. */
export function zedHandMergeHint(existingContent: string, generatedContent: string): string | null {
    if (maskSource(existingContent, true) === existingContent) {
        return null;
    }

    const keys = new Intl.ListFormat('en', { type: 'conjunction' }).format(
        Object.keys(JSON.parse(generatedContent) as object).map((key) => `\`${key}\``),
    );

    return `${ZED_SETTINGS_JSON} has comments, so I did not rewrite it. Copy ${keys} from ${ZED_SETTINGS_JSON}.new into it by hand.`;
}

/** Config paths `runAddAgent` merges into an untracked existing copy instead of colliding with it. */
export const CONFIG_MERGES: Readonly<Record<string, ConfigMerge>> = {
    [ROOT_MCP_JSON]: tryMergeJsonConfig,
    [CURSOR_MCP_JSON]: tryMergeJsonConfig,
    [GEMINI_SETTINGS_JSON]: tryMergeGeminiSettings,
    [ANTIGRAVITY_MCP_JSON]: tryMergeJsonConfig,
    [OPENCODE_JSON]: tryMergeJsonConfig,
    [ZED_SETTINGS_JSON]: tryMergeZedSettings,
    [CODEX_CONFIG_TOML]: tryMergeCodexConfig,
};
