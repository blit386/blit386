/**
 * The short setup wizard.
 *
 * JavaScript and TypeScript are both supported. Optional CI and AI-assistant files can be added when the user opts in.
 * Assistants are multi-select so Claude Code and Cursor can both be chosen in one pass.
 */

import { cancel, confirm, isCancel, multiselect, select } from '@clack/prompts';

import { AGENT_KINDS, AGENT_LABEL, AGENT_SETUP_HINT, type AgentKind } from '@blit386/kit/adapters';

import type { LanguageChoice } from './scaffold';

export interface WizardOptions {
    language: LanguageChoice;

    /** Assistants to generate config for; empty means none. */
    agents: readonly AgentKind[];

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

    const agents = await multiselect({
        message: 'Which AI coding assistants do you use?',
        options: AGENT_KINDS.map((kind) => ({
            value: kind,
            label: AGENT_LABEL[kind],
            hint: AGENT_SETUP_HINT[kind],
        })),

        // Empty selection is "none" - beginners can skip without a dedicated None radio.
        required: false,
    });
    if (isCancel(agents)) {
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
        agents: agents as AgentKind[],
        includeCi,
    };
}

/** Defaults used when --yes or non-TTY mode skips the wizard. */
export function defaultWizardOptions(): WizardOptions {
    return {
        language: 'js',
        agents: [],
        includeCi: false,
    };
}
