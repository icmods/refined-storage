/// <reference path="core-engine.d.ts" />

/**
 * StorageCore — storage aggregation, transactions, transfer math.
 * Load with: IMPORT("StorageCore") → global `StorageCore`.
 *
 * Entry contract — LIVE references, mutated in place by insert/extract, must
 * survive rebuilds:
 *   { storage, items_stored, items: { [uid]: { id, data, count, extra } } }
 *   { storage, items_stored, stacks: [ { id, data, count, extra } ] }   // v3 disks
 * Item identity delegates to CoreKit.Items (hard dependency: dependencies
 * ["CoreKit:2"] + IMPORT("CoreKit:2")).
 *
 * Ownership: the library only mutates the LIVE entries it is given — no
 * events, no timers, no persistence. The HOST owns provider lifecycle:
 * register after load and call resetProviders() on LevelLeft.
 */
declare namespace StorageCore {
    interface StorageEntry {
        storage: number;
        items_stored: number;
        /** Legacy map shape; either `items` or `stacks` is the live shape. */
        items?: { [uid: string]: ItemInstance };
        /** Object shape (v3 disks): ordered stacks, keys re-derived on read. */
        stacks?: ItemInstance[];
    }
    interface StorageProvider {
        /** Must return an array of LIVE entry references (see contract). */
        getEntries(tile: any): StorageEntry[];
    }
    interface AggregatedItem extends ItemInstance {
        uid: string;
    }
    interface Snapshot {
        items: AggregatedItem[];
        storage: number;
        stored: number;
    }
    interface View {
        /**
         * Fresh aggregated list — safe to mutate (never live references).
         * Aggregation is identity-safe: each item's key is re-derived
         * canonically and two different identities are never merged under the
         * same uid (a foreign/stale key is normalized, a conflicting entry is
         * left untouched).
         */
        getItems(): AggregatedItem[];
        /** Fresh copy of a single uid, or null. */
        get(uid: string): AggregatedItem | null;
        /** Canonical-key lookup (same identity rules as getItems()). */
        has(uid: string): boolean;
        getTotals(): { storage: number; stored: number };
        /**
         * Aggregated items (canonical keys, same identity rules as getItems())
         * plus totals from the entries' bookkeeping (not a recount). Fresh
         * copies; never live references.
         */
        snapshot(): Snapshot;
        /** First uid matching { id, data(-1 wildcard), extra? }. */
        findFirst(item: ItemInstance): string | null;
        /**
         * Insert into LIVE entries; returns the remainder that could not be
         * stored. Partial insert across sources is by design; the library has no
         * void/drop policy (overflow handling is host policy).
         * options.onOverflow?(remainder, item) is notified when part does not fit;
         * callback exceptions are isolated.
         */
        insert(item: ItemInstance, count: number, options?: OperationOpts): number;
        /**
         * Extract from LIVE entries (canonical uid; a foreign/stale entry key
         * is matched by re-derived identity); returns the remainder that could
         * not be extracted.
         */
        extract(uid: string, count: number, options?: OperationOpts): number;
        /** Forget one operation id so it can be applied again. */
        forgetOperation(opId: string | number): boolean;
        /** Drop the whole operation log. */
        resetOperations(): void;
    }
    interface ViewOptions {
        /**
         * EXPERIMENTAL. Deterministic insert routing: lower keys go first;
         * ties keep the sources order. Extract is never reordered.
         */
        selector?(entry: StorageEntry, item: ItemInstance): number;
        /**
         * EXPERIMENTAL. Proportional fill per insert: each eligible source gets
         * floor(count * weight / totalWeight) first; leftovers fill in selector
         * order. Non-finite/<=0 weights are ignored.
         */
        weight?(entry: StorageEntry): number;
        /**
         * EXPERIMENTAL. Called after each successful live mutation, once per
         * operation: { uid, delta, item, source }. Exceptions are isolated.
         * commit() emits per applied op, in order; no event when nothing moved.
         */
        onChange?(event: { uid: string; delta: number; item: ItemInstance | null; source: "insert" | "extract" }): void;
        /** EXPERIMENTAL. Operation-log capacity for opId dedup (default 128). */
        opLogSize?: number;
    }
    interface OperationOpts {
        onOverflow?(remainder: number, item: ItemInstance): void;
        /**
         * EXPERIMENTAL, process-local. A repeated opId on the same view returns
         * the original remainder without mutating (no events, no overflow).
         * Bounded by ViewOptions.opLogSize (FIFO).
         */
        opId?: string | number;
        /**
         * Caller-provided canonical item uid. When present, insert reuses it
         * instead of deriving the identity again.
         */
        uid?: string;
        /**
         * Marks `uid` as trusted (the caller derived it canonically): skips the
         * safety re-derivation on the insert path. Leave unset for foreign keys.
         */
        trustedUid?: boolean;
    }
    interface Transaction {
        /** Queue an insert (validated against a shadow; no mutation). Returns the accepted amount. */
        insert(item: ItemInstance, count: number): number;
        /** Queue an extract (shadow-validated). Returns the accepted amount. */
        extract(uid: string, count: number): number;
        /**
         * Apply all queued ops, or nothing (re-validates against the live view).
         * On failure nothing is applied and the plan is discarded (queues and
         * planning shadow are cleared), so planning can continue against the
         * live view.
         */
        commit(): { applied: boolean; ops: number };
        /** Drop the queued plan and the planning shadow. */
        reset(): void;
        pendingCount(): number;
    }
    namespace debug {
        interface Mismatch {
            index: number;
            reason: string;
            uid?: string;
            expected: number;
            actual: number;
        }
        /**
         * DEV-ONLY, opt-in invariant check (nothing runs automatically): per
         * entry, items_stored must equal the sum of item counts. Logging and
         * cadence belong to the host/DebugCore.
         */
        function validate(view: View): { ok: boolean; mismatches: Mismatch[] };
        /**
         * DEV-ONLY. Check one entry's ephemeral stacks index against the stacks;
         * a stale index is rebuilt unless `repair === false`.
         */
        function validateIndex(entry: StorageEntry, repair?: boolean): { ok: boolean; rebuilt?: boolean; mismatches: Mismatch[] };
    }
    namespace Transfer {
        /** drag&drop hold-bar formula. */
        function UI_RATIO(source: ItemInstance, target: ItemInstance, ratio: number,
            maxStackFn?: (id: number) => number): number;
        /** click/long-click math. */
        function BUTTON(item: ItemInstance, capacity: number, isLongPress: boolean,
            maxStackFn?: (id: number) => number): number;
        /** merge-into-slot with mutation; returns the amount added. */
        function MACHINE(item: ItemInstance, slot: ItemInstance, count?: number): number;
        /** Free room for an item across a list of slots. */
        function roomFor(item: ItemInstance, slots: ItemInstance[]): number;
        /** Normalize a count: non-finite or <= 0 → 0, clamped to maxCount. */
        function clampCount(value: number, maxCount?: number): number;
    }

    /** Register a provider (overwrites an existing entry for the same blockId). Host-owned lifecycle. */
    function registerProvider(blockId: number | string, provider: StorageProvider): boolean;
    /** Remove a provider registration. Returns true when one existed. */
    function unregisterProvider(blockId: number | string): boolean;
    function providerFor(blockId: number | string): StorageProvider | null;
    function getProviders(): { [blockId: string]: StorageProvider };
    /**
     * Bulk clear the provider registry. The host must call this on LevelLeft —
     * the library has no engine hooks, so registrations otherwise survive a
     * level change.
     */
    function resetProviders(): void;
    /**
     * Mark the ephemeral stacks index of one entry stale. Required for external
     * writers that mutate `entry.stacks` directly; library insert/extract
     * invalidate on their own.
     */
    function invalidate(entry: StorageEntry): boolean;
    /** Drop every cached stacks index (e.g. on LevelLeft). */
    function resetIndex(): void;
    /**
     * Wrap LIVE entry references. The array is stored BY REFERENCE: keep it
     * stable while a transaction is planning (commit re-validates against it).
     */
    /**
     * Wrap LIVE entry references. The array is stored BY REFERENCE: keep it
     * stable while a transaction is planning (commit re-validates against it).
     * options are opt-in (see ViewOptions); without them routing is array order.
     */
    function createView(sources: StorageEntry[], options?: ViewOptions): View;
    const Transaction: {
        create(view: View): Transaction;
    };
}
