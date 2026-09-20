/// <reference path="core-engine.d.ts" />

/**
 * ContainerSync — client↔server inventory↔storage transfer protocol.
 * Load with: IMPORT("ContainerSync") → global `ContainerSync`.
 *
 * PlayerActor is stale inside a handler — never re-read a slot after a write;
 * the library buffers the player inventory once and treats that buffer as
 * authoritative.
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
 *           processEvents({[uid]: events}, opts), which executes push/delete
 *           and writes the player inventory back.
 *   The packet handler MUST merge pending events per uid (counts add), never
 *   overwrite the pending map.
 *   hasPending()/process()/slotFromCoords() are convenience APIs for external
 *   hosts — the RS host does not call them.
 */
declare namespace ContainerSync {
    const MAX_COUNT: number;

    interface PushDeleteEvent {
        type: "push" | "delete";
        count: number;
        /** push events only: the player inventory slot index. */
        slot?: number;
        /** delete events only: the storage slot name passed to getSlot. */
        slotKey?: string;
        updateFull: boolean;
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
         * "take-zero". Forward to DebugCore/host logging.
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
        reason: "invalid-count" | "not-allowed" | "unknown-type" | "missing-slot" | "take-zero" | string;
    }
    interface LeftoverItem {
        slot: number;
        id: number;
        count: number;
        data: number;
        extra: ItemExtraData | null;
    }

    /** Queue an inventory→storage push into the networkData maps (client side). */
    function queuePush(networkData: any, slot: number, count: number, updateFull: boolean): void;
    /** Queue a storage→inventory extraction into the networkData maps (client side). */
    function queueDelete(networkData: any, slotKey: string, count: number, updateFull: boolean): void;
    /** True when the client flagged pending events ('update' flag). */
    function hasPending(networkData: any): boolean;
    /**
     * Read the queued maps from networkData and reset them. Returns a fresh
     * events map with namespaced keys: 'p:<inventorySlot>' for pushes,
     * 'd:<storageSlotKey>' for deletes (the two directions can never collide).
     * Unsafe client-controlled keys (__proto__/constructor/prototype) are
     * rejected; Java null/malformed JSON degrade to an empty map.
     */
    function buildEvents(networkData: any): { [key: string]: PushDeleteEvent };

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

    /**
     * Process pending events per player. MUTATES eventsByPlayer (processed
     * entries are deleted).
     */
    /**
     * Deterministic order: deletes before pushes (namespaced keys never
     * collide). Host notifications (onPushed/onHandled/onChanged/onLeftover)
     * are isolated: a throwing listener never loses an applied event.
     */
    function processEvents(eventsByPlayer: { [playerUid: string]: { [slotKey: string]: PushDeleteEvent } }, opts: ProcessOpts): ProcessResult;
    /**
     * Convenience for the single-container (per-player) flow:
     * buildEvents + processEvents in one call.
     */
    function process(networkData: any, playerUid: number, opts: ProcessOpts): ProcessResult;

    /** Inventory slot from touch coords. */
    function slotFromCoords(event: { x: number; y: number }, cols: number, cellWidth: number, cellHeight: number): number;
    /** CLICK → 1; long-press → min(maxStack, storageLeft, available). */
    function clickCount(item: ItemInstance, isLongPress: boolean, storageLeft: number, maxStackFn?: (id: number) => number): number;
}
