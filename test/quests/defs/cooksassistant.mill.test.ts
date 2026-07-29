import { beforeEach, describe, expect, mock, test } from 'bun:test';

type FillMode = 'success' | 'already-loaded' | 'silent' | 'reject';
type ControlsMode = 'success' | 'bin-full' | 'empty' | 'silent' | 'reject';
type BinMode = 'success' | 'silent' | 'reject';

let held: Map<string, number>;
let floor: number;
let walks: number[];
let fillMode: FillMode;
let controlsMode: ControlsMode;
let binMode: BinMode;
let fillClicks: number;
let controlsClicks: number;
let binClicks: number;
let controlsAvailable: boolean;
let restoreControlsAfterPolls: number;
let messages: string[];

const count = (name: string): number => held.get(name.toLowerCase()) ?? 0;
const setCount = (name: string, amount: number): void => {
    held.set(name.toLowerCase(), amount);
};
const say = (text: string): void => {
    messages.push(text);
};

mock.module('#/bot/events/gameMessages.js', () => ({
    GameMessages: {
        mark: () => messages.length,
        sawSince: (mark: number, pattern: RegExp) => messages.slice(mark).some(text => pattern.test(text))
    }
}));

mock.module('#/bot/api/Execution.js', () => ({
    Execution: {
        delayUntil: async (fn: () => boolean): Promise<boolean> => {
            for (let i = 0; i < 20; i++) {
                if (fn()) {
                    return true;
                }
                if (restoreControlsAfterPolls > 0 && --restoreControlsAfterPolls === 0) {
                    controlsAvailable = true;
                }
            }
            return false;
        },
        delayTicks: async (): Promise<void> => {}
    }
}));

mock.module('#/bot/api/hud/Inventory.js', () => ({
    Inventory: {
        count,
        contains: (name: string) => count(name) > 0,
        first: (name: string) => {
            if (name.toLowerCase() !== 'grain' || count('Grain') === 0) {
                return null;
            }
            return {
                useOn: async (): Promise<boolean> => {
                    fillClicks++;
                    if (fillMode === 'reject') {
                        return false;
                    }
                    if (fillMode === 'success') {
                        setCount('Grain', count('Grain') - 1);
                        say('You put the grain in the hopper.');
                    } else if (fillMode === 'already-loaded') {
                        say('There is already grain in the hopper.');
                    }
                    return true;
                }
            };
        }
    }
}));

mock.module('#/bot/api/Traversal.js', () => ({
    Traversal: {
        walkResilient: async (dest: { level: number }): Promise<boolean> => {
            floor = dest.level;
            walks.push(floor);
            return true;
        }
    }
}));

mock.module('#/bot/api/queries/Locs.js', () => ({
    Locs: {
        query: () => {
            let wanted = '';
            const nearest = () => {
                if (wanted === 'Hopper' && floor === 2) {
                    return {};
                }
                if (wanted === 'Hopper controls' && floor === 2 && controlsAvailable) {
                    return {
                        interact: async (): Promise<boolean> => {
                            controlsClicks++;
                            if (controlsMode === 'reject') {
                                return false;
                            }
                            controlsAvailable = false;
                            restoreControlsAfterPolls = 2;
                            if (controlsMode === 'success') {
                                say('You operate the hopper. The grain slides down the chute.');
                            } else if (controlsMode === 'bin-full') {
                                say('The flour bin downstairs is full, I should empty it first.');
                            } else if (controlsMode === 'empty') {
                                say('You operate the empty hopper. Nothing interesting happens.');
                            }
                            return true;
                        }
                    };
                }
                if (wanted === 'Flour bin' && floor === 0) {
                    return {
                        interact: async (): Promise<boolean> => {
                            binClicks++;
                            if (binMode === 'reject') {
                                return false;
                            }
                            if (binMode === 'success') {
                                setCount('Pot', count('Pot') - 1);
                                setCount('Pot of flour', count('Pot of flour') + 1);
                            }
                            return true;
                        }
                    };
                }
                return null;
            };
            const chain = {
                name: (name: string) => {
                    wanted = name;
                    return chain;
                },
                action: () => chain,
                within: () => chain,
                nearest,
                exists: () => nearest() !== null
            };
            return chain;
        }
    }
}));

const { millFlour } = await import('#/bot/quests/defs/cooksassistant.js');

beforeEach(() => {
    held = new Map([
        ['pot', 1],
        ['grain', 1]
    ]);
    floor = 0;
    walks = [];
    fillMode = 'success';
    controlsMode = 'success';
    binMode = 'success';
    fillClicks = 0;
    controlsClicks = 0;
    binClicks = 0;
    controlsAvailable = true;
    restoreControlsAfterPolls = 0;
    messages = [];
});

describe('Cook’s Assistant flour mill confirmations', () => {
    test('waits for every confirmed transition and collects the flour', async () => {
        expect(await millFlour(() => {})).toBe(true);
        expect(walks).toEqual([2, 0]);
        expect([fillClicks, controlsClicks, binClicks]).toEqual([1, 1, 1]);
        expect(count('Grain')).toBe(0);
        expect(count('Pot of flour')).toBe(1);
    });

    test('does not operate the controls when loading the hopper is unconfirmed', async () => {
        fillMode = 'silent';
        expect(await millFlour(() => {})).toBe(false);
        expect(walks).toEqual([2]);
        expect(controlsClicks).toBe(0);
    });

    test('recovers when grain was already waiting in the hopper', async () => {
        fillMode = 'already-loaded';
        controlsMode = 'bin-full';
        expect(await millFlour(() => {})).toBe(true);
        expect(count('Grain')).toBe(1);
        expect(count('Pot of flour')).toBe(1);
    });

    test('does not go downstairs when the controls report an empty hopper', async () => {
        controlsMode = 'empty';
        expect(await millFlour(() => {})).toBe(false);
        expect(walks).toEqual([2]);
        expect(binClicks).toBe(0);
    });

    test('requires the pot of flour to appear after emptying the bin', async () => {
        binMode = 'silent';
        expect(await millFlour(() => {})).toBe(false);
        expect(walks).toEqual([2, 0]);
        expect(count('Pot of flour')).toBe(0);
    });
});
