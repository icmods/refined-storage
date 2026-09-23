/// <reference path="core-engine.d.ts" />

/**
 * CraftTreeExecutor — task model + scheduler.
 * Load with: IMPORT("CraftTreeExecutor") → global `CraftTreeExecutor`.
 * The plan is supplied by the host (e.g. CraftTreePlanner); the library owns the
 * task model (buffer reservation, FIFO expected outputs) and the cadence model.
 */
declare namespace CraftTreeExecutor {
    interface Ingredient { id: number; data: number; count: number; }
    interface Pattern {
        isProcessed: boolean;
        coordsId: string;
        ingridients: Ingredient[];
        result: Ingredient[];
    }
    interface PlanNode {
        patternUid: string;
        isProcessing: boolean;
        containerCoords: string;
        quantity: number;
        requirements: { uid: string; count: number; altUids: string[] }[];
    }
    interface Plan {
        nodes: PlanNode[];
        toReserve: { [uid: string]: number };
        toCraft: { [uid: string]: number };
        toTake: { [uid: string]: number };
        missing: { [uid: string]: number };
    }
    interface FullCrafts {
        craftable: boolean;
        errorType?: "NO_PATTERN" | "RECURSIVE" | "TOO_COMPLEX" | "MISSING";
        errorPattern?: string;
        results: ItemInstance[];
        ingridients: ItemInstance[];
        crafts: any[];
        toReserveItems?: { [uid: string]: number };
        plan?: Plan;
    }
    interface TaskHost {
        /** storage extract → remainder (StorageCore view satisfies this). */
        extract?(uid: string, count: number): number;
        insert?(item: ItemInstance, count: number): number;
        /**
         * Optional: the Java extra object captured when `uid` was physically
         * extracted, so buffered re-inserts keep the same variant (extraKey is a
         * string, not an object). Return null when unknown.
         */
        resolveExtra?(uid: string): ItemExtraData | null;
        registerExpectedOutput?(uid: string, task: Task): void;
        unregisterExpectedOutput?(uid: string, task: Task): void;
    }
    interface TaskNode {
        patternUid: string;
        isProcessing: boolean;
        containerCoords: string;
        quantity: number;
        remaining: number;
        done: boolean;
        received: number;
        expectedByUid: { [uid: string]: number } | null;
        receivedByUid: { [uid: string]: number };
        requirements: { uid: string; count: number; provided: number; altUids: string[] }[];
    }
    interface Task {
        id: string;
        /** Host-owned clock value (unix ms); set via createTask options. */
        startTime?: number;
        requestedUid: string;
        requestedCount: number;
        totalSteps: number;
        currentStep: number;
        ticks: number;
        cancelled: boolean;
        completingFlush: boolean;
        nodes: TaskNode[];
        buffer: { [uid: string]: number };
        toReserve: { [uid: string]: number };
        pendingOutputs: { [uid: string]: number[] };
        results: ItemInstance[];
        crafts: any[];
        reserveItems(): boolean;
        flushBuffer(): boolean;
        getProgress(): number;
        consumeFromBuffer(uid: string, count: number): number;
        addToBuffer(uid: string, count: number): void;
        cacheExpectedOutputs(node: TaskNode, pattern: Pattern): void;
        registerExpectedOutputs(node: TaskNode): void;
        unregisterExpectedOutputs(node: TaskNode): void;
        outputsSatisfied(node: TaskNode): boolean;
        onOutputArrived(uid: string, count: number): number;
    }
    interface SchedulerCtx {
        /** Controller-owned tick counter — never World.getThreadTime. */
        ticks: number;
        /** false → serial (at most one craft per tick); default/true → parallel. */
        parallel?: boolean;
        getContainer(coordsId: string): any;
        getInterval?(container: any): number;
        getBudget?(container: any): number;
        /**
         * Optional shared-budget key for an entry. When absent (default) the budget
         * is per entry/node (Java parity). When provided, entries returning the same
         * key share one budget counter per processTick (e.g. per tile coords).
         */
        getBudgetKey?(entry: { coordsId: string; container: any; tile?: any }): string | null;
        isChunkLoaded(coordsId: string): boolean;
        getPattern?(uid: string): Pattern | null;
        /**
         * Storage check WITHOUT mutation (generic mode; unused with executeNode).
         * Authoritative when present: a false result is final (getStored is NOT
         * consulted). getStored is only the fallback when canTake is absent.
         */
        canTake?(uid: string, count: number): boolean;
        getStored?(uid: string): number;
        /** Storage commit → remainder (generic mode; unused with executeNode). */
        take(uid: string, count: number): number;
        /** Refund target on execute failure → remainder (when absent, refunds go to the task buffer). */
        insert?(item: ItemInstance, count: number): number;
        /** Perform ONE craft; { failed: true } → the library refunds the commit (generic mode). */
        execute?(task: Task, node: TaskNode, container: any, pattern: Pattern, plan: any): { failed: boolean } | void;
        /**
         * Multi-container selection. When present, the library iterates the
         * entries and picks viable containers; when absent it falls back to
         * `[{ coordsId: node.containerCoords, container: getContainer(...) }]`.
         */
        getContainers?(patternUid: string): { coordsId: string; container: any; tile?: any }[] | null;
        /**
         * Host-performed per-node execution (allocation + commit + machine + node
         * bookkeeping). When present, the library does NOT run its own
         * plan/commit path (`canTake/take/insert/execute` are ignored);
         * it calls `executeNode` up to the container budget per tick and the host is
         * responsible for `node.remaining/currentStep/done`.
         */
        executeNode?(task: Task, node: TaskNode, entry: { coordsId: string; container: any; tile?: any }, ctx: SchedulerCtx): { failed?: boolean } | void;
        /** Optional "network incomplete" signal, fired on container suspend. */
        markIncomplete?(): void;
        /** Per-tick progress (executed crafts > 0). The host decides the reporting cadence. */
        onProgress?(task: Task, executed: number): void;
        /** Monitor/UI refresh hook. */
        onMonitorDirty?(task: Task): void;
        /** Refresh open GUIs. */
        refreshOpenedGrids?(): void;
        /** Reservation release. */
        removeScheduledCount?(task: Task): void;
        /** Unregister a task's expected outputs. */
        unregisterTaskExpectedOutputs?(task: Task): void;
        /** Task finished normally. Host removes the task. */
        onTaskComplete?(task: Task): void;
        /** Task cancelled (timeout/suspend/missing) — reason is "suspend" | "missing". */
        onTaskCancelled?(task: Task, reason: string): void;
        /** Task finally removed after a cancelled flush. Host removes the task. */
        onTaskRemoved?(task: Task): void;
    }

    /** Normalized pattern as produced by PatternContainers.validatePattern. */
    interface NormalizedPattern {
        id: string;
        isProcessed: boolean;
        oredictEnabled: boolean;
        ingridients: Ingredient[];
        result: Ingredient[];
    }
    interface PatternContainerEntry {
        container: any;
        containerId: string;
        coordsId: string;
        coords: { x: number; y: number; z: number };
        tile: any;
    }
    interface PatternContainer {
        entries: { [key: string]: any };
        coordsIndex: { [key: string]: string };
        reset(): void;
        /** Container must expose getPatterns() → array of raw patterns. */
        register(tile: any, container: any): boolean;
        unregister(tile: any): boolean;
        get(tile: any): any | null;
        getByCoords(coords: { x: number; y: number; z: number }, dimension?: number): any | null;
        /**
         * Live scan: dimension filter, chunk-load safety, dead-tile cleanup,
         * then filterFn(tile, entry) → boolean (the host filters by its
         * network identity).
         */
        scan(blockSource: BlockSource, dimension: number | null, filterFn?: (tile: any, entry: any) => boolean): PatternContainerEntry[];
        /** Normalize a raw pattern; null when invalid. */
        validatePattern(pattern: any): NormalizedPattern | null;
    }

    function createTask(fullCrafts: FullCrafts, host: TaskHost, requestedItem: ItemInstance, requestedCount?: number, options?: { id?: string; startTime?: number }): Task | null;
    function serialize(task: Task): any;
    function restore(data: any, host: TaskHost): Task;
    namespace scheduler {
        function processTick(task: Task, ctx: SchedulerCtx): number;
        /**
         * Default per-container craft budget from the container interval:
         * interval 1 → 5, 10 → 1. Always ≥ 1 (intervals > 10 clamp to 1).
         * The host may override per container via `ctx.getBudget(container)`.
         */
        function getContainerBudget(interval: number): number;
    }
    /**
     * @deprecated UNUSED SKELETON — do not consume. It is not wired into the
     * host: Refined Storage uses its own `PatternContainerRegistry`
     * (dev/network/pattern_containers.js), which is where tiles actually
     * register. The two registries are not synchronized (and their coordinate
     * keys already diverge), so reading this one returns an empty/stale set.
     * Kept only until an explicit adopt-or-remove decision.
     */
    const PatternContainers: PatternContainer;
}
