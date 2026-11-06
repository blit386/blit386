import { execFileSync } from 'node:child_process';

/**
 * Environment for a git child process that must find its repository from `cwd`, not from the caller.
 *
 * Git exports GIT_DIR and its siblings into every hook it runs (`.husky/pre-push`). Left in place they outrank
 * `cwd`: without GIT_WORK_TREE git treats `cwd` as the work tree root, so a `-- src` pathspec run from a nested
 * package folder matches nothing. The list comes from `git rev-parse --local-env-vars` (what git itself clears
 * before recursing into another repository) so it tracks new git versions; the three appended names scope
 * discovery and ref visibility rather than location, and are set on hook subprocesses all the same.
 *
 * @param {Record<string, string>} [extra] Variables to add after the scrub.
 * @returns {NodeJS.ProcessEnv} A copy of `process.env` without repo-location variables, plus `extra`.
 */
export function gitEnvWithoutRepoLocation(extra = {}) {
    const scrubbed = new Set([
        ...execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean),
        'GIT_CEILING_DIRECTORIES',
        'GIT_NAMESPACE',
        'GIT_QUARANTINE_PATH',
    ]);

    return {
        ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !scrubbed.has(name))),
        ...extra,
    };
}
