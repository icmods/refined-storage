LIBRARY({
    name: "StorageCore",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:1"]
});

IMPORT("CoreKit:1");

var StorageCore = {};

/*
 * ============================================================================
 * StorageCore — storage aggregation, transactions, transfer math
 * ============================================================================
 * Providers expose LIVE entries
 * { storage, items_stored, items: { [uid]: { id, data, count, extra } } }, mutated
 * in place by insert/extract. This library aggregates them into a view, provides
 * insert/extract returning the remainder (never silent loss), plan-then-commit
 * transactions, and the transfer math (UI_RATIO / BUTTON / MACHINE).
 *
 * Item matching is delegated to CoreKit.Items (hard dependency via
 * dependencies + IMPORT("CoreKit:1")); the typeof-guard fallback below only
 * triggers when the library is evaluated without its declared dependencies
 * (defensive — the engine normally refuses to load the library in that case).
 * ============================================================================
 */

function _SC_match(a, b, wildcardData) {
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items) {
        return CoreKit.Items.match(a, b, { wildcardData: !!wildcardData, matchExtra: true });
    }
    return a.id === b.id && (a.data === b.data || (wildcardData && (a.data === -1 || b.data === -1)));
}

function _SC_uidOf(item) {
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items) {
        return CoreKit.Items.uidOf(item);
    }
    return item.id + "_" + item.data;
}

function _SC_safeNum(value) {
    value = Number(value);
    if (!isFinite(value)) return 0;
    value = Math.floor(value);
    return value < 0 ? 0 : value;
}

/** Extra compatibility: both absent, or same canonical key (CoreKit.extraKey). */
function _SC_extraSame(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items) {
        return CoreKit.Items.extraKey(a) === CoreKit.Items.extraKey(b);
    }
    return a === b;
}

/* -------------------------------------------------------- providers ------ */

var _SCProviders = Object.create(null);

/**
 * Register an external storage provider for a block id.
 * Contract: provider.getEntries(tile) returns an array of LIVE
 * entry references shaped like DiskData entries:
 *   { storage: number, items_stored: number, items: { [uid]: { id, data, count, extra } } }
 * Entries are mutated in place by insert/extract and must survive rebuilds.
 */
StorageCore.registerProvider = function (blockId, provider) {
    if (!blockId || !provider || typeof provider.getEntries != "function") return false;
    _SCProviders[String(blockId)] = provider;
    return true;
};

/** Remove a provider registration. Returns true when one existed. */
StorageCore.unregisterProvider = function (blockId) {
    var key = String(blockId);
    if (!Object.prototype.hasOwnProperty.call(_SCProviders, key)) return false;
    delete _SCProviders[key];
    return true;
};

StorageCore.providerFor = function (blockId) {
    var key = String(blockId);
    return Object.prototype.hasOwnProperty.call(_SCProviders, key) ? _SCProviders[key] : null;
};

StorageCore.getProviders = function () {
    var out = Object.create(null);
    for (var k in _SCProviders) {
        if (Object.prototype.hasOwnProperty.call(_SCProviders, k)) out[k] = _SCProviders[k];
    }
    return out;
};

StorageCore.resetProviders = function () {
    _SCProviders = Object.create(null);
};

/* -------------------------------------------------------------- view ----- */

/** Opt-in change notification (EXPERIMENTAL): one call per applied mutation. */
function _SC_emitChange(view, uid, delta, item, source) {
    var cb = view._opts && view._opts.onChange;
    if (typeof cb != "function" || !delta) return;
    try { cb({ uid: uid, delta: delta, item: item || null, source: source }); } catch (e) {}
}

function _SCView(sources, opts) {
    this.sources = sources || [];
    this._opts = opts || null;
}

/**
 * createView(sources) — sources: array of LIVE entry references
 * ({ storage, items_stored, items }). All methods aggregate over them on
 * demand and NEVER expose live references (fresh copies only).
 */
StorageCore.createView = function (sources, opts) {
    return new _SCView(sources, opts);
};

_SCView.prototype._collect = function () {
    var out = {};
    for (var i = 0; i < this.sources.length; i++) {
        var entry = this.sources[i];
        if (!entry || !entry.items) continue;
        for (var uid in entry.items) {
            var item = entry.items[uid];
            if (!item || !item.count) continue;
            // Never merge two different identities under the same key.
            // A foreign/stale key is re-derived canonically; a key whose item
            // disagrees with the existing entry is not mixed (corrupt entry wins
            // only when it is itself consistent).
            var key = _SC_uidOf(item);
            if (key !== uid) uid = key;
            if (out[uid]) {
                if (!_SC_match(out[uid], item, false)) {
                    if (_SC_uidOf(out[uid]) === uid) continue;
                } else {
                    out[uid] = { id: item.id, data: item.data, extra: item.extra, count: out[uid].count + item.count };
                    continue;
                }
            }
            out[uid] = { id: item.id, data: item.data, extra: item.extra, count: item.count };
        }
    }
    return out;
};

/** Fresh aggregated list [{ id, data, count, extra, uid }] — safe to mutate. */
_SCView.prototype.getItems = function () {
    var collected = this._collect();
    var list = [];
    for (var uid in collected) {
        var c = collected[uid];
        c.uid = uid;
        list.push(c);
    }
    return list;
};

/** Fresh copy of a single uid, or null. */
_SCView.prototype.get = function (uid) {
    var collected = this._collect();
    var c = collected[uid];
    if (!c) return null;
    c.uid = uid;
    return c;
};

/**
 * Single-pass read: aggregated items + totals from the SAME scan of sources.
 * Returns fresh copies (never live references) and totals as bookkept by the
 * entries. Use when items and totals must be read consistently together.
 */
_SCView.prototype.snapshot = function () {
    var collected = this._collect();
    var storage = 0, stored = 0;
    for (var i = 0; i < this.sources.length; i++) {
        var entry = this.sources[i];
        if (!entry) continue;
        storage += entry.storage || 0;
        stored += entry.items_stored || 0;
    }
    var list = [];
    for (var u in collected) {
        collected[u].uid = u;
        list.push(collected[u]);
    }
    return { items: list, storage: storage, stored: stored };
};

_SCView.prototype.has = function (uid) {
    var collected = this._collect();
    return !!(collected[uid] && collected[uid].count > 0);
};

_SCView.prototype.getTotals = function () {
    var storage = 0, stored = 0;
    for (var i = 0; i < this.sources.length; i++) {
        var e = this.sources[i];
        if (!e) continue;
        storage += e.storage || 0;
        stored += e.items_stored || 0;
    }
    return { storage: storage, stored: stored };
};

/**
 * First uid matching { id, data(-1 wildcard), extra? } — used for
 * data==-1 resolution (resolve to the first known variant).
 */
_SCView.prototype.findFirst = function (item) {
    var collected = this._collect();
    var best = null;
    for (var uid in collected) {
        var c = collected[uid];
        if (_SC_match(c, item, item.data === -1)) {
            if (item.data === -1 || c.data === item.data) { best = uid; break; }
        }
    }
    return best;
};

/**
 * Add up to `cap` to one source index; returns the amount actually added.
 */
_SCView.prototype._addToEntry = function (index, uid, item, cap) {
    var entry = this.sources[index];
    if (!entry || !entry.items) return 0;
    var free = (entry.storage || 0) - (entry.items_stored || 0);
    if (free <= 0) return 0;
    var add = Math.min(cap, free);
    if (add <= 0) return 0;
    var key = _SC_uidOf(item);
    if (key !== uid) uid = key;
    var existing = entry.items[uid];
    if (existing && !_SC_match(existing, item, false)) {
        // A foreign uid must not absorb a different identity; re-derive the
        // canonical key and only merge when the identities agree.
        var canonical = _SC_uidOf(item);
        if (canonical !== uid) {
            uid = canonical;
            existing = entry.items[uid];
        }
        if (existing && !_SC_match(existing, item, false)) return 0;
    }
    if (existing) {
        existing.count += add;
    } else {
        entry.items[uid] = { id: item.id, data: item.data, extra: item.extra || null, count: add };
    }
    entry.items_stored = (entry.items_stored || 0) + add;
    return add;
};

/* ---------------------------------------------- operation idempotency ----- */
/* EXPERIMENTAL, process-local: per-view opId log with FIFO eviction. */

_SCView.prototype._opSeen = function (opId) {
    if (!this._opIds) return undefined;
    var key = String(opId);
    return Object.prototype.hasOwnProperty.call(this._opIds, key) ? this._opIds[key] : undefined;
};

_SCView.prototype._opRecord = function (opId, remainder) {
    if (!this._opIds) {
        this._opIds = Object.create(null);
        this._opOrder = [];
    }
    var key = String(opId);
    if (!Object.prototype.hasOwnProperty.call(this._opIds, key)) this._opOrder.push(key);
    this._opIds[key] = remainder;
    var cap = (this._opts && this._opts.opLogSize) || 128;
    while (this._opOrder.length > cap) delete this._opIds[this._opOrder.shift()];
};

/** Forget one operation id so it can be applied again. Returns true when known. */
_SCView.prototype.forgetOperation = function (opId) {
    var key = String(opId);
    if (!this._opIds || !Object.prototype.hasOwnProperty.call(this._opIds, key)) return false;
    delete this._opIds[key];
    for (var i = 0; i < this._opOrder.length; i++) {
        if (this._opOrder[i] === key) { this._opOrder.splice(i, 1); break; }
    }
    return true;
};

/** Drop the whole operation log. */
_SCView.prototype.resetOperations = function () {
    this._opIds = null;
    this._opOrder = null;
};

/**
 * Source indexes for insert routing. With opts.selector, lower keys go first
 * (ties keep the array order — deterministic even on an unstable sort).
 */
_SCView.prototype._insertOrder = function (item) {
    var order = [];
    for (var i = 0; i < this.sources.length; i++) order.push(i);
    var selector = this._opts && this._opts.selector;
    if (typeof selector == "function") {
        var sources = this.sources;
        order.sort(function (a, b) {
            var ka = selector(sources[a], item);
            var kb = selector(sources[b], item);
            if (ka < kb) return -1;
            if (ka > kb) return 1;
            return a - b;
        });
    }
    return order;
};

/**
 * Insert into the view, mutating the LIVE entries in place.
 * Returns the REMAINDER that could not be stored (0 = fully stored).
 * opts.onOverflow?(remainder, item) is notified when part of the insert does
 * not fit; exceptions inside the callback are isolated (swallowed).
 * Routing: opts.selector (createView) orders sources; opts.weight
 * (EXPERIMENTAL, createView) gives each source a proportional share of the
 * insert first (floor(count * w / totalW)), leftovers fill in order.
 */
_SCView.prototype.insert = function (item, count, opts) {
    count = _SC_safeNum(count);
    if (count <= 0 || !item || item.id <= 0) return count;
    if (opts && opts.opId != null) {
        var seen = this._opSeen(opts.opId);
        if (seen !== undefined) return seen;
    }
    var uid = _SC_uidOf(item);
    var original = count;
    var remaining = count;
    var order = this._insertOrder(item);
    var weightFn = this._opts && this._opts.weight;
    if (typeof weightFn == "function") {
        var shares = [];
        var totalW = 0;
        for (var wi = 0; wi < order.length; wi++) {
            var wentry = this.sources[order[wi]];
            if (!wentry || !wentry.items) continue;
            var wfree = (wentry.storage || 0) - (wentry.items_stored || 0);
            if (wfree <= 0) continue;
            var w = Number(weightFn(wentry));
            if (!isFinite(w) || w <= 0) continue;
            shares.push({ index: order[wi], free: wfree, w: w });
            totalW += w;
        }
        if (totalW > 0) {
            for (var si = 0; si < shares.length && remaining > 0; si++) {
                var share = Math.floor(original * shares[si].w / totalW);
                if (share <= 0) continue;
                remaining -= this._addToEntry(shares[si].index, uid, item, Math.min(share, remaining));
            }
        }
    }
    for (var oi = 0; oi < order.length && remaining > 0; oi++) {
        remaining -= this._addToEntry(order[oi], uid, item, remaining);
    }
    if (opts && opts.opId != null) this._opRecord(opts.opId, remaining);
    _SC_emitChange(this, uid, original - remaining, item, "insert");
    if (remaining > 0 && opts && typeof opts.onOverflow == "function") {
        try { opts.onOverflow(remaining, item); } catch (e) {}
    }
    return remaining;
};

/**
 * Extract from the view, mutating LIVE entries.
 * Returns the REMAINDER that could not be extracted.
 */
_SCView.prototype.extract = function (uid, count, opts) {
    count = _SC_safeNum(count);
    if (count <= 0) return 0;
    if (opts && opts.opId != null) {
        var seenEx = this._opSeen(opts.opId);
        if (seenEx !== undefined) return seenEx;
    }
    var original = count;
    var remaining = count;
    for (var i = 0; i < this.sources.length && remaining > 0; i++) {
        var entry = this.sources[i];
        if (!entry || !entry.items) continue;
        var key = uid;
        var item = entry.items[key];
        if (!item) {
            for (var k in entry.items) {
                var candidate = entry.items[k];
                if (candidate && _SC_uidOf(candidate) === uid) { key = k; item = candidate; break; }
            }
        }
        if (!item) continue;
        var stored = Number(item.count);
        if (!isFinite(stored) || stored <= 0) continue;
        var take = Math.min(remaining, stored);
        item.count = stored - take;
        entry.items_stored = Math.max(0, (entry.items_stored || 0) - take);
        if (item.count <= 0) delete entry.items[key];
        remaining -= take;
    }
    if (opts && opts.opId != null) this._opRecord(opts.opId, remaining);
    _SC_emitChange(this, uid, -(original - remaining), null, "extract");
    return remaining;
};

/* -------------------------------------------------------- transaction ---- */

function _SCTransaction(view) {
    this.view = view;
    this.ops = [];
    this._shadow = null;
}

/**
 * Plan-then-commit transaction:
 * every insert/extract is validated against a SHADOW of the view first;
 * commit() applies all queued ops only when the whole plan is still valid.
 */
StorageCore.Transaction = {
    create: function (view) {
        return new _SCTransaction(view);
    }
};

_SCTransaction.prototype._buildShadow = function () {
    var shadow = [];
    for (var i = 0; i < this.view.sources.length; i++) {
        var src = this.view.sources[i];
        if (!src || !src.items) { shadow.push(null); continue; }
        var copy = { storage: src.storage || 0, items_stored: src.items_stored || 0, items: {} };
        for (var uid in src.items) {
            var it = src.items[uid];
            if (!it) continue;
            copy.items[uid] = { id: it.id, data: it.data, extra: it.extra, count: it.count };
        }
        shadow.push(copy);
    }
    return shadow;
};

/** Queue an insert (no mutation yet). Returns the amount that fits the plan. */
_SCTransaction.prototype.insert = function (item, count) {
    var shadowView = StorageCore.createView(this._shadow || (this._shadow = this._buildShadow()));
    var remainder = shadowView.insert(item, count);
    var accepted = _SC_safeNum(count) - remainder;
    if (accepted > 0) this.ops.push({ type: "insert", item: { id: item.id, data: item.data, extra: item.extra }, count: accepted });
    return accepted;
};

/** Queue an extract (no mutation yet). Returns the amount the plan provides. */
_SCTransaction.prototype.extract = function (uid, count) {
    var shadowView = StorageCore.createView(this._shadow || (this._shadow = this._buildShadow()));
    var remainder = shadowView.extract(uid, count);
    var accepted = _SC_safeNum(count) - remainder;
    if (accepted > 0) this.ops.push({ type: "extract", uid: uid, count: accepted });
    return accepted;
};

/**
 * Apply all queued ops, or nothing. Re-validates against the LIVE view first
 * (sources may have changed between planning and commit). Returns
 * { applied: bool, ops: n }.
 */
_SCTransaction.prototype.commit = function () {
    var ops = this.ops;
    if (!ops.length) { this._shadow = null; return { applied: true, ops: 0 }; }
    // re-validate the full plan against the live view
    var check = StorageCore.createView(this._buildShadow());
    var ok = true;
    for (var i = 0; i < ops.length && ok; i++) {
        var op = ops[i];
        var rem = op.type === "insert" ? check.insert(op.item, op.count) : check.extract(op.uid, op.count);
        if (rem !== 0) ok = false;
    }
    if (!ok) { this.ops = []; this._shadow = null; return { applied: false, ops: 0 }; }
    var n = 0;
    for (var j = 0; j < ops.length; j++) {
        var op2 = ops[j];
        if (op2.type === "insert") this.view.insert(op2.item, op2.count);
        else this.view.extract(op2.uid, op2.count);
        n++;
    }
    this.ops = [];
    this._shadow = null; // invalidate the planning shadow — next insert/extract rebuilds it
    return { applied: true, ops: n };
};

_SCTransaction.prototype.reset = function () {
    this.ops = [];
    this._shadow = null;
};

_SCTransaction.prototype.pendingCount = function () {
    return this.ops.length;
};

/* ------------------------------------------------------------- transfer -- */

StorageCore.Transfer = {};

/**
 * UI_RATIO — drag&drop hold-bar formula (ratio of the source count, clamped).
 * source = slot1, target = slot2, ratio = eventData.value (0..1).
 * Returns the count to move (0 when nothing).
 */
StorageCore.Transfer.UI_RATIO = function (source, target, ratio, maxStackFn) {
    maxStackFn = maxStackFn || function (id) {
        return typeof Item != "undefined" && Item.getMaxStack ? Item.getMaxStack(id) : 64;
    };
    var countValue = source.count * Math.min(1, Math.max(0, ratio));
    countValue = ratio > 0 ? Math.min(Math.max(1, Math.floor(countValue)), maxStackFn(source.id)) : 0;
    return target.id !== 0 ? Math.min(countValue, maxStackFn(target.id) - target.count) : countValue;
};

/**
 * BUTTON — click/long-click math: click = 1, long = min(maxStack, capacityLeft, available).
 */
StorageCore.Transfer.BUTTON = function (item, capacity, isLongPress, maxStackFn) {
    maxStackFn = maxStackFn || function (id) {
        return typeof Item != "undefined" && Item.getMaxStack ? Item.getMaxStack(id) : 64;
    };
    if (!item || item.id <= 0 || !(item.count > 0)) return 0;
    if (!isLongPress) return 1;
    var count = Math.min(maxStackFn(item.id), capacity, item.count);
    return count > 0 ? count : 0;
};

/**
 * MACHINE — merge-into-slot with mutation. Mutates item and slot; returns the
 * amount added (0 when nothing fits).
 */
StorageCore.Transfer.MACHINE = function (item, slot, count) {
    var maxStackFn = function (id) {
        return typeof Item != "undefined" && Item.getMaxStack ? Item.getMaxStack(id) : 64;
    };
    if (count === undefined || count === null) count = 64;
    count = _SC_safeNum(count);
    if (count <= 0) return 0;
    if (slot.id === 0 || (slot.id === item.id && slot.data === item.data && _SC_extraSame(slot.extra, item.extra))) {
        var maxStack = maxStackFn(item.id);
        var add = Math.min(item.count, maxStack - slot.count);
        if (count < add) add = count;
        if (add > 0) {
            slot.id = item.id;
            slot.data = item.data;
            if (item.extra) slot.extra = item.extra;
            else slot.extra = null;
            slot.count += add;
            item.count -= add;
            if (item.count === 0) {
                item.id = item.data = 0;
                item.extra = null;
            }
            return add;
        }
    }
    return 0;
};

/**
 * Free room for an item across a list of slots: sum of empty-slot stacks +
 * partial same-stack room.
 */
StorageCore.Transfer.roomFor = function (item, slots) {
    var maxStack = typeof Item != "undefined" && Item.getMaxStack ? Item.getMaxStack(item.id) : 64;
    var room = 0;
    for (var i = 0; i < slots.length; i++) {
        var s = slots[i];
        if (!s) continue;
        if (s.id === 0) room += maxStack;
        else if (s.id === item.id && s.data === item.data && s.count < maxStack && _SC_extraSame(s.extra, item.extra)) room += maxStack - s.count;
    }
    return room;
};

/**
 * Validate and normalize a count:
 * non-finite or <= 0 → 0; clamped to maxCount.
 */
StorageCore.Transfer.clampCount = function (value, maxCount) {
    value = Math.floor(Number(value));
    if (!isFinite(value) || value <= 0) return 0;
    if (maxCount && value > maxCount) value = maxCount;
    return value;
};

/* ---------------------------------------------------------- diagnostics --- */

/**
 * Optional, DEV-ONLY invariant diagnostics. Nothing runs automatically: the
 * host (or DebugCore) calls validate() when it wants a check.
 */
StorageCore.debug = {
    /**
     * Per entry: items_stored must equal the sum of item counts.
     * Returns { ok, mismatches: [{ index, reason, uid?, expected, actual }] }.
     * Reasons: null-item, invalid-count, bookkeeping-drift, over-capacity.
     */
    validate: function (view) {
        var mismatches = [];
        var sources = (view && view.sources) || [];
        for (var i = 0; i < sources.length; i++) {
            var entry = sources[i];
            if (!entry || !entry.items) continue;
            var actual = 0;
            for (var uid in entry.items) {
                var item = entry.items[uid];
                if (!item) {
                    mismatches.push({ index: i, reason: "null-item", uid: uid, expected: 0, actual: 0 });
                    continue;
                }
                var c = Number(item.count);
                if (!isFinite(c) || c < 0) {
                    mismatches.push({ index: i, reason: "invalid-count", uid: uid, expected: 0, actual: item.count });
                    continue;
                }
                actual += c;
            }
            var expected = Number(entry.items_stored) || 0;
            if (actual !== expected) {
                mismatches.push({ index: i, reason: "bookkeeping-drift", expected: expected, actual: actual });
            }
            var storage = Number(entry.storage);
            if (isFinite(storage) && expected > storage) {
                mismatches.push({ index: i, reason: "over-capacity", expected: storage, actual: expected });
            }
        }
        return { ok: mismatches.length === 0, mismatches: mismatches };
    }
};

EXPORT("StorageCore", StorageCore);
