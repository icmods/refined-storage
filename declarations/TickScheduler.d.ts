/// <reference path="core-engine.d.ts" />

/**
 * TickScheduler — deterministic tick-based scheduling for Inner Core / Horizon.
 * Load with: IMPORT("TickScheduler") → global `TickScheduler`.
 *
 * Time base is TICKS (deterministic) — never World.getThreadTime and never the
 * engine Updatable (both are documented hazards).
 *
 * Semantics:
 *   - deadline nextRun model: no modulo drift, no catch-up storms;
 *   - a dirty task runs immediately and resets its cadence (nextRun = now + interval);
 *   - every task is isolated: a failure never stops the heartbeat (try/catch + failures counter);
 *   - reserved names: registration with a reserved name requires opts.internal.
 */
declare namespace TickScheduler {
    interface TaskHandle {
        /** True only while this exact registration is still live (registry-checked). */
        cancel(): boolean;
        /** False after replace/resetAll/destroyGlobal. */
        isLive(): boolean;
    }
    interface TaskInfo {
        interval: number;
        offset: number;
        nextRun: number;
        lastRun: number;
        runs: number;
        failures: number;
        /** Consecutive failures since the last successful run. */
        consecutiveFailures: number;
        /** True after autoDisable consecutive failures (task kept for inspection; re-register re-enables). */
        disabled: boolean;
        lane: string;
        owner: any;
    }
    interface TaskOpts {
        /** Internal tasks may use reserved names. */
        internal?: boolean;
        /** Optional owner label; overwriting another owner's task logs a warning. */
        owner?: any;
        /** Opt-in: disable the task after N CONSECUTIVE failures (default off). */
        autoDisable?: number;
        /** Priority lane used by the budgeted driver tick (default "normal"); unknown or foreign values normalize to "normal". */
        lane?: "critical" | "normal" | "idle";
        /** When true (function returning bool), the task runs immediately and resets its cadence. */
        isDirty?: () => boolean;
        /** Called on task failure instead of (in addition to) the default log. */
        onError?: (error: any, taskName: string) => void;
    }
    interface DebounceOpts {
        /** Quiet ticks before the run (default 10). */
        ticks?: number;
        /** Force-run after this many ticks regardless of activity (starvation guard). */
        maxTicks?: number;
    }
    interface ThrottleOpts {
        /** Window in ticks (default 10). */
        ticks?: number;
    }
    interface DeferOpts {
        /** Delay in ticks (default 5). */
        ticks?: number;
        /** Maximum TOTAL attempts (default 3). */
        retries?: number;
        /** Label used in failure logs. */
        reason?: string;
        /** Retry delay growth (default "fixed"). */
        backoff?: "fixed" | "linear" | "exp";
        /** Cap for the computed delay (0 = uncapped). */
        maxDelay?: number;
        /** Randomize the delay in [0.5x, 1x]. */
        jitter?: boolean;
    }
    interface Scheduler {
        /** Tick counter of this scheduler (read-only; epoch-resets on reset()/destroy()). */
        readonly ticks: number;
        /** Reserve an internal task name. */
        reserve(name: string): void;
        /**
         * Register a task in a heartbeat-driven scope.
         * Call heartbeat(scopeId[, ...args]) from your tile tick; task fn receives (scopeId, ...args).
         * Returns false when validation fails, otherwise a handle with cancel().
         */
        register(scopeId: string | number, name: string, interval: number, offset: number,
            fn: (scopeId: string | number, ...args: any[]) => void, opts?: TaskOpts): TaskHandle | boolean;
        /** Unregister a task. The reserved "__auto" scope is refused (internal). */
        unregister(scopeId: string | number, name: string): boolean;
        /** Task introspection (nextRun/lastRun/runs/failures). */
        get(scopeId: string | number, name: string): TaskInfo | null;
        list(scopeId: string | number): { [name: string]: TaskInfo } | null;
        listAll(): { [scopeId: string]: { [name: string]: TaskInfo } };
        /** Advance the scope heartbeat and run due/dirty tasks; returns the number of SUCCESSFUL executions (throwing tasks are not counted and never stop the heartbeat). The "__auto" scope is refused. */
        heartbeat(scopeId: string | number, ...args: any[]): number;
        /** Destroy a scope and its tasks. The reserved "__auto" scope is refused (internal). */
        destroyScope(scopeId: string | number): boolean;
        /** Remove every task registered with the given owner (other owners/scopes kept); returns removed count. */
        resetOwner(owner: any): number;
        /** Administrative surface (host/tests only). Normal consumers use their own handles. */
        admin(): Admin;
        /**
         * Simple interval on the scheduler's own tick driver (requires a driver; returns false
         * without one or on invalid args — and NEVER destroys the previous task on invalid args).
         * Replacing an existing name with a different callback logs a warning.
         * NOTE: every time-based primitive below (interval, debounce, throttle,
         * defer, batch) runs inside the scheduler's tick driver — a scheduler
         * created without a driver (create(null)) only advances through manual
         * heartbeat() calls, so these primitives never fire on it.
         */
        interval(name: string, ticks: number, fn: () => void, opts?: TaskOpts & { offset?: number }): TaskHandle | boolean;
        /**
         * Idempotent interval: while a live task with the same name+callback exists,
         * returns its handle (cadence NOT reset). Different callback → replace + warning.
         * Safe to call on every LevelLoaded (survives admin().resetAll()).
         */
        ensureInterval(name: string, ticks: number, fn: () => void, opts?: TaskOpts & { offset?: number }): TaskHandle | boolean;
        /** Debounce with coalescing; returns a handle with cancel(). */
        debounce(key: string, fn: () => void, opts?: DebounceOpts): { cancel(): void };
        /**
         * Per-key throttle. Returns a wrapper that drops calls inside the window:
         * wrapper(...) → true when executed, false when dropped.
         */
        throttle(key: string, fn: (...args: any[]) => void, opts?: ThrottleOpts): (...args: any[]) => boolean;
        isThrottled(key: string, ticks?: number): boolean;
        /** Deferred execution with retries (safe teardown); returns a handle with cancel(). */
        defer(fn: () => void, opts?: DeferOpts): { cancel(): void };
        /** Idempotent defer keyed by string: pending key → existing handle (same fn) or replace + warning. */
        ensureDefer(key: string, fn: () => void, opts?: DeferOpts): { cancel(): void } | boolean;
        /**
         * Per-tick batch (dedupe): fn runs at most once per tick; the FIRST fn wins.
         * Returns true when queued, false when an entry for the key already exists.
         */
        batch(key: string, fn: () => void): boolean;
    }

    interface BudgetOpts {
        enabled?: boolean;
        /** Max tasks per driver tick when enabled (default 64). */
        maxTasksPerTick?: number;
        /** Lane shares; leftover/unused shares flow to the next non-empty lane. */
        laneWeights?: { critical?: number; normal?: number; idle?: number };
    }
    interface BudgetInfo {
        enabled: boolean;
        maxTasksPerTick: number;
        weights: { critical: number; normal: number; idle: number };
    }
    interface Admin {
        /** LevelLeft cleanup: forgets tasks/queues, keeps the tick driver. */
        resetAll(): void;
        /** Configure the per-tick budget (OFF by default). Returns the effective config. */
        setBudget(opts: BudgetOpts): BudgetInfo;
        getBudget(): BudgetInfo;
        /** Dispose permanently: detaches the driver (no-op callback) + clears all state. Idempotent. */
        destroyGlobal(): boolean;
        listAll(): { [scopeId: string]: { [name: string]: TaskInfo } };
        inspect(scopeId: string | number, name: string): TaskInfo | null;
    }

    /** Create a scheduler. driverName: "tick" | "LocalTick" | null (manual heartbeat only). */
    function create(driverName?: string | null): Scheduler;
    /** Administrative surface for the shared server scheduler (host/tests only). */
    function admin(): Admin;
    /** Shared server scheduler (driver "tick", lazy-initialized). */
    const global: Scheduler;
    /** Shared client scheduler (driver "LocalTick", lazy-initialized). */
    const local: Scheduler;
}
