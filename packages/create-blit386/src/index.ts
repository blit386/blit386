/**
 * `create-blit386` entry point.
 *
 * Flow: check Node -> greet -> pick a folder -> short wizard -> scaffold -> install -> git init -> print next steps.
 * Flags: --yes/-y (skip prompts), --ts (TypeScript template), --agent <names> (AI assistant files, comma-separated or
 * repeated), --no-install, --no-git.
 *
 * Two guards run before the wizard: the Node version must meet the engine floor (a friendly message beats an
 * EBADENGINE wall), and without an interactive terminal (an AI agent or CI) we behave as --yes instead of hanging on
 * a prompt nobody can answer. In that case the assistant files go to the agent found in the environment, never in CI.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { AGENT_ADAPTERS, AGENT_KINDS, type AgentKind, GAME_FILE_JS, GAME_FILE_TS } from '@blit386/kit/adapters';
import { cancel, intro, isCancel, log, note, outro, text } from '@clack/prompts';

import { detectCallingAgents, isInteractive, meetsNodeFloor, NODE_FLOOR, quoteIfSpaced } from './env';
import { detectPackageManager, packageManagerField, pmHints } from './pkgManager';
import { scaffold } from './scaffold';
import { defaultWizardOptions, runWizard } from './wizard';

/** The branch the first commit lands on. The optional CI workflow runs on pushes and pull requests to it. */
const DEFAULT_BRANCH = 'main';

/** What `tryGitInit` managed: nothing (git missing), a repository with no commit, or a saved first version. */
type GitInitResult = 'no-git' | 'no-commit' | 'committed';

function tryGitInit(dir: string): GitInitResult {
    try {
        execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
    } catch {
        // git missing. Not fatal; the no-git nag will guide them later.
        return 'no-git';
    }

    try {
        // Name the branch before the first commit. `git init -b` would do the same but needs git 2.28+.
        execFileSync('git', ['symbolic-ref', 'HEAD', `refs/heads/${DEFAULT_BRANCH}`], { cwd: dir, stdio: 'ignore' });
        execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
        execFileSync('git', ['commit', '-q', '-m', 'Initial commit from create-blit386'], {
            cwd: dir,
            stdio: 'ignore',
        });
        return 'committed';
    } catch {
        // Usually no git identity configured: the repository exists, but nothing is saved in it yet.
        return 'no-commit';
    }
}

function tryInstall(dir: string, command: string, args: string[]): boolean {
    try {
        // Same rule as the kit's runPm: npm/pnpm/yarn are .cmd shims on Windows and need a shell. The args are
        // constants (never user input), so shell: true there has no injection surface.
        execFileSync(command, args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
        return true;
    } catch {
        return false;
    }
}

/**
 * The `--agent` values as assistant kinds: comma-separated or repeated, deduplicated. Undefined when the flag is absent.
 * An unknown name, or `--agent` with no value, stops the run with the list of valid names.
 */
function parseAgentFlag(raw: (string | boolean)[] | undefined): AgentKind[] | undefined {
    if (raw === undefined) {
        return undefined;
    }

    const names = raw.flatMap((value) => (typeof value === 'string' ? value.split(',') : [''])).map((n) => n.trim());
    const unknown = names.find((name) => !(AGENT_KINDS as readonly string[]).includes(name));
    if (unknown !== undefined) {
        log.error(
            unknown === '' || unknown.startsWith('-')
                ? `--agent needs an assistant name: ${AGENT_KINDS.join(', ')}.`
                : `I do not know the assistant "${unknown}". You can set up: ${AGENT_KINDS.join(', ')}.`,
        );
        process.exit(1);
    }

    return [...new Set(names as AgentKind[])];
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
            `BLIT386 needs Node ${NODE_FLOOR} or newer, and you have ${process.versions.node}. ` +
                'Install the latest LTS from https://nodejs.org and run this again.',
        );
        process.exit(1);
    }

    // strict: false keeps unknown flags ignored, as they always were. A forwarded `--` (some runners pass it along from
    // `create blit386 my-game -- --yes`) is dropped, or parseArgs would read every flag after it as a positional.
    const { values, positionals: positional } = parseArgs({
        args: process.argv.slice(2).filter((arg) => arg !== '--'),
        strict: false,
        allowPositionals: true,
        options: {
            yes: { type: 'boolean', short: 'y' },
            ts: { type: 'boolean' },
            agent: { type: 'string', multiple: true },
            'no-install': { type: 'boolean' },
            'no-git': { type: 'boolean' },
        },
    });
    const flagYes = values.yes === true;
    const flagTs = values.ts === true;
    const noInstall = values['no-install'] === true;
    const noGit = values['no-git'] === true;
    const flagAgents = parseAgentFlag(values.agent as (string | boolean)[] | undefined);

    // Without a real terminal (an AI agent or CI), the clack wizard would hang waiting for input. Use the defaults
    // instead, give the assistant files to the agent running us, and say so once with the flags that control them.
    const interactive = isInteractive();
    const yes = flagYes || !interactive;
    // Undefined leaves the choice to the wizard (or to the --yes defaults in a real terminal).
    const presetAgents = flagAgents ?? (interactive ? undefined : detectCallingAgents());
    if (!interactive && !flagYes) {
        const defaultLanguageLabel = flagTs ? 'TypeScript' : 'JavaScript';
        const agentPart =
            presetAgents !== undefined && presetAgents.length > 0
                ? `assistant files for ${agentLabels(presetAgents)}${flagAgents ? '' : ' (found in your environment)'}`
                : `no assistant files (pass --agent with one of ${AGENT_KINDS.join(', ')} to add them)`;
        log.info(
            `No interactive terminal, so I skipped the questions: ${defaultLanguageLabel}, no CI, and ${agentPart}. ` +
                'Pass --yes to silence this. Other flags: --ts, --no-install, --no-git.',
        );
    }

    intro('create-blit386');

    const dirArg = await resolveTargetDir(positional[0], yes);
    const targetDir = resolve(process.cwd(), dirArg);
    const projectName = basename(targetDir);

    if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
        log.error(`The folder "${dirArg}" already exists and is not empty. Pick a different name.`);
        process.exit(1);
    }

    const wizardOptions = yes ? defaultWizardOptions() : await runWizard();
    // --agent overrides the wizard's pick, the same way --ts does.
    const agents = presetAgents ?? wizardOptions.agents;

    // --ts flag overrides the wizard's language choice so pros can skip the prompt.
    const language = flagTs ? 'ts' : wizardOptions.language;
    const languageLabel = language === 'ts' ? 'TypeScript' : 'JavaScript';

    const userAgent = process.env.npm_config_user_agent ?? '';
    const pmName = detectPackageManager(userAgent);
    const pm = pmHints(pmName);
    const packageManager = packageManagerField(pmName, userAgent);

    scaffold({
        targetDir,
        projectName,
        pmInstall: pm.installCmd,
        pmRunDev: pm.runDevCmd,
        pmRunBuild: pm.runBuildCmd,
        pmRunFormat: pm.runFormatCmd,
        pmRunLint: pm.runLintCmd,
        pmCiInstall: pm.ciInstallCmd,
        pmCiPrepare: pm.ciPrepareCmd,
        ...(packageManager === undefined ? {} : { packageManager }),
        includeCi: wizardOptions.includeCi,
        agents,
        language,
    });
    log.success(`Created ${projectName} (${languageLabel})`);

    // Install before the first commit, so the commit carries the lockfile the CI workflow's frozen install needs.
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

    const git = noGit ? 'no-git' : tryGitInit(targetDir);
    if (git === 'committed') {
        log.step('Started a git repository and saved the first version');
    } else if (git === 'no-commit') {
        // Manual-sync copy: the kit's NO_COMMIT_NAG (packages/kit/src/messages.ts) repeats this hint. Change both.
        log.warn(
            'Started a git repository, but git could not save the first version. Tell git who you are with ' +
                'git config --global user.name "Your Name" and git config --global user.email "you@example.com", ' +
                'then run git add -A and git commit -m "First version".',
        );
    }

    const cdStep = `cd ${quoteIfSpaced(dirArg)}`;
    const steps = [cdStep, ...(installed ? [] : [pm.installCmd]), pm.runDevCmd];
    // An assistant loads its hooks and docs server only from the folder its session started in (Claude Code, for one,
    // never reads them from a subfolder), so the session that ran this command does not have them yet.
    if (agents.length > 0) {
        steps.push(
            `Start a new assistant session (${agentLabels(agents)}) in ${dirArg} so it loads its skills and hooks`,
        );
    } else if (!interactive) {
        steps.push(`AI assistant? ${cdStep} && npx blit agents add <name>, then open a new session in ${dirArg}`);
    }
    note(steps.join('\n'), 'Next steps');

    const gameFile = language === 'ts' ? GAME_FILE_TS : GAME_FILE_JS;
    outro(`Have fun. Open ${gameFile} to change the game.`);
}

function agentLabels(agents: readonly AgentKind[]): string {
    return agents.map((kind) => AGENT_ADAPTERS[kind].label).join(', ');
}

main().catch((error: unknown) => {
    log.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
