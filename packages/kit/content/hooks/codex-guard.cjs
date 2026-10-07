// Codex PreToolUse entry: one script for both guards, picked by its first argument (`shell` for Bash,
// `patch` for apply_patch). The classification lives in guard-core.cjs, shared with every other agent's
// entry; this file only knows Codex's payload and protocol. Both tools put their text in
// `tool_input.command`: a shell command for Bash, the raw `*** Begin Patch` text for apply_patch - Codex
// never sends a file path, so the edited paths are parsed out of the patch. Exit code 2 with a message on
// stderr blocks the call. Codex has no "ask" answer, so the confirm tier blocks too - its message tells
// the assistant to ask the user first.
//
// The mode names (`shell`, `patch`) are also written in content/hooks.manifest.json's `codex` commands,
// which cannot import them; test/codex-adapter.test.mjs runs those commands, so a rename on one side only
// fails the kit tests.
//
// Fails closed: Codex lets the call through on any other exit code, on exit 2 with an empty stderr, and
// on a crash, so every failure here must still end in a message and exit 2. The hooks.json command around
// this script does the same for a failure before it runs (no `node`, a missing file).
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');

try {
    const { failClosed, isDangerousCommand, isProtectedPath, parsePayload, patchPaths } = require('./guard-core.cjs');
    const mode = process.argv[2];
    // The verdict for the first protected path among `paths`, or null.
    const firstProtected = (paths) => paths.map(isProtectedPath).find(Boolean) ?? null;

    const verdict = failClosed(() => {
        const command = parsePayload(readFileSync(0, 'utf8')).tool_input?.command;

        if (typeof command !== 'string') {
            throw new Error('the payload has no tool_input.command');
        }

        if (mode === 'shell') {
            // `apply_patch <<'EOF' ...` run through the shell reaches Codex's Bash hook, not the apply_patch one.
            return isDangerousCommand(command) ?? firstProtected(patchPaths(command));
        }

        if (mode === 'patch') {
            const paths = patchPaths(command);

            if (paths.length === 0) {
                throw new Error('the patch names no file');
            }

            return firstProtected(paths);
        }

        throw new Error(`unknown guard mode: ${mode}`);
    });

    if (verdict?.decision === 'ask') {
        // The shared confirm-tier message says to ask the user first, but Codex blocks the command again after a yes.
        process.stderr.write(
            `[BLOCKED] ${verdict.userMessage} Codex hooks cannot ask, so ask the user to run the command themselves.\n`,
        );
        process.exit(2);
    }

    if (verdict) {
        process.stderr.write(`[BLOCKED] ${verdict.agentMessage ?? verdict.message}\n`);
        process.exit(2);
    }
} catch (error) {
    process.stderr.write(`[BLOCKED] The guard could not run, so the request was blocked: ${error.message}\n`);
    process.exit(2);
}
