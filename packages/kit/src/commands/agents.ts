/**
 * `blit agents <add|sync>` - manage AI-assistant files from the kit's canonical content.
 *
 * `sync --check` is report-only: reads `.blit/manifest.json`, computes current SHA-256 hashes
 * for kit-owned and shared files, and reports any that have drifted from their generated state.
 * Exits non-zero when drift is found so it is safe to use in CI and inside `blit doctor`.
 *
 * `sync` (no flag) is the write path: it regenerates what the installed kit would emit, then
 * applies the ownership model (section 4.10 of the design doc) to update the project without
 * clobbering user edits:
 *   - kit-owned files the user has not touched are overwritten;
 *   - shared files (AGENTS.md, CLAUDE.md) get only their managed region rewritten;
 *   - kit-owned files the user edited are three-way merged when git is available, otherwise saved
 *     alongside as `<file>.new`;
 *   - user-owned files are never touched; the one the kit itself emits (`.claude/launch.json`) is
 *     written only when it is missing;
 *   - a file new in this kit whose path already holds an untracked, different file is saved as
 *     `<file>.new` and left out of the manifest (an identical one is adopted silently).
 * `--force [path...]` overwrites the named files (or all kit-managed files) with the kit version.
 *
 * `add <agent>` (any `AgentKind`) sets up the files for one AI assistant in a project that did not pick it at
 * scaffold time. It regenerates that assistant's adapter output from the installed kit, writes the new
 * files, and records them in the manifest (so later `sync` runs keep them fresh). It never clobbers an
 * existing file it does not already track: such a file is saved alongside as `<file>.new` instead.
 */

import { AGENT_ADAPTERS } from '../adapters';
import { findProjectRoot } from '../env';
import { ui } from '../messages';
import { AGENT_KINDS, type AgentKind } from '../ownership';
import { runAddAgent } from './agents-add';
import { checkSyncDrift, runFullSync } from './agents-sync';

/** Type guard: is `name` an assistant `add` knows how to set up? */
function isAddableAgent(name: string): name is AgentKind {
    return (AGENT_KINDS as readonly string[]).includes(name);
}

export function runAgents(args: string[]): void {
    const sub = args[0] ?? '';
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    if (sub === 'sync') {
        const root = findProjectRoot(process.cwd());

        if (!root) {
            out(ui.warn('No game found here. Run this inside your game folder.'));
            process.exitCode = 1;
            return;
        }

        if (args.includes('--check')) {
            const driftCount = checkSyncDrift(root, out);

            if (driftCount > 0) {
                process.exitCode = 1;
            }

            return;
        }

        const force = args.includes('--force');
        const forcePaths = args.slice(1).filter((a) => !a.startsWith('-'));

        out(ui.info('Updating AI-assistant files from the latest kit version.'));
        out('');
        const needReview = runFullSync(root, out, { force, forcePaths });

        if (needReview > 0) {
            process.exitCode = 1;
        }

        return;
    }

    if (sub === 'add') {
        const name = args[1] ?? '';

        if (name === '') {
            out(ui.warn('Tell me which assistant to set up.'));
            out(ui.info(`Try ${AGENT_KINDS.map((kind) => `\`npx blit agents add ${kind}\``).join(' or ')}.`));
            process.exitCode = 1;
            return;
        }

        if (!isAddableAgent(name)) {
            out(ui.warn(`I do not know the assistant "${name}".`));
            out(ui.info(`You can set up: ${AGENT_KINDS.join(', ')}.`));
            process.exitCode = 1;
            return;
        }

        const root = findProjectRoot(process.cwd());

        if (!root) {
            out(ui.warn('No game found here. Run this inside your game folder.'));
            process.exitCode = 1;
            return;
        }

        out(ui.info(`Setting up ${AGENT_ADAPTERS[name].label} files from the kit.`));
        out('');
        const needReview = runAddAgent(root, name, out);

        if (needReview > 0) {
            process.exitCode = 1;
        }

        return;
    }

    const kinds = AGENT_KINDS.join('|');

    out(`Usage: blit agents <sync [--check] [--force [path...]] | add <${kinds}>>`);
    out('');
    out(ui.info('sync --check       Report kit-managed files that have drifted (non-zero exit on drift).'));
    out(ui.info('sync               Update AI-assistant files from the latest kit version.'));
    out(ui.info('sync --force       Overwrite your edits with the kit version (optionally name files).'));
    out(ui.info(`add <${kinds}>  Set up files for one AI assistant in this project.`));
}
