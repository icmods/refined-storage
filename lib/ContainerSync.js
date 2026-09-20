LIBRARY({
    name: "ContainerSync",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:1"]
});

IMPORT("CoreKit:1");

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
 * Read a JSON array from a networkData map. Java null, the string "null" and
 * malformed JSON all degrade to [] (golden rule #35: getString may return
 * Java null even when a default is passed).
 */
function _csReadMap(networkData, key) {
    var raw = networkData.getString(key, 'null');
    if (!raw || raw === 'null') return [];
    try {
        var parsed = JSON.parse(raw);
        return (parsed && parsed.length !== undefined) ? parsed : [];
    } catch (e) {
        return [];
    }
}

/** Keys that must never be written/iterated as event names (client-controlled). */
function _csUnsafeKey(key) {
    key = String(key);
    return key === '__proto__' || key === 'constructor' || key === 'prototype';
}

/** Isolated host notification: a throwing listener never breaks processing. */
function _csNotify(fn, a, b, c) {
    if (typeof fn != "function") return;
    try { fn(a, b, c); } catch (e) {}
}

/**
 * Opt-in diagnostics record for a rejected event (EXPERIMENTAL). Reporting only:
 * the processing behaviour is unchanged.
 */
function _csInvalid(opts, playerUid, slotKey, event, reason) {
    if (typeof opts.onInvalid != "function") return;
    try {
        opts.onInvalid({
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
 * job (once, at the end).
 */
ContainerSync.queuePush = function (networkData, slot, count, updateFull) {
    count = _csSafeCount(count);
    if (count <= 0) return;
    var map = _csReadMap(networkData, 'pushItemsMap');
    if (map.indexOf(slot) == -1) map.push(slot);
    networkData.putString('pushItemsMap', JSON.stringify(map));
    networkData.putInt(slot, networkData.getInt(slot, 0) + count);
    networkData.putBoolean('update', true);
    networkData.putBoolean('updateFull' + slot, !!updateFull);
};

/**
 * Queue a storage→inventory extraction into the networkData maps.
 */
ContainerSync.queueDelete = function (networkData, slotKey, count, updateFull) {
    count = _csSafeCount(count);
    if (count <= 0) return;
    var map = _csReadMap(networkData, 'deleteItemsMap');
    if (map.indexOf(slotKey) == -1) map.push(slotKey);
    networkData.putString('deleteItemsMap', JSON.stringify(map));
    networkData.putInt(slotKey, networkData.getInt(slotKey, 0) + count);
    networkData.putBoolean('update', true);
    networkData.putBoolean('updateFull' + slotKey, !!updateFull);
};

/** True when the client flagged pending events. */
ContainerSync.hasPending = function (networkData) {
    return !!networkData.getBoolean('update', false);
};

/**
 * Read the queued maps from networkData and reset them. Returns a fresh events
 * map with NAMESPACED keys (never colliding between the two directions):
 *   'd:<storageSlotKey>' -> { type:'delete', slotKey, count, updateFull }
 *   'p:<inventorySlot>'  -> { type:'push', count, slot, updateFull }
 * Unsafe client-controlled keys (__proto__/constructor/prototype) are rejected.
 */
ContainerSync.buildEvents = function (networkData) {
    var events = {};
    var map = _csReadMap(networkData, 'deleteItemsMap');
    for (var i = 0; i < map.length; i++) {
        if (_csUnsafeKey(map[i])) continue;
        events['d:' + map[i]] = {
            type: 'delete',
            slotKey: map[i],
            count: Number(networkData.getInt(map[i], 0)),
            updateFull: networkData.getBoolean('updateFull' + map[i], false)
        };
        networkData.putInt(map[i], 0);
        networkData.putBoolean('updateFull' + map[i], false);
    }
    networkData.putString('deleteItemsMap', 'null');
    var map2 = _csReadMap(networkData, 'pushItemsMap');
    for (var p = 0; p < map2.length; p++) {
        if (_csUnsafeKey(map2[p])) continue;
        events['p:' + map2[p]] = {
            type: 'push',
            count: Number(networkData.getInt(map2[p], 0)),
            slot: map2[p],
            updateFull: networkData.getBoolean('updateFull' + map2[p], false)
        };
        networkData.putInt(map2[p], 0);
        networkData.putBoolean('updateFull' + map2[p], false);
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
        buffer.push(s && s.id > 0
            ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null }
            : { id: 0, count: 0, data: 0, extra: null });
    }
    return buffer;
};

function _csBufferCopy(buffer) {
    var out = [];
    for (var i = 0; i < buffer.length; i++) {
        var s = buffer[i];
        out.push(s && s.id > 0
            ? { id: s.id, count: s.count, data: s.data, extra: s.extra || null }
            : { id: 0, count: 0, data: 0, extra: null });
    }
    return out;
}

/** Extra identity: both absent, reference-equal, or same canonical string. */
function _csExtraSame(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a === b) return true;
    return CoreKit.Items.fullExtraToString(a) === CoreKit.Items.fullExtraToString(b);
}

/**
 * Write the buffer back with the external-change guard: a slot changed outside
 * the handler is NOT overwritten — its items become the returned leftover.
 * With dirtySlots, only those slots are touched and the slots we emptied
 * (dirty + buffer empty) are explicitly cleared only when the real slot still
 * matches the pre-handler snapshot (originSlots), so an item injected
 * externally into a planned-empty slot is never wiped (CS-B05).
 * originSlots (optional): per-slot copy of the inventory BEFORE the handler
 * ran. With it, only the NEW part (planned − snapshot) of a traced stack is
 * delivered or reported; a pre-existing stack moved externally is never
 * re-added (CS-B13). Returns the leftover count; when `leftoverItems` is
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
        if (s.id > 0) {
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
 * opts: {
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
ContainerSync.processEvents = function (eventsByPlayer, opts) {
    opts = opts || {};
    var maxStackFn = opts.maxStack || function (id) {
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
                if (eventCount <= 0) { _csInvalid(opts, playerUid, slotKey, event, "invalid-count"); delete events[slotKey]; continue; }
                if (typeof opts.isAllowed == "function" && !opts.isAllowed()) { _csInvalid(opts, playerUid, slotKey, event, "not-allowed"); delete events[slotKey]; continue; }
                if (!player) player = new PlayerActor(playerUid);
                if (!buffer) { buffer = ContainerSync.bufferInventory(player); origin = _csBufferCopy(buffer); dirty = {}; }

                if (isPush) {
                    var slotIndex = Number(event.slot);
                    var item = buffer[slotIndex] || { id: 0, count: 0, data: 0, extra: null };
                    if (item.id == 0) { _csInvalid(opts, playerUid, slotKey, event, "missing-slot"); delete events[slotKey]; continue; }
                    var count = Math.min(eventCount, item.count);
                    // fullRefresh when a full stack was requested (before the mutation)
                    // OR updateFull — even when storage rejects everything
                    var fullAttempt = item.count <= count;
                    // Snapshot BEFORE the move: onPushed describes the attempted push, not
                    // the mutated count.
                    var pushedInfo = { id: item.id, data: item.data, extra: item.extra, count: item.count };
                    var remainder = opts.push({ id: item.id, count: count, data: item.data, extra: item.extra }, count);
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
                    _csNotify(opts.onPushed, pushedInfo, pushed);
                    _csNotify(opts.onHandled, playerUid, 'push');
                } else {
                    if (event.type !== 'delete') { _csInvalid(opts, playerUid, slotKey, event, "unknown-type"); delete events[slotKey]; continue; }
                    // a delete on an empty/absent slot is dropped without calling opts.remove
                    // (the host charges energy inside remove, so nothing is consumed)
                    var rawKey = event.slotKey != null ? event.slotKey : slotKey;
                    var stored = typeof opts.getSlot == "function" ? opts.getSlot(rawKey) : null;
                    if (!stored || stored.id <= 0) { _csInvalid(opts, playerUid, slotKey, event, "missing-slot"); delete events[slotKey]; continue; }
                    var maxStack = maxStackFn(stored.id);
                    var inInventory = ContainerSync.findInBuffer(buffer, stored.id, stored.data, stored.extra || null, true);
                    var take = inInventory && inInventory.item.count < maxStack
                        ? Math.min(eventCount, stored.count, maxStack - inInventory.item.count)
                        : Math.min(eventCount, stored.count);
                    if (take <= 0) { _csInvalid(opts, playerUid, slotKey, event, "take-zero"); delete events[slotKey]; continue; }
                    var rem = opts.remove({ id: stored.id, count: take, data: stored.data, extra: stored.extra || null }, take);
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
                    _csNotify(opts.onHandled, playerUid, 'delete');
                }
            }
        }
        if (buffer && needRefresh) {
            var leftoverItems = [];
            var commitLeftover = ContainerSync.commitInventory(player, buffer, dirty, leftoverItems, origin);
            // Route items commitInventory could not write (external race) to the host:
            // total count + per-slot descriptors (opts.onLeftover).
            if (commitLeftover > 0) _csNotify(opts.onLeftover, playerUid, commitLeftover, leftoverItems);
        }
        if (needRefresh) {
            anyChanged = true;
            if (fullRefresh) anyFull = true;
            _csNotify(opts.onChanged, playerUid, fullRefresh);
        }
        delete eventsByPlayer[p];
    }
    return { changed: anyChanged, fullUpdate: anyFull };
};

/**
 * Convenience for the single-container (per-player) flow: build the events from
 * the container's own networkData and process them. Same shape as processEvents.
 */
ContainerSync.process = function (networkData, playerUid, opts) {
    var events = ContainerSync.buildEvents(networkData);
    var has = false;
    for (var k in events) { has = true; break; }
    if (!has) return { changed: false, fullUpdate: false };
    var map = {};
    map[String(playerUid)] = events;
    return ContainerSync.processEvents(map, opts);
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
