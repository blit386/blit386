/** `blit doctor` - a friendly checkup of the things a BLIT386 game needs. */

import {
    detectPackageManager,
    exceedsCaretRange,
    findProjectRoot,
    installedVersion,
    isGitRepo,
    kitEngineRange,
    nodeVersionOk,
    readProject,
    satisfiesCaretRange,
} from '../env';
import { NO_GIT_NAG, ui } from '../messages';
import { checkSyncDrift } from './agents';

/**
 * Runs a BLIT386 environment and project checkup, reporting configuration issues and compatibility warnings to standard output.
 */
export function runDoctor(): void {
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    out(ui.heading('BLIT386 checkup'));
    out('');

    if (nodeVersionOk()) {
        out(ui.success(`Node.js ${process.versions.node}`));
    } else {
        out(ui.warn(`Node.js ${process.versions.node} is older than 22.18.0.`));
        out(ui.info('Update it from nodejs.org (download the LTS button), then restart your editor.'));
    }

    const root = findProjectRoot(process.cwd());
    if (!root) {
        out('');
        out(ui.warn('No game found here. Run this inside your game folder.'));
        return;
    }

    const project = readProject(root);
    const pm = detectPackageManager(root);
    out(ui.success(`Game "${project.name}" (using ${pm})`));

    if (isGitRepo(root)) {
        out(ui.success('Saved with git'));
    } else {
        out(ui.warn('Not saved with git'));
        out('');
        out(NO_GIT_NAG);
        out('');
    }

    const version = installedVersion(root, 'blit386');
    if (version) {
        out(ui.success(`blit386 ${version} installed`));
    } else {
        out(ui.warn('blit386 is not installed yet. Run your install command (for example `npm install`).'));
    }

    // Kit-engine compatibility (D14): compare the engine range this kit was written for against what is installed.
    const engineRange = kitEngineRange();
    if (version && engineRange) {
        if (satisfiesCaretRange(version, engineRange)) {
            out(ui.success(`blit386 ${version} is compatible with this kit (${engineRange})`));
        } else if (exceedsCaretRange(version, engineRange)) {
            out('');
            out(
                ui.warn(
                    `Your local guides were written for an older BLIT386 (${engineRange}), but ${version} is installed.`,
                ),
            );
            out(ui.info('Update @blit386/kit, then run `npx blit agents sync` to refresh your local guides.'));
        } else {
            out('');
            out(ui.warn(`This kit needs blit386 ${engineRange}, but ${version} is installed.`));
            out(ui.info('Update blit386 to match: run `npm update blit386` (or `npx blit upgrade`).'));
        }
    }

    // Sync drift check (D13): warn when kit-managed files have been modified since they were generated.
    out('');
    checkSyncDrift(root, out);
}
