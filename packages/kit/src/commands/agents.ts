/**
 * `blit agents <add|sync>` - v0.1 friendly stub.
 *
 * Per-agent config generation (Claude, Cursor, Zed, ...) from the canonical kit arrives in a later version. For now
 * the scaffolded project already ships a readable AGENTS.md and a docs/ folder usable by a human or any AI assistant.
 */

import { ui } from '../messages';

export function runAgents(args: string[]): void {
    const sub = args[0] ?? '';
    const out = (line: string): void => {
        process.stdout.write(`${line}\n`);
    };

    if (sub === 'add' || sub === 'sync') {
        out(ui.info('Setting up files for a specific AI assistant arrives in a later version of Blit-Tech.'));
        out(ui.info('For now your game already has an AGENTS.md and a docs/ folder that a person or an AI can read.'));
        return;
    }

    out('Usage: blit agents <add|sync>');
    out('');
    out(ui.info('Generates AI-assistant config from your project docs. Coming in a later version.'));
}
