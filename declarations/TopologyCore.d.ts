/// <reference path="core-engine.d.ts" />

/**
 * TopologyCore — generic block-adjacency network topology.
 * Load with: IMPORT("TopologyCore") → global `TopologyCore`.
 *
 * The graph is generic: the host defines isNode/isController callbacks.
 * It deliberately does NOT write tile.data, manage storage, or look up
 * tiles — the host wires that through onEvent/onRebuildNeeded.
 */
declare namespace TopologyCore {
    interface Coords { x: number; y: number; z: number; blockSource?: BlockSource; hint?: Coords; }
    interface GraphConfig {
        /** A block that belongs to the network (cable/machine). Required. */
        isNode(blockId: number, blockData: number): boolean;
        /**
         * Optional coords-aware node predicate (takes precedence over isNode in
         * the DFS). Lets the host require e.g. a live tile entity for non-cable
         * nodes, so tile-less blocks can be skipped.
         */
        isNodeAt?(blockId: number, blockData: number, coords: Coords, blockSource: BlockSource): boolean;
        /**
         * Optional traversal predicate, SEPARATE from membership. The DFS walks
         * through every adjacent block — including tile-less ones it never
         * counts — so a component can reach nodes beyond a tile-less block. When
         * provided, the DFS traverses these without adding them as nodes;
         * otherwise traversal == isNodeAt/isNode.
         */
        isTraversable?(blockId: number, blockData: number, coords: Coords, blockSource: BlockSource): boolean;
        /** A block that roots a component (controller). */
        isController?(blockId: number, blockData: number): boolean;
        /** Optional fast-path id of the controller block (used by searchController's self check). */
        controllerBlockId?: number;
        /** Allowed connection directions for a node (default: all 6). */
        getConnectedSides?(blockId: number, blockData: number): [number, number, number][];
        /** Optional event callback mirroring the internal bus. */
        onEvent?(event: string, data: any): void;
        /**
         * Optional: called when a host predicate (isNode/isNodeAt/isTraversable/
         * isController/getConnectedSides) throws. Return value is used as the
         * predicate result (falsy when omitted). Errors are logged either way.
         */
        onPredicateError?(label: string, error: any): any;
        /** Called for each incomplete component when the debounced rebuild fires. */
        onRebuildNeeded?(component: ComponentSnapshot, componentKey: string): void;
        /**
         * Called once per distinct OTHER controller met during a DESTRUCTIVE
         * flood (assign / controller placement). Reconstruction floods (reflood,
         * chunk rebuild, change reflood, detach) never invoke it — only the
         * "boundaryController" event is emitted, so a host mistake cannot turn
         * a rebuild into a destructive operation. The library never absorbs the
         * boundary; the host decides the duplicate-controller policy.
         */
        onBoundaryController?(componentKey: string, controllerCoords: Coords, dim: number): void;
        /**
         * Called once per changed coordinate AFTER the graph is stable (post-flush and
         * post-reflood). Lets the host apply its own policy for that coordinate
         * (refresh a moved tile's model, reset a data field, etc.). Errors are isolated.
         */
        onAfterChange?(change: { coords: Coords; oldId: number; newId: number; dim: number; oldData: number; newData: number; blockSource?: any; operationId?: number }): void;
        /**
         * "manual" (default): block changes are applied incrementally.
         * "onChange": after a tick's changes, every affected component is
         * re-flooded from its controller (discovers changes the incremental path
         * missed; drops disconnected nodes via nodeRemoved).
         */
        refloodOnChange?: "manual" | "onChange";
        /** A bridge node joining 2+ components merges them (emits componentMerged). Default false. */
        mergeComponents?: boolean;
        /** A removal that disconnects members orphans them (emits nodeOrphaned). Default false. */
        detectSplits?: boolean;
        /** Iterate sides in reverse (5→0). Default false. */
        reverseDFS?: boolean;
    }
    interface FloodOpts {
        /** Operation cause attached to events/out (e.g. "assign" | "reflood" | "change" | "merge" | "split" | "detach"). */
        cause?: string;
        /** false → a reflood never invokes the destructive onBoundaryController callback (default true for assign). */
        destructive?: boolean;
    }
    interface IncompleteReason {
        /** "unloaded" | "host" | other host-provided labels. */
        reason: string;
        coords?: Coords;
        chunkX?: number;
        chunkZ?: number;
        dim?: number;
    }
    interface ComponentSnapshot {
        coords: Coords;
        dim: number;
        nodes: { x: number; y: number; z: number; blockId: number; blockData: number }[];
        nodeCount: number;
        /** Compatibility boolean view. */
        incomplete: boolean;
        /** Why the component is incomplete (deduped); empty when complete. */
        incompleteReasons: IncompleteReason[];
        /** Bumped on every structural change (reflood/merge/split); use to invalidate snapshots. */
        generation: number;
    }
    interface Graph {
        /** Subscribe: nodeAdded | nodeRemoved | componentCreated | componentDestroyed | markedIncomplete | markedComplete | boundaryController | componentMerged | nodeOrphaned. */
        on(event: string, fn: (data?: any) => void): number;
        /**
         * DFS for a controller from coords (with hint cache + incomplete
         * marking). options.includeSelf (default true) — when false the start
         * coords are never returned even if they are a controller, so a
         * controller can find its BOUNDARY controller (bridge detection).
         */
        searchController(coords: Coords, dim: number, out?: { incomplete: boolean }, options?: { includeSelf?: boolean }): Coords | null;
        /**
         * Re-derive the component rooted at controllerCoords. Returns the component
         * key, or null when there is no blockSource / the call was made re-entrantly
         * from a host callback (it is then deferred to the next tick, safely).
         * `out.operationId` identifies the operation that performed the flood.
         */
        floodAssign(controllerCoords: Coords, dim: number, out?: { added: { x: number; y: number; z: number }[]; removed: { x: number; y: number; z: number }[]; incomplete: boolean; incompleteReasons?: IncompleteReason[]; operationId?: number; cause?: string }, options?: FloodOpts): string | null;
        /** Fresh snapshot of a component by controller coords (never live). */
        component(controllerCoords: Coords, dim: number): ComponentSnapshot | null;
        /** Component key owning a node, or null. */
        componentOf(coords: Coords, dim: number): string | null;
        /** Read-only: both coords belong to the same existing component. */
        isConnected(a: Coords, b: Coords, dim: number): boolean;
        /** Read-only: adjacent NODES of a node (traversal-only blocks are not indexed). */
        neighboursOf(coords: Coords, dim: number): Coords[];
        /** Read-only immutable snapshot (alias of component(), includes generation). */
        componentSnapshot(coords: Coords, dim: number): ComponentSnapshot | null;
        /**
         * Re-flood the component owning `coords` from its controller (host-driven).
         * For stale nodes not covered by a BlockChanged (e.g. a tile entity was
         * removed while the block stayed). Returns true when a component existed.
         */
        refloodComponentOf(coords: Coords, dim: number, blockSource?: BlockSource, options?: FloodOpts): boolean;
        /**
        * Block change with per-tick dedup. oldData/newData are optional: when
        * omitted the old block's data defaults to 0 and the new block's data
        * is read from coords.blockData (pass them explicitly whenever the
        * host knows them — old block data is otherwise unrecoverable).
        */
       notifyBlockChanged(coords: Coords, oldId: number, newId: number, dim: number, oldData?: number, newData?: number): void;
        /** Mark components intersecting the chunk incomplete. */
        markChunkUnloaded(chunkX: number, chunkZ: number, dim: number): void;
        /** Schedule a debounced rebuild when a component is incomplete. */
        markChunkLoaded(chunkX: number, chunkZ: number, dim: number): void;
        /** Debounced rebuild (10 ticks, re-armed while incomplete). */
        scheduleRebuild(): void;
        /**
         * Mark a specific component incomplete (host-detected gap). Emits
         * "markedIncomplete" on the false→true transition. Returns true if the
         * component exists.
         */
        markComponentIncomplete(controllerCoords: Coords, dim: number, reason?: string): boolean;
        /** Host marks a component rebuilt after successful rebuild work. */
        markComplete(controllerCoords: Coords, dim: number): void;
        /** Remove a component and its node index (controller destroyed). */
        removeComponent(controllerCoords: Coords, dim: number): boolean;
        /** LevelLeft cleanup. */
        reset(): void;
        destroy(): void;
    }

    function createGraph(config: GraphConfig): Graph;
}
