/**
 * Environment for `git` subprocesses that must act on the repository they are pointed at – by
 * `cwd`, by `-C`, or by an explicit path – rather than on whatever repository the parent process
 * happened to belong to.
 *
 * Git exports `GIT_DIR` (and a handful of siblings) into every hook it runs, and hooks are where
 * these scripts get invoked from: `.husky/pre-push` dispatches `pnpm --filter ... run preflight`,
 * so every git subprocess underneath inherits `GIT_DIR` pointing at the *pushing* worktree's git
 * directory. Those variables outrank both `cwd` and `-C`, which turns two ordinary-looking calls
 * into repo-wide damage:
 *
 * - `git init` in a throwaway temp repo re-initializes the real one instead. When the push came
 *   from a linked worktree, `GIT_DIR` is `.git/worktrees/<name>`, which git cannot pair with a
 *   work tree from an unrelated cwd – so it writes `bare = true` into the shared `.git/config`,
 *   and every later git command in the main checkout and in every worktree fails with
 *   "fatal: this operation must be run in a work tree" until someone resets it by hand.
 * - `git log` against a fixture repo silently reads the real repo's history instead, so
 *   `lastModified` frontmatter comes back wrong rather than failing loudly.
 *
 * `packages/blit386/scripts/gen-api-history.test.mjs` scrubs the same variables inline for the
 * same reason.
 */

/**
 * Variables through which git locates a repository. Anything here outranks `cwd`/`-C`, so it has
 * to go before a subprocess may be trusted to act on the directory it was handed.
 *
 * `git rev-parse --local-env-vars` is the authority – it is exactly the list git itself clears
 * before recursing into an unrelated repository – and `git-env.test.mjs` asserts this set stays a
 * superset of what the installed git reports, so a future git adding one fails the suite rather
 * than silently widening the hole. The three extras beyond that list (`GIT_CEILING_DIRECTORIES`,
 * `GIT_NAMESPACE`, `GIT_QUARANTINE_PATH`) scope discovery and ref visibility rather than the repo
 * location proper, but they are set on hook subprocesses too and mean nothing to a temp fixture.
 */
const REPO_LOCATION_VARS = new Set([
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CEILING_DIRECTORIES',
    'GIT_COMMON_DIR',
    'GIT_CONFIG',
    'GIT_CONFIG_COUNT',
    'GIT_CONFIG_PARAMETERS',
    'GIT_DIR',
    'GIT_GRAFT_FILE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_NAMESPACE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_OBJECT_DIRECTORY',
    'GIT_PREFIX',
    'GIT_QUARANTINE_PATH',
    'GIT_REPLACE_REF_BASE',
    'GIT_SHALLOW_FILE',
    'GIT_WORK_TREE',
]);

/**
 * Build the environment for a `git` subprocess, with git's repository-location variables removed
 * so the command acts on the directory it was given.
 *
 * @param {NodeJS.ProcessEnv} [overrides] - Extra variables to set on top of the scrubbed
 *   environment (`GIT_AUTHOR_DATE` and friends). Applied last, so an override always wins.
 * @returns {NodeJS.ProcessEnv} A copy of `process.env` safe to hand to `git`.
 */
export const gitEnv = (overrides = {}) => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !REPO_LOCATION_VARS.has(name))),
    ...overrides,
});
