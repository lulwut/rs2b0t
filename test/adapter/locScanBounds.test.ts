import { describe, expect, test } from 'bun:test';
import { scanBounds } from '#/bot/adapter/ClientAdapter.js';

const LAST = 103; // SCENE_SIZE - 1

describe('scanBounds', () => {
    test('no bound scans the whole axis', () => {
        expect(scanBounds(50)).toEqual([0, LAST]);
        expect(scanBounds(50, Infinity)).toEqual([0, LAST]);
    });

    test('a bound is a window either side of the player', () => {
        expect(scanBounds(50, 10)).toEqual([40, 60]);
        expect(scanBounds(50, 0)).toEqual([50, 50]);
    });

    test('the window clamps to the scene at both edges', () => {
        expect(scanBounds(3, 10)).toEqual([0, 13]);
        expect(scanBounds(100, 10)).toEqual([90, LAST]);
        expect(scanBounds(50, 1000)).toEqual([0, LAST]);
    });

    // a negative radius must not invert the range and scan nothing silently
    test('a negative bound degenerates to the player tile', () => {
        expect(scanBounds(50, -5)).toEqual([50, 50]);
    });

    test('a fractional bound does not widen the window', () => {
        expect(scanBounds(50, 10.9)).toEqual([40, 60]);
    });
});
