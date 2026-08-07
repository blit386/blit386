/**
 * Commitlint configuration for conventional commits
 * @see https://commitlint.js.org
 */

import { findDashTypographyIssues } from './scripts/check-dash-typography.mjs';

/** Local commitlint plugin enforcing this repo's en-dash-only rule (root CLAUDE.md, "Dash Typography") on the full commit message. */
const dashTypographyPlugin = {
    rules: {
        'dash-typography': (parsed) => {
            const issues = findDashTypographyIssues(parsed.raw ?? '');

            if (issues.length === 0) return [true];

            const details = issues.map((issue) => `  line ${issue.line}, col ${issue.column}: ${issue.message}`);

            return [false, `commit message dash typography:\n${details.join('\n')}`];
        },
    },
};

export default {
    extends: ['@commitlint/config-conventional'],
    plugins: [dashTypographyPlugin],
    rules: {
        // This repo's own en-dash-only rule, not part of @commitlint/config-conventional
        'dash-typography': [2, 'always'],
        // Enforce conventional commit types
        'type-enum': [
            2,
            'always',
            [
                'feat', // New feature
                'fix', // Bug fix
                'docs', // Documentation changes
                'style', // Code style changes (formatting, etc.)
                'refactor', // Code refactoring
                'perf', // Performance improvements
                'test', // Adding or updating tests
                'build', // Build system or dependencies
                'ci', // CI/CD changes
                'chore', // Other changes (maintenance, etc.)
                'revert', // Revert previous commit
            ],
        ],
        // Subject case: lowercase
        'subject-case': [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
        // Subject must not end with period
        'subject-empty': [2, 'never'],
        'subject-full-stop': [2, 'never', '.'],
        // Type must be lowercase
        'type-case': [2, 'always', 'lower-case'],
        // Type must not be empty
        'type-empty': [2, 'never'],
        // Header max length
        'header-max-length': [2, 'always', 100],
    },
};
