LIBRARY({
    name: "EventBus",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var EventBus = {};

/*
 * ============================================================================
 * EventBus — event emitter with error isolation, scopes, namespaces and
 * capability-limited handles.
 * ============================================================================
 * Semantics:
 *   - listener errors are isolated (a throwing listener never stops the emission);
 *   - the listener list is snapshotted on emit;
 *   - clear/clearScope are ADMIN operations on the shared bus; normal consumers
 *     use their namespace handle (on/emit/clearOwn) or an isolated create() bus;
 *   - a reentrancy depth guard drops runaway recursion with a log;
 *   - namespaces prefix every event ("rs:taskAdded") and own their listeners;
 *   - define(event, validate) adds a dev-only payload contract per namespace.
 * ============================================================================
 */

var _EB_LOG_TAG = "EventBus";
var _EB_DEFAULT_MAX_DEPTH = 32;
var _EB_GROWTH_WARN = 1000;

function _ebLog(msg) {
    if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, _EB_LOG_TAG);
}

function _EBBus() {
    Object.defineProperty(this, "_listeners", { value: Object.create(null), enumerable: false, writable: true, configurable: true });
    this._seq = 1;
    this._depth = 0;
    this._maxDepth = _EB_DEFAULT_MAX_DEPTH;
    this._trace = null;
    this._grown = Object.create(null);
    this._ephemeral = [];
}

/**
 * on(event, fn[, scope][, opts]) — opts: { owner, ephemeral }.
 * Returns a stable numeric subscription id (no longer the list index).
 */
_EBBus.prototype.on = function (event, fn, scope, opts) {
    if (typeof fn != "function") return -1;
    if (!this._listeners[event]) this._listeners[event] = [];
    var list = this._listeners[event];
    if (list.length >= _EB_GROWTH_WARN && !this._grown[event]) {
        this._grown[event] = true;
        _ebLog('listener growth warning: event "' + event + '" reached ' + list.length + ' listeners');
    }
    var id = this._seq++;
    var entry = {
        fn: fn,
        scope: scope === undefined ? null : scope,
        owner: (opts && opts.owner) || null,
        ephemeral: !!(opts && opts.ephemeral),
        id: id
    };
    list.push(entry);
    if (entry.ephemeral) {
        this._ephemeral.push({ event: event, id: id });
        _ebEnsureLifecycle();
    }
    return id;
};

_EBBus.prototype.once = function (event, fn, scope, opts) {
    var self = this;
    var wrapper = function (data) {
        self.off(event, wrapper);
        fn(data);
    };
    wrapper._ebOriginal = fn;
    this.on(event, wrapper, scope, opts);
    return wrapper;
};

/** Unregister by callback (accepts the once wrapper); removes every match. */
_EBBus.prototype.off = function (event, fn) {
    var list = this._listeners[event];
    if (!list) return;
    var self = this;
    for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].fn === fn || (fn && list[i].fn._ebOriginal === fn)) {
            if (this._ephemeral.length) {
                this._ephemeral = this._ephemeral.filter(function (e) { return e.id !== list[i].id; });
            }
            list.splice(i, 1);
        }
    }
};

/** Unregister a single subscription by the id returned from on(). */
_EBBus.prototype.offId = function (event, id) {
    var list = this._listeners[event];
    if (!list) return false;
    for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].id === id) {
            if (this._ephemeral.length) {
                this._ephemeral = this._ephemeral.filter(function (e) { return e.id !== id; });
            }
            list.splice(i, 1);
            return true;
        }
    }
    return false;
};

/** Emit to all listeners; an exception in one listener does not stop the emission. */
_EBBus.prototype.emit = function (event, data) {
    return this.emitScoped(event, null, data);
};

/**
 * Emit only listeners with scope === scope (or scope null = all).
 * Returns the number of executed listeners.
 */
_EBBus.prototype.emitScoped = function (event, scope, data) {
    var list = this._listeners[event];
    if (!list || !list.length) return 0;
    if (this._depth >= this._maxDepth) {
        _ebLog('emit depth limit (' + this._maxDepth + ') reached on "' + event + '" — dropped');
        return 0;
    }
    var snapshot = list.slice();
    var count = 0;
    this._depth++;
    try {
        for (var i = 0; i < snapshot.length; i++) {
            if (scope !== null && snapshot[i].scope !== scope) continue;
            count++;
            try {
                snapshot[i].fn(data);
            } catch (e) {
                _ebLog('listener error on "' + event + '": ' + e);
            }
        }
        if (this._trace) {
            try {
                this._trace({ event: event, listeners: snapshot.length, executed: count, depth: this._depth });
            } catch (e2) {}
        }
    } finally {
        this._depth--;
    }
    return count;
};

/** Remove all listeners registered with the given scope. */
_EBBus.prototype.clearScope = function (scope) {
    var events = Object.keys(this._listeners);
    for (var e = 0; e < events.length; e++) {
        var list = this._listeners[events[e]];
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].scope === scope) list.splice(i, 1);
        }
    }
    this._rebuildEphemeral();
};

/** Remove every listener owned by an owner label. Returns the removed count. */
_EBBus.prototype.clearOwner = function (owner) {
    if (owner === null || owner === undefined) return 0;
    var removed = 0;
    var events = Object.keys(this._listeners);
    for (var e = 0; e < events.length; e++) {
        var list = this._listeners[events[e]];
        for (var i = list.length - 1; i >= 0; i--) {
            if (list[i].owner === owner) {
                list.splice(i, 1);
                removed++;
            }
        }
    }
    this._rebuildEphemeral();
    return removed;
};

_EBBus.prototype._rebuildEphemeral = function () {
    var out = [];
    for (var i = 0; i < this._ephemeral.length; i++) {
        var ref = this._ephemeral[i];
        var list = this._listeners[ref.event];
        if (!list) continue;
        for (var j = 0; j < list.length; j++) {
            if (list[j].id === ref.id) { out.push(ref); break; }
        }
    }
    this._ephemeral = out;
};

_EBBus.prototype._clearEphemeral = function () {
    for (var i = this._ephemeral.length - 1; i >= 0; i--) {
        var ref = this._ephemeral[i];
        this.offId(ref.event, ref.id);
    }
    this._ephemeral = [];
};

/** Remove listeners of one event (or all of them when event == null). */
_EBBus.prototype.clear = function (event) {
    if (event) {
        delete this._listeners[event];
    } else {
        this._listeners = Object.create(null);
    }
    this._rebuildEphemeral();
};

_EBBus.prototype.listenerCount = function (event) {
    return this._listeners[event] ? this._listeners[event].length : 0;
};

/** Optional observability hook (off by default). Returns an unsubscribe function. */
_EBBus.prototype.onTrace = function (fn) {
    if (typeof fn != "function") return false;
    this._trace = fn;
    var self = this;
    return function () { if (self._trace === fn) self._trace = null; };
};

/** Create a new isolated bus (full surface, for internal systems). */
EventBus.create = function () {
    return new _EBBus();
};

/* --------------------------------------------------------------- global bus */

EventBus._globalBus = null;
EventBus._globalHandle = null;

function _ebGlobalBus() {
    if (!EventBus._globalBus) EventBus._globalBus = new _EBBus();
    return EventBus._globalBus;
}

// One LevelLeft callback (registered lazily) clears ephemeral subscriptions.
var _ebLifecycleHooked = false;
function _ebEnsureLifecycle() {
    if (_ebLifecycleHooked) return;
    if (typeof Callback != "undefined" && Callback && Callback.addCallback) {
        _ebLifecycleHooked = true;
        Callback.addCallback("LevelLeft", function () {
            if (EventBus._globalBus) EventBus._globalBus._clearEphemeral();
        });
    }
}

/**
 * Restricted handle for the shared bus: listen + emit only.
 * Destructive operations live on EventBus.admin(); per-namespace operations on
 * EventBus.ns(name).
 */
EventBus.getGlobal = function () {
    if (EventBus._globalHandle) return EventBus._globalHandle;
    var bus = _ebGlobalBus();
    EventBus._globalHandle = {
        on: function (event, fn, scope) { return bus.on(event, fn, scope); },
        once: function (event, fn, scope) { return bus.once(event, fn, scope); },
        off: function (event, fn) { return bus.off(event, fn); },
        offId: function (event, id) { return bus.offId(event, id); },
        emit: function (event, data) { return bus.emit(event, data); },
        emitScoped: function (event, scope, data) { return bus.emitScoped(event, scope, data); },
        listenerCount: function (event) { return bus.listenerCount(event); },
        onTrace: function (fn) { return bus.onTrace(fn); }
    };
    return EventBus._globalHandle;
};

/** Administrative surface for the shared bus (host/tests only). */
EventBus.admin = function () {
    var bus = _ebGlobalBus();
    return {
        clear: function (event) { bus.clear(event); },
        clearAll: function () { bus.clear(); },
        clearScope: function (scope) { bus.clearScope(scope); },
        clearOwner: function (owner) { return bus.clearOwner(owner); },
        listEvents: function () {
            var out = [];
            var events = Object.keys(bus._listeners);
            for (var i = 0; i < events.length; i++) out.push({ event: events[i], count: bus._listeners[events[i]].length });
            return out;
        },
        setMaxDepth: function (n) {
            n = Math.floor(Number(n));
            if (isFinite(n) && n >= 1) bus._maxDepth = n;
            return bus._maxDepth;
        },
        trace: function (fn) { return bus.onTrace(fn); }
    };
};

/* --------------------------------------------------------------- namespaces */

var _ebNamespaces = Object.create(null);
var _ebSchemas = Object.create(null);

/**
 * Namespace handle: every event is prefixed ("rs:taskAdded"), listeners are
 * owned, and destructive operations are limited to the namespace's own entries.
 */
EventBus.ns = function (name) {
    if (typeof name != "string" || !/^[a-z][a-z0-9_]*$/.test(name)) {
        throw new Error("EventBus.ns: invalid namespace '" + name + "'");
    }
    if (_ebNamespaces[name]) return _ebNamespaces[name];
    var bus = _ebGlobalBus();
    var prefix = name + ":";
    function key(event) { return prefix + event; }
    var handle = {
        name: name,
        on: function (event, fn, opts) { return bus.on(key(event), fn, null, { owner: name, ephemeral: opts && opts.ephemeral }); },
        once: function (event, fn, opts) { return bus.once(key(event), fn, null, { owner: name, ephemeral: opts && opts.ephemeral }); },
        off: function (event, fn) { return bus.off(key(event), fn); },
        offId: function (event, id) { return bus.offId(key(event), id); },
        define: function (event, validate) {
            _ebSchemas[key(event)] = (typeof validate == "function") ? validate : null;
        },
        emit: function (event, data) {
            var schema = _ebSchemas[key(event)];
            if (schema && typeof Config != "undefined" && Config && Config.dev) {
                var ok = false;
                try { ok = !!schema(data); } catch (e) { ok = false; }
                if (!ok) {
                    _ebLog('payload rejected by schema on "' + key(event) + '"');
                    return 0;
                }
            }
            return bus.emit(key(event), data);
        },
        emitScoped: function (event, scope, data) { return bus.emitScoped(key(event), scope, data); },
        listenerCount: function (event) { return bus.listenerCount(key(event)); },
        clearOwn: function () { return bus.clearOwner(name); }
    };
    _ebNamespaces[name] = handle;
    return handle;
};

// Protected shared-bus accessor: assigning EventBus.global is a no-op.
Object.defineProperty(EventBus, "global", {
    enumerable: true,
    configurable: false,
    get: function () { return EventBus.getGlobal(); }
});

EXPORT("EventBus", EventBus);
