// Claude Code PreToolUse and Gemini CLI BeforeTool hook: stops the assistant from hand-editing lock
// files and .env files. The classification lives in guard-core.cjs, shared with every other agent's
// entry; this file only knows the payload both agents send (`tool_input.file_path`) and their shared
// protocol (exit code 2 blocks the edit and shows the message to the assistant). Fails closed: a
// payload it cannot read, or one without a file path, blocks the edit - every tool the manifest
// matches (Claude's Edit, MultiEdit, Write; Gemini's write_file, replace) sends one.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');

// A guard core that will not load (missing, or crashing as it loads) blocks too: both agents let the edit through on
// any exit code other than 2 (BT-775).
let guardCore;
try {
    guardCore = require('./guard-core.cjs');
} catch (error) {
    process.stderr.write(`[BLOCKED] The guard could not run, so the request was blocked: ${error.message}\n`);
    process.exit(2);
}
const { failClosed, isProtectedPath, parsePayload } = guardCore;

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
