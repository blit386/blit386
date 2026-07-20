import { describe, expect, it } from 'vitest';

import { INJECTION_MARKER, injectSnippet, shouldInjectSnippet } from './transform';

const INCLUDE_ALL = () => true;
const INCLUDE_NONE = () => false;

describe('shouldInjectSnippet', () => {
    const validCode = "import { bootstrap } from 'blit386';\nbootstrap(Demo);\n";

    it('is true for code matching include, calling bootstrap(), and importing from blit386', () => {
        expect(shouldInjectSnippet(validCode, '/project/src/main.ts', INCLUDE_ALL)).toBe(true);
    });

    it('is false when include rejects the id', () => {
        expect(shouldInjectSnippet(validCode, '/project/src/main.ts', INCLUDE_NONE)).toBe(false);
    });

    it('is false when code has no bootstrap( call', () => {
        const code = "import { BT } from 'blit386';\nBT.init();\n";

        expect(shouldInjectSnippet(code, '/project/src/main.ts', INCLUDE_ALL)).toBe(false);
    });

    it('is false when code does not import from blit386', () => {
        expect(shouldInjectSnippet('bootstrap(Demo);\n', '/project/src/main.ts', INCLUDE_ALL)).toBe(false);
    });

    it('accepts a double-quoted blit386 import', () => {
        const code = 'import { bootstrap } from "blit386";\nbootstrap(Demo);\n';

        expect(shouldInjectSnippet(code, '/project/src/main.ts', INCLUDE_ALL)).toBe(true);
    });

    it('is false (idempotent) once the marker is already present', () => {
        const injected = injectSnippet(validCode).code;

        expect(shouldInjectSnippet(injected, '/project/src/main.ts', INCLUDE_ALL)).toBe(false);
    });
});

describe('injectSnippet', () => {
    it('appends the marker and the literal import.meta.hot.accept() call', () => {
        const result = injectSnippet('bootstrap(Demo);\n');

        expect(result.code).toContain(INJECTION_MARKER);
        expect(result.code).toContain('import.meta.hot.accept()');
        expect(result.code).toContain('registerHotReload(import.meta.hot)');
        expect(result.code).toContain("import { registerHotReload } from 'blit386';");
    });

    it('appends after the original code rather than prepending', () => {
        const result = injectSnippet('bootstrap(Demo);\n');

        expect(result.code.indexOf('bootstrap(Demo)')).toBeLessThan(result.code.indexOf(INJECTION_MARKER));
    });

    it('produces a sourcemap', () => {
        const result = injectSnippet('bootstrap(Demo);\n');

        expect(result.map).toBeDefined();
        expect(result.map.mappings.length).toBeGreaterThan(0);
    });
});
