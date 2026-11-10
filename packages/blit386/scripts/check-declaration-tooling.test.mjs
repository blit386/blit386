import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DRIFT_WARNING_PATTERNS,
    extractBtDeclarationBlock,
    findAlignmentFailures,
    findDriftWarnings,
    findMissingBtDeclarationMembers,
    findMissingViteDeclarationMembers,
    findUnexportedDeclarations,
    findViteDeclarationSizeFailure,
    INTERNAL_BASE_CLASSES,
    REQUIRED_BT_DECLARATION_MEMBERS,
    REQUIRED_VITE_DECLARATION_MEMBERS,
    validateDeclarationTooling,
} from './check-declaration-tooling.mjs';

describe('check-declaration-tooling', () => {
    it('exports at least one drift warning pattern', () => {
        assert.ok(DRIFT_WARNING_PATTERNS.length > 0);
    });

    it('detects known drift warning substrings', () => {
        const log = 'WARNING: TypeScript version used for analysis is different from the compiler version';
        const warnings = findDriftWarnings(log);
        assert.equal(warnings.length, 1);
    });

    it('passes a clean alignment log', () => {
        const log =
            '[vite:dts] Analysis will use the bundled TypeScript version 5.9.3\n[vite:dts] Declaration files built';
        assert.deepEqual(findDriftWarnings(log), []);
        assert.deepEqual(findAlignmentFailures(log, '5.9.3'), []);
    });

    it('fails when bundled TypeScript version does not match workspace pin', () => {
        const log = 'Analysis will use the bundled TypeScript version 6.0.3';
        const failures = findAlignmentFailures(log, '5.9.3');
        assert.equal(failures.length, 1);
        assert.match(failures[0], /does not match workspace pin/);
    });

    it('fails when alignment log line is missing', () => {
        const failures = findAlignmentFailures('built in 1200ms', '5.9.3');
        assert.equal(failures.length, 1);
        assert.match(failures[0], /was not found/);
    });

    it('validateDeclarationTooling skips output file when disabled', () => {
        const log = 'Analysis will use the bundled TypeScript version 5.9.3';
        const failures = validateDeclarationTooling(log, { requireOutputFile: false });
        assert.deepEqual(failures, []);
    });

    it('findMissingBtDeclarationMembers fails when requestedBackend is absent', () => {
        const dts = 'declare namespace BT { readonly activeBackend: Backend | null; }';
        const failures = findMissingBtDeclarationMembers(dts);
        assert.equal(failures.length, 1);
        assert.match(failures[0], /requestedBackend/);
    });

    it('findMissingBtDeclarationMembers passes when required getters are present', () => {
        const dts = [
            'declare namespace BT {',
            '  readonly requestedBackend: Backend | null;',
            '  readonly activeBackend: Backend | null;',
            '}',
        ].join('\n');
        assert.deepEqual(findMissingBtDeclarationMembers(dts), []);
    });

    it('findMissingBtDeclarationMembers ignores similarly named members outside BT', () => {
        const dts = [
            'interface Other { readonly requestedBackend: string; readonly activeBackend: string; }',
            'export declare const BT: { readonly ticks: number; };',
        ].join('\n');
        const failures = findMissingBtDeclarationMembers(dts);
        assert.equal(failures.length, REQUIRED_BT_DECLARATION_MEMBERS.length);
        assert.ok(failures.every((message) => message.includes('missing BT getter')));
    });

    it('extractBtDeclarationBlock reads export declare const BT object type', () => {
        const dts = 'export declare const BT: { readonly ticks: number; };';
        assert.equal(extractBtDeclarationBlock(dts), '{ readonly ticks: number; }');
    });

    it('extractBtDeclarationBlock joins the parts of a BT typed as an intersection of typeof parts', () => {
        const dts = [
            'export declare const BT: typeof constants & typeof lifecycle;',
            'declare const constants: { readonly FLIP_H: number; };',
            'declare const lifecycle: { readonly activeBackend: Backend | null; };',
        ].join('\n');
        assert.equal(
            extractBtDeclarationBlock(dts),
            '{ readonly FLIP_H: number; }\n{ readonly activeBackend: Backend | null; }',
        );
    });

    it('extractBtDeclarationBlock returns null when a typeof part is missing', () => {
        const dts =
            'export declare const BT: typeof constants & typeof lifecycle;\ndeclare const constants: { a: 1; };';
        assert.equal(extractBtDeclarationBlock(dts), null);
    });

    it('findViteDeclarationSizeFailure passes for a real-sized declaration file', () => {
        assert.deepEqual(findViteDeclarationSizeFailure(3370), []);
    });

    it('findViteDeclarationSizeFailure fails for a collapsed export {} stub', () => {
        const failures = findViteDeclarationSizeFailure(12);
        assert.equal(failures.length, 1);
        assert.match(failures[0], /12 bytes/);
        assert.match(failures[0], /stub/);
    });

    it('findMissingViteDeclarationMembers passes when the plugin factory export is present', () => {
        const dts = 'export declare function blit386(options?: Blit386PluginOptions): Plugin_2;';
        assert.deepEqual(findMissingViteDeclarationMembers(dts), []);
    });

    it('findMissingViteDeclarationMembers fails when the plugin factory export is absent', () => {
        const dts = 'export declare function unrelated(): void;';
        const failures = findMissingViteDeclarationMembers(dts);
        assert.equal(failures.length, REQUIRED_VITE_DECLARATION_MEMBERS.length);
        assert.match(failures[0], /blit386/);
    });

    it('findMissingViteDeclarationMembers ignores similarly named functions', () => {
        const dts = 'export declare function blit386Helper(): void;';
        const failures = findMissingViteDeclarationMembers(dts);
        assert.equal(failures.length, 1);
        assert.match(failures[0], /missing export: blit386/);
    });

    it('validateDeclarationTooling skips both declaration output files when disabled', () => {
        const log =
            '[vite:dts] Analysis will use the bundled TypeScript version 5.9.3\n[vite:dts] Declaration files built';
        const failures = validateDeclarationTooling(log, { requireOutputFile: false });
        assert.deepEqual(failures, []);
    });
});

describe('findUnexportedDeclarations', () => {
    it('reports a type a public signature uses but the rollup does not export', () => {
        const dts = [
            'declare interface Hidden {',
            '    x: number;',
            '}',
            'export declare function use(h: Hidden): void;',
            'export { }',
        ].join('\n');

        assert.deepEqual(findUnexportedDeclarations(dts), [
            'dist/blit386.d.ts declares Hidden, which a public signature uses, but does not export it',
        ]);
    });

    it('accepts exported types, abstract classes, enums, and names in an export list', () => {
        const dts = [
            'export declare type A = number;',
            'export declare abstract class B {}',
            'export declare enum C { D }',
            'declare type E = string;',
            'export { E, E as F }',
        ].join('\n');

        assert.deepEqual(findUnexportedDeclarations(dts), []);
    });

    it('ignores unexported values, which only back typeof references', () => {
        const dts = ['declare const LAYOUTS: readonly ["a"];', 'declare function blip(seed?: number): void;'].join(
            '\n',
        );

        assert.deepEqual(findUnexportedDeclarations(dts), []);
    });

    it('allows the inheritance-only base classes', () => {
        const dts = INTERNAL_BASE_CLASSES.map((name) => `declare abstract class ${name} {}`).join('\n');

        assert.deepEqual(findUnexportedDeclarations(dts), []);
    });
});
