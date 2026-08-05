import { describe, expect, it } from 'vitest';

import { checkPlainJsSyntax, INJECTION_MARKER, injectSnippet, shouldInjectSnippet } from './transform';

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

describe('checkPlainJsSyntax', () => {
    it('is null for syntactically valid code in a .js module', () => {
        const code = "import { bootstrap } from 'blit386';\nbootstrap(Demo);\n";

        expect(checkPlainJsSyntax(code, '/project/src/001-basics.js')).toBeNull();
    });

    it('is null for syntactically valid code in a .mjs module', () => {
        expect(checkPlainJsSyntax('export const x = 1;\n', '/project/src/main.mjs')).toBeNull();
    });

    it('reports the syntax error and its character offset for invalid code in a .js module', () => {
        // The exact BT-318 repro: a dangling assignment.
        const result = checkPlainJsSyntax('const x = ;\n', '/project/src/001-basics.js');

        expect(result).not.toBeNull();
        expect(result?.message).toContain('Unexpected token');
        expect(result?.pos).toBe(10);
    });

    it('ignores a query suffix when matching the module id extension', () => {
        const result = checkPlainJsSyntax('const x = ;\n', '/project/src/001-basics.js?t=1700000000000');

        expect(result).not.toBeNull();
    });

    it('is null (skipped) for a .ts module even with invalid plain-JS/TypeScript-only syntax', () => {
        // Valid TypeScript, invalid as plain ES - acorn (an ES-only parser) would reject this if it
        // ran, which is exactly why .ts/.mts must be skipped rather than checked.
        const code = 'const x: number = 1;\n';

        expect(checkPlainJsSyntax(code, '/project/src/game.ts')).toBeNull();
    });

    it('is null (skipped) for a .mts module', () => {
        expect(checkPlainJsSyntax('const x: number = ;\n', '/project/src/game.mts')).toBeNull();
    });
});

describe('injectSnippet', () => {
    it('appends the marker and the literal import.meta.hot.accept() call', () => {
        const result = injectSnippet('bootstrap(Demo);\n');

        expect(result.code).toContain(INJECTION_MARKER);
        expect(result.code).toContain('import.meta.hot.accept()');
        expect(result.code).toContain('__blit386_registerHotReload(import.meta.hot)');
        expect(result.code).toContain("import { registerHotReload as __blit386_registerHotReload } from 'blit386';");
    });

    it('aliases the injected import so it never collides with an existing registerHotReload binding', () => {
        const codeWithExistingImport =
            "import { bootstrap, registerHotReload } from 'blit386';\n" +
            'if (import.meta.hot) {\n' +
            '    registerHotReload(import.meta.hot);\n' +
            '}\n' +
            'bootstrap(Demo);\n';

        const result = injectSnippet(codeWithExistingImport);
        const injectedPortion = result.code.slice(result.code.indexOf(INJECTION_MARKER));

        // Two import declarations binding the same local name - even from the same source - is a
        // SyntaxError in ES modules, so the injected import must use a different local name than the
        // entry module's own pre-existing `registerHotReload` import.
        expect(injectedPortion).toContain(
            "import { registerHotReload as __blit386_registerHotReload } from 'blit386';",
        );
        expect(injectedPortion).not.toMatch(/import\s*\{\s*registerHotReload\s*\}\s*from\s*'blit386'/);
    });

    it('marks the build as dev via globalThis.__BLIT386_DEV__, unconditionally on import.meta.hot', () => {
        const result = injectSnippet('bootstrap(Demo);\n');
        const injectedPortion = result.code.slice(result.code.indexOf(INJECTION_MARKER));
        const devMarkerIndex = injectedPortion.indexOf('globalThis.__BLIT386_DEV__ = true;');
        const hotGuardIndex = injectedPortion.indexOf('if (import.meta.hot)');

        expect(devMarkerIndex).toBeGreaterThan(-1);
        expect(devMarkerIndex).toBeLessThan(hotGuardIndex);
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
