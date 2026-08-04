import { describe, expect, test } from 'bun:test';
import { LoopingBot, TaskBot, type Task } from '#/bot/api/Bot.js';
import { PER_TICK, asCadence, type LoopCadence } from '#/bot/api/LoopCadence.js';
import { loopDue } from '#/bot/runtime/Scheduler.js';
import { ScriptContext, type LoopDue } from '#/bot/runtime/ScriptContext.js';

class Plain extends LoopingBot {
    override loop(): void {}
}

describe('loopDue', () => {
    test('a frame cadence is due whenever the pump runs', () => {
        expect(loopDue({ kind: 'frame' }, 0, 0)).toBe(true);
        expect(loopDue({ kind: 'frame' }, 1e9, 500)).toBe(true);
    });

    test('a tick cadence waits for the observed tick counter, not the clock', () => {
        const due: LoopDue = { kind: 'tick', dueTick: 10, staleAt: 3000 };
        expect(loopDue(due, 0, 9)).toBe(false);
        // wall-clock passing inside the grace window does not make it due
        expect(loopDue(due, 2999, 9)).toBe(false);
        expect(loopDue(due, 0, 10)).toBe(true);
        // ticks can be missed under load; catching up late still fires
        expect(loopDue(due, 0, 14)).toBe(true);
    });

    // tickCount only advances on PLAYER_INFO. A dropped socket, a lag spike, or
    // no client attached at all must not freeze the script until StallGuard's
    // 15-minute restart — past the backstop it runs on stale state, exactly as
    // the wall-clock pacing this replaced always did.
    test('a starved tick cadence falls back to the clock', () => {
        const due: LoopDue = { kind: 'tick', dueTick: 10, staleAt: 3000 };
        expect(loopDue(due, 3000, 0)).toBe(true);
        expect(loopDue(due, 10_000, 0)).toBe(true);
    });

    test('a time cadence waits for the clock, not for ticks', () => {
        const due: LoopDue = { kind: 'time', dueAt: 1000 };
        expect(loopDue(due, 999, 9999)).toBe(false);
        expect(loopDue(due, 1000, 0)).toBe(true);
    });
});

describe('asCadence', () => {
    test('a returned number is legacy wall-clock ms', () => {
        expect(asCadence(600, PER_TICK)).toEqual({ kind: 'time', ms: 600 });
    });

    test('returning nothing falls back to the bot cadence', () => {
        expect(asCadence(undefined, PER_TICK)).toBe(PER_TICK);
    });

    test('a returned cadence overrides the bot cadence', () => {
        const frame: LoopCadence = { kind: 'frame' };
        expect(asCadence(frame, PER_TICK)).toBe(frame);
    });

    // 0 is 'as soon as possible' and several scripts rely on it
    test('a returned 0 stays a zero-length delay, not a fallback', () => {
        expect(asCadence(0, PER_TICK)).toEqual({ kind: 'time', ms: 0 });
    });
});

describe('bot defaults', () => {
    test('a script that states no cadence rides the server tick', () => {
        const bot = new Plain();
        expect(bot.cadence).toEqual({ kind: 'server-tick', ticks: 1 });
        expect(bot.loopDelay).toBeNull();
    });
});

describe('TaskBot cadence', () => {
    class Probe extends TaskBot {
        ran: string[] = [];

        constructor(...tasks: (Task & { name: string })[]) {
            super();
            this.add(
                ...tasks.map(t => ({
                    ...t,
                    execute: () => {
                        this.ran.push(t.name);
                    }
                }))
            );
        }
    }

    test('the executed task states the cadence for its iteration', async () => {
        const bot = new Probe({
            name: 'urgent',
            validate: () => true,
            execute: () => {},
            cadence: { kind: 'frame' }
        });

        expect(await bot.loop()).toEqual({ kind: 'frame' });
        expect(bot.ran).toEqual(['urgent']);
    });

    test('a task with no cadence falls through to the bot cadence', async () => {
        const bot = new Probe({ name: 'plain', validate: () => true, execute: () => {} });

        expect(asCadence(await bot.loop(), bot.cadence)).toBe(bot.cadence);
    });

    // only the first passing task runs, so only its cadence can apply
    test('a skipped task cannot set the cadence', async () => {
        const bot = new Probe(
            { name: 'skipped', validate: () => false, execute: () => {}, cadence: { kind: 'frame' } },
            { name: 'ran', validate: () => true, execute: () => {} }
        );

        expect(await bot.loop()).toBeUndefined();
        expect(bot.ran).toEqual(['ran']);
    });
});

describe('pause/resume', () => {
    test('a wall-clock due date is pushed by the time spent paused', () => {
        const ctx = new ScriptContext();
        ctx.nextLoop = { kind: 'time', dueAt: performance.now() + 1000 };
        const before = ctx.nextLoop.dueAt;

        ctx.pause();
        ctx.resume();

        expect(ctx.nextLoop.kind).toBe('time');
        expect((ctx.nextLoop as { dueAt: number }).dueAt).toBeGreaterThanOrEqual(before);
    });

    // the tick counter does not advance while paused, so the due tick is still
    // the right one — shifting it would skip a tick on every resume
    test('a tick due date is left exactly where it was', () => {
        const ctx = new ScriptContext();
        ctx.nextLoop = { kind: 'tick', dueTick: 42, staleAt: performance.now() + 3000 };

        ctx.pause();
        ctx.resume();

        expect(ctx.nextLoop.kind).toBe('tick');
        expect((ctx.nextLoop as { dueTick: number }).dueTick).toBe(42);
    });

    // otherwise a bot paused for an hour resumes with its backstop already
    // expired and burns one loop against stale state for no reason
    test('the tick backstop does not burn down while paused', () => {
        const ctx = new ScriptContext();
        const staleAt = performance.now() + 3000;
        ctx.nextLoop = { kind: 'tick', dueTick: 42, staleAt };

        ctx.pause();
        ctx.resume();

        expect((ctx.nextLoop as { staleAt: number }).staleAt).toBeGreaterThanOrEqual(staleAt);
    });
});
