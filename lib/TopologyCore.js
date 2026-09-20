LIBRARY({
    name: "TopologyCore",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:1", "EventBus:1", "TickScheduler:1"]
});

IMPORT("CoreKit:1");
IMPORT("EventBus:1");
IMPORT("TickScheduler:1");

var TopologyCore = {};

var _TOPO_LOG_TAG = "TopologyCore";

function _topoLog(msg) {
    if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, _TOPO_LOG_TAG);
}

/*
 * ============================================================================
 * TopologyCore — generic block-adjacency network topology
 * ============================================================================
 * Iterative DFS with a visited set + controller hint cache and incomplete marking
 * on unloaded chunks, flood-assign from a controller, chunk discard/load handling
 * with a debounced rebuild, and per-tick block-change dedup. Emits join/leave/
 * create/destroy/merge/orphan events.
 *
 * What it does NOT do (deliberately): tile.data writes (NETWORK_ID), network
 * storage, or controller tile lookup. The host wires these through callbacks,
 * which keeps the graph generic (cable nets, machine nets, drawer scans, etc.).
 * ============================================================================
 */

var _TOPO_EVENTS = {
    nodeAdded: 1,
    nodeRemoved: 1,
    componentCreated: 1,
    componentDestroyed: 1,
    markedIncomplete: 1,
    markedComplete: 1,
    boundaryController: 1,
    // two components joined by a bridge node / a node cut off by a split.
    componentMerged: 1,
    nodeOrphaned: 1
};

function _topoKey(dim, coords) {
    return CoreKit.coords.key(dim, coords);
}

function _topoCts(coords) {
    return CoreKit.coords.cts(coords);
}

function _TopoGraph(config) {
    config = config || {};
    if (typeof config.isNode != "function") throw new Error("TopologyCore: config.isNode required");
    this.config = config;
    this.bus = EventBus.create();
    this.components = {};
    this.nodeIndex = {};
    this._rebuildPending = false;
    this._rebuildTicks = 10;
    this._changedQueue = {};
    this._changedQueued = false;
    this._changedQueuedTick = 0;
    this._affected = {};
    // Reentrancy guard: mutating operations started from inside a running
    // operation (host callbacks) are deferred to the next tick instead of
    // corrupting the traversal in progress.
    this._opDepth = 0;
    this._operationId = 0;
    this._deferredOps = [];
    this._deferredQueued = false;
    var self = this;
    this._flushChanged = function () {
        self._flushChangedQueue();
    };
    this._flushDeferred = function () {
        self._flushDeferredOps();
    };
}

function _topoEmit(graph, event, data) {
    if (data && typeof data === "object") {
        if (data.operationId === undefined && graph._operationId > 0) data.operationId = graph._operationId;
        if (data.cause === undefined && graph._opCause) data.cause = graph._opCause;
    }
    graph.bus.emit(event, data);
    if (typeof graph.config.onEvent == "function") {
        try { graph.config.onEvent(event, data); } catch (e) {}
    }
}

_TopoGraph.prototype.on = function (event, fn) {
    if (!_TOPO_EVENTS[event]) throw new Error("TopologyCore: unknown event '" + event + "'");
    return this.bus.on(event, fn);
};

/**
 * Call a host predicate with isolation: a throwing predicate is logged and
 * degrades to `onPredicateError(label, error)` (or false) instead of aborting
 * an operation mid-way and corrupting the graph.
 */
_TopoGraph.prototype._safeCall = function (fn, a, b, c, d, label) {
    try {
        return fn(a, b, c, d);
    } catch (e) {
        _topoLog('predicate "' + label + '" threw: ' + e);
        if (typeof this.config.onPredicateError === "function") {
            try { return this.config.onPredicateError(label, e); } catch (e2) {}
        }
        return false;
    }
};

_TopoGraph.prototype._isController = function (blockId, blockData) {
    var fn = this.config.isController;
    if (typeof fn != "function") return false;
    return !!this._safeCall(fn, blockId, blockData, undefined, undefined, "isController");
};

_TopoGraph.prototype._isNodeById = function (blockId, blockData) {
    var fn = this.config.isNode;
    if (typeof fn != "function") return false;
    return !!this._safeCall(fn, blockId, blockData, undefined, undefined, "isNode");
};

/** Config helper: connected sides of a node (default: all 6). */
_TopoGraph.prototype._connectedSides = function (blockId, data) {
    var fn = this.config.getConnectedSides;
    if (typeof fn == "function") {
        var sides = this._safeCall(fn, blockId, data, undefined, undefined, "getConnectedSides");
        return sides || CoreKit.coords.sides;
    }
    return CoreKit.coords.sides;
};

/**
 * Sides used for DFS, honouring config.reverseDFS (parity with RS
 * set_net_for_blocks which pushes sides 5→0). Returns a reversed COPY so the
 * config-owned array is never mutated.
 */
_TopoGraph.prototype._sidesFor = function (blockId, data) {
    var sides = this._connectedSides(blockId, data);
    if (!this.config.reverseDFS || !sides || !sides.length) return sides;
    var out = [];
    for (var i = sides.length - 1; i >= 0; i--) out.push(sides[i]);
    return out;
};

/**
 * Optional coords-aware node predicate. When config.isNodeAt is provided the
 * DFS uses it (the host can require e.g. a live tile entity for non-cable
 * nodes); otherwise it falls back to config.isNode(id, data).
 */
_TopoGraph.prototype._isNodeAt = function (blockId, blockData, coords, blockSource) {
    var fn = this.config.isNodeAt;
    if (typeof fn === "function") {
        return !!this._safeCall(fn, blockId, blockData, coords, blockSource, "isNodeAt");
    }
    return this._isNodeById(blockId, blockData);
};

/**
 * Optional traversal predicate, SEPARATE from node membership: a component can
 * traverse a tile-less block to reach nodes BEYOND it, without counting that
 * block as a node. When config.isTraversable is given the DFS walks those blocks
 * without counting them; otherwise traversal == membership (`_isNodeAt`).
 */
_TopoGraph.prototype._isTraversableAt = function (blockId, blockData, coords, blockSource) {
    var fn = this.config.isTraversable;
    if (typeof fn === "function") {
        return !!this._safeCall(fn, blockId, blockData, coords, blockSource, "isTraversable");
    }
    return this._isNodeAt(blockId, blockData, coords, blockSource);
};

/**
 * Iterative DFS searching for a controller from `coords`. Returns { x, y, z } | null.
 * Marks the result { found, incomplete } in the optional out object.
 * opts.includeSelf (default true): when false the starting coords are NEVER
 * returned even if they are a controller — the DFS still explores from them, so a
 * controller can find its BOUNDARY controller (used for bridge/duplicate-controller
 * detection). The host still decides.
 */
_TopoGraph.prototype.searchController = function (coords, dim, out, opts) {
    var blockSource = coords.blockSource;
    if (out) out.incomplete = false;
    if (!blockSource) return null;
    var isSafe = CoreKit.Engine.safeIsChunkLoadedAt;
    var includeSelf = !(opts && opts.includeSelf === false);

    if (isSafe(blockSource, coords.x, coords.y, coords.z) === false) {
        if (out) out.incomplete = true;
        return null;
    }
    var selfBlock = blockSource.getBlock(coords.x, coords.y, coords.z);
    if (includeSelf &&
        (selfBlock.id == (this.config.controllerBlockId != null ? this.config.controllerBlockId : -1) ||
        this._isController(selfBlock.id, selfBlock.data))) {
        return { x: coords.x, y: coords.y, z: coords.z };
    }
    var hint = coords.hint;
    if (hint && hint.x !== undefined && !(hint.x === 0 && hint.y === 0 && hint.z === 0)) {
        if (isSafe(blockSource, hint.x, hint.y, hint.z) !== false) {
            var hintBlock = blockSource.getBlock(hint.x, hint.y, hint.z);
            if (this._isController(hintBlock.id, hintBlock.data)) {
                return { x: hint.x, y: hint.y, z: hint.z };
            }
        }
    }
    var visited = {};
    visited[_topoCts(coords)] = true;
    var stack = [{ x: coords.x, y: coords.y, z: coords.z, id: selfBlock.id, data: selfBlock.data }];
    while (stack.length) {
        var c = stack.pop();
        var sides = this._sidesFor(c.id, c.data);
        for (var s = 0; s < sides.length; s++) {
            var nx = c.x + sides[s][0], ny = c.y + sides[s][1], nz = c.z + sides[s][2];
            var key = nx + "," + ny + "," + nz;
            if (visited[key]) continue;
            visited[key] = true;
            if (isSafe(blockSource, nx, ny, nz) === false) {
                if (out) out.incomplete = true;
                continue;
            }
            var block = blockSource.getBlock(nx, ny, nz);
            if (this._isController(block.id, block.data)) {
                return { x: nx, y: ny, z: nz };
            }
            if (this._isTraversableAt(block.id, block.data, { x: nx, y: ny, z: nz }, blockSource)) {
                stack.push({ x: nx, y: ny, z: nz, id: block.id, data: block.data });
            }
        }
    }
    return null;
};

/**
 * Flood-fill a component from controller coords.
 * Assigns node membership, emits events, returns the component key.
 *
 * out (optional diff): when given, receives
 *   { added: [{x,y,z}], removed: [{x,y,z}], incomplete: bool }
 * relative to the PREVIOUS membership of this component. A brand-new component
 * reports every node as added and nothing removed. The host can apply the diff
 * incrementally instead of re-reading the whole component.
 *
 * Every distinct OTHER controller encountered during the flood is a BOUNDARY:
 * the graph emits the bus event "boundaryController" and calls
 * config.onBoundaryController(componentKey, controllerCoords, dim) if present. The
 * library treats it as a limit (never absorbs it); the host decides the policy.
 */
/**
 * Public entry point with the reentrancy guard: a flood started from a host
 * callback while another operation is running is deferred to the next tick
 * (the graph is in an intermediate state at that point).
 */
_TopoGraph.prototype.floodAssign = function (controllerCoords, dim, out, opts) {
    dim = dim === undefined || dim === null ? 0 : dim;
    if (!controllerCoords || !controllerCoords.blockSource) return null;
    var cause = (opts && opts.cause) || "assign";
    var destructive = !(opts && opts.destructive === false);
    if (this._opDepth > 0) {
        this._deferOp({
            type: "flood",
            coords: { x: controllerCoords.x, y: controllerCoords.y, z: controllerCoords.z, blockSource: controllerCoords.blockSource },
            dim: dim,
            cause: cause,
            destructive: destructive
        });
        _topoLog("floodAssign re-entered - deferred to the next tick");
        return null;
    }
    this._beginOp(cause);
    try {
        var result = this._floodAssign(controllerCoords, dim, out, { cause: cause, destructive: destructive });
        if (out) {
            out.operationId = this._operationId;
            out.cause = cause;
        }
        return result;
    } finally {
        this._endOp();
    }
};

_TopoGraph.prototype._floodAssign = function (controllerCoords, dim, out, opts) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var blockSource = controllerCoords.blockSource;
    if (!blockSource) return null;
    var destructive = !(opts && opts.destructive === false);
    var isSafe = CoreKit.Engine.safeIsChunkLoadedAt;

    var cKey = _topoKey(dim, controllerCoords);
    var existing = this.components[cKey];
    var component;
    var prevNodes = {};
    if (existing) {
        for (var cts0 in existing.nodes) {
            prevNodes[cts0] = existing.nodes[cts0];
            delete this.nodeIndex[_topoKey(dim, existing.nodes[cts0])];
        }
        existing.nodes = {};
        existing.incomplete = false;
        existing.incompleteReasons = [];
        existing._reasonKeys = Object.create(null);
        existing.generation = (existing.generation || 0) + 1;
        component = existing;
    } else {
        component = {
            coords: { x: controllerCoords.x, y: controllerCoords.y, z: controllerCoords.z },
            dim: dim,
            nodes: {},
            incomplete: false,
            incompleteReasons: [],
            generation: 1
        };
        this.components[cKey] = component;
        _topoEmit(this, "componentCreated", { componentKey: cKey, coords: component.coords, dim: dim });
    }

    var controllerBlock = blockSource.getBlock(controllerCoords.x, controllerCoords.y, controllerCoords.z);
    component.rootBlockId = controllerBlock.id;
    component.rootBlockData = controllerBlock.data;
    var visited = {};
    visited[_topoCts(controllerCoords)] = true;
    var boundarySeen = {};
    var stack = [{ x: controllerCoords.x, y: controllerCoords.y, z: controllerCoords.z, id: controllerBlock.id, data: controllerBlock.data }];
    while (stack.length) {
        var c = stack.pop();
        var sides = this._sidesFor(c.id, c.data);
        for (var s = 0; s < sides.length; s++) {
            var nx = c.x + sides[s][0], ny = c.y + sides[s][1], nz = c.z + sides[s][2];
            var cts = nx + "," + ny + "," + nz;
            if (visited[cts]) continue;
            visited[cts] = true;
            if (isSafe(blockSource, nx, ny, nz) === false) {
                this._addIncompleteReason(cKey, component, "unloaded:" + nx + "," + ny + "," + nz,
                    { reason: "unloaded", coords: { x: nx, y: ny, z: nz } });
                continue;
            }
            var block = blockSource.getBlock(nx, ny, nz);
            if (this._isController(block.id, block.data)) {
                var bKey = _topoKey(dim, { x: nx, y: ny, z: nz });
                if (!boundarySeen[bKey]) {
                    boundarySeen[bKey] = true;
                    _topoEmit(this, "boundaryController", { componentKey: cKey, coords: { x: nx, y: ny, z: nz }, dim: dim });
                    if (destructive && typeof this.config.onBoundaryController == "function") {
                        try { this.config.onBoundaryController(cKey, { x: nx, y: ny, z: nz }, dim); } catch (e) {}
                    }
                }
                continue; // another controller = boundary
            }
            if (this._isTraversableAt(block.id, block.data, { x: nx, y: ny, z: nz }, blockSource)) {
                // membership: only real nodes are counted (tile-less non-cables are skipped)
                if (this._isNodeAt(block.id, block.data, { x: nx, y: ny, z: nz }, blockSource)) {
                    var nodeKey = _topoKey(dim, { x: nx, y: ny, z: nz });
                    var prevOwner = this.nodeIndex[nodeKey];
                    if (prevOwner && prevOwner !== cKey) this._stealNode(prevOwner, cts, { x: nx, y: ny, z: nz }, dim);
                    component.nodes[cts] = { x: nx, y: ny, z: nz, blockId: block.id, blockData: block.data };
                    this.nodeIndex[nodeKey] = cKey;
                    _topoEmit(this, "nodeAdded", { componentKey: cKey, coords: { x: nx, y: ny, z: nz }, dim: dim });
                }
                stack.push({ x: nx, y: ny, z: nz, id: block.id, data: block.data });
            }
        }
    }
    // reflood can drop nodes — emit nodeRemoved for each disappeared member.
    for (var pk in prevNodes) {
        if (!component.nodes[pk]) {
            _topoEmit(this, "nodeRemoved", {
                componentKey: cKey,
                coords: { x: prevNodes[pk].x, y: prevNodes[pk].y, z: prevNodes[pk].z },
                dim: dim,
                blockId: prevNodes[pk].blockId
            });
        }
    }
    if (out) {
        out.added = [];
        out.removed = [];
        for (var k in component.nodes) {
            if (!prevNodes[k]) out.added.push({ x: component.nodes[k].x, y: component.nodes[k].y, z: component.nodes[k].z });
        }
        for (var pk2 in prevNodes) {
            if (!component.nodes[pk2]) out.removed.push({ x: prevNodes[pk2].x, y: prevNodes[pk2].y, z: prevNodes[pk2].z });
        }
        out.incomplete = component.incomplete;
        out.incompleteReasons = component.incompleteReasons ? component.incompleteReasons.slice() : [];
    }
    return cKey;
};

/** Snapshot of a component by controller coords (fresh copy, never live). */
_TopoGraph.prototype.component = function (controllerCoords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var component = this.components[_topoKey(dim, controllerCoords)];
    if (!component) return null;
    var nodes = [];
    for (var cts in component.nodes) {
        var n = component.nodes[cts];
        nodes.push({ x: n.x, y: n.y, z: n.z, blockId: n.blockId, blockData: n.blockData });
    }
    return {
        coords: { x: component.coords.x, y: component.coords.y, z: component.coords.z },
        dim: component.dim,
        nodes: nodes,
        nodeCount: nodes.length,
        incomplete: component.incomplete,
        incompleteReasons: component.incompleteReasons ? component.incompleteReasons.slice() : [],
        generation: component.generation || 0
    };
};

/** Component key owning a node, or null. */
_TopoGraph.prototype.componentOf = function (coords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    return this.nodeIndex[_topoKey(dim, coords)] || null;
};

/**
 * Host-driven re-flood of the component owning `coords` (from its controller).
 * Use when the host detects a stale node that no BlockChanged covers (e.g. a
 * tile entity was removed while the block stayed — the host re-derives
 * membership so `isNodeAt` can drop it). Returns true when a component existed
 * for the coords. Generic: the library does not know why the host re-floods.
 */
/** Read-only: are both nodes in the same (existing) component? */
_TopoGraph.prototype.isConnected = function (a, b, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var ka = this.nodeIndex[_topoKey(dim, a)];
    if (!ka) return false;
    return ka === this.nodeIndex[_topoKey(dim, b)];
};

/** Read-only: adjacent NODES of a node (traversal-only blocks are not indexed). */
_TopoGraph.prototype.neighboursOf = function (coords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var cKey = this.nodeIndex[_topoKey(dim, coords)];
    if (!cKey) return [];
    var component = this.components[cKey];
    if (!component) return [];
    var node = component.nodes[_topoCts(coords)];
    if (!node) return [];
    var out = [];
    var sides = this._sidesFor(node.blockId, node.blockData);
    for (var i = 0; i < sides.length; i++) {
        var nx = node.x + sides[i][0], ny = node.y + sides[i][1], nz = node.z + sides[i][2];
        if (this.nodeIndex[_topoKey(dim, { x: nx, y: ny, z: nz })]) out.push({ x: nx, y: ny, z: nz });
    }
    return out;
};

/** Read-only immutable snapshot (alias of component(), with generation). */
_TopoGraph.prototype.componentSnapshot = function (coords, dim) {
    return this.component(coords, dim);
};

_TopoGraph.prototype.refloodComponentOf = function (coords, dim, blockSource, opts) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var cKey = this.nodeIndex[_topoKey(dim, coords)];
    if (!cKey) return false;
    var component = this.components[cKey];
    if (!component || !component.coords) return false;
    if (!blockSource) blockSource = coords.blockSource;
    if (!blockSource) return false;
    if (this._opDepth > 0) {
        this._deferOp({
            type: "reflood",
            coords: { x: component.coords.x, y: component.coords.y, z: component.coords.z, blockSource: blockSource },
            dim: dim,
            cause: (opts && opts.cause) || "reflood",
            destructive: !!(opts && opts.destructive)
        });
        _topoLog("refloodComponentOf re-entered - deferred to the next tick");
        return false;
    }
    this.floodAssign({ x: component.coords.x, y: component.coords.y, z: component.coords.z, blockSource: blockSource }, dim, null,
        { cause: (opts && opts.cause) || "reflood", destructive: !!(opts && opts.destructive) });
    return true;
};

/**
 * Block change notification with per-tick dedup. Revalidates
 * the 6-neighborhood: node placed → joins an existing component (or creates
 * one if it is a controller); node removed → owner component drops it and
 * re-searches (marking incomplete when the search can't complete).
 * oldData/newData are optional; when omitted, the old block's data defaults
 * to 0 and the new block's data is read from coords.blockData (the host can
 * always pass them explicitly — block data is otherwise unrecoverable after
 * the change).
 */
_TopoGraph.prototype.notifyBlockChanged = function (coords, oldId, newId, dim, oldData, newData) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var entry = {
        coords: { x: coords.x, y: coords.y, z: coords.z, blockSource: coords.blockSource },
        oldId: oldId,
        newId: newId,
        dim: dim,
        oldData: oldData !== undefined && oldData !== null ? oldData : 0,
        newData: newData !== undefined && newData !== null ? newData : (coords.blockData || 0)
    };
    var key = dim + ":" + _topoCts(coords) + ":" + oldId + ":" + newId + ":" + entry.oldData + ":" + entry.newData;
    this._changedQueue[key] = entry;
    var now = TickScheduler.global.ticks;
    // Self-heal a lost flush: a scheduler reset (admin().resetAll) wipes the
    // pending batch while _changedQueued stays true, so re-arm when the queue
    // is older than one tick or the tick counter went backwards.
    var stale = this._changedQueued
        && (now < this._changedQueuedTick || (now - this._changedQueuedTick) > 1);
    if (!this._changedQueued || stale) {
        this._changedQueued = true;
        this._changedQueuedTick = now;
        // batch key carries the GRAPH id — two graphs notifying the same
        // coords in the same tick must not steal each other's flush slot
        // (TickScheduler.batch keeps only the first fn per key).
        TickScheduler.global.batch("topology:changed:" + this._id(), this._flushChanged);
    }
};

/**
 * Mark a component incomplete and record WHY (deduped). The boolean
 * `component.incomplete` stays the compatibility view; reasons are additive.
 */
_TopoGraph.prototype._addIncompleteReason = function (componentKey, component, key, reasonObj) {
    var wasIncomplete = !!component.incomplete;
    component.incomplete = true;
    if (!component.incompleteReasons) component.incompleteReasons = [];
    if (!component._reasonKeys) component._reasonKeys = Object.create(null);
    if (component._reasonKeys[key]) return;
    component._reasonKeys[key] = true;
    component.incompleteReasons.push(reasonObj);
    if (!wasIncomplete) {
        _topoEmit(this, "markedIncomplete", {
            componentKey: componentKey,
            reason: reasonObj.reason,
            coords: reasonObj.coords,
            chunkX: reasonObj.chunkX,
            chunkZ: reasonObj.chunkZ,
            dim: reasonObj.dim !== undefined ? reasonObj.dim : component.dim
        });
    }
};

_TopoGraph.prototype._beginOp = function (cause) {
    this._opDepth++;
    if (this._opDepth === 1) {
        this._operationId++;
        this._opCause = cause || null;
    }
    return this._operationId;
};

_TopoGraph.prototype._endOp = function () {
    if (this._opDepth > 0) this._opDepth--;
    if (this._opDepth === 0) this._opCause = null;
};

_TopoGraph.prototype._deferOp = function (op) {
    this._deferredOps.push(op);
    if (!this._deferredQueued) {
        this._deferredQueued = true;
        TickScheduler.global.batch("topology:deferred:" + this._id(), this._flushDeferred);
    }
};

_TopoGraph.prototype._flushDeferredOps = function () {
    this._deferredQueued = false;
    var ops = this._deferredOps;
    this._deferredOps = [];
    for (var i = 0; i < ops.length; i++) {
        var op = ops[i];
        try {
            if (op.type === "flood") this.floodAssign(op.coords, op.dim, null, { cause: op.cause || "assign", destructive: op.destructive !== false });
            else if (op.type === "remove") this.removeComponent(op.coords, op.dim);
            else if (op.type === "reflood") this.refloodComponentOf(op.coords, op.dim, op.coords.blockSource, { cause: op.cause || "reflood", destructive: op.destructive === true });
        } catch (e) {
            _topoLog('deferred "' + op.type + '" failed: ' + e);
        }
    }
};

_TopoGraph.prototype._flushChangedQueue = function () {
    this._changedQueued = false;
    var queue = this._changedQueue;
    this._changedQueue = {};
    this._affected = {};
    this._beginOp("change");
    var changes = [];
    for (var key in queue) {
        var change = queue[key];
        changes.push(change);
        try {
            this._processChange(change);
        } catch (e) {
            _topoLog('_processChange failed for "' + key + '": ' + e);
        }
    }
    // refloodOnChange — re-derive the affected components once per tick
    // (a batch of changes collapses into a single reflood per component).
    if (this.config.refloodOnChange === "onChange") {
        for (var ak in this._affected) {
            var a = this._affected[ak];
            if (!this.components[_topoKey(a.dim, a.coords)]) continue;
            try {
                this._floodAssign({ x: a.coords.x, y: a.coords.y, z: a.coords.z, blockSource: a.blockSource }, a.dim, null, { cause: "reflood", destructive: false });
            } catch (e) {
                _topoLog('reflood failed for "' + ak + '": ' + e);
            }
        }
    }
    this._affected = {};
    // Host hook, AFTER the graph is stable: lets the host apply its own policy for
    // each changed coordinate (e.g. refresh a moved tile's model / reset a data field).
    // Wrapped per-change so a host error cannot affect the graph.
    if (changes.length && typeof this.config.onAfterChange === "function") {
        for (var ci = 0; ci < changes.length; ci++) {
            changes[ci].operationId = this._operationId;
            changes[ci].cause = "change";
            try { this.config.onAfterChange(changes[ci]); } catch (e) {}
        }
    }
    this._endOp();
};

/** Record a component whose controller should be re-flooded (refloodOnChange). */
_TopoGraph.prototype._markAffected = function (component, dim, blockSource) {
    if (!component || !component.coords) return;
    if (!this._affected) this._affected = {};
    var cKey = _topoKey(dim, component.coords);
    if (!this._affected[cKey]) {
        this._affected[cKey] = {
            coords: { x: component.coords.x, y: component.coords.y, z: component.coords.z },
            dim: dim,
            blockSource: blockSource
        };
    }
};

_TopoGraph.prototype._processChange = function (change) {
    var blockSource = change.coords.blockSource;
    if (!blockSource) return;

    if (this._isController(change.oldId, change.oldData || 0)) {
        this._removeComponentCore(change.coords, change.dim);
    }
    if (this._isController(change.newId, change.newData || 0)) {
        var prevCause = this._opCause;
        this._opCause = "assign";
        try {
            this._floodAssign({ x: change.coords.x, y: change.coords.y, z: change.coords.z, blockSource: blockSource }, change.dim, null, { cause: "assign", destructive: true });
        } finally {
            this._opCause = prevCause;
        }
        return;
    }
    // Removal is detected by id (isNode), not by the tile-aware predicate:
    // a batched/deferred flush runs after the tile entity is gone, so
    // _isNodeAt(oldId) would be false and the node would never be dropped.
    var wasNode = (typeof this.config.isNode === "function")
        ? this._isNodeById(change.oldId, change.oldData || 0)
        : this._isNodeAt(change.oldId, change.oldData || 0, change.coords, blockSource);
    if (wasNode && !this._isNodeAt(change.newId, change.newData || 0, change.coords, blockSource)) {
        var cKeyOld = this.nodeIndex[_topoKey(change.dim, change.coords)];
        if (cKeyOld && this.components[cKeyOld]) this._markAffected(this.components[cKeyOld], change.dim, blockSource);
        this._removeNode(change.coords, change.dim);
    }
    if (this._isNodeAt(change.newId, change.newData || 0, change.coords, blockSource)) {
        this._tryJoin(change.coords, change.dim, change.newId, change.newData || 0);
        var cKeyNew = this.nodeIndex[_topoKey(change.dim, change.coords)];
        if (cKeyNew && this.components[cKeyNew]) this._markAffected(this.components[cKeyNew], change.dim, blockSource);
    }
};

_TopoGraph.prototype._removeNode = function (coords, dim) {
    var nodeKey = _topoKey(dim, coords);
    var cKey = this.nodeIndex[nodeKey];
    if (!cKey) return;
    var component = this.components[cKey];
    if (!component) { delete this.nodeIndex[nodeKey]; return; }
    var removedNode = component.nodes[_topoCts(coords)];
    delete component.nodes[_topoCts(coords)];
    delete this.nodeIndex[nodeKey];
    _topoEmit(this, "nodeRemoved", {
        componentKey: cKey,
        coords: coords,
        dim: dim,
        blockId: removedNode ? removedNode.blockId : undefined
    });
    if (component.coords && (component.coords.x === coords.x && component.coords.y === coords.y && component.coords.z === coords.z)) {
        // the controller itself is gone → destroy the component; drop every
        // remaining member from nodeIndex so no dangling keys survive.
        for (var rk in component.nodes) {
            delete this.nodeIndex[_topoKey(dim, component.nodes[rk])];
        }
        delete this.components[cKey];
        _topoEmit(this, "componentDestroyed", { componentKey: cKey, coords: coords, dim: dim });
        return;
    }
    // a removed bridge may split the component — orphan the cut-off part.
    if (this.config.detectSplits && this.components[cKey]) {
        this._splitCheck(this.components[cKey], cKey, dim);
    }
};

/**
 * Detach a node from a component it no longer belongs to (ghost cleanup).
 * Emits nodeRemoved for the old component. Rare path, kept out of the hot loop.
 */
_TopoGraph.prototype._stealNode = function (prevOwner, cts, coords, dim) {
    var prev = this.components[prevOwner];
    if (!prev || !prev.nodes[cts]) return;
    var prevNode = prev.nodes[cts];
    delete prev.nodes[cts];
    _topoEmit(this, "nodeRemoved", {
        componentKey: prevOwner,
        coords: { x: coords.x, y: coords.y, z: coords.z },
        dim: dim,
        blockId: prevNode.blockId
    });
};

/**
 * Put a node into a component. A node belongs to exactly one component: if it
 * is currently registered under another component, detach it from there first
 * (emitting nodeRemoved for the old component) so no ghost membership survives.
 */
_TopoGraph.prototype._assignNode = function (component, ownerKey, coords, dim, blockId, blockData) {
    var nodeKey = _topoKey(dim, coords);
    var cts = _topoCts(coords);
    var prevOwner = this.nodeIndex[nodeKey];
    if (prevOwner && prevOwner !== ownerKey) this._stealNode(prevOwner, cts, coords, dim);
    component.nodes[cts] = { x: coords.x, y: coords.y, z: coords.z, blockId: blockId || 0, blockData: blockData || 0 };
    this.nodeIndex[nodeKey] = ownerKey;
};

_TopoGraph.prototype._tryJoin = function (coords, dim, blockId, blockData) {
    var blockSource = coords.blockSource;
    if (!blockSource) return;
    var sides = this._sidesFor(blockId, blockData);
    var owners = [];
    for (var s = 0; s < sides.length; s++) {
        var nx = coords.x + sides[s][0], ny = coords.y + sides[s][1], nz = coords.z + sides[s][2];
        var nKey = _topoKey(dim, { x: nx, y: ny, z: nz });
        var o = this.nodeIndex[nKey];
        if (o && owners.indexOf(o) === -1) owners.push(o);
    }
    if (!owners.length) return;
    var owner = owners[0];
    var component = this.components[owner];
    if (!component) return;
    // a bridge node can touch SEVERAL components — merge them when enabled.
    if (owners.length > 1 && this.config.mergeComponents) {
        for (var oi = 1; oi < owners.length; oi++) {
            this._mergeInto(owner, owners[oi], dim, coords);
        }
    }
    this._assignNode(component, owner, coords, dim, blockId, blockData);
    _topoEmit(this, "nodeAdded", { componentKey: owner, coords: coords, dim: dim });
};

/**
 * Absorb `fromKey`'s nodes into `targetKey` and emit componentMerged.
 * The absorbed component's controller is NOT touched — the host applies its
 * duplicate-controller policy on the componentMerged event.
 */
_TopoGraph.prototype._mergeInto = function (targetKey, fromKey, dim, coords) {
    if (targetKey === fromKey) return;
    var target = this.components[targetKey];
    var from = this.components[fromKey];
    if (!target || !from) return;
    for (var cts in from.nodes) {
        var n = from.nodes[cts];
        target.nodes[cts] = n;
        this.nodeIndex[_topoKey(dim, n)] = targetKey;
    }
    target.generation = (target.generation || 0) + 1;
    delete this.components[fromKey];
    var prevCauseM = this._opCause;
    this._opCause = "merge";
    _topoEmit(this, "componentMerged", {
        componentKey: targetKey,
        mergedKey: fromKey,
        mergedControllerCoords: from.coords,
        coords: { x: coords.x, y: coords.y, z: coords.z },
        dim: dim
    });
    this._opCause = prevCauseM;
};

/**
 * After a node removal, orphan the members no longer reachable from
 * the component's controller (a split). Emits nodeOrphaned per cut-off node.
 */
_TopoGraph.prototype._splitCheck = function (component, cKey, dim) {
    var members = component.nodes;
    var reachable = {};
    var stack = [];
    var ccoords = component.coords;
    var cSides = this._sidesFor(component.rootBlockId || 0, component.rootBlockData || 0);
    for (var cts in members) {
        var n = members[cts];
        var connected = false;
        for (var cs = 0; cs < cSides.length && !connected; cs++) {
            connected = (ccoords.x + cSides[cs][0] === n.x &&
                ccoords.y + cSides[cs][1] === n.y &&
                ccoords.z + cSides[cs][2] === n.z);
        }
        if (!connected) {
            var nSides = this._sidesFor(n.blockId, n.blockData);
            for (var ns = 0; ns < nSides.length && !connected; ns++) {
                connected = (n.x + nSides[ns][0] === ccoords.x &&
                    n.y + nSides[ns][1] === ccoords.y &&
                    n.z + nSides[ns][2] === ccoords.z);
            }
        }
        if (connected) { reachable[cts] = true; stack.push(n); }
    }
    while (stack.length) {
        var cur = stack.pop();
        var sides = this._sidesFor(cur.blockId, cur.blockData);
        for (var s = 0; s < sides.length; s++) {
            var nbCts = (cur.x + sides[s][0]) + "," + (cur.y + sides[s][1]) + "," + (cur.z + sides[s][2]);
            if (members[nbCts] && !reachable[nbCts]) { reachable[nbCts] = true; stack.push(members[nbCts]); }
        }
    }
    var splitHappened = false;
    for (var cts2 in members) {
        if (reachable[cts2]) continue;
        splitHappened = true;
        var o = members[cts2];
        delete members[cts2];
        delete this.nodeIndex[_topoKey(dim, o)];
        var prevCauseS = this._opCause;
        this._opCause = "split";
        _topoEmit(this, "nodeOrphaned", { componentKey: cKey, coords: { x: o.x, y: o.y, z: o.z }, dim: dim, blockId: o.blockId });
        this._opCause = prevCauseS;
    }
    if (splitHappened) component.generation = (component.generation || 0) + 1;
};

/** Mark every component intersecting the chunk as incomplete. */
_TopoGraph.prototype.markChunkUnloaded = function (chunkX, chunkZ, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    for (var cKey in this.components) {
        var component = this.components[cKey];
        if (component.dim !== dim) continue;
        var hit = false;
        for (var cts in component.nodes) {
            var n = component.nodes[cts];
            if ((n.x >> 4) == chunkX && (n.z >> 4) == chunkZ) { hit = true; break; }
        }
        if (!hit && (component.coords.x >> 4) == chunkX && (component.coords.z >> 4) == chunkZ) hit = true;
        if (hit) {
            this._addIncompleteReason(cKey, component, "unloadedChunk:" + chunkX + "," + chunkZ,
                { reason: "unloaded", chunkX: chunkX, chunkZ: chunkZ, dim: dim });
        }
    }
};

/** Chunk loaded: schedule a rebuild when an incomplete component intersects it. */
_TopoGraph.prototype.markChunkLoaded = function (chunkX, chunkZ, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    for (var cKey in this.components) {
        var component = this.components[cKey];
        if (component.dim !== dim || !component.incomplete) continue;
        var hit = false;
        for (var cts in component.nodes) {
            var n = component.nodes[cts];
            if ((n.x >> 4) == chunkX && (n.z >> 4) == chunkZ) { hit = true; break; }
        }
        if (!hit && (component.coords.x >> 4) == chunkX && (component.coords.z >> 4) == chunkZ) hit = true;
        if (hit) {
            this.scheduleRebuild();
            return;
        }
    }
};

/**
 * Debounced rebuild (10-tick countdown, re-armed while incomplete).
 * On expiry, calls config.onRebuildNeeded(component, componentKey) for each
 * incomplete component. The host performs the tile-level work there.
 * A single interval task per graph is re-armed in place — never duplicated
 * (TickScheduler is a declared dependency, imported at the top).
 */
_TopoGraph.prototype._cancelRebuild = function () {
    if (this._rebuildInterval && typeof this._rebuildInterval.cancel == "function") {
        try { this._rebuildInterval.cancel(); } catch (e) {}
    }
    this._rebuildInterval = null;
    this._rebuildPending = false;
};

_TopoGraph.prototype.scheduleRebuild = function () {
    if (this._rebuildInterval) {
        if (typeof this._rebuildInterval.isLive == "function" && !this._rebuildInterval.isLive()) {
            // a scheduler reset wiped the interval: fall through and re-arm
            this._rebuildInterval = null;
        } else {
            if (!this._rebuildPending) {
                this._rebuildPending = true;
                this._rebuildTicks = 10;
            }
            return;
        }
    }
    this._rebuildPending = true;
    this._rebuildTicks = 10;
    var self = this;
    var step = function () {
        if (!self._rebuildPending) return;
        self._rebuildTicks--;
        if (self._rebuildTicks > 0) return;
        self._rebuildPending = false;
        for (var cKey in self.components) {
            var component = self.components[cKey];
            if (!component.incomplete) continue;
            if (typeof self.config.onRebuildNeeded == "function") {
                try { self.config.onRebuildNeeded(component, cKey); } catch (e) {}
            }
        }
        var stillIncomplete = false;
        for (var cKey2 in self.components) {
            if (self.components[cKey2].incomplete) { stillIncomplete = true; break; }
        }
        if (stillIncomplete) {
            self._rebuildPending = true;
            self._rebuildTicks = 10;
        } else {
            self._cancelRebuild();
        }
    };
    this._rebuildInterval = TickScheduler.global.interval("topology:rebuild:" + this._id(), 1, step);
};

var _topoIdCounter = 0;
_TopoGraph.prototype._id = function () {
    if (!this.__topoId) this.__topoId = ++_topoIdCounter;
    return this.__topoId;
};

/**
 * Mark a SPECIFIC component incomplete (host-detected gap: a tile lookup
 * failed, an unloaded area was reached, etc). Emits "markedIncomplete" on the
 * false→true transition (same semantics as markChunkUnloaded, which scans by
 * chunk). Returns true if the component exists.
 */
_TopoGraph.prototype.markComponentIncomplete = function (controllerCoords, dim, reason) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var cKey = _topoKey(dim, controllerCoords);
    var component = this.components[cKey];
    if (!component) return false;
    var label = reason || "host";
    this._addIncompleteReason(cKey, component, "host:" + label,
        { reason: label, coords: { x: controllerCoords.x, y: controllerCoords.y, z: controllerCoords.z } });
    return true;
};

/** Mark a component as rebuilt (host calls after successful rebuild). */
_TopoGraph.prototype.markComplete = function (controllerCoords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var component = this.components[_topoKey(dim, controllerCoords)];
    if (component && component.incomplete) {
        component.incomplete = false;
        component.incompleteReasons = [];
        component._reasonKeys = Object.create(null);
        _topoEmit(this, "markedComplete", { componentKey: _topoKey(dim, controllerCoords), dim: dim });
    }
};

/** Remove a component and its node index (controller destroyed). */
_TopoGraph.prototype.removeComponent = function (controllerCoords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    if (this._opDepth > 0) {
        this._deferOp({
            type: "remove",
            coords: { x: controllerCoords.x, y: controllerCoords.y, z: controllerCoords.z, blockSource: controllerCoords.blockSource },
            dim: dim
        });
        _topoLog("removeComponent re-entered - deferred to the next tick");
        return false;
    }
    this._beginOp("detach");
    try {
        return this._removeComponentCore(controllerCoords, dim);
    } finally {
        this._endOp();
    }
};

/** Unguarded core (internal callers run inside an already-open operation). */
_TopoGraph.prototype._removeComponentCore = function (controllerCoords, dim) {
    dim = dim === undefined || dim === null ? 0 : dim;
    var cKey = _topoKey(dim, controllerCoords);
    var component = this.components[cKey];
    if (!component) return false;
    for (var cts in component.nodes) {
        var n = component.nodes[cts];
        delete this.nodeIndex[_topoKey(dim, n)];
    }
    delete this.components[cKey];
    _topoEmit(this, "componentDestroyed", { componentKey: cKey, coords: controllerCoords, dim: dim });
    return true;
};

/** LevelLeft cleanup. */
_TopoGraph.prototype.reset = function () {
    this._cancelRebuild();
    this.components = {};
    this.nodeIndex = {};
    this._changedQueue = {};
    this._changedQueued = false;
    this._changedQueuedTick = 0;
    this._affected = {};
    this._opDepth = 0;
    this._operationId = 0;
    this._deferredOps = [];
    this._deferredQueued = false;
};

_TopoGraph.prototype.destroy = function () {
    this.reset();
    this.bus.clear();
};

TopologyCore.createGraph = function (config) {
    return new _TopoGraph(config);
};

EXPORT("TopologyCore", TopologyCore);
