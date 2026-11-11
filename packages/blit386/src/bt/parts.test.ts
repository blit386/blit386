/**
 * `BLIT386.ts` merges the `src/bt/` parts into `BT` by spreading their property descriptors, so a member defined in two
 * parts would silently keep only the later one. These tests keep every member in exactly one part.
 */

import { describe, expect, it } from 'vitest';

import { BT } from '../BLIT386';
import { audio } from './audio';
import { buttons } from './buttons';
import { camera } from './camera';
import { constants } from './constants';
import { draw } from './draw';
import { effects } from './effects';
import { lifecycle } from './lifecycle';
import { palette } from './palette';
import { pointer } from './pointer';

const PARTS = { constants, lifecycle, audio, palette, effects, draw, camera, pointer, buttons };

describe('BT parts', () => {
    it('define each member in exactly one part', () => {
        const owners = new Map<string, string[]>();

        for (const [partName, part] of Object.entries(PARTS)) {
            for (const member of Object.keys(part)) {
                owners.set(member, [...(owners.get(member) ?? []), partName]);
            }
        }

        const duplicates = [...owners].filter(([, parts]) => parts.length > 1);

        expect(duplicates).toEqual([]);
    });

    it('are all merged into BT, getters as getters', () => {
        const partMembers = Object.values(PARTS).flatMap((part) => Object.keys(part));

        expect(Object.keys(BT).sort()).toEqual([...partMembers].sort());
        expect(typeof Object.getOwnPropertyDescriptor(BT, 'displaySize')?.get).toBe('function');
    });
});
