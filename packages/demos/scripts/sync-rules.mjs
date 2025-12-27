/**
 * Sync AI assistant rules across different tools.
 *
 * Reads master rules from ai-rules/*.mdc files and generates tool-specific
 * configuration files. Configuration is read from the package.json "syncRules" field.
 *
 * Supported targets:
 * - cursor:   .cursor/rules/*.mdc (copies with frontmatter)
 * - webstorm: .aiassistant/rules/*.md (strips frontmatter)
 * - zed:      .rules (combined markdown)
 * - claude:   CLAUDE.md (combined markdown)
 *
 * Usage:
 *   pnpm sync-rules         # Sync rules based on package.json config
 *   pnpm sync-rules --help  # Show help
 *
 * @see https://docs.cursor.com/context/rules
 * @see https://www.jetbrains.com/help/ai-assistant/configure-project-rules.html
 * @see https://zed.dev/docs/ai/rules
 * @see https://claude.com/blog/using-claude-md-files
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');

const TARGETS = {
    cursor: {
        description: '.cursor/rules/*.mdc',
        generate: generateCursor,
    },
    webstorm: {
        description: '.aiassistant/rules/*.md',
        generate: generateWebStorm,
    },
    zed: {
        description: '.rules',
        generate: generateZed,
    },
    claude: {
        description: 'CLAUDE.md',
        generate: generateClaude,
    },
};

/**
 * Shows help message and exits.
 */
function showHelp() {
    const targetList = Object.entries(TARGETS)
        .map(([name, { description }]) => `  - ${name}: ${description}`)
        .join('\n');

    console.log(`
Usage: pnpm sync-rules [--help]

Syncs AI assistant rules from ai-rules/*.mdc to tool-specific locations.
Configuration is read from package.json "syncRules" field.

Targets:
${targetList}

Configuration example in package.json:
  "syncRules": {
    "source": "ai-rules",
    "targets": {
      "cursor": true,
      "webstorm": true,
      "zed": true,
      "claude": true
    }
  }
`);
    process.exit(0);
}

/**
 * Loads and validates configuration from package.json.
 * Throws if the configuration is missing or invalid.
 *
 * @returns {{ source: string, targets: string[] }} Validated configuration.
 */
function loadConfig() {
    const packageJsonPath = join(ROOT_DIR, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // noinspection JSUnresolvedReference
    if (!packageJson.syncRules) {
        throw new Error('Missing "syncRules" configuration in package.json');
    }

    const { source, targets } = packageJson.syncRules;

    if (!source || typeof source !== 'string') {
        throw new Error('Missing or invalid "syncRules.source" in package.json');
    }

    if (!targets || typeof targets !== 'object') {
        throw new Error('Missing or invalid "syncRules.targets" in package.json');
    }

    // Filter enabled targets and validate they exist
    const enabledTargets = Object.entries(targets)
        .filter(([, enabled]) => enabled)
        .map(([name]) => {
            if (!TARGETS[name]) {
                throw new Error(`Unknown target "${name}" in syncRules.targets`);
            }
            return name;
        });

    if (enabledTargets.length === 0) {
        throw new Error('No targets enabled in syncRules.targets');
    }

    return { source, targets: enabledTargets };
}

/**
 * Reads all .mdc files from the source directory.
 *
 * @param {string} sourceDir - Source directory relative to root.
 * @returns {Array<{ name: string, filename: string, content: string, contentClean: string }>}
 */
function readSourceRules(sourceDir) {
    const rulesDir = join(ROOT_DIR, sourceDir);
    const files = readdirSync(rulesDir);
    const mdcFiles = files.filter((file) => file.endsWith('.mdc'));

    if (mdcFiles.length === 0) {
        throw new Error(`No .mdc files found in ${sourceDir}/`);
    }

    return mdcFiles.map((file) => {
        const content = readFileSync(join(rulesDir, file), 'utf-8');
        const name = file.replace('.mdc', '');

        // Strip YAML frontmatter (between --- markers) for tools that don't support it
        const contentClean = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

        return { name, filename: file, content, contentClean };
    });
}

/**
 * Writes content to a file and logs the action.
 *
 * @param {string} filePath - Absolute path to write to.
 * @param {string} content - Content to write.
 * @param {string} displayPath - Path to display in logs.
 */
function writeRuleFile(filePath, content, displayPath) {
    writeFileSync(filePath, content, 'utf-8');
    console.log(`   - ${displayPath}`);
}

/**
 * Combines all rule files into a single Markdown document.
 *
 * @param {Array<{ contentClean: string }>} rules - Rule files to combine.
 * @returns {string} Combined Markdown.
 */
function combineRules(rules) {
    const header = `# Project Rules

> Auto-generated from ai-rules/*.mdc files.
> To update, edit the source files and run: \`pnpm sync-rules\`

---

`;
    const combined = rules.map((rule) => rule.contentClean.trim()).join('\n\n---\n\n');
    return header + combined;
}

/**
 * Generates Cursor rules: .cursor/rules/*.mdc
 * Copies files as-is since Cursor uses the same .mdc format with frontmatter.
 */
function generateCursor(rules) {
    const dir = join(ROOT_DIR, '.cursor', 'rules');
    mkdirSync(dir, { recursive: true });

    for (const rule of rules) {
        writeRuleFile(join(dir, rule.filename), rule.content, `.cursor/rules/${rule.filename}`);
    }
}

/**
 * Generates WebStorm rules: .aiassistant/rules/*.md
 * Strips frontmatter since WebStorm uses plain Markdown.
 */
function generateWebStorm(rules) {
    const dir = join(ROOT_DIR, '.aiassistant', 'rules');
    mkdirSync(dir, { recursive: true });

    for (const rule of rules) {
        writeRuleFile(join(dir, `${rule.name}.md`), rule.contentClean.trim(), `.aiassistant/rules/${rule.name}.md`);
    }
}

/**
 * Generates Zed rules: .rules
 * Creates a single combined Markdown file at the project root.
 */
function generateZed(rules) {
    writeRuleFile(join(ROOT_DIR, '.rules'), combineRules(rules), '.rules');
}

/**
 * Generates Claude Code rules: CLAUDE.md
 * Creates a single combined Markdown file at the project root.
 */
function generateClaude(rules) {
    writeRuleFile(join(ROOT_DIR, 'CLAUDE.md'), combineRules(rules), 'CLAUDE.md');
}

/**
 * Main entry point.
 */
function main() {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        showHelp();
    }

    console.log('Syncing AI assistant rules...\n');

    const config = loadConfig();

    console.log(`Source: ${config.source}/`);
    console.log(`Targets: ${config.targets.join(', ')}\n`);

    // Read source rules
    console.log(`1. Reading source rules from ${config.source}/*.mdc`);
    const rules = readSourceRules(config.source);
    console.log(`   Found ${rules.length} files: ${rules.map((r) => r.name).join(', ')}\n`);

    // Generate each target
    let step = 2;
    for (const targetName of config.targets) {
        const target = TARGETS[targetName];
        console.log(`${step}. Generating ${target.description}`);
        target.generate(rules);
        step++;
    }

    // Summary
    console.log('\nDone! Rules synced successfully.');
    console.log('\nGenerated:');
    for (const targetName of config.targets) {
        console.log(`  - ${TARGETS[targetName].description}`);
    }
    console.log(`\nSource of truth: ${config.source}/*.mdc`);
}

main();
