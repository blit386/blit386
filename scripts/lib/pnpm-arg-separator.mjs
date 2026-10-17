/**
 * The standalone `--` that pnpm inserts when you run `pnpm run <script> -- <args>`.
 * Scripts compare incoming argv against this and skip it. A `startsWith('--')`
 * check is the option prefix, not this separator, and stays inline.
 */
export const PNPM_ARG_SEPARATOR = '--';
