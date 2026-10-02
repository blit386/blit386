// Claude Code PreToolUse hook: stops the assistant from hand-editing lock files and .env files.
// A lock file is written by the package manager (an install rewrites it correctly); a hand edit
// breaks the next install. A .env file holds secrets the assistant should not read back or rewrite.
// Exit code 2 blocks the edit and shows the message to the assistant.
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { readFileSync } = require('node:fs');
const path = require('node:path');

const LOCK_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);

/** `.env` and `.env.local`, but not `.env.example` - that one is a template meant to be edited. */
const isEnvFile = (name) => (name === '.env' || name.startsWith('.env.')) && name !== '.env.example';

let file = '';
try {
    file = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path ?? '';
} catch {
    // No readable payload - nothing to protect.
}

const name = typeof file === 'string' ? path.basename(file) : '';

if (LOCK_FILES.has(name)) {
    process.stderr.write(
        `[BLOCKED] ${name} is written by the package manager. Change package.json and run an install instead.\n`,
    );
    process.exit(2);
}

if (isEnvFile(name)) {
    process.stderr.write(`[BLOCKED] ${name} holds secrets. Ask the user to edit it by hand.\n`);
    process.exit(2);
}
