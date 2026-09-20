LIBRARY({
    name: "MpCore",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["TickScheduler:1"]
});

IMPORT("TickScheduler:1");

var MpCore = {};

/*
 * ============================================================================
 * MpCore — multiplayer toolkit: per-player state, screens, request guards
 * ============================================================================
 * Per-player connected-clients map + open/close listeners (per-client cleanup,
 * no cross-player contamination), screen resolution + targeted/broadcast refresh,
 * per-source request throttle with pruning, request validation, and a per-player
 * state map. PlayerActor is used per tick only, never retained.
 * ============================================================================
 */

function _mpOwner(container, fallbackTile) {
    if (container && typeof container.getParent == "function") {
        try {
            var parent = container.getParent();
            if (parent) return parent;
        } catch (e) {}
    }
    return fallbackTile;
}

var _MP_containers = [];

if (typeof Callback != "undefined" && Callback && Callback.addCallback) {
    Callback.addCallback("LevelLeft", function () { _MP_containers = []; });
}

/**
 * Attach the connected-clients map + open/close listeners to a TILE instance
 * (call once in init()). Returns the clients map. onClose is per-client.
 *   tile.__mpClients[uid] = client
 *   opts.onOpen(container, client)          — optional, AFTER the client is tracked
 *   opts.onClose(uid, container, client)    — optional per-client cleanup callback
 * (onClose keeps uid as the first arg for backward compatibility.)
 */
MpCore.connectivity = function (tile, opts) {
    opts = opts || {};
    tile.__mpClients = tile.__mpClients || {};
    var container = tile.container;
    if (!container) return tile.__mpClients;
    var hadAttach = !!(tile.__mpOpenAttached || tile.__mpCloseAttached);
    // The same instance can receive a new container (re-init): re-attach so the
    // hooks are not silently bound to a dead container.
    if (tile.__mpContainer !== container) {
        tile.__mpContainer = container;
        delete tile.__mpOpenAttached;
        delete tile.__mpCloseAttached;
    }
    if (tile.__mpOpenAttached && tile.__mpCloseAttached) return tile.__mpClients;
    if (!hadAttach && _MP_containers.indexOf(container) !== -1) {
        tile.__mpOpenAttached = true;
        tile.__mpCloseAttached = true;
        return tile.__mpClients;
    }
    // Attach each listener independently and flag it only AFTER success, so a
    // partial failure is not locked in and a retry only re-attempts the missing one.
    if (!tile.__mpOpenAttached) {
        try {
            container.addServerOpenListener({
                onOpen: function (cont, client) {
                    var owner = _mpOwner(cont || container, tile);
                    owner.__mpClients = owner.__mpClients || {};
                    try {
                        var uid = client.getPlayerUid();
                        owner.__mpClients[uid] = client;
                    } catch (e) {}
                    if (typeof opts.onOpen == "function") {
                        try { opts.onOpen(cont || container, client, owner); } catch (e) {}
                    }
                }
            });
            tile.__mpOpenAttached = true;
        } catch (e) {}
    }
    if (!tile.__mpCloseAttached) {
        try {
            container.addServerCloseListener({
                onClose: function (cont, client) {
                    var owner = _mpOwner(cont || container, tile);
                    owner.__mpClients = owner.__mpClients || {};
                    var uid = null;
                    try { uid = client.getPlayerUid(); } catch (e) {}
                    if (uid !== null) {
                        delete owner.__mpClients[uid];
                    } else {
                        // getPlayerUid() threw — fall back to reference identity so the
                        // client is not leaked (the old code left a stale entry).
                        for (var k in owner.__mpClients) {
                            if (owner.__mpClients[k] === client) { delete owner.__mpClients[k]; break; }
                        }
                    }
                    if (typeof opts.onClose == "function") {
                        try { opts.onClose(uid, cont || container, client, owner); } catch (e) {}
                    }
                }
            });
            tile.__mpCloseAttached = true;
        } catch (e) {}
    }
    if (tile.__mpOpenAttached && tile.__mpCloseAttached) {
        if (tile.data && tile.data.__mpListenersV1 !== undefined) delete tile.data.__mpListenersV1;
        if (_MP_containers.indexOf(container) === -1) _MP_containers.push(container);
    }
    return tile.__mpClients;
};

/**
 * Clear all tracked clients for a tile (LevelLeft / teardown). Keeps the engine
 * listeners attached — there is no detach API — but drops stale references.
 */
MpCore.reset = function (tile) {
    if (tile) tile.__mpClients = {};
};

/** Drop one client (onDisconnectionPlayer cleanup). Returns true when removed. */
MpCore.disconnect = function (tile, playerUid) {
    if (tile && tile.__mpClients && tile.__mpClients[playerUid] !== undefined) {
        delete tile.__mpClients[playerUid];
        return true;
    }
    return false;
};

MpCore.getClient = function (tile, playerUid) {
    return tile.__mpClients ? tile.__mpClients[playerUid] : null;
};

MpCore.isWatching = function (tile, client) {
    if (!tile || !client || !tile.__mpClients) return false;
    var uid = null;
    try { uid = client.getPlayerUid(); } catch (e) { return false; }
    if (uid === null || uid === undefined) return false;
    return tile.__mpClients[uid] !== undefined && tile.__mpClients[uid] !== null;
};

/**
 * Install getScreenByName on a TileEntity prototype (required by openFor —
 * without it the engine throws "View not attached to window manager").
 *   screens = { "main": window, ... } or a function(name) → window
 */
MpCore.attachScreens = function (prototype, screens) {
    prototype.getScreenByName = function (screenName, container) {
        if (typeof screens == "function") return screens(screenName);
        return screens[screenName] || screens["main"] || null;
    };
};

/**
 * Open a screen for a specific client and send the initial payload
 * (openFor + targeted refresh).
 *   MpCore.openFor(tile, client, "main", payload)
 */
MpCore.openFor = function (tile, client, screenName, payload) {
    if (!tile || !tile.container || !client) return false;
    tile.container.openFor(client, screenName);
    MpCore.refresh(tile, client, "openGui", payload);
    return true;
};

/**
 * Targeted refresh (client given) or broadcast (client null) —
 * Targeted (client given) or broadcast (client null).
 */
MpCore.refresh = function (tile, client, eventName, payload) {
    if (!tile || !tile.container) return false;
    if (client) {
        tile.container.sendEvent(client, eventName, payload);
    } else {
        tile.container.sendEvent(eventName, payload);
    }
    return true;
};

/**
 * Lazy per-player map stored in tile.data[key].
 *   var pages = MpCore.perPlayer(tile, "recipePlayerPages");
 *   pages[uid] — plain object; survives tile persistence via tile.data.
 */
MpCore.perPlayer = function (tile, key) {
    if (!tile.data[key]) tile.data[key] = {};
    return tile.data[key];
};

/**
 * Per-source request throttle with pruning (default 60 ticks).
 * Ticks come from TickScheduler.global (declared dependency, imported at the
 * top). The epoch compensates a tick counter reset (LevelLeft → reset()).
 */
var _MP_epoch = 0;
var _MP_lastBase = 0;

function _mpNow() {
    var base = TickScheduler.global.ticks;
    if (base < _MP_lastBase) _MP_epoch += _MP_lastBase;
    _MP_lastBase = base;
    return base + _MP_epoch;
}

function _mpGuardCreate(throttleTicks) {
    var last = {};
    var pruneAt = null;
    return {
        isThrottled: function (sourceKey) {
            var t = last[sourceKey];
            return t !== null && t !== undefined && _mpNow() - t < throttleTicks;
        },
        mark: function (sourceKey) {
            var now = _mpNow();
            last[sourceKey] = now;
            if (pruneAt === null || now - pruneAt >= throttleTicks) {
                pruneAt = now;
                for (var k in last) {
                    if (now - last[k] >= throttleTicks) delete last[k];
                }
            }
        }
    };
}

/**
 * Create a request guard for a tile.
 *   var guard = MpCore.requestGuard(tile, 60);
 *   if (guard.isThrottled(playerUid)) return;
 *   ...work... ; guard.mark(playerUid);
 */
MpCore.requestGuard = function (tile, throttleTicks) {
    throttleTicks = Math.floor(Number(throttleTicks));
    if (!isFinite(throttleTicks) || throttleTicks < 1) throttleTicks = 60;
    var storageKey = "__mpGuard" + throttleTicks;
    if (!tile[storageKey]) tile[storageKey] = _mpGuardCreate(throttleTicks);
    return tile[storageKey];
};

/**
 * Server-side request validation: validate first, kick when the request is
 * impossible. fn() must return true when valid.
 */
MpCore.validate = function (client, fn) {
    var ok = false;
    try { ok = !!fn(); } catch (e) { ok = false; }
    if (!ok && client) {
        try { client.disconnect("Invalid request"); } catch (e) {}
    }
    return ok;
};

/**
 * Wrap a containerEvent handler with a player-uid guard: the handler runs
 * only when the requesting client is still connected (defensive).
 * tile MUST be the tile INSTANCE (not the prototype) — instances are
 * detected via their container; prototypes are never mutated.
 */
MpCore.guardHandler = function (tile, handler, opts) {
    opts = opts || {};
    var requireOpen = opts.requireOpen === true;
    return function (eventData, connectedClient) {
        var uid = null;
        try { uid = connectedClient.getPlayerUid(); } catch (e) { return; }
        if (uid === null || uid === undefined) return;
        if (!tile.__mpClients) {
            if (!tile.container) return;
            tile.__mpClients = {};
        }
        if (requireOpen && !tile.__mpClients[uid]) {
            if (typeof opts.onReject == "function") {
                try { opts.onReject(uid, tile); } catch (e) {}
            }
            return;
        }
        if (!tile.__mpClients[uid]) {
            // client not registered in connectivity — late registration fallback
            tile.__mpClients[uid] = connectedClient;
        }
        handler(eventData, connectedClient, uid);
    };
};

/* --------------------------------------------------------------- tile guard -- */

/** True when the tile instance exists, has data and was not marked removed. */
MpCore.isTileAlive = function (tile) {
    return !!(tile && tile.data && !tile.data.removed);
};

/**
 * Run `fn(tile)` on a live tile instance with error isolation.
 * opts.requireNetworkEntity — skip tiles without a networkEntity (server-side
 *   detached tiles, e.g. created on an unloaded chunk).
 * opts.allowRemoved — allow calling on tiles marked removed (default false).
 * Returns true when fn ran, false when skipped or when fn threw.
 */
MpCore.safeTileCall = function (tile, fn, opts) {
    opts = opts || {};
    if (!tile || typeof fn != "function") return false;
    if (!tile.data || (!opts.allowRemoved && tile.data.removed)) return false;
    if (opts.requireNetworkEntity && !tile.networkEntity) return false;
    try { fn(tile); return true; }
    catch (e) {
        if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log((opts.label || "tileCall") + " failed: " + e, opts.logTag || "MpCore");
        return false;
    }
};

EXPORT("MpCore", MpCore);
