import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCliArgs } from '../cli-args.mjs';

const OPTIONS = { out: { type: 'string' }, force: { type: 'boolean' } };

describe('parseCliArgs', () => {
    it('drops the leading -- pnpm forwards, so the flags after it still parse', () => {
        const { values, positionals } = parseCliArgs(['--', '--force', 'basics'], OPTIONS, true);

        // node:util returns `values` with a null prototype, so compare a plain copy.
        assert.deepEqual({ ...values }, { force: true });
        assert.deepEqual(positionals, ['basics']);
    });

    it('refuses a following option as a value', () => {
        assert.throws(() => parseCliArgs(['--out', '--force'], OPTIONS), /^Error: --out requires a value\.$/);
        assert.throws(() => parseCliArgs(['--out'], OPTIONS), /--out requires a value/);
    });

    it('names an unknown option', () => {
        assert.throws(() => parseCliArgs(['--bogus'], OPTIONS), /^Error: Unknown option --bogus$/);
    });

    it('keeps node errors it does not reword', () => {
        assert.throws(() => parseCliArgs(['--force=yes'], OPTIONS), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' });
        assert.throws(() => parseCliArgs(['basics'], OPTIONS), { code: 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL' });
    });
});
