/**
 * The short setup wizard.
 *
 * v0.1 produces a JavaScript project. TypeScript templates are shown as "coming soon".
 * Optional CI and AI-assistant files can be added when the user opts in.
 */

import { cancel, confirm, isCancel, note, select } from '@clack/prompts';

import type { AgentChoice } from './scaffold';

export interface WizardOptions {
    agent: AgentChoice;
    includeCi: boolean;
}

function bail(): never {
    cancel('No problem. Maybe next time.');
    process.exit(0);
}

export async function runWizard(): Promise<WizardOptions> {
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
            { value: 'claude', label: 'Claude Code', hint: 'adds CLAUDE.md' },
            { value: 'cursor', label: 'Cursor', hint: 'adds .cursor/rules' },
        ],
    });
    if (isCancel(agent)) {
        bail();
    }

    const includeCi = await confirm({
        message: 'Add GitHub Actions CI (build + format check)?',
        initialValue: false,
    });
    if (isCancel(includeCi)) {
        bail();
    }

    return {
        agent: agent as AgentChoice,
        includeCi: includeCi === true,
    };
}

/** Defaults used when --yes skips the wizard. */
export function defaultWizardOptions(): WizardOptions {
    return {
        agent: 'none',
        includeCi: false,
    };
}
