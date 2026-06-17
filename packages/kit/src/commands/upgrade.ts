/** `blit upgrade` - update blit386 to the latest version, with a kind nudge if the project is not under git. */

import {
    detectPackageManager,
    findProjectRoot,
    installedVersion,
    isGitRepo,
    pmAddArgs,
    pmRemoveArgs,
    runPm,
} from '../env';
import { DEPRECATIONS_URL, NO_GIT_NAG, ui } from '../messages';
import { confirm } from '../prompt';
import { migrateProject } from './migrate';

function majorChanged(before: string, after: string): boolean {
    const beforeMajor = Number.parseInt(before.split('.')[0] ?? '', 10);
    const afterMajor = Number.parseInt(after.split('.')[0] ?? '', 10);
    return Number.isFinite(beforeMajor) && Number.isFinite(afterMajor) && afterMajor > beforeMajor;
}

export async function runUpgrade(): Promise<void> {
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    const root = findProjectRoot(process.cwd());
    if (!root) {
        out(ui.error("Couldn't find a game here. Run this inside your game folder."));
        process.exitCode = 1;
        return;
    }

    if (!isGitRepo(root)) {
        out(ui.warn('Heads up before upgrading:'));
        out('');
        out(NO_GIT_NAG);
        out('');

        const go = await confirm('Upgrade anyway?');
        if (!go) {
            out(ui.info('No changes made. Save your work first, then run `blit upgrade` again.'));
            return;
        }
    }

    const before = installedVersion(root, 'blit386');
    const pm = detectPackageManager(root);
    out(ui.info(`Updating blit386 with ${pm}...`));

    if (installedVersion(root, 'blit-tech')) {
        out(ui.info('Removing legacy blit-tech package...'));
        runPm(root, pm, pmRemoveArgs(pm, 'blit-tech'));
    }

    const status = runPm(root, pm, pmAddArgs(pm, 'blit386@latest'));
    if (status !== 0) {
        out(ui.error('The update did not finish. Check the messages above and try again.'));
        process.exitCode = status;
        return;
    }

    const after = installedVersion(root, 'blit386');

    if (!(before && after && before !== after)) {
        out(ui.success(after ? `blit386 is already up to date (${after}).` : 'blit386 updated.'));
        return;
    }

    out(ui.success(`blit386 ${before} -> ${after}`));

    if (majorChanged(before, after)) {
        out(ui.warn('This was a big update, so some names may have changed.'));
        out(ui.info(`Full list of changes: ${DEPRECATIONS_URL}`));
    }

    out('');
    out(ui.info('Checking your game for old BLIT386 names...'));

    const summary = await migrateProject(root, out, { write: false });

    if (summary.appliedCount > 0) {
        out('');

        if (await confirm('Apply these renames now?')) {
            // upgrade already ran the no-git nag above, so do not repeat it here.
            await migrateProject(root, out, { write: true, skipGitNag: true });
        } else {
            out(ui.info('No changes made. Run `blit migrate --write` when you are ready.'));
        }
    }
}
