/// <reference path="core-engine.d.ts" />

/**
 * Adapters — cross-mod storage adapters over StorageCore.
 * Load with: IMPORT("Adapters") → global `Adapters`.
 *
 * Every adapter produces a StorageCore ENTRY
 *   { storage, items_stored, items: { [uid]: { id, data, count, extra } } }
 * The entry mirrors an external container (drawer/chest). The mirror is the
 * live object for the network; syncFrom() reads the container into the mirror,
 * syncTo() applies the mirror back (bidirectional write-through) and RETURNS
 * the amount that could not be applied — nothing is lost silently.
 */
declare namespace Adapters {
    interface Entry {
        storage: number;
        items_stored: number;
        items: { [uid: string]: ItemInstance };
        /** Rebuild the mirror from the tile/container slots. */
        syncFrom(tile?: any): void;
        /** Apply the mirror back (bidirectional). Returns the un-applied amount. */
        syncTo(tile?: any): number;
        /**
         * Side-effect-free dry-run of syncTo(): returns the final-state slot
         * operations that WOULD be applied (id 0 = clear), the leftover, and
         * the capacity. Does not touch the source and does not mutate the
         * mirror; the tile.add hook is not invoked (room is used instead).
         */
        planTo(tile?: any): Plan;
        /** Deterministic composition token; changes only when uid/count change. */
        changeToken(): string;
    }
    interface PlanOp {
        slot: string;
        id: number;
        count: number;
        data: number;
        extra: any;
    }
    interface Plan {
        ops: PlanOp[];
        leftover: number;
        storage: number;
    }
    interface DrawerTile {
        blockID: number;
        container: any;
        getConfig?(): { size: number };
        add?(slotName: string, id: number, count: number, data: number, extra: any): number;
        validateAll?(): void;
    }
    interface ContainerOpts {
        /** Overrides the storage-discovered input slots (host policy). */
        inSlots?: string[];
        /** Overrides the storage-discovered output slots (host policy). */
        outSlots?: string[];
    }

    /**
     * Drawer entry. Capacity = tile.getConfig().size × slot count
     * (fallback configSize).
     */
    function drawer(blockId: number | string, configSize?: number): Entry;
    /** One entry per drawer tile (network provider). */
    function drawerEntries(drawerTiles: DrawerTile[]): Entry[];
    /**
     * Container entry from a StorageInterface container/Storage: named slots
     * + per-slot maxStack. Slot names/capacity are re-discovered on every
     * sync/plan (container topology can change).
     */
    function container(storage: any, options?: ContainerOpts): Entry;
    /** Neighbour container entry; null when absent. */
    function neighbour(region: BlockSource, coords: Vector, side: number): Entry | null;
    /** All six container neighbours: [{ side, entry }]. */
    function neighbours(region: BlockSource, coords: Vector): { side: number; entry: Entry }[];

    interface SyncAllResult {
        leftover: number;
        synced: number;
        skipped: number;
        failed: number;
    }
    interface SyncAllOpts {
        /** Sync even when the changeToken is unchanged. */
        force?: boolean;
        /** Called for a throwing syncTo; the entry keeps its old token (retry on the next call). */
        onError?(entry: Entry, error: any, index: number): void;
    }
    /**
     * Sync a set of entries with changeToken-based skipping. A throwing
     * syncTo is counted as failed, reported via onError, and its token is
     * NOT marked (so the next call retries it).
     */
    function syncAll(entries: Entry[], options?: SyncAllOpts): SyncAllResult;

    type CapabilityKind = "drawer" | "container" | "neighbour";
    interface Capabilities {
        target: "tile" | "storage" | "global";
        required: string[];
        optional: string[];
    }
    interface CheckResult {
        ok: boolean;
        missingRequired: string[];
        missingOptional: string[];
    }
    /** Declarative capability inventory per adapter kind (drift baseline). */
    const capabilities: { drawer: Capabilities; container: Capabilities; neighbour: Capabilities };
    /** Pre-flight capability check for an adapter target. */
    function check(kind: CapabilityKind, target: any): CheckResult;
}
