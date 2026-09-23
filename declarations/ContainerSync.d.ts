/// <reference path="core-engine.d.ts" />

/**
 * ContainerSync — client↔server inventory↔storage transfer protocol.
 * Load with: IMPORT("ContainerSync") → global `ContainerSync`.
 *
 * PlayerActor is stale inside a handler — never re-read a slot after a write;
 * the library buffers the player inventory once and treats that buffer as
 * authoritative.
 *
 * Item convention: `id == 0` is an empty slot (vanilla air is never held in a
 * slot); negative IDs are valid items — validity is `id != 0`, never `id > 0`.
 *
 * Contract: the host provides storage ops in the pushItem/deleteItem shape —
 * push(item, count) → remainder / remove(item, count) → remainder (never
 * silent loss; a StorageCore view satisfies both). The library owns the
 * player inventory mutation (buffered, authoritative) and the event
 * bookkeeping; the host owns the storage itself and the GUI refresh.
 *
 * Flow (real RS transport):
 *   CLIENT: queuePush/queueDelete write the maps into networkData; on the next
 *           client tick the host builds the events and sends them as a packet
 *           (the 'update' flag gates it). networkData.sendChanges() is only
 *           needed by hosts that do NOT use a packet transport.
 *   SERVER: the packet handler stores the events per player uid; the tick calls
 *           processEvents({[uid]: events}, options), which executes push/delete
 *           and writes the player inventory back.
 *   The packet handler MUST merge pending events per uid (counts add), never
 *   overwrite the pending map.
 *   CONFIRMATION: senders carry the client's requestNumber; the server writes
 *   acknowledgedRequest/requestResult after processEvents; the client reads it
 *   via readRequestResult(). process()/slotFromCoords() remain conveniences
 *   for external hosts.
 */
declare namespace ContainerSync {
    const MAX_COUNT: number;
    /** Wire protocol version for slot↔slot transfer payloads ({ v, from, to, count, want }). */
    const PROTOCOL_VERSION: number;

    /**
     * Safe JSON read for networkData (single location): Java null, "null", empty
     * strings and malformed JSON degrade to `fallback`.
     */
    function jsonGet(networkData: any, key: string, fallback?: any): any;
    /**
     * Safe JSON write for networkData: stringify + putString; never throws,
     * returns false when the write failed.
     */
    function jsonPut(networkData: any, key: string, value: any): boolean;

    /** Expected-item reference recorded at click time (uid preferred, id/data fallback). */
    interface WantRef {
        id: number;
        data: number;
        uid: string;
    }
    interface PushDeleteEvent {
        type: "push" | "delete";
        count: number;
        /** push events only: the player inventory slot index. */
        slot?: number;
        /** delete events only: the storage slot name passed to getSlot. */
        slotKey?: string;
        updateFull: boolean;
        /**
         * The item the sender clicked, when queuePush/queueDelete received it.
         * The server validates the slot against this reference and, on mismatch
         * (the host re-mapped its slots), resolves the item by uid via
         * `findByUid`; unresolvable events are dropped ("stale-slot").
         */
        want?: WantRef | null;
    }
    interface ProcessOpts {
        /** Work-allowed check (optional; skipped events are dropped). */
        isAllowed?(): boolean;
        /** Host storage insert; returns the remainder. */
        push(item: ItemInstance, count: number): number;
        /** Host storage extract; returns the remainder. */
        remove(item: ItemInstance, count: number): number;
        /** Storage slot read for delete events. */
        getSlot?(slotKey: string): ItemInstance | null;
        /** Stable identity of an item (host uidOf). Required for `want` validation. */
        itemUid?(item: ItemInstance): string;
        /**
         * Current storage item for a uid, with its live count/extra (host
         * itemsIndex). Used to resolve a `want` reference when the slot no
         * longer holds it; return null when the item is gone.
         */
        findByUid?(uid: string): ItemInstance | null;
        /** Per-item max stack override (default Item.getMaxStack). */
        maxStack?(id: number): number;
        /** Called per processed event ("push"/"delete"). */
        onHandled?(playerUid: number, kind: "push" | "delete"): void;
        /**
         * Called on every valid push event with a PRE-MOVE snapshot of the item
         * (id/data/extra/count before mutation), even when pushed == 0 (the
         * dirty-slot notification runs unconditionally).
         */
        onPushed?(item: ItemInstance, pushed: number): void;
        /**
         * Called when commitInventory could not write planned items (the real
         * inventory slot held a different stack — external race). Host recovery
         * hook: total count plus a descriptor per affected slot. Counts are the
         * NEW part only (planned − pre-handler snapshot); a pre-existing stack
         * moved externally is neither reported nor re-added.
         */
        onLeftover?(playerUid: number, leftover: number, items: LeftoverItem[]): void;
        /** Called per player when something moved. */
        onChanged?(playerUid: number, fullUpdate: boolean): void;
        /**
         * EXPERIMENTAL, reporting only (behaviour unchanged). Called for every
         * event rejected before/without applying: reason is one of
         * "invalid-count" | "not-allowed" | "unknown-type" | "missing-slot" |
         * "take-zero" | "stale-slot". Forward to DebugCore/host logging.
         */
        onInvalid?(record: InvalidRecord): void;
    }
    interface ProcessResult {
        changed: boolean;
        fullUpdate: boolean;
    }
    /** A planned inventory write that commitInventory could not apply (external race). */
    interface InvalidRecord {
        playerUid: number;
        slotKey: string;
        type: "push" | "delete" | string | null;
        count: any;
        updateFull: boolean;
        reason: "invalid-count" | "not-allowed" | "unknown-type" | "missing-slot" | "take-zero" | "stale-slot" | string;
    }
    interface LeftoverItem {
        slot: number;
        id: number;
        count: number;
        data: number;
        extra: ItemExtraData | null;
    }

    /** Queue an inventory→storage push into the networkData maps (client side). */
    function queuePush(networkData: any, slot: number, count: number, updateFull: boolean, want?: WantRef | string): void;
    /** Queue a storage→inventory extraction into the networkData maps (client side). */
    function queueDelete(networkData: any, slotKey: string, count: number, updateFull: boolean, want?: WantRef | string): void;
    /**
     * Build the transport identity of an item: { id, data, uid }. The uid comes
     * from options.itemUid (host CoreKit.Items.uidOf); without it only id/data are
     * usable (uid ""). Returns null for a missing/empty item (id == 0; negative
     * ids are valid items).
     */
    function want(item: ItemInstance, options?: { itemUid?(item: ItemInstance): string }): WantRef | null;
    /**
     * True when `item` satisfies a want reference (uid first when options.itemUid
     * is given, then id/data). `want` may also be a plain uid string (id/data
     * wildcards); null/empty `want` or `item` never match.
     */
    function wantMatches(want: WantRef | string | null, item: ItemInstance, options?: { itemUid?(item: ItemInstance): string }): boolean;
    /**
     * True when unacknowledged requests exist (`requestNumber` >
     * `acknowledgedRequest`) or the 'update' flag is set.
     */
    function hasPending(networkData: any): boolean;
    /**
     * Read the queued maps from networkData and reset them. Returns a fresh
     * events map with namespaced keys: 'p:<inventorySlot>' for pushes,
     * 'd:<storageSlotKey>' for deletes (the two directions can never collide).
     * Unsafe client-controlled keys (__proto__/constructor/prototype) are
     * rejected; Java null/malformed JSON degrade to an empty map.
     */
    function buildEvents(networkData: any, out?: { requestNumber?: number }): { [key: string]: PushDeleteEvent };
    /**
     * Last processed request sequence + outcome, once per acknowledgement
     * (`acknowledgedRequest` / `requestResult`). Returns { seq, changed,
     * fullUpdate } or null when nothing new; consumes the ack via
     * `readRequestNumber`.
     */
    function readRequestResult(networkData: any): { seq: number; changed: boolean; fullUpdate: boolean } | null;

    /**
     * Read the whole player inventory ONCE into a plain buffer.
     * 36 slots, fresh copies.
     */
    function bufferInventory(playerActor: PlayerActor): ItemInstance[];
    /**
     * Write the buffer back with the external-change guard: a slot changed
     * outside the handler is not overwritten — its items become the returned
     * leftover. With dirtySlots, only those slots are touched and slots WE
     * emptied are explicitly cleared only when the real slot still matches the
     * pre-handler snapshot (originSlots), so an externally injected item is
     * never wiped. With originSlots, only the NEW part of a traced stack is
     * written or reported (a pre-existing stack moved externally is not
     * re-added). When `leftoverItems` is given it receives the descriptors
     * { slot, id, count, data, extra } that could not be written. Returns the
     * leftover count.
     */
    function commitInventory(playerActor: PlayerActor, buffer: ItemInstance[], dirtySlots?: { [slot: number]: boolean }, leftoverItems?: { slot: number; id: number; count: number; data: number; extra: ItemExtraData | null }[], originSlots?: ItemInstance[]): number;
    /**
     * Lenient search in a buffer: same id, data with -1 wildcard, extra by
     * reference then fullExtraToString. Returns { slot, item } or null.
     */
    function findInBuffer(buffer: ItemInstance[], id: number, data: number, extra: ItemExtraData | null, reverse?: boolean): { slot: number; item: ItemInstance } | null;
    /**
     * Merge into the buffer: exact stacks first, then empty slots. The
     * optional `touched` object receives every modified slot index. Returns
     * the remainder that did not fit.
     */
    function addToBuffer(buffer: ItemInstance[], id: number, count: number, data: number, extra: ItemExtraData | null, maxStack?: number, touched?: { [slot: number]: boolean }): number;

    interface TransferContainerOpts {
        /** false = skip this slot (counted in `skipped`). */
        filter?(name: string, slot: ItemInstance): boolean;
        /** Empty every copied source slot. Default true. */
        clearSource?: boolean;
        /** false = pass `extra` by reference (host behavior); a function is applied to each extra and its result stored. */
        cloneExtra?: false | ((extra: ItemExtraData | null) => ItemExtraData | null);
        /** false = keep an occupied destination slot (counted in `skipped`). Default true. */
        overwrite?: boolean;
    }
    interface TransferContainerResult {
        moved: number;
        skipped: number;
        cleared: number;
    }
    /**
     * Copy every non-empty slot from `from` to `to` (carry helper: piston /
     * upgrade / replace). Both are objects with enumerable `slots` and
     * setSlot(name,id,count,data,extra) — no engine access; WHICH containers,
     * WHEN and what to filter stay host policy. Not atomic: a throwing setSlot
     * aborts mid-loop.
     */
    function transferContainer(
        from: { slots: { [name: string]: ItemInstance }; getSlot?(name: string): ItemInstance | null; setSlot(name: string, id: number, count: number, data: number, extra: ItemExtraData | null): void },
        to: { slots: { [name: string]: ItemInstance }; getSlot?(name: string): ItemInstance | null; setSlot(name: string, id: number, count: number, data: number, extra: ItemExtraData | null): void },
        options?: TransferContainerOpts
    ): TransferContainerResult;

    interface TransferSlotAccessor {
        get(name: string): ItemInstance | null;
        set(name: string, id: number, count: number, data: number, extra: ItemExtraData | null): void;
    }
    interface TransferOpts {
        from: TransferSlotAccessor;
        to: TransferSlotAccessor;
        fromKey: string;
        toKey: string;
        /** Absolute count, fraction < 1 (ceil of the source stack), or "all". */
        count: number | "all";
        /** Source identity check (uid preferred); mismatch = "stale-slot". */
        want?: WantRef | string | null;
        itemUid?(item: ItemInstance): string;
        /** Host policy; throwing/false = "not-allowed". */
        canTake?(name: string, item: ItemInstance): boolean;
        canPut?(name: string, item: ItemInstance): boolean;
        maxStack?(id: number): number;
        /** Different item in the destination: true (or a predicate) swaps whole stacks; default false = "occupied". */
        swap?: boolean | ((src: ItemInstance, dst: ItemInstance) => boolean);
        /** Called once after a successful move (host syncs its containers). */
        sync?(): void;
    }
    interface TransferResult {
        moved: number;
        remainder: number;
        reason: "missing-slot" | "stale-slot" | "invalid-count" | "take-zero" | "occupied" | "not-allowed" | null;
    }
    /**
     * Canonical slot↔slot transaction (engine has no slot-to-slot). Validates
     * the source identity, clamps to the destination space + maxStack, applies
     * through the host accessors and syncs once. No transport (the host ships
     * the payload; PROTOCOL_VERSION pins its shape).
     */
    function transfer(config: TransferOpts): TransferResult;

    interface NetStateFieldSpec {
        /**
         * "json" = JSON.stringify on publish / JSON.parse on read (null clears
         * the key; lossiness for 64-bit longs and Java objects applies).
         */
        type?: "int" | "boolean" | "string" | "json";
        default?: any;
    }
    interface NetStateConfig {
        /** Required; key = "<version>@<id>". */
        version: string;
        /** Optional content hash + count keys (the bounded retry needs both). */
        hash?: string;
        count?: string;
        /** Bounded retry ticks after a hash mismatch (default 20; 0 = off). */
        retry?: number;
        /** Field schema: publish writes only declared names; read fills all (typed + default). */
        fields?: { [name: string]: NetStateFieldSpec };
    }
    interface NetStateState {
        version?: number;
        retry: number;
    }
    interface NetStateConsumeHandlers {
        /** Required for apply; missing = the state is treated as closed. */
        isLive?(): boolean;
        /** true = defer to the next tick (version is NOT marked). */
        isGestureActive?(): boolean;
        /** false = defer to the next tick (version is NOT marked). */
        nameMatches?(): boolean;
        /** Local content hash; enables the bounded retry when configured. */
        hash?(): { h: number; n: number };
        /** Host apply + render (isolated; failures go to onError). */
        onApply?(version: number): void;
        onError?(error: any): void;
    }
    interface NetStateConsumeResult {
        applied: boolean;
        reason: "init" | "same" | "closed" | "gesture" | "name" | "version" | "retry" | "retryWait";
        version: number;
    }
    interface NetState {
        /**
         * Server side: write declared fields + optional {hash,count}, bump the
         * version and (unless options.sync === false) sendChanges. Returns the new
         * version; a missing nd/id is a no-op returning the current version.
         */
        publish(nd: any, id: string | number, values?: { [name: string]: any }, metrics?: { hash?: number; count?: number }, options?: { sync?: boolean }): number;
        /** Client side: fill every declared field into `target` (typed + default). Returns target. */
        read(nd: any, id: string | number, target: any): any;
        /** Host-owned per-tile consume state ({ version, retry }). */
        createState(): NetStateState;
        /**
         * Client tick: apply on a new version (honoring the host gates), then run
         * the bounded hash retry. Returns { applied, reason, version }.
         */
        consume(nd: any, id: string | number, state: NetStateState, handlers?: NetStateConsumeHandlers): NetStateConsumeResult;
    }
    /**
     * Per-tile UI state protocol over networkData (namespace "@<id>"): typed
     * fields, monotonic version, optional hash/count retry. Re-publishing at
     * attach/open is just another publish. Returns null for an unusable config
     * (no string `version`); unsafe names (`@`, __proto__/constructor/prototype)
     * are rejected.
     */
    function netState(config: NetStateConfig): NetState | null;

    /**
     * Process pending events per player. MUTATES eventsByPlayer (processed
     * entries are deleted).
     */
    /**
     * Deterministic order: deletes before pushes (namespaced keys never
     * collide). Host notifications (onPushed/onHandled/onChanged/onLeftover)
     * are isolated: a throwing listener never loses an applied event.
     */
    function processEvents(eventsByPlayer: { [playerUid: string]: { [slotKey: string]: PushDeleteEvent } }, options: ProcessOpts): ProcessResult;
    /**
     * Convenience for the single-container (per-player) flow:
     * buildEvents + processEvents in one call.
     */
    function process(networkData: any, playerUid: number, options: ProcessOpts): ProcessResult;

    /** Inventory slot from touch coords. */
    function slotFromCoords(event: { x: number; y: number }, cols: number, cellWidth: number, cellHeight: number): number;
    /** CLICK → 1; long-press → min(maxStack, storageLeft, available). */
    function clickCount(item: ItemInstance, isLongPress: boolean, storageLeft: number, maxStackFn?: (id: number) => number): number;
}
