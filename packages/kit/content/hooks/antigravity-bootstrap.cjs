// Antigravity PreInvocation hook: the session-start bootstrap. Antigravity has no session-start event and
// PreInvocation fires before every model call, so a marker file keyed by workspace + conversationId makes the
// work run once per conversation. The marker lives in the OS temp dir (nothing lands in the project) and is
// written before the work, so a failure is not retried on every later call.
// Installs dependencies when node_modules is missing, runs `blit doctor`, and reports through injectSteps.
// First argument: the package manager's install command (the manifest always passes it). Never blocks: every error ends in an empty `{}`.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { parsePayload } = require('./guard-core.cjs');

const MAX_REPORT = 2000;

function bootstrap() {
    const { conversationId, workspacePaths } = parsePayload(readFileSync(0, 'utf8'));
    const root = workspacePaths?.[0];

    if (typeof conversationId !== 'string' || typeof root !== 'string') {
        return null;
    }

    const key = createHash('sha256').update(`${root}\n${conversationId}`).digest('hex').slice(0, 32);
    const marker = path.join(tmpdir(), `blit-bootstrap-${key}`);

    if (existsSync(marker)) {
        return null;
    }

    writeFileSync(marker, '');

    const run = (command) =>
        spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', windowsHide: true, timeout: 280_000 });
    const report = [];

    if (!existsSync(path.join(root, 'node_modules'))) {
        const install = process.argv[2];
        const result = run(install);

        report.push(
            result.status === 0
                ? `[session-start] Installed dependencies with \`${install}\`.`
                : `[session-start] \`${install}\` failed; continuing without a warmed toolchain.`,
        );
    }

    if (existsSync(path.join(root, 'node_modules', '.bin', 'blit'))) {
        const doctor = run('node_modules/.bin/blit doctor');

        report.push(`[session-start] blit doctor:\n${`${doctor.stdout}${doctor.stderr}`.trim()}`);
    }

    const text = report.join('\n').slice(0, MAX_REPORT);

    return text ? { injectSteps: [{ ephemeralMessage: text }] } : null;
}

let output = null;

try {
    output = bootstrap();
} catch {
    // No readable payload or a failed step - the bootstrap is a convenience, so say nothing.
}

process.stdout.write(`${JSON.stringify(output ?? {})}\n`);
