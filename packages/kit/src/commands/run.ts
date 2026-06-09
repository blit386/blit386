/** `blit run` - start the project's dev server with whichever package manager the project uses. */

import { detectPackageManager, findProjectRoot, pmRunArgs, runPm } from '../env';
import { ui } from '../messages';

export function runDev(): void {
    const root = findProjectRoot(process.cwd());
    if (!root) {
        process.stdout.write(`${ui.error("Couldn't find a game here. Run this inside your game folder.")}\n`);
        process.exitCode = 1;
        return;
    }

    const pm = detectPackageManager(root);
    process.stdout.write(`${ui.info(`Starting your game with ${pm}. Press Ctrl+C to stop.`)}\n`);

    const status = runPm(root, pm, pmRunArgs(pm, 'dev'));
    process.exitCode = status;
}
