/** `blit upgrade` - update blit-tech to the latest version, with a kind nudge if the project is not under git. */

import { createInterface } from 'node:readline/promises';

import { detectPackageManager, findProjectRoot, installedVersion, isGitRepo, pmAddArgs, runPm } from '../env';
import { DEPRECATIONS_URL, NO_GIT_NAG, ui } from '../messages';

async function confirm(question: string): Promise<boolean> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    try {
        const answer = (await rl.question(`${question} (y/N) `)).trim().toLowerCase();
        return answer === 'y' || answer === 'yes';
    } finally {
        rl.close();
    }
}

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

    const before = installedVersion(root, 'blit-tech');
    const pm = detectPackageManager(root);
    out(ui.info(`Updating blit-tech with ${pm}...`));

    const status = runPm(root, pm, pmAddArgs(pm, 'blit-tech@latest'));
    if (status !== 0) {
        out(ui.error('The update did not finish. Check the messages above and try again.'));
        process.exitCode = status;
        return;
    }

    const after = installedVersion(root, 'blit-tech');
    if (before && after && before !== after) {
        out(ui.success(`blit-tech ${before} -> ${after}`));
        if (majorChanged(before, after)) {
            out(ui.warn('This was a big update, so some commands may have changed names.'));
            out(ui.info(`See what changed: ${DEPRECATIONS_URL}`));
        }
    } else if (after) {
        out(ui.success(`blit-tech is already up to date (${after}).`));
    } else {
        out(ui.success('blit-tech updated.'));
    }
}
