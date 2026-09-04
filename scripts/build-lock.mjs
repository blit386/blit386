/**
 * Cross-process exclusive lock for a "check freshness, build if stale" self-heal script. Shared by
 * `ensure-engine-built.mjs` and `ensure-kit-built.mjs`: both shell out from `packages/demos` and
 * `packages/website`, which pnpm's default workspace concurrency runs in parallel (`.husky/pre-push`'s
 * `pnpm --filter "...[ref]" run preflight`, or a plain `pnpm -r build`). Without a lock, two processes
 * can both see a stale `dist/` at the same instant and both spawn an independent rebuild writing into
 * the same `dist/` at once – confirmed to intermittently corrupt `vite-plugin-dts`/API Extractor's
 * declaration bundling with errors like "referenced path was not found: .../amber.d.ts".
 *
 * `acquireLockOrConfirmBuilt` serializes the actual build behind an exclusive lock directory
 * (`mkdirSync` is atomic) so only the process that wins the race builds; every other process either
 * finds the target already fresh (built by the winner while it waited) or waits for the lock to free
 * up and then re-checks. The lock directory carries the owning pid, so a build killed mid-run (crash,
 * Ctrl-C) is detected as dead via `process.kill(pid, 0)` and cleared rather than deadlocking every
 * later run; a wall-clock ceiling (`LOCK_STALE_MS`) backstops that for the pid-reuse case.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Milliseconds between polls while waiting for another process's build or lock. */
const LOCK_POLL_MS = 200;

/** A lock older than this is assumed abandoned even if its owning pid looks alive (clock skew, pid reuse). */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** Synchronous sleep – callers are spawnSync-based throughout, so polling has to block, not await. */
const sleepSync = (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const isPidAlive = (pid) => {
    if (!Number.isInteger(pid)) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

/**
 * Blocks until either this process holds the exclusive build lock at `lockDir` (return `true` - the
 * caller should build) or `checkBuilt()` reports the target already fresh, built by another process
 * while waiting (return `false` - the caller should skip the build). A lock directory whose pid is no
 * longer running, or that has been held past `LOCK_STALE_MS`, is treated as abandoned and cleared.
 */
const acquireLockOrConfirmBuilt = (lockDir, checkBuilt, sleep = sleepSync) => {
    const waitStartedMs = Date.now();

    for (;;) {
        if (checkBuilt()) {
            return false;
        }

        try {
            mkdirSync(lockDir);
            writeFileSync(resolve(lockDir, 'pid'), String(process.pid));
            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }

        let lockOwnerPid = Number.NaN;

        try {
            lockOwnerPid = Number(readFileSync(resolve(lockDir, 'pid'), 'utf8'));
        } catch {
            // Lock directory exists but its pid file hasn't been written yet – a few-microsecond
            // window right after another process's mkdirSync, not an abandoned lock.
        }

        const isAbandoned =
            (Number.isInteger(lockOwnerPid) && !isPidAlive(lockOwnerPid)) || Date.now() - waitStartedMs > LOCK_STALE_MS;

        if (isAbandoned) {
            rmSync(lockDir, { recursive: true, force: true });
            continue;
        }

        sleep(LOCK_POLL_MS);
    }
};

const releaseBuildLock = (lockDir) => {
    rmSync(lockDir, { recursive: true, force: true });
};

export { acquireLockOrConfirmBuilt, releaseBuildLock };
