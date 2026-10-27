/**
 * Cross-process exclusive lock for a "check freshness, build if stale" self-heal script. Shared by
 * `ensure-engine-built.mjs` and `ensure-kit-built.mjs`: both shell out from `packages/demos` and
 * `packages/website`, which pnpm's default workspace concurrency runs in parallel (`.husky/pre-push`'s
 * `pnpm --filter "...[ref]" run preflight`, or a plain `pnpm -r build`). Without a lock, two processes
 * can both see a stale `dist/` at the same instant and both spawn an independent rebuild writing into
 * the same `dist/` at once - confirmed to intermittently corrupt `vite-plugin-dts`/API Extractor's
 * declaration bundling with errors like "referenced path was not found: .../amber.d.ts".
 *
 * `acquireLockOrConfirmBuilt` serializes the actual build behind an exclusive lock directory
 * (`mkdirSync` is atomic) so only the process that wins the race builds; every other process either
 * finds the target already fresh (built by the winner while it waited) or waits for the lock to free
 * up and then re-checks. A lock is reclaimed as abandoned only when its recorded pid is confirmed
 * dead via `process.kill(pid, 0)` (a build killed mid-run: crash, Ctrl-C), when the pid is alive but
 * its start time no longer matches the one recorded beside it (the pid was reused), or, if the pid
 * can't even be read, once the lock directory itself is older than `LOCK_STALE_MS` - never merely because a waiter
 * has personally been polling a long time, so a legitimately slow but live build is never evicted out
 * from under itself no matter how long anyone has been waiting on it.
 *
 * Reclaiming a lock never deletes it in place: `reclaimAbandonedLock` atomically renames it to a
 * private path first (`renameSync`, so exactly one waiter can win the rename against every other
 * waiter reaching the same conclusion at the same time) and only then inspects and deletes the moved
 * copy - and if that copy turns out to belong to a pid that is alive after all (recreated by another
 * process between this waiter's freshness check and its reclaim attempt), it is moved back instead of
 * destroyed. A plain `rmSync(lockDir)` cannot do either: two waiters that both see the same abandoned
 * lock can otherwise have the second one delete the *new*, live lock the first one just created after
 * winning the race and starting its build.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Milliseconds between polls while waiting for another process's build or lock. */
const LOCK_POLL_MS = 200;

/** How old an unreadable lock (no parseable pid) must be before it's treated as abandoned. */
const LOCK_STALE_MS = 10 * 60 * 1000;

/** Synchronous sleep - callers are spawnSync-based throughout, so polling has to block, not await. */
const sleepSync = (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** How long a waiter polls before printing its one "still waiting" message. */
const LOCK_WAIT_NOTICE_MS = 5000;

/** Newest mtime (ms) of any file under `dir`, recursively. 0 if `dir` has no files. */
const getNewestMtimeMs = (dir) => {
    let newestMtimeMs = 0;

    for (const relativePath of readdirSync(dir, { recursive: true })) {
        const stats = statSync(resolve(dir, relativePath));

        if (stats.isFile() && stats.mtimeMs > newestMtimeMs) {
            newestMtimeMs = stats.mtimeMs;
        }
    }

    return newestMtimeMs;
};

const isPidAlive = (pid) => {
    if (!Number.isInteger(pid)) {
        return false;
    }

    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === 'EPERM'; // Alive, but owned by another user.
    }
};

/** Start time of `pid` as `ps` prints it, or `null` where it can't be read (Windows, no `ps`). */
const getProcessStart = (pid) => {
    const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C' },
    });

    return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : null;
};

/**
 * Whether the process that wrote `lockDir` is still running. A live pid alone is not enough - after a
 * reboot or SIGKILL the pid can be reused by an unrelated process - so the start time recorded beside
 * the pid must also match. Without a recorded or readable start time, the pid check stands alone.
 */
const isLockOwnerAlive = (lockDir, pid) => {
    if (!isPidAlive(pid)) {
        return false;
    }

    let recordedStart;

    try {
        recordedStart = readFileSync(resolve(lockDir, 'start'), 'utf8');
    } catch {
        return true;
    }

    // Empty means the owner is mid-write - not a mismatch.
    if (!recordedStart) {
        return true;
    }

    const currentStart = getProcessStart(pid);

    return currentStart === null || currentStart === recordedStart;
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
        return false; // Raced away already - not this waiter's call to make.
    }
};

/**
 * Atomically relocates `lockDir` to a private path and inspects what actually moved before deciding
 * whether to delete it, rather than deleting in place (see the file header for why that's unsafe). If
 * `renameSync` fails with `ENOENT`, another waiter already reclaimed this lock first - not an error,
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

    if (Number.isInteger(reapedPid) && isLockOwnerAlive(reapDir, reapedPid)) {
        try {
            renameSync(reapDir, lockDir);
        } catch {
            // lockDir was reoccupied again in the meantime too - leave the orphaned reap
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
const acquireLockOrConfirmBuilt = (lockDir, checkBuilt, sleep = sleepSync, now = Date.now) => {
    const waitStartMs = now();
    let noticePrinted = false;

    for (;;) {
        if (checkBuilt()) {
            return false;
        }

        try {
            mkdirSync(lockDir);
            writeFileSync(resolve(lockDir, 'pid'), String(process.pid));

            const start = getProcessStart(process.pid);

            if (start !== null) {
                writeFileSync(resolve(lockDir, 'start'), start);
            }

            return true;
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }

        const lockOwnerPid = readLockOwnerPid(lockDir);
        const ownerIsDead = Number.isInteger(lockOwnerPid) && !isLockOwnerAlive(lockDir, lockOwnerPid);
        const ownerIsUnverifiable = !Number.isInteger(lockOwnerPid) && isLockOlderThan(lockDir, LOCK_STALE_MS);

        if (ownerIsDead || ownerIsUnverifiable) {
            reclaimAbandonedLock(lockDir);
            continue;
        }

        if (!noticePrinted && now() - waitStartMs > LOCK_WAIT_NOTICE_MS) {
            noticePrinted = true;

            const owner = Number.isInteger(lockOwnerPid) ? `pid ${lockOwnerPid}` : 'an unknown owner';

            console.error(`waiting on build lock held by ${owner} - delete ${lockDir} if stale`);
        }

        sleep(LOCK_POLL_MS);
    }
};

const releaseBuildLock = (lockDir) => {
    rmSync(lockDir, { recursive: true, force: true });
};

export { acquireLockOrConfirmBuilt, getNewestMtimeMs, getProcessStart, reclaimAbandonedLock, releaseBuildLock };
