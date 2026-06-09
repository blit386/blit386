/** `blit doctor` - a friendly checkup of the things a Blit-Tech game needs. */

import { detectPackageManager, findProjectRoot, installedVersion, isGitRepo, nodeVersionOk, readProject } from '../env';
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
        out(ui.info('Run `blit upgrade` to get the latest version.'));
    } else {
        out(ui.warn('blit-tech is not installed yet. Run your install command (for example `npm install`).'));
    }
}
