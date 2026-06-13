/**
 * `create-blit-tech` entry point.
 *
 * Flow: check Node -> greet -> pick a folder -> short wizard -> scaffold -> git init -> install -> print next steps.
 * Flags: --yes/-y (skip prompts), --no-install, --no-git.
 *
 * Two guards run before the wizard: the Node version must meet the engine floor (a friendly message beats an
 * EBADENGINE wall), and without an interactive terminal (an AI agent or CI) we behave as --yes instead of hanging on
 * a prompt nobody can answer.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { cancel, intro, isCancel, log, note, outro, text } from '@clack/prompts';

import { isInteractive, meetsNodeFloor, NODE_FLOOR } from './env';
import { detectPackageManager, pmHints } from './pkgManager';
import { scaffold } from './scaffold';
import { defaultWizardOptions, runWizard } from './wizard';

function tryGitInit(dir: string): boolean {
    try {
        execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
        execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
        execFileSync('git', ['commit', '-q', '-m', 'Initial commit from create-blit-tech'], {
            cwd: dir,
            stdio: 'ignore',
        });
        return true;
    } catch {
        // git missing, or no identity configured. Not fatal; the no-git nag will guide them later.
        return false;
    }
}

function tryInstall(dir: string, command: string, args: string[]): boolean {
    try {
        execFileSync(command, args, { cwd: dir, stdio: 'inherit' });
        return true;
    } catch {
        return false;
    }
}

async function resolveTargetDir(positional: string | undefined, yes: boolean): Promise<string> {
    if (positional) {
        return positional;
    }
    if (yes) {
        return 'my-blit-game';
    }

    const answer = await text({
        message: 'What should we name your game folder?',
        placeholder: 'my-game',
        defaultValue: 'my-game',
    });
    if (isCancel(answer)) {
        cancel('No problem. Maybe next time.');
        process.exit(0);
    }

    return answer.trim() || 'my-game';
}

async function main(): Promise<void> {
    if (!meetsNodeFloor(process.versions.node)) {
        log.error(
            `Blit-Tech needs Node ${NODE_FLOOR} or newer, and you have ${process.versions.node}. ` +
                'Install the latest LTS from https://nodejs.org and run this again.',
        );
        process.exit(1);
    }

    const argv = process.argv.slice(2);
    const positional = argv.filter((arg) => !arg.startsWith('-'));
    const flagYes = argv.includes('--yes') || argv.includes('-y');
    const noInstall = argv.includes('--no-install');
    const noGit = argv.includes('--no-git');

    // Without a real terminal (an AI agent or CI), the clack wizard would hang waiting for input. Use the defaults
    // instead and say so once, kindly, with the flags that control them.
    const interactive = isInteractive();
    const yes = flagYes || !interactive;
    if (!interactive && !flagYes) {
        log.info(
            'No interactive terminal detected, so I used the defaults: JavaScript, no AI assistant, no CI. ' +
                'Pass --yes to silence this, or run me in a terminal to choose. Other flags: --no-install, --no-git.',
        );
    }

    intro('create-blit-tech');

    const dirArg = await resolveTargetDir(positional[0], yes);
    const targetDir = resolve(process.cwd(), dirArg);
    const projectName = basename(targetDir);

    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
        log.error(`The folder "${dirArg}" already exists and is not empty. Pick a different name.`);
        process.exit(1);
    }

    const wizardOptions = yes ? defaultWizardOptions() : await runWizard();

    const pm = pmHints(detectPackageManager());

    scaffold({
        targetDir,
        projectName,
        pmInstall: pm.installCmd,
        pmRunDev: pm.runDevCmd,
        pmRunBuild: pm.runBuildCmd,
        pmRunFormat: pm.runFormatCmd,
        pmRunLint: pm.runLintCmd,
        includeCi: wizardOptions.includeCi,
        agent: wizardOptions.agent,
    });
    log.success(`Created ${projectName} (JavaScript)`);

    if (!noGit && tryGitInit(targetDir)) {
        log.step('Started a git repository and saved the first version');
    }

    let installed = false;
    if (!noInstall) {
        log.step(`Installing the engine with ${pm.name} (this can take a minute)`);
        installed = tryInstall(targetDir, pm.name, pm.installArgs);
        if (installed) {
            log.success('Installed');
        } else {
            log.warn(`Could not install automatically. Run "${pm.installCmd}" yourself.`);
        }
    }

    const steps = [`cd ${dirArg}`, ...(installed ? [] : [pm.installCmd]), pm.runDevCmd];
    note(steps.join('\n'), 'Next steps');
    outro('Have fun. Open src/game.js to change the game.');
}

main().catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
