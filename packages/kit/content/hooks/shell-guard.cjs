// Gemini CLI BeforeTool hook for run_shell_command: blocks destructive git commands.
// The classification lives in guard-core.cjs, shared with every other agent's entry; this file only
// knows Gemini's payload (`tool_input.command`) and protocol (exit code 2 blocks the call and sends
// stderr to the assistant). Gemini has no "ask" answer, so the confirm tier blocks too - its message
// tells the assistant to ask the user first. Fails closed: Gemini lets the call through on any exit
// code other than 2, so an unreadable payload or a missing command must exit 2 itself.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');
const { failClosed, isDangerousCommand, parsePayload } = require('./guard-core.cjs');

const verdict = failClosed(() => {
    const command = parsePayload(readFileSync(0, 'utf8')).tool_input?.command;

    if (typeof command !== 'string') {
        throw new Error('the payload has no tool_input.command');
    }

    return isDangerousCommand(command);
});

if (verdict) {
    process.stderr.write(`[BLOCKED] ${verdict.agentMessage ?? verdict.message}\n`);
    process.exit(2);
}
