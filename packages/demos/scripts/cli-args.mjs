/**
 * Argument parsing shared by the capture scripts: `node:util` `parseArgs` in strict mode, after
 * dropping the leading `--` that `pnpm run <script> -- <args>` forwards (left in, it would end
 * option parsing and turn every flag after it into a positional).
 *
 * Strict mode already refuses the case the scripts used to guard by hand: `--out --force` throws
 * instead of writing every card into a directory named "--force". The two common errors are
 * reworded into the scripts' own short form; anything else keeps node's message.
 */
import { parseArgs } from 'node:util';

import { PNPM_ARG_SEPARATOR } from '../../../scripts/lib/pnpm-arg-separator.mjs';

// Node's "Option '--out <value>' argument missing" and "Option '--out' argument is ambiguous".
const MISSING_VALUE_PATTERN = /argument (?:missing|is ambiguous)/u;
const OPTION_NAME_PATTERN = /'(-{1,2}[^' ]+)/u;

/**
 * @param {string[]} argv Arguments after the script name.
 * @param {import('node:util').ParseArgsConfig['options']} options Option definitions.
 * @param {boolean} [allowPositionals] Accept positional arguments (a demo slug).
 * @returns {{ values: Record<string, string | boolean | undefined>, positionals: string[] }}
 * @throws {Error} On an unknown option, an option missing its value, or an unexpected positional.
 */
export function parseCliArgs(argv, options, allowPositionals = false) {
    const args = argv[0] === PNPM_ARG_SEPARATOR ? argv.slice(1) : argv;

    try {
        return parseArgs({ args, options, strict: true, allowPositionals });
    } catch (error) {
        const option = error.message.match(OPTION_NAME_PATTERN)?.[1];

        if (error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
            throw new Error(`Unknown option ${option}`, { cause: error });
        }

        if (error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && MISSING_VALUE_PATTERN.test(error.message)) {
            throw new Error(`${option} requires a value.`, { cause: error });
        }

        throw error;
    }
}
