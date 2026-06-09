/**
 * The short setup wizard.
 *
 * v0.1 always produces a JavaScript, no-agent project. The TypeScript and AI-assistant choices are shown as
 * "coming soon" so the path is visible, and a friendly note explains what happens if one is picked.
 */

import { cancel, isCancel, note, select } from '@clack/prompts';

function bail(): never {
    cancel('No problem. Maybe next time.');
    process.exit(0);
}

export async function runWizard(): Promise<void> {
    const language = await select({
        message: 'Which language do you want?',
        initialValue: 'js',
        options: [
            { value: 'js', label: 'JavaScript', hint: 'great to start with' },
            { value: 'ts', label: 'TypeScript', hint: 'coming soon' },
        ],
    });
    if (isCancel(language)) {
        bail();
    }
    if (language === 'ts') {
        note('TypeScript templates arrive in a later version. Building a JavaScript game for now.', 'Heads up');
    }

    const agent = await select({
        message: 'Do you use an AI coding assistant?',
        initialValue: 'none',
        options: [
            { value: 'none', label: 'No, just the game and docs', hint: 'recommended to start' },
            { value: 'claude', label: 'Claude Code', hint: 'coming soon' },
            { value: 'cursor', label: 'Cursor', hint: 'coming soon' },
        ],
    });
    if (isCancel(agent)) {
        bail();
    }
    if (agent !== 'none') {
        note(
            'Assistant-specific files arrive in a later version. Your game includes a readable AGENTS.md for now.',
            'Heads up',
        );
    }
}
