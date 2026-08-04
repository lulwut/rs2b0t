import { bus, type EventMap } from '../events/EventBus.js';
import { SettingsBag } from '../runtime/Settings.js';
import { PER_TICK, type LoopCadence } from './LoopCadence.js';
import type Tile from './Tile.js';

/**
 * Base class for every bot.
 * @see docs/API.md#bot-base-classes
 */
export abstract class AbstractBot {
    /**
     * How soon `loop()` may run again. Defaults to once per server tick: the
     * same rate the old 600ms default ran at, but woken by the tick itself
     * rather than a timer that drifts against it.
     * @see docs/API.md#loop-cadence
     */
    cadence: LoopCadence = PER_TICK;

    /**
     * @deprecated Wall-clock ms between iterations. Set `cadence` instead —
     * `loopDelay = 600` is `{ kind: 'server-tick' }` with worse phase, and
     * `loopDelay = 0` is `{ kind: 'frame' }`. Left `null` so a script that
     * never mentions it gets the tick cadence; any number set here still wins,
     * so unmigrated scripts keep their exact current pacing.
     */
    loopDelay: number | null = null;

    settings: SettingsBag = new SettingsBag({});

    private logSink: ((msg: string) => void) | null = null;
    private subscriptions: (() => void)[] = [];

    onStart?(): void | Promise<void>;
    onStop?(): void;
    onPause?(): void;
    onResume?(): void;

    onPaint?(ctx: CanvasRenderingContext2D): void;

    recoveryAnchor?(): Tile | null;

    grindTargets(): string[] {
        return [];
    }

    log(msg: string): void {
        if (this.logSink) {
            this.logSink(msg);
        } else {
            console.log(`[bot] ${msg}`);
        }
    }

    on<K extends keyof EventMap>(event: K, cb: (payload: EventMap[K]) => void): void {
        this.subscriptions.push(bus.on(event, cb));
    }

    bindLog(sink: (msg: string) => void): void {
        this.logSink = sink;
    }

    disposeSubscriptions(): void {
        for (const unsub of this.subscriptions) {
            unsub();
        }
        this.subscriptions = [];
    }
}

/**
 * Implement `loop()`; it runs repeatedly at the bot's `cadence`. Return a
 * cadence to override it for the next iteration only.
 * @see docs/API.md#loopingbot
 */
export abstract class LoopingBot extends AbstractBot {
    abstract loop(): LoopCadence | number | void | Promise<LoopCadence | number | void>;
}

/**
 * A guard and the action it guards.
 * @see docs/API.md#taskbot
 */
export interface Task {
    validate(): boolean | Promise<boolean>;
    execute(): void | Promise<void>;
    /** Cadence for the iteration this task ran; omit to use the bot's. */
    cadence?: LoopCadence;
}

/**
 * Runs the first task whose `validate()` passes, once per loop. Order is
 * priority.
 * @see docs/API.md#taskbot
 */
export abstract class TaskBot extends LoopingBot {
    private readonly tasks: Task[] = [];

    protected add(...tasks: Task[]): void {
        this.tasks.push(...tasks);
    }

    async loop(): Promise<LoopCadence | number | void> {
        for (const task of this.tasks) {
            if (await task.validate()) {
                await task.execute();
                // a task may state how soon the chain should be re-walked after
                // it — a task that just armed something wants a tighter look
                return task.cadence;
            }
        }
    }
}

/**
 * A decision node in a behaviour tree.
 * @see docs/API.md#treebot
 */
export abstract class BranchTask {
    abstract validate(): boolean;
    abstract success(): TreeNode;
    abstract failure(): TreeNode;
}

/**
 * An action node in a behaviour tree.
 * @see docs/API.md#treebot
 */
export abstract class LeafTask {
    abstract execute(): void | Promise<void>;
}

export type TreeNode = BranchTask | LeafTask;

export abstract class TreeBot extends LoopingBot {
    abstract root(): TreeNode;

    async loop(): Promise<LoopCadence | number | void> {
        let node = this.root();
        while (node instanceof BranchTask) {
            node = node.validate() ? node.success() : node.failure();
        }

        await node.execute();
    }
}
