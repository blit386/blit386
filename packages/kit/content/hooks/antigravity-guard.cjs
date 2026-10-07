// Antigravity PreToolUse entry: one script for both guards, picked by its first argument
// (`files` for the write tools, `shell` for run_command). The classification lives in guard-core.cjs,
// shared with every other agent's entry; this file only knows Antigravity's payload
// (`toolCall.args.TargetFile`, `toolCall.args.CommandLine`) and protocol (a JSON decision on stdout).
// Fails closed on everything: Antigravity documents no behavior for a crashed hook, so an unreadable
// payload, a missing argument, or a guard-core that will not load all answer with a deny.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');

const reply = (decision, reason) => process.stdout.write(`${JSON.stringify({ decision, reason })}\n`);

try {
    const { failClosed, isDangerousCommand, isProtectedPath, parsePayload } = require('./guard-core.cjs');
    const mode = process.argv[2];

    const verdict = failClosed(() => {
        const args = parsePayload(readFileSync(0, 'utf8')).toolCall?.args;

        if (mode === 'files') {
            if (typeof args?.TargetFile !== 'string') {
                throw new Error('the payload has no toolCall.args.TargetFile');
            }

            return isProtectedPath(args.TargetFile);
        }

        if (mode === 'shell') {
            if (typeof args?.CommandLine !== 'string') {
                throw new Error('the payload has no toolCall.args.CommandLine');
            }

            return isDangerousCommand(args.CommandLine);
        }

        throw new Error(`unknown guard mode: ${mode}`);
    });

    if (!verdict) {
        // Not `allow`: Antigravity defines that as automatic approval, which would skip the permission prompt
        // the user would otherwise see. `ask` hands the call back to the normal approval flow.
        reply('ask');
    } else if (verdict.message) {
        reply('deny', verdict.message);
    } else {
        reply(verdict.decision, `${verdict.userMessage} ${verdict.agentMessage}`);
    }
} catch (error) {
    reply('deny', `The guard could not run, so the request was blocked: ${error.message}`);
}
