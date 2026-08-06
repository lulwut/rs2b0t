import { expect, test } from 'bun:test';
import { activeStatsReady } from '#/bot/adapter/ClientAdapter.js';

test('activeStatsReady rejects the login gap before the stat snapshot arrives', () => {
    const levels = new Int32Array(25);

    expect(activeStatsReady(levels)).toBe(false);

    levels.fill(1);
    expect(activeStatsReady(levels)).toBe(true);
});

test('activeStatsReady ignores unused skill slots but requires every real skill', () => {
    const levels = new Int32Array(25);
    levels.fill(1);

    levels[19] = 0;
    levels[21] = 0;
    expect(activeStatsReady(levels)).toBe(true);

    levels[20] = 0;
    expect(activeStatsReady(levels)).toBe(false);
});
