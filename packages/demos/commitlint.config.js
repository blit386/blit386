/**
 * Commitlint configuration for conventional commits
 * @see https://commitlint.js.org
 */

export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
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
