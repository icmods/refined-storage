LIBRARY({
    name: "TickScheduler",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var TickScheduler = {};

/*
 * ============================================================================
 * TickScheduler — deterministic tick-based scheduling
 * ============================================================================
 * Deadline-based scheduling (nextRun deadline, no modulo drift), heartbeat scopes
 * with dirty-run resets, error isolation, debounce/coalesce, deferred teardown
 * with retries, and per-key throttle with pruning.
 *
 * Time base: TICKS (deterministic) — never the engine thread clock nor engine
 * Updatable callbacks.
 * ============================================================================
 */

var _TS_LOG_TAG = "TickScheduler";

function _tsLog(msg) {
    if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, _TS_LOG_TAG);
}

function _TS_safeNum(value, fallback) {
    value = Math.floor(Number(value));
    return isFinite(value) ? value : fallback;
}

function _TS_Scheduler(driverName) {
    this._ticks = 0;
    this.scopes = Object.create(null);
    this.reserved = Object.create(null);
    this._debounce = Object.create(null);
    this._batch = Object.create(null);
    this._batchOrder = [];
    this._defer = [];
    this._deferKeys = Object.create(null);
    this._throttle = Object.create(null);
    this._auto = null;
    this._driver = driverName || null;
    this._destroyed = false;
    // Budget is OFF by default; see admin().setBudget().
    this._budget = {
        enabled: false,
        maxTasksPerTick: _TS_BUDGET_DEFAULT,
        weights: { critical: 0.5, normal: 0.4, idle: 0.1 }
    };
    this._rr = { critical: 0, normal: 0, idle: 0 };
    var self = this;
    if (this._driver) {
        Callback.addCallback(this._driver, function () {
            if (self._destroyed) return; // disposed — no-op (engine has no removeCallback)
            self._tick();
        });
    }
}

// Module-private token: only interval() may register in the reserved `__auto` scope.
var _TS_AUTO_TOKEN = {};

// Priority lanes (budgeted driver tick only; heartbeat scopes are never budgeted).
var _TS_LANES = Object.create(null);
_TS_LANES.critical = 0;
_TS_LANES.normal = 1;
_TS_LANES.idle = 2;
var _TS_LANE_ORDER = ["critical", "normal", "idle"];
var _TS_LANE_DEFAULT = "normal";
var _TS_BUDGET_DEFAULT = 64;

function _tsLane(value) {
    return (typeof value == "string" && _TS_LANES[value] !== undefined) ? value : _TS_LANE_DEFAULT;
}

// Read-only tick counter (epoch-resets on reset()/destroy()).
Object.defineProperty(_TS_Scheduler.prototype, "ticks", {
    enumerable: true,
    configurable: false,
    get: function () { return this._ticks; }
});

/** Reserve an internal task name (registration with a reserved name requires opts.internal). */
_TS_Scheduler.prototype.reserve = function (name) {
    this.reserved[name] = 1;
};

_TS_Scheduler.prototype._runSafe = function (fn, label) {
    try {
        fn();
    } catch (e) {
        _tsLog('task "' + label + '" failed: ' + e);
    }
};

function _tsAutoDisableLimit(opts) {
    var n = opts ? _TS_safeNum(opts.autoDisable, 0) : 0;
    return n > 0 ? n : 0;
}

/**
 * Register a failure on a task: counters + onError + dedup logging + optional
 * auto-disable after `autoDisable` CONSECUTIVE failures. Returns true when disabled.
 */
function _tsFailTask(t, scopeId, name, e, label) {
    t.failures++;
    t.consecutiveFailures++;
    if (t.onError) {
        try { t.onError(e, name); } catch (e2) {}
    }
    if (t.autoDisable > 0 && t.consecutiveFailures >= t.autoDisable) {
        t.disabled = true;
        _tsLog(label + ' "' + name + '" on scope "' + scopeId + '" DISABLED after ' +
            t.consecutiveFailures + ' consecutive failures: ' + e);
        return true;
    }
    if (t.consecutiveFailures === 1) {
        _tsLog(label + ' "' + name + '" on scope "' + scopeId + '" failed: ' + e);
    }
    return false;
}

/**
 * register(scopeId, name, interval, offset, fn[, opts]) → handle {cancel}.
 * opts: { internal: bool, isDirty: fn→bool, onError: fn(error, name) }.
 * A scope is heartbeat-driven: call heartbeat(scopeId) from your tile tick.
 * Returns false when validation fails.
 */
_TS_Scheduler.prototype.register = function (scopeId, name, interval, offset, fn, opts) {
    if (scopeId === null || scopeId === undefined) return false;
    if (scopeId === "__auto" && !(opts && opts.__autoToken === _TS_AUTO_TOKEN)) return false;
    if (typeof name != "string" || !name) return false;
    if (this.reserved[name] && !(opts && opts.internal)) return false;
    interval = _TS_safeNum(interval, 0);
    if (interval < 1) return false;
    offset = _TS_safeNum(offset, 0);
    if (offset < 0) offset = 0;
    offset = offset % interval;
    if (typeof fn != "function") return false;
    var scope = this.scopes[scopeId];
    if (!scope) scope = this.scopes[scopeId] = { heartbeat: 0, tasks: Object.create(null) };
    var newOwner = (opts && opts.owner) || null;
    var existing = scope.tasks[name];
    if (existing && existing.owner !== newOwner) {
        _tsLog('task "' + name + '" on scope "' + scopeId + '" overwritten (owner ' +
            (existing.owner || "none") + ' -> ' + (newOwner || "none") + ')');
    }
    var task = {
        interval: interval,
        offset: offset,
        nextRun: scope.heartbeat + interval - offset,
        lastRun: 0,
        runs: 0,
        failures: 0,
        consecutiveFailures: 0,
        disabled: false,
        autoDisable: _tsAutoDisableLimit(opts),
        lane: _tsLane(opts && opts.lane),
        owner: newOwner,
        isDirty: (opts && typeof opts.isDirty == "function") ? opts.isDirty : null,
        onError: (opts && typeof opts.onError == "function") ? opts.onError : null,
        fn: fn
    };
    scope.tasks[name] = task;
    return this._makeHandle(scopeId, name, task);
};

/** Registry-checked handle: cancel/isLive compare against the live registry, not a stale closure. */
_TS_Scheduler.prototype._makeHandle = function (scopeId, name, task) {
    var self = this;
    var scope = this.scopes[scopeId];
    return {
        cancel: function () {
            if (self.scopes[scopeId] === scope && scope.tasks[name] === task) {
                delete scope.tasks[name];
                return true;
            }
            return false;
        },
        isLive: function () {
            return self.scopes[scopeId] === scope && scope.tasks[name] === task;
        }
    };
};

_TS_Scheduler.prototype.unregister = function (scopeId, name) {
    if (scopeId === "__auto") return false;
    var scope = this.scopes[scopeId];
    if (scope && scope.tasks[name]) {
        delete scope.tasks[name];
        return true;
    }
    return false;
};

_TS_Scheduler.prototype.get = function (scopeId, name) {
    var scope = this.scopes[scopeId];
    var t = scope && scope.tasks[name];
    if (!t) return null;
    return {
        interval: t.interval,
        offset: t.offset,
        nextRun: t.nextRun,
        lastRun: t.lastRun,
        runs: t.runs,
        failures: t.failures,
        consecutiveFailures: t.consecutiveFailures,
        disabled: t.disabled,
        lane: t.lane,
        owner: t.owner
    };
};

_TS_Scheduler.prototype.list = function (scopeId) {
    var scope = this.scopes[scopeId];
    if (!scope) return null;
    var out = Object.create(null);
    for (var name in scope.tasks) out[name] = this.get(scopeId, name);
    return out;
};

_TS_Scheduler.prototype.listAll = function () {
    var out = Object.create(null);
    for (var scopeId in this.scopes) out[scopeId] = this.list(scopeId);
    return out;
};

/**
 * Advance the scope heartbeat and run due/dirty tasks in name order.
 * Extra args are passed to each task fn: fn(scopeId, ...args).
 * Each task is isolated (a failure never stops the heartbeat).
 */
_TS_Scheduler.prototype.heartbeat = function (scopeId) {
    if (scopeId === "__auto") return 0;
    var scope = this.scopes[scopeId];
    if (!scope) return 0;
    scope.heartbeat++;
    var extras = [];
    for (var a = 1; a < arguments.length; a++) extras.push(arguments[a]);
    return this._heartbeat(scope, scopeId, extras);
};

/** Run one heartbeat task if due/dirty. Returns true when the callback executed successfully. */
_TS_Scheduler.prototype._runHeartbeatTask = function (scope, scopeId, name, t, args) {
    if (t.disabled) return false;
    var dirty = false;
    if (t.isDirty) {
        try {
            dirty = !!t.isDirty();
        } catch (e) {
            _tsFailTask(t, scopeId, name, e, 'isDirty on task');
            return false;
        }
    }
    if (!dirty && scope.heartbeat < t.nextRun) return false;
    if (dirty) {
        t.nextRun = scope.heartbeat + t.interval;
    } else {
        t.nextRun = Math.max(t.nextRun + t.interval, scope.heartbeat + t.interval);
    }
    t.lastRun = scope.heartbeat;
    t.runs++;
    try {
        t.fn.apply(null, args);
        t.consecutiveFailures = 0;
        return true;
    } catch (e) {
        _tsFailTask(t, scopeId, name, e, 'task');
        return false;
    }
};

_TS_Scheduler.prototype._heartbeat = function (scope, scopeId, extras) {
    var args = [scopeId];
    for (var a = 0; a < extras.length; a++) args.push(extras[a]);
    var names = Object.keys(scope.tasks);
    var ran = 0;
    for (var i = 0; i < names.length; i++) {
        var t = scope.tasks[names[i]];
        if (!t) continue;
        if (this._runHeartbeatTask(scope, scopeId, names[i], t, args)) ran++;
    }
    return ran;
};

/**
 * Budgeted variant used by the tick driver (interval/ensure tasks): due tasks are
 * drained lane by lane (critical → normal → idle) with per-lane weights and an
 * anti-starvation round-robin cursor. `heartbeat()` (tile scopes) is NOT budgeted.
 */
_TS_Scheduler.prototype._heartbeatBudgeted = function (scope, scopeId, extras) {
    var args = [scopeId];
    for (var a = 0; a < extras.length; a++) args.push(extras[a]);
    var budget = this._budget;
    var names = Object.keys(scope.tasks);
    var byLane = Object.create(null);
    byLane.critical = [];
    byLane.normal = [];
    byLane.idle = [];
    for (var i = 0; i < names.length; i++) {
        var t = scope.tasks[names[i]];
        if (!t) continue;
        byLane[_tsLane(t.lane)].push(names[i]);
    }
    var lanes = [];
    for (var lp = 0; lp < _TS_LANE_ORDER.length; lp++) {
        if (byLane[_TS_LANE_ORDER[lp]].length) lanes.push(_TS_LANE_ORDER[lp]);
    }
    var ran = 0;
    var remaining = budget.maxTasksPerTick;
    var leftover = 0;
    for (var k = 0; k < lanes.length; k++) {
        if (remaining <= 0) break;
        var lane = lanes[k];
        var list = byLane[lane];
        var share;
        if (k === lanes.length - 1) {
            share = remaining;
        } else {
            share = Math.max(1, Math.floor(budget.maxTasksPerTick * budget.weights[lane]) + leftover);
            if (share > remaining) share = remaining;
        }
        var cursor = this._rr[lane] % list.length;
        var examined = 0;
        var runThisLane = 0;
        while (examined < list.length && runThisLane < share) {
            var idx = (cursor + examined) % list.length;
            var name = list[idx];
            var task = scope.tasks[name];
            if (task && this._runHeartbeatTask(scope, scopeId, name, task, args)) {
                ran++;
                runThisLane++;
                this._rr[lane] = (idx + 1) % list.length;
            }
            examined++;
        }
        remaining -= runThisLane;
        leftover = share - runThisLane;
    }
    return ran;
};

_TS_Scheduler.prototype.destroyScope = function (scopeId) {
    if (scopeId === "__auto") return false;
    if (this.scopes[scopeId]) delete this.scopes[scopeId];
};

/** Remove every task registered with the given owner (scopes and other owners are kept). */
_TS_Scheduler.prototype.resetOwner = function (owner) {
    if (owner === null || owner === undefined) return 0;
    var removed = 0;
    for (var scopeId in this.scopes) {
        var scope = this.scopes[scopeId];
        var names = Object.keys(scope.tasks);
        for (var i = 0; i < names.length; i++) {
            var t = scope.tasks[names[i]];
            if (t && t.owner === owner) {
                delete scope.tasks[names[i]];
                removed++;
            }
        }
    }
    return removed;
};

/**
 * Administrative surface (host/tests only): resetAll / destroyGlobal / listAll / inspect.
 * Normal consumers should use register/interval/ensure and their own handles.
 */
_TS_Scheduler.prototype.admin = function () {
    var self = this;
    return {
        resetAll: function () { self._resetAll(); },
        destroyGlobal: function () { return self._destroy(); },
        listAll: function () { return self.listAll(); },
        inspect: function (scopeId, name) { return self.get(scopeId, name); },
        setBudget: function (opts) { return self._setBudget(opts); },
        getBudget: function () { return self._getBudget(); }
    };
};

/** Configure the per-tick budget (OFF by default). maxTasksPerTick default 64. */
_TS_Scheduler.prototype._setBudget = function (opts) {
    opts = opts || {};
    if (opts.enabled !== undefined) this._budget.enabled = !!opts.enabled;
    if (opts.maxTasksPerTick !== undefined) {
        var m = _TS_safeNum(opts.maxTasksPerTick, this._budget.maxTasksPerTick);
        this._budget.maxTasksPerTick = m >= 1 ? m : _TS_BUDGET_DEFAULT;
    }
    if (opts.laneWeights) {
        for (var li = 0; li < _TS_LANE_ORDER.length; li++) {
            var lane = _TS_LANE_ORDER[li];
            if (opts.laneWeights[lane] !== undefined) {
                var w = Number(opts.laneWeights[lane]);
                if (isFinite(w) && w >= 0) this._budget.weights[lane] = w;
            }
        }
    }
    return this._getBudget();
};

_TS_Scheduler.prototype._getBudget = function () {
    return {
        enabled: this._budget.enabled,
        maxTasksPerTick: this._budget.maxTasksPerTick,
        weights: {
            critical: this._budget.weights.critical,
            normal: this._budget.weights.normal,
            idle: this._budget.weights.idle
        }
    };
};

/** LevelLeft cleanup (ADMIN): forgets all tasks/queues but keeps the tick driver. */
_TS_Scheduler.prototype._resetAll = function () {
    this.scopes = Object.create(null);
    this._debounce = Object.create(null);
    this._batch = Object.create(null);
    this._batchOrder = [];
    this._defer = [];
    this._deferKeys = Object.create(null);
    this._throttle = Object.create(null);
    this._auto = null;
    this._ticks = 0;
    this._pruneAt = null;
    this._rr = { critical: 0, normal: 0, idle: 0 };
};

/**
 * Dispose the scheduler permanently (ADMIN): detaches the tick driver and clears all
 * state. The engine has no Callback.removeCallback, so the registered callback
 * is turned into a no-op (functional detach). Idempotent; returns true on the
 * first call. Use admin().resetAll() for LevelLeft (keeps the driver alive).
 */
_TS_Scheduler.prototype._destroy = function () {
    if (this._destroyed) return false;
    this._destroyed = true;
    this._driver = null;
    this.scopes = Object.create(null);
    this.reserved = Object.create(null);
    this._debounce = Object.create(null);
    this._batch = Object.create(null);
    this._batchOrder = [];
    this._defer = [];
    this._deferKeys = Object.create(null);
    this._throttle = Object.create(null);
    this._auto = null;
    this._ticks = 0;
    this._pruneAt = null;
    return true;
};

/**
 * Simple interval on the scheduler's own tick driver (global → 'tick',
 * local → 'LocalTick'). fn(scopeId). Requires a driver (create(driverName)).
 */
_TS_Scheduler.prototype.interval = function (name, ticks, fn, opts) {
    if (!this._driver) return false;
    if (typeof name != "string" || !name) return false;
    if (typeof fn != "function") return false;
    ticks = _TS_safeNum(ticks, 0);
    if (ticks < 1) return false;
    opts = opts || {};
    if (!this._auto || this.scopes["__auto"] !== this._auto) {
        this._auto = { heartbeat: 0, tasks: Object.create(null) };
        this.scopes["__auto"] = this._auto;
    }
    var existing = this._auto.tasks[name];
    if (existing) {
        if (existing.fn && existing.fn._tsFn !== fn) {
            _tsLog('interval "' + name + '" replaced (callback changed)');
        }
        delete this._auto.tasks[name];
    }
    var wrapper = function () { fn(); };
    wrapper._tsFn = fn;
    return this.register("__auto", name, ticks, opts.offset || 0, wrapper,
        { internal: true, __autoToken: _TS_AUTO_TOKEN, owner: opts.owner, lane: opts.lane, autoDisable: opts.autoDisable, isDirty: opts.isDirty, onError: opts.onError });
};

/**
 * Idempotent interval: while a live task with the same name and callback exists it
 * returns the existing handle (cadence NOT reset). A different callback replaces it
 * with a warning. Unlike interval(), it is safe to call on every LevelLoaded.
 */
_TS_Scheduler.prototype.ensureInterval = function (name, ticks, fn, opts) {
    if (!this._driver) return false;
    if (typeof name != "string" || !name) return false;
    if (typeof fn != "function") return false;
    ticks = _TS_safeNum(ticks, 0);
    if (ticks < 1) return false;
    opts = opts || {};
    if (!this._auto || this.scopes["__auto"] !== this._auto) {
        this._auto = { heartbeat: 0, tasks: Object.create(null) };
        this.scopes["__auto"] = this._auto;
    }
    var existing = this._auto.tasks[name];
    if (existing) {
        if (existing.fn && existing.fn._tsFn === fn) {
            return this._makeHandle("__auto", name, existing);
        }
        _tsLog('ensureInterval "' + name + '" replaced (callback changed)');
        delete this._auto.tasks[name];
    }
    var wrapper = function () { fn(); };
    wrapper._tsFn = fn;
    return this.register("__auto", name, ticks, opts.offset || 0, wrapper,
        { internal: true, __autoToken: _TS_AUTO_TOKEN, owner: opts.owner, lane: opts.lane, autoDisable: opts.autoDisable, isDirty: opts.isDirty, onError: opts.onError });
};

/**
 * Debounce with coalescing: fn runs once after `ticks` quiet ticks; repeated
 * calls reset the countdown. opts: { ticks=10, maxTicks } — maxTicks forces a
 * run that many ticks after the FIRST call regardless of re-scheduling
 * (starvation guard). maxTicks < 1 disables the guard.
 */
_TS_Scheduler.prototype.debounce = function (key, fn, opts) {
    opts = opts || {};
    var ticks = _TS_safeNum(opts.ticks, 10);
    if (ticks < 1) ticks = 1;
    var maxTicks = _TS_safeNum(opts.maxTicks, 0);
    if (maxTicks < 1) maxTicks = 0;
    var existing = this._debounce[key];
    var born = existing ? existing.born : this._ticks;
    var entry = { fn: fn, ticksLeft: ticks, born: born, maxTicks: maxTicks };
    this._debounce[key] = entry;
    var self = this;
    return {
        cancel: function () {
            if (self._debounce[key] === entry) delete self._debounce[key];
        }
    };
};

/**
 * Per-key throttle. Returns a wrapper that drops calls within the window:
 * wrapper(...) → true when executed, false when dropped.
 */
_TS_Scheduler.prototype.throttle = function (key, fn, opts) {
    opts = opts || {};
    var ticks = _TS_safeNum(opts.ticks, 10);
    if (ticks < 1) ticks = 1;
    var self = this;
    return function () {
        var last = self._throttle[key];
        if (last != null && self._ticks - last < ticks) return false;
        self._throttle[key] = self._ticks;
        fn.apply(null, arguments);
        return true;
    };
};

_TS_Scheduler.prototype.isThrottled = function (key, ticks) {
    ticks = _TS_safeNum(ticks, 10);
    if (ticks < 1) ticks = 1;
    var last = this._throttle[key];
    return last != null && this._ticks - last < ticks;
};

/**
 * Deferred execution with retries and optional backoff:
 * opts: { ticks=5, retries=3, reason, backoff="fixed"|"linear"|"exp", maxDelay, jitter } —
 * on exception the task is re-queued until `retries` TOTAL attempts are used up,
 * then dropped with a log. `ensureDefer(key, ...)` uses opts.key internally.
 */
_TS_Scheduler.prototype.defer = function (fn, opts) {
    opts = opts || {};
    var ticks = _TS_safeNum(opts.ticks, 5);
    if (ticks < 1) ticks = 1;
    var retries = _TS_safeNum(opts.retries, 3);
    if (retries < 0) retries = 0;
    var backoff = opts.backoff;
    if (backoff !== "linear" && backoff !== "exp") backoff = "fixed";
    var maxDelay = _TS_safeNum(opts.maxDelay, 0);
    if (maxDelay < 0) maxDelay = 0;
    var entry = {
        fn: fn,
        ticksLeft: ticks,
        delay: ticks,
        attempts: 0,
        retries: retries,
        backoff: backoff,
        maxDelay: maxDelay,
        jitter: !!opts.jitter,
        reason: opts.reason || null,
        key: (typeof opts.key == "string" && opts.key) ? opts.key : null,
        cancelled: false
    };
    this._defer.push(entry);
    if (entry.key) this._deferKeys[entry.key] = entry;
    return {
        cancel: function () {
            entry.cancelled = true;
        }
    };
};

function _tsBackoffDelay(base, attempts, mode, maxDelay, jitter) {
    var d = base;
    if (mode === "linear") d = base * attempts;
    else if (mode === "exp") d = base * Math.pow(2, attempts - 1);
    if (maxDelay > 0 && d > maxDelay) d = maxDelay;
    if (jitter) d = Math.round(d * (0.5 + Math.random() * 0.5));
    if (d < 1) d = 1;
    return d;
}

/**
 * Idempotent defer keyed by string: while an entry with the same key is pending,
 * repeated calls return the existing handle (same callback) or replace it with a
 * warning (different callback).
 */
_TS_Scheduler.prototype.ensureDefer = function (key, fn, opts) {
    if (typeof key != "string" || !key) return false;
    if (typeof fn != "function") return false;
    var existing = this._deferKeys[key];
    if (existing) {
        if (existing.fn === fn) {
            return {
                cancel: function () { existing.cancelled = true; }
            };
        }
        _tsLog('ensureDefer "' + key + '" replaced (callback changed)');
        existing.cancelled = true;
    }
    opts = opts || {};
    var merged = {};
    for (var k in opts) merged[k] = opts[k];
    merged.key = key;
    return this.defer(fn, merged);
};

/**
 * Per-tick batch (dedupe): fn runs at most once per tick, no matter how many
 * times batch(key, fn) is called; the FIRST fn wins, extra calls are dropped.
 */
_TS_Scheduler.prototype.batch = function (key, fn) {
    if (this._batch[key]) return false;
    this._batch[key] = fn;
    this._batchOrder.push(key);
    return true;
};

/* ----------------------------------------------------------- tick driver -- */

_TS_Scheduler.prototype._tick = function () {
    this._ticks++;
    if (this._auto) {
        this._auto.heartbeat++;
        if (this._budget.enabled) this._heartbeatBudgeted(this._auto, "__auto", []);
        else this._heartbeat(this._auto, "__auto", []);
    }

    var dKeys = Object.keys(this._debounce);
    for (var i = 0; i < dKeys.length; i++) {
        var d = this._debounce[dKeys[i]];
        if (!d) continue;
        d.ticksLeft--;
        if (d.ticksLeft > 0 && !(d.maxTicks && this._ticks - d.born >= d.maxTicks)) continue;
        if (this._debounce[dKeys[i]] === d) delete this._debounce[dKeys[i]];
        this._runSafe(d.fn, "debounce:" + dKeys[i]);
    }

    if (this._batchOrder.length) {
        var order = this._batchOrder;
        this._batchOrder = [];
        for (var b = 0; b < order.length; b++) {
            var fn = this._batch[order[b]];
            if (!fn) continue;
            delete this._batch[order[b]];
            this._runSafe(fn, "batch:" + order[b]);
        }
    }

    var remaining = [];
    for (var q = 0; q < this._defer.length; q++) {
        var e = this._defer[q];
        if (e.cancelled) {
            if (e.key) delete this._deferKeys[e.key];
            continue;
        }
        e.ticksLeft--;
        if (e.ticksLeft > 0) { remaining.push(e); continue; }
        try {
            e.fn();
            if (e.key) delete this._deferKeys[e.key];
        } catch (err) {
            e.attempts++;
            if (e.attempts < e.retries) {
                e.ticksLeft = _tsBackoffDelay(e.delay, e.attempts, e.backoff, e.maxDelay, e.jitter);
                remaining.push(e);
            } else {
                if (e.key) delete this._deferKeys[e.key];
                _tsLog('deferred task "' + (e.reason || "?") + '" permanently failed after ' +
                    e.attempts + ' attempt(s): ' + err);
            }
        }
    }
    this._defer = remaining;

    if (this._pruneAt == null || this._ticks - this._pruneAt >= 600) {
        this._pruneAt = this._ticks;
        var tKeys = Object.keys(this._throttle);
        for (var t = 0; t < tKeys.length; t++) {
            if (this._ticks - this._throttle[tKeys[t]] >= 600) delete this._throttle[tKeys[t]];
        }
    }
};

/* ------------------------------------------------------------ public API -- */

/** Create a scheduler. driverName: "tick" | "LocalTick" | null (manual heartbeat only). */
TickScheduler.create = function (driverName) {
    return new _TS_Scheduler(driverName || null);
};

function _tsLazy(name, holder) {
    Object.defineProperty(TickScheduler, name, {
        enumerable: true,
        configurable: false,
        get: function () {
            if (!holder.value) holder.value = TickScheduler.create(holder.driver);
            return holder.value;
        }
    });
}

_tsLazy("global", { driver: "tick", value: null });
_tsLazy("local", { driver: "LocalTick", value: null });

/** Administrative surface for the shared server scheduler (host/tests only). */
TickScheduler.admin = function () {
    return TickScheduler.global.admin();
};

EXPORT("TickScheduler", TickScheduler);
