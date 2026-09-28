// Cursor beforeShellExecution entry. Cursor's hook PATH on Windows includes Git\cmd
// (git.exe) but not Git\bin (sh.exe), so `sh script.sh` never starts and failClosed
// blocks every command with empty stdout. Node is on that PATH; this finds a POSIX
// sh and runs the shell-safety.sh argument (or the sibling script).
// .cjs so it stays CommonJS when a parent package.json sets "type": "module".

const { spawn, spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function listed(command) {
    const result = spawnSync('where.exe', [command], { encoding: 'utf8', windowsHide: true });

    return (result.stdout || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && existsSync(line));
}

function findSh() {
    if (process.platform !== 'win32') {
        return 'sh';
    }

    const onPath = listed('sh')[0];
    if (onPath) {
        return onPath;
    }

    for (const git of listed('git')) {
        const root = path.resolve(path.dirname(git), '..');
        for (const candidate of [path.join(root, 'bin', 'sh.exe'), path.join(root, 'usr', 'bin', 'sh.exe')]) {
            if (existsSync(candidate)) {
                return candidate;
            }
        }
    }

    return null;
}

function deny(message) {
    process.stdout.write(`${JSON.stringify({ permission: 'deny', user_message: message, agent_message: message })}\n`);
    process.exit(0);
}

const sh = findSh();
if (!sh) {
    deny('Shell safety hook could not run: no POSIX sh was found. Install Git for Windows or add sh to PATH.');
}

const script = process.argv[2] || path.join(__dirname, 'shell-safety.sh');
const child = spawn(sh, [script], { stdio: 'inherit', windowsHide: true });

child.on('error', (error) => {
    deny(`Shell safety hook could not run: ${error.message}`);
});

child.on('exit', (code) => {
    process.exit(code ?? 1);
});
