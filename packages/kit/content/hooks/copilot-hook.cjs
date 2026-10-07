// GitHub Copilot entry for every hook in .github/hooks/blit.json, picked by its first argument:
//   pre-tool      (preToolUse)   - the shell and protected-file guards, over guard-core.cjs
//   post-tool     (postToolUse)  - formats the files an edit tool changed, through format-file.cjs
//   session-start (sessionStart) - installs dependencies (the second argument is the install command) and
//                                  runs `blit doctor`
// The mode names are also written in content/hooks.manifest.json's `copilot` commands, which cannot import
// them; test/copilot-adapter.test.mjs runs those commands, so a rename on one side only fails the kit tests.
// Node only, so every mode runs under both the `bash` and the `powershell` command key.
//
// Copilot sends one of two payload dialects, and this file is the only place that knows them:
//   Copilot CLI, cloud agent, VS Code "Copilot" harness - {toolName, toolArgs}; toolArgs is an object or the
//     same object as a JSON string. Shell tools: bash, powershell ({command}); edit tools: edit, create ({path}).
//   VS Code "Local" harness (older, slated for removal) - {tool_name, tool_input}, with VS Code's own tool
//     names and argument keys. It may ignore the hooks file's matcher, so each dialect lists the tools it acts on.
// A tool neither dialect lists is let through and never formatted.
//
// pre-tool deny: the reason on stderr, the decision as JSON on stdout in both dialects, and exit 2 - Copilot
// denies on exit 2 whatever stdout says, and the Local harness treats exit 2 as a block that shows stderr to
// the model. Ask (force push, branch -D, stash drop): the JSON alone, exit 0; the cloud agent, with no one to
// ask, denies. Fails closed: a guarded tool whose arguments cannot be read is denied, and Copilot denies on a
// crash or any non-zero exit too. Only a hook timeout lets the call through, so the guard does no slow work.
// post-tool and session-start never fail: a formatter or install problem leaves the session as it was.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { bootstrapReport } = require('./bootstrap-core.cjs');
const { failClosed, isDangerousCommand, isProtectedPath, parsePayload, patchPaths } = require('./guard-core.cjs');
const { formatFile } = require('./format-file.cjs');

/** The one file path most VS Code Local harness edit tools name. */
const filePathOf = (args) => [args.filePath];

/** The command text of a tool that takes it in `command`. */
const commandOf = (args) => args.command;

/**
 * Each payload dialect, keyed by the field that names the tool: how its tool arguments are read, the command text
 * each shell tool runs, and the file paths each edit tool writes. The Local harness names and keys are VS Code's
 * (`extensions/copilot/src/extension/tools/common/toolNames.ts`, `extensions/copilot/package.json`, and
 * `terminalContrib/chatAgentTools` in microsoft/vscode). An extractor that finds no such shape returns a non-string
 * or throws, and the call is denied.
 */
const DIALECTS = {
    toolName: {
        args: (payload) => (typeof payload.toolArgs === 'string' ? JSON.parse(payload.toolArgs) : payload.toolArgs),
        shell: { bash: commandOf, powershell: commandOf },
        edits: {
            edit: (args) => [args.path],
            create: (args) => [args.path],
        },
    },
    tool_name: {
        args: (payload) => payload.tool_input,
        shell: {
            run_in_terminal: commandOf,
            send_to_terminal: commandOf,
            create_and_run_task: (args) => [args.task.command, ...(args.task.args ?? [])].join(' '),
        },
        edits: {
            create_file: filePathOf,
            replace_string_in_file: filePathOf,
            insert_edit_into_file: filePathOf,
            edit_notebook_file: filePathOf,
            multi_replace_string_in_file: (args) => args.replacements.map((replacement) => replacement.filePath),
            apply_patch: (args) => patchPaths(args.input),
        },
    },
};

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The tool call in a payload: its name, its arguments, and which kind of tool it is (`shell`, `edit`, or null for a
 * tool neither dialect lists). Throws on a payload that names no tool, or a listed tool with unreadable arguments.
 */
function readToolCall(payload) {
    const key = Object.keys(DIALECTS).find((field) => typeof payload[field] === 'string');

    if (key === undefined) {
        throw new Error('the payload names no tool');
    }

    const dialect = DIALECTS[key];
    const name = payload[key];
    const editPaths = Object.hasOwn(dialect.edits, name) ? dialect.edits[name] : undefined;
    const shellCommand = Object.hasOwn(dialect.shell, name) ? dialect.shell[name] : undefined;
    const kind = editPaths ? 'edit' : shellCommand ? 'shell' : null;

    if (kind === null) {
        return { name, kind };
    }

    const args = dialect.args(payload);
    if (!isObject(args)) {
        throw new Error(`the ${name} call has no readable arguments`);
    }

    if (kind === 'shell') {
        const command = shellCommand(args);
        if (typeof command !== 'string') {
            throw new Error(`the ${name} call has no command`);
        }

        return { name, kind, command };
    }

    const paths = editPaths(args);
    if (paths.length === 0 || !paths.every((file) => typeof file === 'string')) {
        throw new Error(`the ${name} call names no file`);
    }

    return { name, kind, paths };
}

const firstProtected = (paths) => paths.map(isProtectedPath).find(Boolean) ?? null;

/** Print the decision in both dialects: Copilot reads the top-level keys, the Local harness `hookSpecificOutput`. */
function reply(decision, reason) {
    const output = {
        permissionDecision: decision,
        permissionDecisionReason: reason,
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: decision,
            permissionDecisionReason: reason,
        },
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);
}

function preTool() {
    const verdict = failClosed(() => {
        const call = readToolCall(parsePayload(readFileSync(0, 'utf8')));

        if (call.kind === 'shell') {
            // A patch written through the shell (`apply_patch <<'EOF'`) is checked like an edit.
            return isDangerousCommand(call.command) ?? firstProtected(patchPaths(call.command));
        }

        return call.kind === 'edit' ? firstProtected(call.paths) : null;
    });

    if (verdict?.decision === 'ask') {
        reply('ask', verdict.userMessage);
    } else if (verdict) {
        const reason = verdict.agentMessage ? `${verdict.userMessage} ${verdict.agentMessage}` : verdict.message;

        reply('deny', reason);
        process.stderr.write(`[BLOCKED] ${reason}\n`);
        process.exit(2);
    }
}

function postTool() {
    try {
        const payload = parsePayload(readFileSync(0, 'utf8'));
        const call = readToolCall(payload);

        // A relative path is the session's; every Copilot payload carries its `cwd`.
        for (const file of call.kind === 'edit' ? call.paths : []) {
            formatFile(path.resolve(payload.cwd, file));
        }
    } catch {
        // No readable payload or edit - nothing to format.
    }
}

/**
 * Install dependencies when `node_modules` is missing, then run `blit doctor` (`bootstrap-core.cjs`), and hand the
 * report to the session as `additionalContext`. The project root is the working directory: hooks run with
 * `cwd: "."`, the repository root.
 */
function sessionStart(install) {
    let report = [];

    try {
        report = bootstrapReport(process.cwd(), install);
    } catch {
        // The bootstrap is a convenience; a failure leaves the session as it was.
    }

    if (report.length > 0) {
        process.stdout.write(`${JSON.stringify({ additionalContext: report.join('\n') })}\n`);
    }
}

const MODES = { 'pre-tool': preTool, 'post-tool': postTool, 'session-start': () => sessionStart(process.argv[3]) };
const mode = MODES[process.argv[2]];

if (mode === undefined) {
    // An unknown mode is a broken hooks file; exit 2 makes a preToolUse entry deny rather than allow.
    process.stderr.write(`[BLOCKED] Unknown blit Copilot hook mode: ${process.argv[2]}\n`);
    process.exit(2);
}

mode();
