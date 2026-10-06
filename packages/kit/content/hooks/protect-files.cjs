// Claude Code PreToolUse hook: stops the assistant from hand-editing lock files and .env files.
// The classification lives in guard-core.cjs, shared with every other agent's entry; this file only
// knows Claude's payload (`tool_input.file_path`) and protocol (exit code 2 blocks the edit and shows
// the message to the assistant). Fails closed: a payload it cannot read, or one without a file path,
// blocks the edit - every tool the manifest matches (Edit, MultiEdit, Write) sends one.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');
const { failClosed, isProtectedPath, parsePayload } = require('./guard-core.cjs');

const verdict = failClosed(() => {
    const file = parsePayload(readFileSync(0, 'utf8')).tool_input?.file_path;

    if (typeof file !== 'string') {
        throw new Error('the payload has no tool_input.file_path');
    }

    return isProtectedPath(file);
});

if (verdict) {
    process.stderr.write(`[BLOCKED] ${verdict.message}\n`);
    process.exit(2);
}
