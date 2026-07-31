/**
 * `blit` - the project-local BLIT386 helper CLI.
 *
 * Commands: run | doctor | upgrade | migrate | agents | help. Kept tiny and beginner-friendly; see ./messages for the
 * voice.
 */

import { runAgents } from './commands/agents';
import { runDoctor } from './commands/doctor';
import { runMigrate } from './commands/migrate';
import { runDev } from './commands/run';
import { runUpgrade } from './commands/upgrade';
import { color, ui } from './messages';

const HELP = `${color.bold('blit')} - the BLIT386 helper

Usage: blit <command>

Commands:
  ${color.cyan('run')}        Start your game in the browser
  ${color.cyan('doctor')}     Check your setup (Node, git, blit386 version)
  ${color.cyan('upgrade')}    Update blit386 to the latest version (then offers migrate)
  ${color.cyan('migrate')}    Update old names + enable hot reload (--write to apply)
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
        case 'migrate':
            await runMigrate(process.argv.slice(3));
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
