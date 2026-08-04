/**
 * How often a script's `loop()` becomes eligible to run again.
 *
 * The scheduler pumps on every client frame, so a cadence is a gate on the
 * loop body, not on the pump. Three kinds, in order of how tightly they bind
 * to the server:
 *
 * - `frame` — eligible on the next client frame (~20ms). For reacting inside a
 *   tick: a hitsplat, an XP drop, a interface that just opened.
 * - `server-tick` — eligible once the observed tick counter has advanced. Same
 *   invocation rate as the old 600ms default, but phase-locked to the server
 *   instead of free-running, so the loop wakes at the *start* of a tick rather
 *   than a random offset into it.
 * - `time` — wall-clock ms. Only for pacing that is deliberately unrelated to
 *   game time (backoff, polling a logged-out client).
 *
 * Never key a cadence to a count of frames: frame duration is client `deltime`,
 * which has changed before, and anything counting frames silently encodes it.
 * @see docs/API.md#loop-cadence
 */
export type LoopCadence = { kind: 'frame' } | { kind: 'server-tick'; ticks?: number } | { kind: 'time'; ms: number };

/** One loop per server tick — the default for scripts that state no cadence. */
export const PER_TICK: LoopCadence = { kind: 'server-tick', ticks: 1 };

/**
 * `loop()` may return a cadence, a number (legacy: ms), or nothing. Normalise
 * that to a cadence, falling back to the bot's own declared cadence.
 */
export function asCadence(returned: LoopCadence | number | void, fallback: LoopCadence): LoopCadence {
    if (typeof returned === 'number') {
        return { kind: 'time', ms: returned };
    }

    return returned ?? fallback;
}
