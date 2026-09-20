LIBRARY({
    name: "Adapters",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:1"]
});

IMPORT("CoreKit:1");

var Adapters = {};

/*
 * ============================================================================
 * Adapters — cross-mod storage adapters over StorageCore
 * ============================================================================
 * Each adapter turns a foreign container (drawer, generic slot container,
 * neighbour block) into a StorageCore entry and writes changes back to the source.
 *
 * Contract: every adapter produces a StorageCore ENTRY
 *   { storage, items_stored, items: { [uid]: { id, data, count, extra } } }
 * Entries mirror an external container (drawer/chest). The mirror is the
 * live object for the network; syncFrom() reads the external container into
 * the mirror, syncTo() applies the mirror back (bidirectional write-through)
 * and RETURNS the amount that could not be applied — nothing is lost
 * silently, the caller decides where the leftover goes.
 * planTo() is the dry-run of syncTo(): it returns the slot operations that
 * WOULD be applied ({ ops, leftover, storage }) without touching the source
 * and without mutating the mirror. ops entries carry the final slot state
 * (id 0 = clear). The tile.add hook is not invoked during a dry-run (room is
 * used instead), so a host applying a plan must re-run syncTo for the hook.
 * ============================================================================
 */

function _adpUid(item) {
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items) return CoreKit.Items.uidOf(item);
    return item.id + "_" + item.data;
}

function _adpHas(obj, key) {
    return typeof obj == "undefined" || obj === null ? false : typeof obj[key] == "function";
}

/** Deterministic composition token; changes only when uid/count change. */
function _adpToken(items) {
    var parts = [];
    for (var uid in items) {
        if (!Object.prototype.hasOwnProperty.call(items, uid)) continue;
        parts.push(uid + "=" + items[uid].count);
    }
    parts.sort();
    return parts.join("|");
}

function _adpDrawerSlotNames(tile) {
    if (tile && _adpHas(tile, "getSlotNames")) {
        try {
            var names = tile.getSlotNames();
            if (names && names.length) return names;
        } catch (e) {}
    }
    if (typeof StorageInterface != "undefined" && StorageInterface &&
        typeof StorageInterface.getInterface == "function") {
        try {
            var iface = StorageInterface.getInterface(tile);
            if (iface && _adpHas(iface, "getContainerSlots")) {
                var fromIface = iface.getContainerSlots();
                if (fromIface && fromIface.length) {
                    var filtered = [];
                    for (var fi = 0; fi < fromIface.length; fi++) {
                        if (/^slot_/.test(String(fromIface[fi]))) filtered.push(fromIface[fi]);
                    }
                    if (filtered.length) return filtered;
                }
            }
        } catch (e) {}
    }
    var probed = [];
    if (tile && tile.container && tile.container.slots) {
        for (var k in tile.container.slots) {
            if (/^slot_\d+$/.test(k)) probed.push(k);
        }
    }
    return probed;
}

function _adpDrawerPerSlotCapacity(tile, fallback) {
    var size = fallback || 64;
    if (tile && _adpHas(tile, "getConfig")) {
        try {
            var cfg = tile.getConfig();
            if (cfg && cfg.size > 0) size = cfg.size;
        } catch (e) {}
    }
    return size;
}

function _adpSlotCandidates(storage, slotNames, mode) {
    var method = mode == "in" ? "getInputSlots" : "getOutputSlots";
    if (_adpHas(storage, method)) {
        try {
            var names = storage[method]();
            if (names && names.length) {
                var map = {};
                for (var i = 0; i < names.length; i++) map[String(names[i])] = true;
                var filtered = [];
                for (var s = 0; s < slotNames.length; s++) {
                    if (map[String(slotNames[s])]) filtered.push(slotNames[s]);
                }
                if (filtered.length) return filtered;
            }
        } catch (e) {}
    }
    return slotNames;
}

/* ------------------------------------------------------------- capabilities -- */

/**
 * Declarative capability inventory per adapter kind (drift baseline: keep in
 * sync with the actual accesses and with the README table).
 * required  → adapter cannot work without it (check() ok=false)
 * optional  → degraded mode, handled by the fallback chain
 */
Adapters.capabilities = {
    drawer: {
        target: "tile",
        required: ["container.getSlot", "container.setSlot"],
        optional: ["getSlotNames", "getConfig", "add", "validateAll", "container.clearSlot", "container.sendChanges"]
    },
    container: {
        target: "storage",
        required: ["getSlot", "setSlot"],
        optional: ["getContainerSlots", "getSlotMaxStack", "clearSlot", "getInputSlots", "getOutputSlots"]
    },
    neighbour: {
        target: "global",
        required: ["StorageInterface.getNeighbourStorage"],
        optional: []
    }
};

function _adpProbeGlobal(path) {
    var parts = String(path).split(".");
    if (parts[0] != "StorageInterface") return false;
    if (typeof StorageInterface == "undefined" || !StorageInterface) return false;
    var obj = StorageInterface;
    for (var i = 1; i < parts.length; i++) {
        if (obj === null || obj === undefined || typeof obj[parts[i]] != "function") return false;
        obj = obj[parts[i]];
    }
    return true;
}

/**
 * Pre-flight capability check for an adapter target.
 * Returns { ok, missingRequired, missingOptional }.
 */
Adapters.check = function (kind, target) {
    var spec = Adapters.capabilities[kind];
    var missingRequired = [];
    var missingOptional = [];
    if (!spec) return { ok: false, missingRequired: missingRequired, missingOptional: missingOptional };
    function has(path) {
        if (spec.target == "global") return _adpProbeGlobal(path);
        var obj = target;
        var parts = String(path).split(".");
        for (var i = 0; i < parts.length; i++) {
            if (obj === null || obj === undefined) return false;
            obj = obj[parts[i]];
        }
        return typeof obj == "function";
    }
    for (var r = 0; r < spec.required.length; r++) {
        if (!has(spec.required[r])) missingRequired.push(spec.required[r]);
    }
    for (var o = 0; o < spec.optional.length; o++) {
        if (!has(spec.optional[o])) missingOptional.push(spec.optional[o]);
    }
    return { ok: missingRequired.length === 0, missingRequired: missingRequired, missingOptional: missingOptional };
};

/* ------------------------------------------------------------------ drawer -- */

/**
 * Drawer entry: capacity = per-slot capacity (tile.getConfig().size) × slot count,
 * syncFrom(tile) rebuilds the mirror from the drawer slots,
 * syncTo(tile) applies the mirror back (bidirectional) and returns the
 * un-applied amount. planTo(tile) is the side-effect-free dry-run.
 * Locking (addon drawerKey → data._lockedSlots) is respected on write;
 * drawers reject non-null extras.
 */
Adapters.drawer = function (blockId, configSize) {
    var entry = {
        storage: configSize || 64,
        items_stored: 0,
        items: {},
        _drawerTile: null,
        _blockId: blockId,
        _slotNames: []
    };

    function readState() {
        var tile = entry._drawerTile;
        var slotNames = _adpDrawerSlotNames(tile);
        var perSlot = _adpDrawerPerSlotCapacity(tile, configSize);
        var slots = [];
        for (var s = 0; s < slotNames.length; s++) {
            var slot = tile && tile.container ? tile.container.getSlot(slotNames[s]) : null;
            slots.push(slot && slot.id > 0 && slot.count > 0
                ? { id: slot.id, data: slot.data, extra: slot.extra || null, count: slot.count }
                : { id: 0, data: 0, extra: null, count: 0 });
        }
        return { tile: tile, slotNames: slotNames, perSlot: perSlot, slots: slots };
    }

    function buildPlan(state, applyAdd) {
        var ops = [];
        var leftover = 0;
        var adjustments = [];
        var want = {};
        for (var wuid in entry.items) want[wuid] = entry.items[wuid].count;
        var have = {};
        for (var i = 0; i < state.slots.length; i++) {
            var v = state.slots[i];
            if (v.id > 0 && v.count > 0) have[_adpUid(v)] = (have[_adpUid(v)] || 0) + v.count;
        }
        for (var uidW in have) {
            var toRemove = have[uidW] - (want[uidW] || 0);
            if (toRemove <= 0) continue;
            for (var s2 = 0; s2 < state.slots.length && toRemove > 0; s2++) {
                var v2 = state.slots[s2];
                if (v2.id <= 0 || _adpUid(v2) !== uidW) continue;
                var take = Math.min(v2.count, toRemove);
                v2.count -= take;
                if (v2.count <= 0) { v2.id = 0; v2.data = 0; v2.extra = null; v2.count = 0; }
                ops.push({ slot: state.slotNames[s2], id: v2.id, count: v2.count, data: v2.data, extra: v2.extra });
                toRemove -= take;
            }
            leftover += toRemove;
        }
        var haveNow = {};
        for (var n = 0; n < state.slots.length; n++) {
            var vn = state.slots[n];
            if (vn.id > 0 && vn.count > 0) haveNow[_adpUid(vn)] = (haveNow[_adpUid(vn)] || 0) + vn.count;
        }
        for (var uidD in entry.items) {
            var item = entry.items[uidD];
            var unplaced = item.count - (haveNow[uidD] || 0);
            if (unplaced <= 0) continue;
            if (!item.extra) {
                for (var s3 = 0; s3 < state.slots.length && unplaced > 0; s3++) {
                    var name = state.slotNames[s3];
                    var v3 = state.slots[s3];
                    var lock = (state.tile && state.tile.data && state.tile.data._lockedSlots) ? state.tile.data._lockedSlots[name] : null;
                    if (lock && (lock.id !== item.id || lock.data !== item.data)) continue;
                    if (v3.id !== 0 && (v3.id !== item.id || v3.data !== item.data)) continue;
                    var room = state.perSlot - v3.count;
                    if (room <= 0) continue;
                    var accepted = Math.min(unplaced, room);
                    if (applyAdd && _adpHas(state.tile, "add")) {
                        var added = state.tile.add(name, item.id, accepted, item.data, null);
                        accepted = (typeof added == "number" && isFinite(added) && added > 0) ? Math.min(added, accepted) : 0;
                    }
                    if (accepted > 0) {
                        v3.id = item.id;
                        v3.data = item.data;
                        v3.extra = null;
                        v3.count += accepted;
                        ops.push({ slot: name, id: v3.id, count: v3.count, data: v3.data, extra: v3.extra });
                        unplaced -= accepted;
                    }
                }
            }
            if (unplaced > 0) {
                leftover += unplaced;
                adjustments.push({ uid: uidD, unplaced: unplaced });
            }
        }
        return { ops: ops, leftover: leftover, adjustments: adjustments };
    }

    function applyOps(tile, ops) {
        var container = tile.container;
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (op.id > 0) container.setSlot(op.slot, op.id, op.count, op.data, op.extra || null);
            else if (_adpHas(container, "clearSlot")) container.clearSlot(op.slot);
            else container.setSlot(op.slot, 0, 0, 0, null);
        }
    }

    entry.syncFrom = function (tile) {
        if (tile) this._drawerTile = tile;
        var state = readState();
        var items = {};
        var stored = 0;
        for (var s = 0; s < state.slots.length; s++) {
            var v = state.slots[s];
            if (v.id <= 0 || v.count <= 0) continue;
            var uid = _adpUid(v);
            if (items[uid]) items[uid].count += v.count;
            else items[uid] = { id: v.id, data: v.data, extra: v.extra || null, count: v.count };
            stored += v.count;
        }
        this.items = items;
        this.items_stored = stored;
        this._slotNames = state.slotNames;
        this.storage = state.perSlot * state.slotNames.length;
    };

    entry.planTo = function (tile) {
        if (tile) this._drawerTile = tile;
        var state = readState();
        var plan = buildPlan(state, false);
        return { ops: plan.ops, leftover: plan.leftover, storage: state.perSlot * state.slotNames.length };
    };

    entry.syncTo = function (tile) {
        if (tile) this._drawerTile = tile;
        var tileRef = this._drawerTile;
        var leftover = 0;
        if (!tileRef || !tileRef.container) return leftover;
        var state = readState();
        var plan = buildPlan(state, true);
        applyOps(tileRef, plan.ops);
        leftover = plan.leftover;
        for (var a = 0; a < plan.adjustments.length; a++) {
            var adj = plan.adjustments[a];
            var item = this.items[adj.uid];
            if (!item) continue;
            item.count -= adj.unplaced;
            if (item.count <= 0) delete this.items[adj.uid];
        }
        var stored = 0;
        for (var uidS in this.items) stored += this.items[uidS].count;
        this.items_stored = stored;
        this.storage = state.perSlot * state.slotNames.length;
        if (_adpHas(tileRef, "validateAll")) tileRef.validateAll();
        if (tileRef.container && _adpHas(tileRef.container, "sendChanges")) tileRef.container.sendChanges();
        return leftover;
    };

    entry.changeToken = function () {
        return _adpToken(this.items);
    };

    return entry;
};

/**
 * Provider for a drawer network: one entry per drawer tile. The host feeds
 * entries into StorageCore.createView.
 */
Adapters.drawerEntries = function (drawerTiles) {
    var entries = [];
    for (var i = 0; i < drawerTiles.length; i++) {
        var tile = drawerTiles[i];
        var perSlot = _adpDrawerPerSlotCapacity(tile, 64);
        var entry = Adapters.drawer(tile ? tile.blockID : 0, perSlot);
        entry.syncFrom(tile);
        entries.push(entry);
    }
    return entries;
};

/* --------------------------------------------------------------- container -- */

/**
 * Container entry from a StorageInterface container/Storage (named slots +
 * per-slot maxStack). capacity = sum of slot maxStacks (default 64/slot).
 * opts: { inSlots?: string[], outSlots?: string[] } overrides the
 * input/output slot lists discovered from the storage (host policy).
 * syncTo() is bidirectional (withdrawals + deposits, respecting input/output
 * slots when the storage exposes them) and returns the un-applied amount.
 * planTo() is the side-effect-free dry-run. Slot names/capacity are
 * re-discovered on every sync/plan (container topology can change).
 */
Adapters.container = function (storage, opts) {
    opts = opts || {};
    var fixedIn = (opts.inSlots && opts.inSlots.length) ? opts.inSlots.slice() : null;
    var fixedOut = (opts.outSlots && opts.outSlots.length) ? opts.outSlots.slice() : null;
    var entry = {
        storage: 0,
        items_stored: 0,
        items: {},
        _storage: storage,
        _slotNames: [],
        _maxStacks: {}
    };

    function refreshSlots() {
        var slotNames = [];
        var maxStacks = {};
        var capacity = 0;
        try {
            if (_adpHas(storage, "getContainerSlots")) {
                slotNames = storage.getContainerSlots() || [];
                for (var s = 0; s < slotNames.length; s++) {
                    var name = slotNames[s];
                    var ms = 64;
                    if (_adpHas(storage, "getSlotMaxStack")) {
                        try { ms = storage.getSlotMaxStack(name) || 64; } catch (e) {}
                    }
                    maxStacks[String(name)] = ms;
                    capacity += ms;
                }
            }
        } catch (e) {
            slotNames = [];
            maxStacks = {};
            capacity = 0;
        }
        entry._slotNames = slotNames;
        entry._maxStacks = maxStacks;
        entry.storage = capacity;
    }

    function readState() {
        var slots = [];
        for (var s = 0; s < entry._slotNames.length; s++) {
            var slot = entry._storage ? entry._storage.getSlot(entry._slotNames[s]) : null;
            slots.push(slot && slot.id > 0 && slot.count > 0
                ? { id: slot.id, data: slot.data, extra: slot.extra || null, count: slot.count }
                : { id: 0, data: 0, extra: null, count: 0 });
        }
        return { slots: slots, slotNames: entry._slotNames, maxStacks: entry._maxStacks };
    }

    function buildPlan(state) {
        var ops = [];
        var leftover = 0;
        var adjustments = [];
        var want = {};
        for (var wuid in entry.items) want[wuid] = entry.items[wuid].count;
        var outNames = fixedOut || _adpSlotCandidates(entry._storage, state.slotNames, "out");
        var outIndex = {};
        for (var oi = 0; oi < outNames.length; oi++) outIndex[String(outNames[oi])] = true;
        var have = {};
        for (var i = 0; i < state.slots.length; i++) {
            var v = state.slots[i];
            if (v.id > 0 && v.count > 0) have[_adpUid(v)] = (have[_adpUid(v)] || 0) + v.count;
        }
        for (var uidW in have) {
            var toRemove = have[uidW] - (want[uidW] || 0);
            if (toRemove <= 0) continue;
            for (var s2 = 0; s2 < state.slots.length && toRemove > 0; s2++) {
                var name2 = state.slotNames[s2];
                if (!outIndex[String(name2)]) continue;
                var v2 = state.slots[s2];
                if (v2.id <= 0 || _adpUid(v2) !== uidW) continue;
                var take = Math.min(v2.count, toRemove);
                v2.count -= take;
                if (v2.count <= 0) { v2.id = 0; v2.data = 0; v2.extra = null; v2.count = 0; }
                ops.push({ slot: name2, id: v2.id, count: v2.count, data: v2.data, extra: v2.extra });
                toRemove -= take;
            }
            leftover += toRemove;
        }
        var inNames = fixedIn || _adpSlotCandidates(entry._storage, state.slotNames, "in");
        var inIndex = {};
        for (var ii = 0; ii < inNames.length; ii++) inIndex[String(inNames[ii])] = true;
        var haveNow = {};
        for (var n = 0; n < state.slots.length; n++) {
            var vn = state.slots[n];
            if (vn.id > 0 && vn.count > 0) haveNow[_adpUid(vn)] = (haveNow[_adpUid(vn)] || 0) + vn.count;
        }
        for (var uidD in entry.items) {
            var item = entry.items[uidD];
            var unplaced = item.count - (haveNow[uidD] || 0);
            if (unplaced <= 0) continue;
            for (var s3 = 0; s3 < state.slots.length && unplaced > 0; s3++) {
                if (!inIndex[String(state.slotNames[s3])]) continue;
                var v3 = state.slots[s3];
                if (v3.id !== 0 && (v3.id !== item.id || v3.data !== item.data)) continue;
                var ms3 = state.maxStacks[String(state.slotNames[s3])] || 64;
                var room = ms3 - v3.count;
                if (room <= 0) continue;
                var add = Math.min(unplaced, room);
                v3.id = item.id;
                v3.data = item.data;
                v3.extra = item.extra || null;
                v3.count += add;
                ops.push({ slot: state.slotNames[s3], id: v3.id, count: v3.count, data: v3.data, extra: v3.extra });
                unplaced -= add;
            }
            if (unplaced > 0) {
                leftover += unplaced;
                adjustments.push({ uid: uidD, unplaced: unplaced });
            }
        }
        return { ops: ops, leftover: leftover, adjustments: adjustments };
    }

    function applyOps(ops) {
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            if (op.id > 0) entry._storage.setSlot(op.slot, op.id, op.count, op.data, op.extra || null);
            else if (_adpHas(entry._storage, "clearSlot")) entry._storage.clearSlot(op.slot);
            else entry._storage.setSlot(op.slot, 0, 0, 0, null);
        }
    }

    entry.syncFrom = function () {
        refreshSlots();
        var state = readState();
        var items = {};
        var stored = 0;
        for (var s = 0; s < state.slots.length; s++) {
            var v = state.slots[s];
            if (v.id <= 0 || v.count <= 0) continue;
            var uid = _adpUid(v);
            if (items[uid]) items[uid].count += v.count;
            else items[uid] = { id: v.id, data: v.data, extra: v.extra || null, count: v.count };
            stored += v.count;
        }
        this.items = items;
        this.items_stored = stored;
    };

    entry.planTo = function () {
        refreshSlots();
        var state = readState();
        var plan = buildPlan(state);
        return { ops: plan.ops, leftover: plan.leftover, storage: this.storage };
    };

    entry.syncTo = function () {
        var leftover = 0;
        if (!this._storage || !_adpHas(this._storage, "getSlot") || !_adpHas(this._storage, "setSlot")) return leftover;
        refreshSlots();
        var state = readState();
        var plan = buildPlan(state);
        applyOps(plan.ops);
        leftover = plan.leftover;
        for (var a = 0; a < plan.adjustments.length; a++) {
            var adj = plan.adjustments[a];
            var item = this.items[adj.uid];
            if (!item) continue;
            item.count -= adj.unplaced;
            if (item.count <= 0) delete this.items[adj.uid];
        }
        var stored = 0;
        for (var uidS in this.items) stored += this.items[uidS].count;
        this.items_stored = stored;
        return leftover;
    };

    entry.changeToken = function () {
        return _adpToken(this.items);
    };

    entry.syncFrom();
    return entry;
};

/* ----------------------------------------------------------- write-through -- */

/**
 * Sync a set of entries with change detection: an entry whose changeToken()
 * is unchanged since the last successful syncAll is skipped (opts.force
 * overrides). A throwing syncTo is reported (opts.onError) and its token is
 * NOT marked, so the next call retries it. Returns
 * { leftover, synced, skipped, failed }.
 */
Adapters.syncAll = function (entries, opts) {
    opts = opts || {};
    var result = { leftover: 0, synced: 0, skipped: 0, failed: 0 };
    if (!entries || typeof entries.length !== "number") return result;
    for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (!entry || typeof entry.syncTo !== "function") continue;
        var token = (typeof entry.changeToken == "function") ? entry.changeToken() : null;
        if (!opts.force && token !== null && entry._adpToken === token) {
            result.skipped++;
            continue;
        }
        var leftover = 0;
        try {
            leftover = entry.syncTo() || 0;
        } catch (e) {
            result.failed++;
            if (typeof opts.onError == "function") {
                try { opts.onError(entry, e, i); } catch (e2) {}
            }
            continue;
        }
        if (typeof leftover != "number" || !isFinite(leftover) || leftover < 0) leftover = 0;
        result.leftover += leftover;
        if (token !== null) entry._adpToken = token;
        result.synced++;
    }
    return result;
};

/**
 * Neighbour container entry — a chest/drawer next to a block becomes a storage
 * node. Returns null when there is no container on that side.
 */
Adapters.neighbour = function (region, coords, side) {
    try {
        if (typeof StorageInterface == "undefined" || !StorageInterface ||
            typeof StorageInterface.getNeighbourStorage != "function") return null;
        var storage = StorageInterface.getNeighbourStorage(region, coords, side);
        if (!storage) return null;
        return Adapters.container(storage);
    } catch (e) {
        return null;
    }
};

/**
 * All six sides: returns [{ side, entry }] for every container neighbour.
 */
Adapters.neighbours = function (region, coords) {
    var out = [];
    var sides = [0, 1, 2, 3, 4, 5];
    for (var i = 0; i < sides.length; i++) {
        var entry = Adapters.neighbour(region, coords, sides[i]);
        if (entry) out.push({ side: sides[i], entry: entry });
    }
    return out;
};

// Adapters is STRICTLY storage. `recipeViewerWorkbench` was moved to the separate
// `RecipeViewerAdapter` library (boundary split: storage vs recipe-viewer).

EXPORT("Adapters", Adapters);
