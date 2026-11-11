/**
 * The OpenCode adapter: `opencode.json` (permissions, formatter, docs server), the kit-guard plugin, and its hook
 * scripts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { TemplateVars } from '../manifest';
import { OPENCODE_HOOKS_DIR, OPENCODE_JSON, OPENCODE_KIT_GUARD } from '../ownership';
import {
    collectHookScripts,
    type GeneratedFile,
    MCP_SERVER_NAME,
    MCP_SERVER_URL,
    readHooksManifest,
    render,
} from './shared';

/**
 * The `permission` half of `opencode.json`: OpenCode's declarative deny rules. The last matching rule wins and `*`
 * crosses `/`, so a leading `*` covers nested files and `*.env.example` has to come after `*.env.*`. There is no
 * `"*": "allow"` base entry on purpose: it would override a stricter user-level default for every tool call.
 *
 * MANUAL-SYNC HAZARD: these lists restate the guard core's policy (`content/hooks/guard-core.cjs`: `isProtectedPath`,
 * `isDangerousCommand`) in a form glob patterns can express - coarser, never laxer, with four exceptions a `*`
 * pattern cannot express without also denying allowed commands: the checkout file-like-argument rule
 * (`git checkout src/game.js`; `*.*` would also deny a tag such as `git checkout 1.8.0`), a `-f` / `-p` in the
 * middle of a bundled short-flag cluster (`-*f` would also deny `git checkout -b leaf`; push lists its common
 * two-letter clusters such as `-uf`), a branch delete flag and force flag that are not adjacent
 * (`git branch -d old -f`), and an abbreviated branch delete or force flag (`git branch --del -f`). `--force-w` and
 * longer push prefixes are covered, since `*--force*` matches them. `test/opencode.test.mjs` runs one case table
 * through both, so an edit on either side that is not mirrored fails the kit tests. The `kit-guard.ts` plugin enforces
 * the exact deny policy on top of this, including what a pattern cannot see at all (`bash -c "..."`) or spell in every
 * case (`-c ALIAS.n=...`); it can only block, so an ask-tier form these globs miss (`git push -uvf`,
 * `git branch -d old -f`, and any ask-tier command written inside a subshell, with an uppercase or `.exe` git, or with
 * a quoted option value) runs without a prompt.
 */
const OPENCODE_PERMISSION = {
    // Matched against the project-relative path, so each base name is listed bare (a top-level file) and with a `*/`
    // prefix (any depth). Spelling them as `*pnpm-lock.yaml` or `*.env.*` would also catch `my-pnpm-lock.yaml` and
    // `game.env.js`, which the guard core allows.
    edit: {
        'pnpm-lock.yaml': 'deny',
        '*/pnpm-lock.yaml': 'deny',
        'package-lock.json': 'deny',
        '*/package-lock.json': 'deny',
        'bun.lockb': 'deny',
        '*/bun.lockb': 'deny',
        '*.lock': 'deny',
        '.env': 'deny',
        '*/.env': 'deny',
        '.env.*': 'deny',
        '*/.env.*': 'deny',
        '.env.example': 'allow',
        '*/.env.example': 'allow',
    },
    // The built-in default for `.env` reads is `ask` in source and `deny` in the docs, so state it.
    read: {
        '.env': 'deny',
        '*/.env': 'deny',
        '.env.*': 'deny',
        '*/.env.*': 'deny',
        '.env.example': 'allow',
        '*/.env.example': 'allow',
    },
    bash: {
        // `--hard` anywhere after `reset`, followed by anything (`;`, `&&`, a redirect), and each shorter prefix git
        // accepts (`--h` to `--har`) as a whole argument, so `--help` still passes.
        'git reset *--hard*': 'deny',
        ...Object.fromEntries(
            [3, 4, 5].flatMap((length) => {
                const prefix = '--hard'.slice(0, length);
                return [
                    [`git reset *${prefix}`, 'deny'],
                    [`git reset *${prefix} *`, 'deny'],
                ];
            }),
        ),
        'git checkout -- *': 'deny',
        'git checkout * -- *': 'deny',
        'git checkout .': 'deny',
        'git checkout * .': 'deny',
        'git checkout -f*': 'deny',
        'git checkout * -f*': 'deny',
        // Any `--f...` on checkout is `--force` or a prefix of it; checkout has no other long option starting with f.
        'git checkout *--f*': 'deny',
        'git checkout -p*': 'deny',
        'git checkout * -p*': 'deny',
        'git checkout -2*': 'deny',
        'git checkout * -2*': 'deny',
        'git checkout -3*': 'deny',
        'git checkout * -3*': 'deny',
        'git checkout *--pat*': 'deny',
        'git checkout *--ou*': 'deny',
        'git checkout *--th*': 'deny',
        'git checkout *--no-over*': 'deny',
        'git switch -f*': 'deny',
        'git switch * -f*': 'deny',
        // Each prefix of `--force` (`--f` to `--force`) as a whole argument, so `--force-create` (keeps local edits)
        // still passes.
        ...Object.fromEntries(
            [3, 4, 5, 6, 7].flatMap((length) => {
                const prefix = '--force'.slice(0, length);
                return [
                    [`git switch *${prefix}`, 'deny'],
                    [`git switch *${prefix} *`, 'deny'],
                ];
            }),
        ),
        'git switch *--di*': 'deny',
        'git restore *': 'deny',
        'git restore --staged *': 'allow',
        'git clean': 'deny',
        'git clean *': 'deny',
        'git clean -n*': 'allow',
        'git clean --dry-run*': 'allow',
        'git push -f*': 'ask',
        'git push * -f*': 'ask',
        'git push *--force*': 'ask',
        'git push * +*': 'ask',
        // A bundled `-f` after one of push's other short flags (`-uf`); `-fu` is caught by `-f*` above (BT-749).
        ...Object.fromEntries(
            ['u', 'v', 'q', 'n', 'd', '4', '6'].flatMap((letter) => [
                [`git push -${letter}f*`, 'ask'],
                [`git push * -${letter}f*`, 'ask'],
            ]),
        ),
        'git branch -D *': 'ask',
        'git branch * -D*': 'ask',
        // A delete flag next to a force flag, in either order or as one cluster (`-df`, `-d -f`, `--delete -f`).
        ...Object.fromEntries(
            [
                '-df',
                '-fd',
                ...['-d', '--delete'].flatMap((del) =>
                    ['-f', '--force'].flatMap((force) => [`${del} ${force}`, `${force} ${del}`]),
                ),
            ].flatMap((flags) => [
                [`git branch ${flags}*`, 'ask'],
                [`git branch * ${flags}*`, 'ask'],
            ]),
        ),
        'git stash drop*': 'ask',
        'git stash clear*': 'ask',
        // Config given for one command: an alias can stand for any subcommand, and a push refspec or mirror mode can
        // force, delete, or mirror on a plain push (BT-775). git reads config keys in any case and a glob cannot, so
        // every push given inline config asks, which also covers a `--config-env` value nobody can read; the plugin
        // denies an alias in any case.
        'git *-c alias.*': 'deny',
        'git *--config-env*alias.*': 'deny',
        'git *-c * push*': 'ask',
        'git *--config-env* push*': 'ask',
        // Plumbing that discards like `checkout --` and `reset --hard`; every `checkout-index` is denied, which is
        // coarser than the guard core (it denies only `-f`), since a `-f` can sit anywhere in a short-flag cluster.
        'git checkout-index *': 'deny',
        'git read-tree *--res*': 'deny',
        // A push that deletes or overwrites remote branches: `--delete` / `-d`, a `:branch` refspec, `--mirror`.
        'git push -d*': 'ask',
        'git push * -d*': 'ask',
        'git push *--de*': 'ask',
        'git push * :*': 'ask',
        'git push :*': 'ask',
        'git push *--mi*': 'ask',
    },
} as const;

/**
 * Which formatter owns which file type, the same split as the Claude and Cursor `format-file.cjs` hook and the starter's
 * `format` script: Biome formats code and JSON, Prettier formats Markdown and YAML. OpenCode's formatters are off until
 * enabled, and its built-in Prettier would also claim code files, so each tool is pinned to its own extensions.
 */
const OPENCODE_FORMATTER = {
    biome: { extensions: ['.js', '.cjs', '.mjs', '.ts', '.json', '.jsonc'] },
    prettier: { extensions: ['.md', '.mdx', '.mdc', '.yml', '.yaml'] },
} as const;

/**
 * `opencode.json`. Both formatters are switched on by name (see `OPENCODE_FORMATTER`). The docs server entry has no
 * `mcpServers` wrapper - OpenCode calls the key `mcp` and marks a remote server with `type: 'remote'`.
 */
function openCodeConfigFile(): GeneratedFile {
    const config = {
        $schema: 'https://opencode.ai/config.json',
        formatter: OPENCODE_FORMATTER,
        permission: OPENCODE_PERMISSION,
        mcp: { [MCP_SERVER_NAME]: { type: 'remote', url: MCP_SERVER_URL, enabled: true } },
    };

    return { path: OPENCODE_JSON, content: `${JSON.stringify(config, null, 2)}\n` };
}

/**
 * Generate the OpenCode adapter files from the kit IR. Skills and the persona need none of their own: OpenCode reads
 * `AGENTS.md` and the shared `.agents/skills/` folder (`generateAgentFiles` emits it).
 *   - `opencode.json`                   (kit-owned; formatter, permission map, docs MCP server)
 *   - `.opencode/plugins/kit-guard.ts`  (kit-owned; rendered from `content/hooks/opencode-kit-guard.ts`)
 *   - `.opencode/hooks/{script}`        (kit-owned; copied verbatim - the guard core and the bootstrap script)
 *
 * @param root - The kit root directory.
 * @param vars - Template variables used when rendering generated content.
 * @returns The generated OpenCode files and their contents.
 */
export function generateOpenCodeAdapter(root: string, vars: TemplateVars): GeneratedFile[] {
    const contentRoot = join(root, 'content');
    const manifest = readHooksManifest(contentRoot);
    const plugin = render(readFileSync(join(contentRoot, 'hooks', 'opencode-kit-guard.ts'), 'utf8'), vars);

    return [
        openCodeConfigFile(),
        { path: OPENCODE_KIT_GUARD, content: plugin },
        ...collectHookScripts(contentRoot, manifest, 'opencode', OPENCODE_HOOKS_DIR),
    ];
}
