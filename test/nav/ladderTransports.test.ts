import { describe, expect, test } from 'bun:test';

import type { TransportEdgeData } from '#/bot/nav/PathFinder.js';
import stairs from '#/bot/nav/data/stairEdges.json';
import transports from '#/bot/nav/data/transports.json';

const transportEdges = transports as TransportEdgeData[];
const stairEdges = stairs as TransportEdgeData[];
const all = [...transportEdges, ...stairEdges];

describe('LostCity ladder transport data', () => {
    test('includes all four Mining Guild entrances and matching exits', () => {
        const surfaceLocs = new Set(['3018,3339', '3019,3338', '3019,3340', '3020,3339']);
        const undergroundLocs = new Set(['3018,9739', '3019,9738', '3019,9740', '3020,9739']);

        const entrances = transportEdges.filter(edge => edge.locId === 2113 && !edge.disabledReason);
        const exits = transportEdges.filter(edge => edge.locId === 1755 && undergroundLocs.has(`${edge.locX},${edge.locZ}`) && !edge.disabledReason);

        expect(new Set(entrances.map(edge => `${edge.locX},${edge.locZ}`))).toEqual(surfaceLocs);
        expect(new Set(exits.map(edge => `${edge.locX},${edge.locZ}`))).toEqual(undergroundLocs);
        expect(entrances.every(edge => edge.kind === 'dungeon' && edge.to.z - edge.from.z === 6400)).toBe(true);
        expect(exits.every(edge => edge.kind === 'dungeon' && edge.from.z - edge.to.z === 6400)).toBe(true);
    });

    test('does not route through LostCity ladders that cannot be traversed', () => {
        const broken = all.filter(edge => edge.locId === 1752);
        const untrustedShipLadder = all.filter(edge => edge.locId === 287);

        expect(broken).not.toHaveLength(0);
        expect(untrustedShipLadder).not.toHaveLength(0);
        expect([...broken, ...untrustedShipLadder].every(edge => Boolean(edge.disabledReason))).toBe(true);
    });

    test('uses dungeon semantics for active same-plane ladder teleports', () => {
        const samePlaneLadders = all.filter(edge => edge.debugName?.includes('ladder') && edge.from.level === edge.to.level && !edge.disabledReason);
        expect(samePlaneLadders).not.toHaveLength(0);
        expect(samePlaneLadders.every(edge => edge.kind === 'dungeon')).toBe(true);
    });
});
