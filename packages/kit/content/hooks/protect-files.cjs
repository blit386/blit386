// Claude Code PreToolUse and Gemini CLI BeforeTool hook: stops the assistant from hand-editing lock
// files and .env files. The classification lives in guard-core.cjs, shared with every other agent's
// entry; this file only knows the payload both agents send (`tool_input.file_path`) and their shared
// protocol (exit code 2 blocks the edit and shows the message to the assistant). Fails closed: a
// payload it cannot read, or one without a file path, blocks the edit - every tool the manifest
// matches (Claude's Edit, MultiEdit, Write; Gemini's write_file, replace) sends one.
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
