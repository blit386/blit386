/**
 * `blit` - the project-local Blit-Tech helper CLI.
 *
 * Commands: run | doctor | upgrade | agents | help. Kept tiny and beginner-friendly; see ./messages for the voice.
 */

import { runAgents } from './commands/agents';
import { runDoctor } from './commands/doctor';
import { runDev } from './commands/run';
import { runUpgrade } from './commands/upgrade';
import { color, ui } from './messages';

const HELP = `${color.bold('blit')} - the Blit-Tech helper

Usage: blit <command>

Commands:
  ${color.cyan('run')}        Start your game in the browser
  ${color.cyan('doctor')}     Check your setup (Node, git, blit-tech version)
  ${color.cyan('upgrade')}    Update blit-tech to the latest version
  ${color.cyan('agents')}     Manage AI-assistant files (sync, add)
  ${color.cyan('help')}       Show this help
`;

async function main(): Promise<void> {
    const command = process.argv[2] ?? 'help';

    switch (command) {
        case 'run':
            runDev();
            break;
        case 'doctor':
            runDoctor();
            break;
        case 'upgrade':
            await runUpgrade();
            break;
        case 'agents':
            runAgents(process.argv.slice(3));
            break;
        case 'help':
        case '--help':
        case '-h':
            process.stdout.write(HELP);
            break;
        default:
            process.stdout.write(`${ui.error(`Unknown command: ${command}`)}\n\n${HELP}`);
            process.exitCode = 1;
    }
}

main().catch((error: unknown) => {
    process.stderr.write(`${ui.error(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
});
