/**
 * The short setup wizard.
 *
 * JavaScript and TypeScript are both supported. Optional CI and AI-assistant files can be added when the user opts in.
 */

import { cancel, confirm, isCancel, select } from '@clack/prompts';

import type { AgentChoice, LanguageChoice } from './scaffold';

export interface WizardOptions {
    language: LanguageChoice;
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
            { value: 'ts', label: 'TypeScript', hint: 'adds types and a tsconfig' },
        ],
    });
    if (isCancel(language)) {
        bail();
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
        language: language as LanguageChoice,
        agent: agent as AgentChoice,
        includeCi,
    };
}

/** Defaults used when --yes or non-TTY mode skips the wizard. */
export function defaultWizardOptions(): WizardOptions {
    return {
        language: 'js',
        agent: 'none',
        includeCi: false,
    };
}
