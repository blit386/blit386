/**
 * Commitlint configuration for conventional commits. The preset already enforces the type list,
 * lowercase subject, no trailing period, and the 100-character header limit.
 * @see https://commitlint.js.org
 */

export default {
    extends: ['@commitlint/config-conventional'],
};
