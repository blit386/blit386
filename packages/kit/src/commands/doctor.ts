/** `blit doctor` - a friendly checkup of the things a Blit-Tech game needs. */

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

export function runDoctor(): void {
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    out(ui.heading('Blit-Tech checkup'));
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

    const version = installedVersion(root, 'blit-tech');
    if (version) {
        out(ui.success(`blit-tech ${version} installed`));
    } else {
        out(ui.warn('blit-tech is not installed yet. Run your install command (for example `npm install`).'));
    }

    // Kit-engine compatibility (D14): compare the engine range this kit was written for against what is installed.
    const engineRange = kitEngineRange();
    if (version && engineRange) {
        if (satisfiesCaretRange(version, engineRange)) {
            out(ui.success(`blit-tech ${version} is compatible with this kit (${engineRange})`));
        } else if (exceedsCaretRange(version, engineRange)) {
            out('');
            out(
                ui.warn(
                    `Your local guides were written for an older Blit-Tech (${engineRange}), but ${version} is installed.`,
                ),
            );
            out(ui.info('Update @blit-tech/kit to get guides that match your engine: run `npx blit upgrade`.'));
        } else {
            out('');
            out(ui.warn(`This kit needs blit-tech ${engineRange}, but ${version} is installed.`));
            out(ui.info('Update blit-tech to match: run `npm update blit-tech` (or `npx blit upgrade`).'));
        }
    }
}
