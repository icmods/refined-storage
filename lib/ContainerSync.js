LIBRARY({
    name: "ContainerSync",
    version: 2,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:2"]
});

IMPORT("CoreKit:2");

var ContainerSync = {};

/*
 * ============================================================================
 * ContainerSync — client↔server inventory↔storage transfer protocol
 * ============================================================================
 * The host provides storage ops as push(item, count) → remainder and
 * remove(item, count) → remainder (a StorageCore view satisfies both). The
 * library owns the buffered player-inventory mutation (read once, write once —
 * PlayerActor is stale inside a handler) and the event bookkeeping; the host
 * owns the storage itself and the GUI refresh.
 * ============================================================================
 */

ContainerSync.MAX_COUNT = 10000;

/**
 * Wire protocol version for slot↔slot transfer payloads ({ v, from, to, count,
 * want }): the transport stays host-side; transfer() pins this constant so both
 * ends can refuse mismatched versions.
 */
ContainerSync.PROTOCOL_VERSION = 1;

/**
 * Safe JSON access for networkData: Java null,
 * "null", empty strings and malformed JSON degrade to `fallback` on read;
 * stringify/put failures never throw and report false on write. Useful on its
 * own, and the transport behind NetState's "json" field type.
 */
ContainerSync.jsonGet = function (networkData, key, fallback) {
    if (!networkData || typeof networkData.getString != "function") return fallback;
    try { return _csJsonGet(networkData.getString(key, 'null'), fallback); }
    catch (e) { return fallback; }
};

ContainerSync.jsonPut = function (networkData, key, value) {
    if (!networkData || typeof networkData.putString != "function") return false;
    return _csJsonPut(networkData, key, value);
};

/**
 * Safe JSON read: Java null, the string "null", an empty string,
 * malformed JSON and a parsed JSON null all degrade to `fallback`. Golden rule
 * #35: getString may return Java null even when a default is passed.
 */
function _csJsonGet(raw, fallback) {
    if (raw === null || typeof raw == "undefined" || raw === "" || raw === "null") return fallback;
    try {
        var parsed = JSON.parse(raw);
        return (parsed === null || typeof parsed == "undefined") ? fallback : parsed;
    } catch (e) {
        return fallback;
    }
}

/** Safe JSON write: serialize `value` into networkData; false when it throws. */
function _csJsonPut(networkData, key, value) {
    try {
        networkData.putString(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Read a JSON array from a networkData map. Non-arrays (Java null, "null",
 * malformed JSON, plain objects) all degrade to [].
 */
function _csReadMap(networkData, key) {
    var parsed = _csJsonGet(networkData.getString(key, 'null'), null);
    return (parsed && parsed.length !== undefined) ? parsed : [];
}

/** Keys that must never be written/iterated as event names (client-controlled). */
function _csUnsafeKey(key) {
    key = String(key);
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

/**
 * Normalize a want reference: a string is a uid-only reference (id/data are
 * wildcards -1); an object keeps id/data/uid. Returns null for a falsy want.
 */
function _csNormalizeWant(want) {
    if (!want) return null;
    if (typeof want === 'string') return { id: -1, data: -1, uid: want };
    return { id: want.id | 0, data: want.data | 0, uid: want.uid != null ? String(want.uid) : "" };
}

/**
 * Expected-item reference for a queued event, stored next to the count. Storage
 * slots are re-mapped whenever the host rebuilds its view (the grid re-sorts on
 * every change), so the sender records WHAT it clicked and the server validates
 * the slot against it (resolving by uid on mismatch).
 */
function _csWriteWant(networkData, key, want) {
    var w = _csNormalizeWant(want);
    if (!w) return;
    _csJsonPut(networkData, "want_" + key, w);
}

function _csReadWant(networkData, key) {
    var raw = null;
    try { raw = networkData.getString("want_" + key, null); } catch (e) { return null; }
    var w = _csJsonGet(raw, null);
    return (w && typeof w == 'object') ? w : null;
}

function _csClearWant(networkData, key) {
    try { networkData.putString("want_" + key, 'null'); } catch (e) {}
}

/** True when `item` satisfies the expected-item reference (uid first, then id/data). */
function _csWantMatches(options, want, item) {
    if (!want || !item) return false;
    if (want.uid && typeof options.itemUid === "function") {
        try { if (options.itemUid(item) === want.uid) return true; } catch (e) {}
    }
    return item.id === want.id && item.data === want.data;
}

/**
 * Build the transport identity of an item: { id, data, uid }. The uid comes
 * from options.itemUid (host CoreKit.Items.uidOf); without it only id/data are
 * usable (uid ""). Returns null for a missing/empty item (id == 0; negative
 * ids are valid items).
 */
ContainerSync.want = function (item, options) {
    if (!item || !item.id) return null;
    options = options || {};
    var uid = "";
    if (typeof options.itemUid == "function") {
        try {
            var u = options.itemUid(item);
            if (u !== null && typeof u != "undefined") uid = String(u);
        } catch (e) {}
    }
    return { id: item.id | 0, data: item.data | 0, uid: uid };
};

/**
 * True when `item` satisfies a want reference (uid first when options.itemUid is
 * given, then id/data). `want` may also be a plain uid string (id/data
 * wildcards); null/empty `want` or `item` never match.
 */
ContainerSync.wantMatches = function (want, item, options) {
    return _csWantMatches(options || {}, _csNormalizeWant(want), item);
};

/** Isolated host notification: a throwing listener never breaks processing. */
function _csNotify(fn, a, b, c) {
    if (typeof fn != "function") return;
    try { fn(a, b, c); } catch (e) {}
}

/**
 * Opt-in diagnostics record for a rejected event (EXPERIMENTAL). Reporting only:
 * the processing behaviour is unchanged.
 */
function _csInvalid(options, playerUid, slotKey, event, reason) {
    if (typeof options.onInvalid != "function") return;
    try {
        options.onInvalid({
            playerUid: playerUid,
            slotKey: slotKey,
            type: event ? event.type : null,
            count: event ? event.count : null,
            updateFull: !!(event && event.updateFull),
            reason: reason
        });
    } catch (e) {}
}

/* ------------------------------------------------- client → server queue -- */

/**
 * Queue an inventory→storage push into the networkData maps. The client writes
 * the maps; the server reads them with buildEvents. sendChanges is the caller's
 * job (once, at the end). `want` ({ id, data, uid } or a uid string) records the
 * clicked item so a changed inventory slot can never push a different stack.
 */
ContainerSync.queuePush = function (networkData, slot, count, updateFull, want) {
    count = _csSafeCount(count);
    if (count <= 0) return;
    var map = _csReadMap(networkData, 'pushItemsMap');
    if (map.indexOf(slot) == -1) map.push(slot);
    _csJsonPut(networkData, 'pushItemsMap', map);
    networkData.putInt(slot, networkData.getInt(slot, 0) + count);
    networkData.putBoolean('update', true);
    networkData.putBoolean('updateFull' + slot, !!updateFull);
    networkData.putInt('requestNumber', networkData.getInt('requestNumber', 0) + 1);
    _csWriteWant(networkData, slot, want);
};

/**
 * Queue a storage→inventory extraction into the networkData maps. `want`
 * ({ id, data, uid } or a uid string) records the clicked item so a re-mapped
 * storage slot can never extract a different stack.
 */
ContainerSync.queueDelete = function (networkData, slotKey, count, updateFull, want) {
    count = _csSafeCount(count);
    if (count <= 0) return;
    var map = _csReadMap(networkData, 'deleteItemsMap');
    if (map.indexOf(slotKey) == -1) map.push(slotKey);
    _csJsonPut(networkData, 'deleteItemsMap', map);
    networkData.putInt(slotKey, networkData.getInt(slotKey, 0) + count);
    networkData.putBoolean('update', true);
    networkData.putBoolean('updateFull' + slotKey, !!updateFull);
    networkData.putInt('requestNumber', networkData.getInt('requestNumber', 0) + 1);
    _csWriteWant(networkData, slotKey, want);
};

/** True when the client flagged pending events or has unacknowledged requests. */
ContainerSync.hasPending = function (networkData) {
    if (networkData.getInt('requestNumber', 0) > networkData.getInt('acknowledgedRequest', 0)) return true;
    return !!networkData.getBoolean('update', false);
};

/**
 * Last processed request sequence + outcome, once per ack (V3 only).
 * Returns { seq, changed, fullUpdate } or null when nothing new.
 */
ContainerSync.readRequestResult = function (networkData) {
    var seq = networkData.getInt('acknowledgedRequest', 0);
    if (!seq || networkData.getInt('readRequestNumber', 0) === seq) return null;
    networkData.putInt('readRequestNumber', seq);
    var parsed = _csJsonGet(networkData.getString('requestResult', 'null'), null);
    return { seq: seq, changed: !!(parsed && parsed.changed), fullUpdate: !!(parsed && parsed.fullUpdate) };
};

/**
 * Read the queued maps from networkData and reset them. Returns a fresh events
 * map with NAMESPACED keys (never colliding between the two directions):
 *   'd:<storageSlotKey>' -> { type:'delete', slotKey, count, updateFull, want }
 *   'p:<inventorySlot>'  -> { type:'push', count, slot, updateFull, want }
 * Unsafe client-controlled keys (__proto__/constructor/prototype) are rejected.
 * `want` is the expected-item reference recorded by the queue call (may be null).
 */
ContainerSync.buildEvents = function (networkData, out) {
    if (out && typeof out == "object") out.requestNumber = networkData.getInt('requestNumber', 0);
    var events = {};
    var map = _csReadMap(networkData, 'deleteItemsMap');
    for (var i = 0; i < map.length; i++) {
        if (_csUnsafeKey(map[i])) continue;
        events['d:' + map[i]] = {
            type: 'delete',
            slotKey: map[i],
            count: Number(networkData.getInt(map[i], 0)),
            updateFull: networkData.getBoolean('updateFull' + map[i], false),
            want: _csReadWant(networkData, map[i])
        };
        networkData.putInt(map[i], 0);
        networkData.putBoolean('updateFull' + map[i], false);
        _csClearWant(networkData, map[i]);
    }
    networkData.putString('deleteItemsMap', 'null');
    var map2 = _csReadMap(networkData, 'pushItemsMap');
    for (var p = 0; p < map2.length; p++) {
        if (_csUnsafeKey(map2[p])) continue;
        events['p:' + map2[p]] = {
            type: 'push',
            count: Number(networkData.getInt(map2[p], 0)),
            slot: map2[p],
            updateFull: networkData.getBoolean('updateFull' + map2[p], false),
            want: _csReadWant(networkData, map2[p])
        };
        networkData.putInt(map2[p], 0);
        networkData.putBoolean('updateFull' + map2[p], false);
        _csClearWant(networkData, map2[p]);
    }
    networkData.putString('pushItemsMap', 'null');
    networkData.putBoolean('update', false);
    return events;
};

/* ----------------------------------------------- player inventory access -- */

/**
 * Read the whole player inventory ONCE into a plain buffer (36 slots). Item
 * fields are copied into plain objects, but `extra` is kept BY REFERENCE (a
 * Java ItemExtraData cannot be safely deep-copied here): treat it as read-only
 * inside the handler. PlayerActor is stale, so never re-read a slot after a
 * write.
 */
ContainerSync.bufferInventory = function (playerActor) {
    var buffer = [];
    for (var i = 0; i < 36; i++) {
        var s = playerActor.getInventorySlot(i);
        buffer.push(s && s.id != 0
            ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null }
            : { id: 0, count: 0, data: 0, extra: null });
    }
    return buffer;
};

function _csBufferCopy(buffer) {
    var out = [];
    for (var i = 0; i < buffer.length; i++) {
        var s = buffer[i];
        out.push(s && s.id != 0
            ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null }
            : { id: 0, count: 0, data: 0, extra: null });
    }
    return out;
}

/** Extra identity: both absent, reference-equal, or same canonical content. */
function _csExtraSame(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a === b) return true;
    if (typeof CoreKit != "undefined" && CoreKit.ItemContent) return CoreKit.ItemContent.sameExtra(a, b);
    return CoreKit.Items.fullExtraToString(a) === CoreKit.Items.fullExtraToString(b);
}

/**
 * Write the buffer back with the external-change guard: a slot changed outside
 * the handler is NOT overwritten — its items become the returned leftover.
 * With dirtySlots, only those slots are touched and the slots we emptied
 * (dirty + buffer empty) are explicitly cleared only when the real slot still
 * matches the pre-handler snapshot (originSlots), so an item injected
 * externally into a planned-empty slot is never wiped.
 * originSlots (optional): per-slot copy of the inventory BEFORE the handler
 * ran. With it, only the NEW part (planned − snapshot) of a traced stack is
 * delivered or reported; a pre-existing stack moved externally is never
 * re-added. Returns the leftover count; when `leftoverItems` is
 * provided it also receives a descriptor per affected slot
 * { slot, id, count, data, extra }.
 */
ContainerSync.commitInventory = function (playerActor, buffer, dirtySlots, leftoverItems, originSlots) {
    var leftover = 0;
    function _csTraced(origin, s) {
        return !!(origin && s && origin.id == s.id && origin.data == s.data && _csExtraSame(origin.extra, s.extra));
    }
    for (var i = 0; i < buffer.length; i++) {
        if (dirtySlots && !dirtySlots[i]) continue;
        var s = buffer[i];
        if (!s) continue;
        var real = playerActor.getInventorySlot(i);
        var origin = originSlots ? originSlots[i] : null;
        var traced = _csTraced(origin, s);
        if (s.id != 0) {
            if (real && real.id != 0) {
                if (real.id != s.id || real.data != s.data || !_csExtraSame(real.extra, s.extra)) {
                    var fresh = traced ? s.count - origin.count : s.count;
                    if (fresh > 0) {
                        leftover += fresh;
                        // The numeric return loses the item identity, so the host cannot
                        // recover anything with it. Expose a descriptor per affected slot
                        // (optional out-array; the pre-existing callers ignore it).
                        if (leftoverItems) leftoverItems.push({ slot: i, id: s.id, count: fresh, data: s.data, extra: s.extra || null });
                    }
                    continue;
                }
            } else if (traced) {
                var delta = s.count - origin.count;
                if (delta > 0) playerActor.setInventorySlot(i, s.id, delta, s.data, s.extra || null);
                continue;
            }
            playerActor.setInventorySlot(i, s.id, s.count, s.data, s.extra || null);
        } else if (dirtySlots) {
            if (real && real.id != 0 && (!origin || _csTraced(origin, real))) {
                playerActor.setInventorySlot(i, 0, 0, 0, null);
            }
        }
    }
    return leftover;
};

/**
 * Lenient search in a buffer: same id, data with -1 wildcard, extra matched by
 * reference first then by fullExtraToString (strip semantics). Returns
 * { slot, item } or null.
 */
ContainerSync.findInBuffer = function (buffer, id, data, extra, reverse) {
    if (data === undefined || data === null) data = -1;
    var start = reverse ? buffer.length - 1 : 0;
    var end = reverse ? -1 : buffer.length;
    var step = reverse ? -1 : 1;
    for (var i = start; i != end; i += step) {
        var s = buffer[i];
        if (!s || s.id != id) continue;
        if (data != -1 && s.data != data) continue;
        if (extra === undefined || extra === -1) return { slot: i, item: s };
        if (s.extra === extra) return { slot: i, item: s };
        if (s.extra && extra && CoreKit.Items.fullExtraToString(s.extra) === CoreKit.Items.fullExtraToString(extra)) return { slot: i, item: s };
    }
    return null;
};

/**
 * Merge items into the buffer: first into existing exact stacks (id+data+extra),
 * then into empty slots. The optional `touched` object receives every modified
 * slot index. Returns the remainder that did not fit (the caller routes it).
 */
ContainerSync.addToBuffer = function (buffer, id, count, data, extra, maxStack, touched) {
    maxStack = maxStack || 64;
    var remaining = count;
    for (var i = 0; i < buffer.length && remaining > 0; i++) {
        var s = buffer[i];
        if (!s || s.id != id || s.data != data) continue;
        if (!CoreKit.Items.mergeable({ id: id, data: data, extra: extra || null }, s)) continue;
        if (s.count >= maxStack) continue;
        var take = Math.min(maxStack - s.count, remaining);
        s.count += take;
        remaining -= take;
        if (touched) touched[i] = true;
    }
    for (var j = 0; j < buffer.length && remaining > 0; j++) {
        var e = buffer[j];
        if (!e || e.id != 0) continue;
        var take2 = Math.min(maxStack, remaining);
        e.id = id;
        e.count = take2;
        e.data = data;
        e.extra = extra || null;
        remaining -= take2;
        if (touched) touched[j] = true;
    }
    return remaining;
};

/* ---------------------------------------------------- container carry ---- */

/**
 * Slot reader for transferContainer: the engine's `getSlot(name)` is preferred
 * because a container may hold RAW Java slot objects inside its JS `slots`
 * object (`ItemContainer.getSlot` stores the Java ItemContainerSlot there) and
 * reading such a value from JS throws (Rhino "Invalid JavaScript value of type
 * ...ItemContainerSlot"). `getSlot` returns the wrapped object; without it the
 * raw read is isolated. A throwing reader yields null (slot skipped).
 */
function _csSlotReader(container) {
    if (container && typeof container.getSlot == "function") {
        return function (name) {
            try { return container.getSlot(name); } catch (e) { return null; }
        };
    }
    return function (name) {
        try { return container.slots[name]; } catch (e) { return null; }
    };
}

/**
 * Copy every non-empty slot from `from` to `to` (carry helper: piston /
 * upgrade / replace). `from`/`to` are objects with enumerable `slots` plus
 * setSlot(name,id,count,data,extra) (and preferably getSlot(name) — see
 * _csSlotReader); no engine access. WHICH containers, WHEN and what to filter
 * stay host policy.
 *
 * options: {
 *   filter(name, slot) -> boolean  // false = skip (counted as skipped)
 *   clearSource: true              // empty every copied source slot (default true)
 *   cloneExtra: false              // false = pass extra by reference (host
 *                                  // behavior); a function is applied to each
 *                                  // extra and its result is stored
 *   overwrite: true                // false = keep an occupied destination slot
 *                                  // (counted as skipped)
 * }
 * Returns { moved, skipped, cleared }. Not atomic: a throwing setSlot aborts
 * mid-loop (the host call-site decides on recovery).
 */
ContainerSync.transferContainer = function (from, to, options) {
    var result = { moved: 0, skipped: 0, cleared: 0 };
    if (!from || !to || !from.slots || !to.slots || typeof to.setSlot != "function") return result;
    options = options || {};
    var filter = (typeof options.filter == "function") ? options.filter : null;
    var cloneExtra = (typeof options.cloneExtra == "function") ? options.cloneExtra : null;
    var clearSource = options.clearSource !== false;
    var overwrite = options.overwrite !== false;
    var readFrom = _csSlotReader(from);
    var readTo = _csSlotReader(to);
    for (var name in from.slots) {
        if (!Object.prototype.hasOwnProperty.call(from.slots, name)) continue;
        if (_csUnsafeKey(name)) continue;
        var slot = readFrom(name);
        if (!slot || typeof slot != "object") continue;
        var id = slot.id;
        if (!id) continue; // id == 0 = empty; negative ids are valid items
        if (filter && !filter(name, slot)) { result.skipped++; continue; }
        if (!overwrite) {
            var dest = readTo(name);
            if (dest && dest.id) { result.skipped++; continue; }
        }
        var extra = slot.extra || null;
        if (cloneExtra) extra = cloneExtra(extra);
        to.setSlot(name, id, slot.count, slot.data, extra);
        result.moved++;
        if (clearSource) {
            from.setSlot(name, 0, 0, 0, null);
            result.cleared++;
        }
    }
    return result;
};

/* ------------------------------------------------- slot↔slot transfer ----- */

function _csMaxStackFn(fn) {
    if (typeof fn == "function") return fn;
    return function (id) {
        return (typeof Item != "undefined" && Item && Item.getMaxStack) ? Item.getMaxStack(id) : 64;
    };
}

/**
 * Requested amount: a number < 1 is a FRACTION of the source stack (ceil, so a
 * non-empty fraction always moves at least one); >= 1 is an absolute count
 * (clamped to MAX_COUNT); "all" takes the whole stack. Anything else is 0.
 */
function _csTransferCount(count, available) {
    if (count === "all") return available;
    if (typeof count != "number" || !isFinite(count) || count <= 0) return 0;
    if (count < 1) return Math.ceil(available * count);
    return Math.min(Math.floor(count), ContainerSync.MAX_COUNT);
}

function _csTransferAllowed(fn, key, item) {
    if (typeof fn != "function") return true;
    try { return !!fn(key, item); } catch (e) { return false; }
}

/**
 * Canonical slot↔slot transaction (the engine has no slot-to-slot: the handler
 * body is empty in both container families). Validates the source identity
 * (`want`), clamps to the destination space and maxStack, applies through the
 * host accessors and syncs once. Policy stays host: canTake/canPut/maxStack and
 * swap (boolean, or a predicate (srcItem, dstItem) -> bool). No transport —
 * the host ships the payload; PROTOCOL_VERSION pins its shape.
 *
 * from/to: { get(name) -> item|null, set(name,id,count,data,extra) }.
 * count: absolute number, fraction < 1 (ceil), or "all".
 * Returns { moved, remainder, reason } with reason one of "missing-slot" |
 * "stale-slot" | "invalid-count" | "take-zero" | "occupied" | "not-allowed"
 * (null on success). A swap exchanges the two whole stacks (count is ignored)
 * and reports the source stack size as `moved`.
 */
ContainerSync.transfer = function (config) {
    var res = { moved: 0, remainder: 0, reason: null };
    if (!config || !config.from || !config.to ||
        typeof config.from.get != "function" || typeof config.from.set != "function" ||
        typeof config.to.get != "function" || typeof config.to.set != "function") {
        res.reason = "missing-slot";
        return res;
    }
    var from = config.from, to = config.to;
    var src = from.get(config.fromKey);
    if (!src || src.id == 0) { res.reason = "missing-slot"; return res; }
    if (config.want && !_csWantMatches(config, _csNormalizeWant(config.want), src)) {
        res.reason = "stale-slot";
        return res;
    }
    var dst = to.get(config.toKey);
    var same = !!(dst && dst.id != 0 && src.id === dst.id && src.data === dst.data && _csExtraSame(dst.extra, src.extra));
    if (dst && dst.id != 0 && !same) {
        // Different item in the destination: swap whole stacks (host predicate
        // when `swap` is a function), otherwise refuse.
        var swapOk = false;
        if (typeof config.swap == "function") {
            try { swapOk = !!config.swap(src, dst); } catch (e) { swapOk = false; }
        } else {
            swapOk = config.swap === true;
        }
        if (!swapOk) { res.reason = "occupied"; return res; }
        if (!_csTransferAllowed(config.canTake, config.fromKey, src)) { res.reason = "not-allowed"; return res; }
        if (!_csTransferAllowed(config.canPut, config.toKey, src)) { res.reason = "not-allowed"; return res; }
        from.set(config.fromKey, dst.id, dst.count, dst.data, dst.extra || null);
        to.set(config.toKey, src.id, src.count, src.data, src.extra || null);
        if (typeof config.sync == "function") { try { config.sync(); } catch (e) {} }
        res.moved = src.count;
        return res;
    }
    var wantCount = _csTransferCount(config.count, src.count);
    if (wantCount <= 0) { res.reason = "invalid-count"; return res; }
    var maxStack = _csMaxStackFn(config.maxStack)(src.id);
    if (!(maxStack > 0)) maxStack = 64;
    var space = maxStack - (same ? dst.count : 0);
    var take = Math.min(wantCount, src.count, space);
    if (take <= 0) { res.reason = "take-zero"; return res; }
    if (!_csTransferAllowed(config.canTake, config.fromKey, src)) { res.reason = "not-allowed"; return res; }
    if (!_csTransferAllowed(config.canPut, config.toKey, src)) { res.reason = "not-allowed"; return res; }
    if (take >= src.count) from.set(config.fromKey, 0, 0, 0, null);
    else from.set(config.fromKey, src.id, src.count - take, src.data, src.extra || null);
    if (same) to.set(config.toKey, dst.id, dst.count + take, dst.data, dst.extra || null);
    else to.set(config.toKey, src.id, take, src.data, src.extra || null);
    if (typeof config.sync == "function") { try { config.sync(); } catch (e) {} }
    res.moved = take;
    res.remainder = wantCount - take;
    return res;
};

/* --------------------------------------------------- server processing ---- */

function _csSafeCount(value) {
    var count = Math.floor(Number(value));
    return isFinite(count) && count > 0 ? Math.min(count, ContainerSync.MAX_COUNT) : 0;
}

/**
 * Process the pending events per player, using a buffered player inventory.
 * MUTATES eventsByPlayer (processed entries are deleted).
 *
 * eventsByPlayer: { [playerUid]: { [slotKey]: { type, count, slot?, updateFull } } }
 * options: {
 *   isAllowed() → boolean                  // work-allowed check (optional)
 *   push(item, count) → remainder          // host storage insert (RS pushItem shape)
 *   remove(item, count) → remainder        // host storage extract (RS deleteItem shape)
 *   getSlot(slotKey) → item | null         // storage slot read for deletes
 *   maxStack(id) → number                  // optional override (default Item.getMaxStack)
 *   onHandled(playerUid, kind)             // optional, per event ("push"/"delete")
 *   onPushed(item, pushed)                 // optional, per valid push event — fires
 *                                          // even when pushed == 0
 *   onLeftover(playerUid, leftover, items) // optional, per player when commitInventory
 *                                          // could not write planned slots (external
 *                                          // race): total count + descriptors
 *                                          // [{ slot, id, count, data, extra }]
 *   onChanged(playerUid, fullUpdate)       // optional, per player when something moved
 * }
 * Returns { changed: bool, fullUpdate: bool }.
 */
ContainerSync.processEvents = function (eventsByPlayer, options) {
    options = options || {};
    var maxStackFn = options.maxStack || function (id) {
        return (typeof Item != "undefined" && Item && Item.getMaxStack) ? Item.getMaxStack(id) : 64;
    };
    var anyChanged = false;
    var anyFull = false;
    for (var p in eventsByPlayer) {
        if (!Object.prototype.hasOwnProperty.call(eventsByPlayer, p) || _csUnsafeKey(p)) continue;
        var events = eventsByPlayer[p];
        if (!events) { delete eventsByPlayer[p]; continue; }
        var playerUid = Number(p);
        var player = null;
        var buffer = null;
        var origin = null;
        var dirty = null;
        var needRefresh = false;
        var fullRefresh = false;
        var order = [];
        for (var k in events) {
            if (Object.prototype.hasOwnProperty.call(events, k) && !_csUnsafeKey(k)) order.push(k);
        }
        // Deterministic order: deletes before pushes (matches buildEvents), not
        // the engine's for-in enumeration (integer-like keys would come first).
        for (var pass = 0; pass < 2; pass++) {
            for (var oi = 0; oi < order.length; oi++) {
                var slotKey = order[oi];
                var event = events[slotKey];
                if (!event) continue;
                var isPush = event.type == 'push';
                if (pass === 0 && isPush) continue;
                if (pass === 1 && !isPush) continue;
                var eventCount = _csSafeCount(event.count);
                if (eventCount <= 0) { _csInvalid(options, playerUid, slotKey, event, "invalid-count"); delete events[slotKey]; continue; }
                if (typeof options.isAllowed == "function" && !options.isAllowed()) { _csInvalid(options, playerUid, slotKey, event, "not-allowed"); delete events[slotKey]; continue; }
                if (!player) player = new PlayerActor(playerUid);
                if (!buffer) { buffer = ContainerSync.bufferInventory(player); origin = _csBufferCopy(buffer); dirty = {}; }

                if (isPush) {
                    var slotIndex = Number(event.slot);
                    var item = buffer[slotIndex] || { id: 0, count: 0, data: 0, extra: null };
                    var wantPush = event.want;
                    if (wantPush && (item.id == 0 || !_csWantMatches(options, wantPush, item))) {
                        // Inventory changed since the click: push the same item from
                        // wherever it sits now, never whatever landed in that slot.
                        var foundIndex = -1;
                        for (var bi = 0; bi < buffer.length; bi++) {
                            var cand = buffer[bi];
                            if (cand && cand.id != 0 && _csWantMatches(options, wantPush, cand)) { foundIndex = bi; break; }
                        }
                        if (foundIndex < 0) { _csInvalid(options, playerUid, slotKey, event, "stale-slot"); delete events[slotKey]; continue; }
                        slotIndex = foundIndex;
                        item = buffer[foundIndex];
                    }
                    if (item.id == 0) { _csInvalid(options, playerUid, slotKey, event, "missing-slot"); delete events[slotKey]; continue; }
                    var count = Math.min(eventCount, item.count);
                    // fullRefresh when a full stack was requested (before the mutation)
                    // OR updateFull — even when storage rejects everything
                    var fullAttempt = item.count <= count;
                    // Snapshot BEFORE the move: onPushed describes the attempted push, not
                    // the mutated count.
                    var pushedInfo = { id: item.id, data: item.data, extra: item.extra, count: item.count };
                    var remainder = options.push({ id: item.id, count: count, data: item.data, extra: item.extra }, count);
                    if (typeof remainder != "number" || !isFinite(remainder)) remainder = count;
                    if (remainder < 0) remainder = 0;
                    if (remainder > count) remainder = count;
                    var pushed = count - remainder;
                    if (pushed > 0) {
                        item.count -= pushed;
                        if (item.count <= 0) {
                            buffer[slotIndex] = { id: 0, count: 0, data: 0, extra: null };
                        }
                        dirty[slotIndex] = true;
                    }
                    // Consume the event right after the critical mutation: a throwing
                    // notification must never leave the event for a second storage apply.
                    delete events[slotKey];
                    // a valid push event always refreshes (even when fully rejected)
                    needRefresh = true;
                    if (fullAttempt || event.updateFull) fullRefresh = true;
                    _csNotify(options.onPushed, pushedInfo, pushed);
                    _csNotify(options.onHandled, playerUid, 'push');
                } else {
                    if (event.type !== 'delete') { _csInvalid(options, playerUid, slotKey, event, "unknown-type"); delete events[slotKey]; continue; }
                    // a delete on an empty/absent slot is dropped without calling options.remove
                    // (the host charges energy inside remove, so nothing is consumed)
                    var rawKey = event.slotKey != null ? event.slotKey : slotKey;
                    var stored = typeof options.getSlot == "function" ? options.getSlot(rawKey) : null;
                    var wantDel = event.want;
                    if (wantDel) {
                        if (!stored || stored.id == 0 || !_csWantMatches(options, wantDel, stored)) {
                            // Storage view re-mapped since the click: take the item the
                            // client asked for (by uid), never the slot's new occupant.
                            var resolved = (typeof options.findByUid === "function") ? options.findByUid(wantDel.uid) : null;
                            if (resolved && resolved.id != 0 && _csWantMatches(options, wantDel, resolved)) {
                                stored = resolved;
                            } else {
                                _csInvalid(options, playerUid, slotKey, event, "stale-slot");
                                delete events[slotKey];
                                continue;
                            }
                        }
                    } else if (!stored || stored.id == 0) {
                        _csInvalid(options, playerUid, slotKey, event, "missing-slot");
                        delete events[slotKey];
                        continue;
                    }
                    var maxStack = maxStackFn(stored.id);
                    var inInventory = ContainerSync.findInBuffer(buffer, stored.id, stored.data, stored.extra || null, true);
                    var take = inInventory && inInventory.item.count < maxStack
                        ? Math.min(eventCount, stored.count, maxStack - inInventory.item.count)
                        : Math.min(eventCount, stored.count);
                    if (take <= 0) { _csInvalid(options, playerUid, slotKey, event, "take-zero"); delete events[slotKey]; continue; }
                    var rem = options.remove({ id: stored.id, count: take, data: stored.data, extra: stored.extra || null }, take);
                    if (typeof rem != "number" || !isFinite(rem)) rem = take;
                    if (rem < 0) rem = 0;
                    if (rem > take) rem = take;
                    var removed = take - rem;
                    if (removed > 0) {
                        var extra = inInventory ? inInventory.item.extra : (stored.extra || null);
                        var touched = {};
                        var leftover = ContainerSync.addToBuffer(buffer, stored.id, removed, stored.data, extra, maxStack, touched);
                        for (var tk in touched) {
                            if (Object.prototype.hasOwnProperty.call(touched, tk)) dirty[tk] = true;
                        }
                        if (leftover > 0 && player.addItemToInventory) {
                            player.addItemToInventory(stored.id, leftover, stored.data, extra || null, true);
                        }
                        needRefresh = true;
                        if (stored.count <= take || event.updateFull) fullRefresh = true;
                    }
                    delete events[slotKey];
                    _csNotify(options.onHandled, playerUid, 'delete');
                }
            }
        }
        if (buffer && needRefresh) {
            var leftoverItems = [];
            var commitLeftover = ContainerSync.commitInventory(player, buffer, dirty, leftoverItems, origin);
            // Route items commitInventory could not write (external race) to the host:
            // total count + per-slot descriptors (options.onLeftover).
            if (commitLeftover > 0) _csNotify(options.onLeftover, playerUid, commitLeftover, leftoverItems);
        }
        if (needRefresh) {
            anyChanged = true;
            if (fullRefresh) anyFull = true;
            _csNotify(options.onChanged, playerUid, fullRefresh);
        }
        delete eventsByPlayer[p];
    }
    return { changed: anyChanged, fullUpdate: anyFull };
};

/**
 * Convenience for the single-container (per-player) flow: build the events from
 * the container's own networkData and process them. Same shape as processEvents.
 */
ContainerSync.process = function (networkData, playerUid, options) {
    var ack = {};
    var events = ContainerSync.buildEvents(networkData, ack);
    var has = false;
    for (var k in events) { has = true; break; }
    if (!has) return { changed: false, fullUpdate: false };
    var map = {};
    map[String(playerUid)] = events;
    var result = ContainerSync.processEvents(map, options);
    networkData.putInt('acknowledgedRequest', ack.requestNumber || 0);
    _csJsonPut(networkData, 'requestResult', result);
    networkData.putBoolean('update', false);
    return result;
};

/* -------------------------------------------------------- net state ------ */

/**
 * Per-tile UI state protocol over networkData (namespace `@<id>`), matching the
 * per-tile UI state protocol: typed field publish with a monotonic version,
 * optional content hash/count for a bounded mismatch retry, and a client-tick
 * consume. Re-publishing at attach/open is just another publish (no separate
 * `snapshot` API).
 *
 *   var ns = ContainerSync.netState({
 *       version: "itemsVersion",               // required; key = "<version>@<id>"
 *       hash: "itemsHash", count: "itemsCount",// optional (retry needs both)
 *       retry: 20,                             // bounded retry ticks (default 20; 0 = off)
 *       fields: { sort: { type: "int", default: 0 }, ... }
 *   });
 * Returns null for an unusable config (no string `version`). Field/key names
 * containing `@` and unsafe keys (__proto__/constructor/prototype) are rejected.
 * `publish` writes only declared fields present in `values` (undeclared names
 * are ignored); `read` always fills every declared field (typed, with default).
 * No logging, no engine access; `consume` isolates the host callbacks.
 */
ContainerSync.netState = function (config) {
    config = config || {};
    var versionKey = config.version;
    if (typeof versionKey != "string" || !versionKey.length ||
        _csUnsafeKey(versionKey) || versionKey.indexOf('@') != -1) return null;

    var schema = [];
    var fields = config.fields || {};
    for (var fName in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, fName)) continue;
        if (_csUnsafeKey(fName) || fName.indexOf('@') != -1) continue;
        var spec = fields[fName] || {};
        var fType = (spec.type === "int" || spec.type === "boolean" || spec.type === "json") ? spec.type : "string";
        var fDef = (typeof spec.default != "undefined") ? spec.default
            : (fType === "int" ? 0 : (fType === "boolean" ? false : (fType === "json" ? null : "")));
        schema.push({ name: fName, type: fType, def: fDef });
    }

    function _nsKey(name, id) { return name + '@' + id; }
    function _nsBadKey(name) {
        return typeof name != "string" || !name.length || _csUnsafeKey(name) || name.indexOf('@') != -1;
    }
    var hashKey = _nsBadKey(config.hash) ? null : config.hash;
    var countKey = _nsBadKey(config.count) ? null : config.count;
    var hasHash = !!(hashKey && countKey);
    var retryMax = (typeof config.retry == "number" && isFinite(config.retry) && config.retry >= 0)
        ? Math.floor(config.retry) : 20;

    var ns = {};

    function _isLive(handlers) {
        if (typeof handlers.isLive != "function") return false;
        try { return !!handlers.isLive(); } catch (e) { return false; }
    }

    function _apply(handlers, ver) {
        if (typeof handlers.onApply != "function") return;
        try { handlers.onApply(ver); }
        catch (e) {
            try { if (typeof handlers.onError == "function") handlers.onError(e); } catch (e2) {}
        }
    }

    /** True when the local hash cannot be confirmed against the published one. */
    function _hashMismatch(nd, id, handlers) {
        if (!hasHash || typeof handlers.hash != "function") return false;
        var st = null;
        try { st = handlers.hash(); } catch (e) { return true; }
        if (!st) return true;
        return !(st.n === nd.getInt(_nsKey(countKey, id), -1) &&
            st.h === nd.getInt(_nsKey(hashKey, id), 0));
    }

    /**
     * Server side: write declared fields + optional {hash,count} metrics, bump
     * the version and (unless options.sync === false) sendChanges. Returns the new
     * version; a missing nd/id is a no-op returning the current version.
     */
    ns.publish = function (nd, id, values, metrics, options) {
        if (!nd || id === null || typeof id == "undefined") return 0;
        if (values && typeof values == "object") {
            for (var i = 0; i < schema.length; i++) {
                var f = schema[i];
                if (!Object.prototype.hasOwnProperty.call(values, f.name)) continue;
                var v = values[f.name];
                if (typeof v == "undefined") continue;
                // Schema-driven typing: the engine key type MUST match what
                // read() uses, so string fields are coerced, boolean fields are
                // truthy-coerced, and mismatched ints are skipped.
                if (f.type === "boolean") nd.putBoolean(_nsKey(f.name, id), !!v);
                else if (f.type === "int") { if (typeof v == "number") nd.putInt(_nsKey(f.name, id), v); }
                else if (f.type === "json") _csJsonPut(nd, _nsKey(f.name, id), v);
                else nd.putString(_nsKey(f.name, id), v == null ? '' : String(v));
            }
        }
        if (metrics && typeof metrics == "object" && hasHash) {
            if (typeof metrics.hash == "number") nd.putInt(_nsKey(hashKey, id), metrics.hash);
            if (typeof metrics.count == "number") nd.putInt(_nsKey(countKey, id), metrics.count);
        }
        var ver = (nd.getInt(_nsKey(versionKey, id), 0) + 1) & 0x7FFFFFFF;
        nd.putInt(_nsKey(versionKey, id), ver);
        if (!options || options.sync !== false) nd.sendChanges();
        return ver;
    };

    /** Client side: fill every declared field into `target` (typed + default). */
    ns.read = function (nd, id, target) {
        if (!nd || !target || id === null || typeof id == "undefined") return target;
        for (var i = 0; i < schema.length; i++) {
            var f = schema[i];
            var key = _nsKey(f.name, id);
            if (f.type === "int") target[f.name] = nd.getInt(key, f.def);
            else if (f.type === "boolean") target[f.name] = nd.getBoolean(key, f.def);
            else if (f.type === "json") target[f.name] = ContainerSync.jsonGet(nd, key, f.def);
            else {
                var sv = nd.getString(key, f.def);
                target[f.name] = (sv === null || typeof sv == "undefined") ? f.def : sv;
            }
        }
        return target;
    };

    /** Host-owned per-tile consume state ({ version, retry }). */
    ns.createState = function () { return { version: undefined, retry: 0 }; };

    /**
     * Client tick: apply the published state on a new version, honoring the host
     * gates, then run the bounded hash retry. handlers: {
     *   isLive() -> bool,               // required for apply (missing = closed)
     *   isGestureActive() -> bool,      // true = defer to the next tick
     *   nameMatches() -> bool,          // false = defer to the next tick
     *   hash() -> { h, n },             // local content hash (enables retry)
     *   onApply(version),               // host apply + render (isolated)
     *   onError(error)                  // optional, onApply failures
     * }
     * Returns { applied, reason, version } with reason one of
     * "init"|"same"|"closed"|"gesture"|"name"|"version"|"retry"|"retryWait".
     */
    ns.consume = function (nd, id, state, handlers) {
        var res = { applied: false, reason: "same", version: 0 };
        if (!nd || !state || id === null || typeof id == "undefined") return res;
        handlers = handlers || {};
        var v = nd.getInt(_nsKey(versionKey, id), 0);
        res.version = v;
        if (typeof state.version == "undefined") {
            state.version = v;
            res.reason = "init";
            return res;
        }
        if (v !== state.version) {
            if (!_isLive(handlers)) {
                state.version = v;
                res.reason = "closed";
                return res;
            }
            if (typeof handlers.isGestureActive == "function") {
                var gest = false;
                try { gest = !!handlers.isGestureActive(); } catch (e) { gest = true; }
                if (gest) { res.reason = "gesture"; return res; }
            }
            if (typeof handlers.nameMatches == "function") {
                var match = false;
                try { match = !!handlers.nameMatches(); } catch (e) { match = false; }
                if (!match) { res.reason = "name"; return res; }
            }
            state.version = v;
            _apply(handlers, v);
            res.applied = true;
            res.reason = "version";
            if (_hashMismatch(nd, id, handlers)) state.retry = retryMax;
        }
        if (state.retry > 0 && _isLive(handlers)) {
            if (!_hashMismatch(nd, id, handlers)) {
                state.retry = 0;
                _apply(handlers, v);
                res.applied = true;
                if (res.reason === "same") res.reason = "retry";
                return res;
            }
            state.retry--;
            if (!res.applied) res.reason = "retryWait";
        }
        return res;
    };

    return ns;
};

/* ------------------------------------------------------ client UI math ---- */

/**
 * Inventory slot index from touch coords:
 * slot = floor(x/cellW) + floor(y/cellH) * cols.
 */
ContainerSync.slotFromCoords = function (event, cols, cellWidth, cellHeight) {
    return Math.floor(event.x / cellWidth) + Math.floor(event.y / cellHeight) * cols;
};

/**
 * Click count: CLICK → 1; long-press → min(maxStack, storageLeft, available).
 */
ContainerSync.clickCount = function (item, isLongPress, storageLeft, maxStackFn) {
    maxStackFn = maxStackFn || function (id) {
        return (typeof Item != "undefined" && Item && Item.getMaxStack) ? Item.getMaxStack(id) : 64;
    };
    if (!isLongPress) return 1;
    var count = Math.min(maxStackFn(item.id), storageLeft, item.count);
    return count > 0 ? count : 0;
};

EXPORT("ContainerSync", ContainerSync);
