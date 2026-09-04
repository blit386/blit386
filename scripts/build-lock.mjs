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
 * up and then re-checks. A lock is reclaimed as abandoned only when its recorded pid is confirmed
 * dead via `process.kill(pid, 0)` (a build killed mid-run: crash, Ctrl-C) or, if the pid can't even be
 * read, once the lock directory itself is older than `LOCK_STALE_MS` – never merely because a waiter
 * has personally been polling a long time, so a legitimately slow but live build is never evicted out
 * from under itself no matter how long anyone has been waiting on it.
 *
 * Reclaiming a lock never deletes it in place: `reclaimAbandonedLock` atomically renames it to a
 * private path first (`renameSync`, so exactly one waiter can win the rename against every other
 * waiter reaching the same conclusion at the same time) and only then inspects and deletes the moved
 * copy – and if that copy turns out to belong to a pid that is alive after all (recreated by another
 * process between this waiter's freshness check and its reclaim attempt), it is moved back instead of
 * destroyed. A plain `rmSync(lockDir)` cannot do either: two waiters that both see the same abandoned
 * lock can otherwise have the second one delete the *new*, live lock the first one just created after
 * winning the race and starting its build.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Milliseconds between polls while waiting for another process's build or lock. */
const LOCK_POLL_MS = 200;

/** How old an unreadable lock (no parseable pid) must be before it's treated as abandoned. */
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

/** The pid recorded in `lockDir`, or `NaN` if it can't be read (missing, or not written yet). */
const readLockOwnerPid = (lockDir) => {
    try {
        return Number(readFileSync(resolve(lockDir, 'pid'), 'utf8'));
    } catch {
        return Number.NaN;
    }
};

/** Whether `lockDir`'s own mtime (set at creation, untouched until removal) predates `thresholdMs` ago. */
const isLockOlderThan = (lockDir, thresholdMs) => {
    try {
        return Date.now() - statSync(lockDir).mtimeMs > thresholdMs;
    } catch {
        return false; // Raced away already – not this waiter's call to make.
    }
};

/**
 * Atomically relocates `lockDir` to a private path and inspects what actually moved before deciding
 * whether to delete it, rather than deleting in place (see the file header for why that's unsafe). If
 * `renameSync` fails with `ENOENT`, another waiter already reclaimed this lock first – not an error,
 * the caller's loop just retries from scratch. If the relocated copy's pid is alive after all, it is
 * moved back rather than destroyed; if that restore itself loses a race (the path was reoccupied in
 * the meantime too), the orphaned reap directory is left in place rather than guessed at further -
 * an exceptionally narrow multi-way race that nothing else ever reads.
 */
const reclaimAbandonedLock = (lockDir) => {
    const reapDir = `${lockDir}.reap-${process.pid}-${randomUUID()}`;

    try {
        renameSync(lockDir, reapDir);
    } catch (err) {
        if (err.code === 'ENOENT') {
            return;
        }

        throw err;
    }

    const reapedPid = readLockOwnerPid(reapDir);

    if (Number.isInteger(reapedPid) && isPidAlive(reapedPid)) {
        try {
            renameSync(reapDir, lockDir);
        } catch {
            // lockDir was reoccupied again in the meantime too – leave the orphaned reap
            // directory rather than guess further.
        }

        return;
    }

    rmSync(reapDir, { recursive: true, force: true });
};

/**
 * Blocks until either this process holds the exclusive build lock at `lockDir` (return `true` - the
 * caller should build) or `checkBuilt()` reports the target already fresh, built by another process
 * while waiting (return `false` - the caller should skip the build).
 */
const acquireLockOrConfirmBuilt = (lockDir, checkBuilt, sleep = sleepSync) => {
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

        const lockOwnerPid = readLockOwnerPid(lockDir);
        const ownerIsDead = Number.isInteger(lockOwnerPid) && !isPidAlive(lockOwnerPid);
        const ownerIsUnverifiable = !Number.isInteger(lockOwnerPid) && isLockOlderThan(lockDir, LOCK_STALE_MS);

        if (ownerIsDead || ownerIsUnverifiable) {
            reclaimAbandonedLock(lockDir);
            continue;
        }

        sleep(LOCK_POLL_MS);
    }
};

const releaseBuildLock = (lockDir) => {
    rmSync(lockDir, { recursive: true, force: true });
};

export { acquireLockOrConfirmBuilt, reclaimAbandonedLock, releaseBuildLock };
