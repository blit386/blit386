import { readFileSync, writeFileSync } from 'node:fs';

const CONFIG_PATH = 'dist/server/wrangler.json';
const REQUIRED_FLAG = 'nodejs_compat';

const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

if (!Array.isArray(config.compatibility_flags)) {
    config.compatibility_flags = [];
}

if (!config.compatibility_flags.includes(REQUIRED_FLAG)) {
    config.compatibility_flags.push(REQUIRED_FLAG);
}

writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
