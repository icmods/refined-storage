LIBRARY({
    name: "DebugCore",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var DebugCore = {};

/*
 * ============================================================================
 * DebugCore — structured logging, channels, ring buffer, counters, profiling
 * ============================================================================
 * Config-gated prefixed Logger.Log channels, a ring buffer of the last events
 * (crash diagnostics), and counter/profiler primitives.
 * ============================================================================
 */

var _DBG_enabled = false;
var _DBG_enabledFn = null;
var _DBG_ring = null;
var _DBG_counters = {};

/**
 * Enable/disable all channels. Pass a function for dynamic gating
 * (e.g. function () { return Config.dev; }).
 */
DebugCore.setEnabled = function (value) {
    if (typeof value == "function") {
        _DBG_enabledFn = value;
        _DBG_enabled = true;
    } else {
        _DBG_enabledFn = null;
        _DBG_enabled = !!value;
    }
};

DebugCore.isEnabled = function () {
    if (_DBG_enabledFn) return !!_DBG_enabledFn();
    return _DBG_enabled;
};

function _dbgLog(level, tag, msg) {
    if (!DebugCore.isEnabled()) return;
    var text = "[" + tag + "] " + msg;
    if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(text, "DebugCore");
    if (_DBG_ring) _DBG_ring.push(level + " " + text);
}

/**
 * channel(tag) → { log, warn, error, trace } — prefixed [TAG], gated by
 * setEnabled.
 */
DebugCore.channel = function (tag) {
    return {
        log: function (msg) { _dbgLog("INFO", tag, msg); },
        warn: function (msg) { _dbgLog("WARN", tag, msg); },
        error: function (msg) { _dbgLog("ERROR", tag, msg); },
        trace: function (msg) { _dbgLog("TRACE", tag, msg); }
    };
};

/*
 * In-memory ring buffer of the last N log lines.
 * opts.onFlush(lines) is called every 10 wraps of the ring — the host can
 * persist lines through FileTools.WriteText for crash-safe diagnostics.
 */
DebugCore.ring = function (capacity, opts) {
    opts = opts || {};
    capacity = Math.floor(Number(capacity));
    if (!isFinite(capacity) || capacity < 1) capacity = 256;
    var buf = [];
    var wrapped = 0;
    return {
        push: function (line) {
            buf.push(String(line));
            if (buf.length > capacity) {
                buf.shift();
                wrapped++;
                if (wrapped % 10 === 0 && typeof opts.onFlush == "function") {
                    try { opts.onFlush(buf.slice()); } catch (e) {}
                }
            }
        },
        getLast: function (n) {
            n = Math.floor(Number(n));
            if (!isFinite(n) || n < 1) n = buf.length;
            return buf.slice(Math.max(0, buf.length - n));
        },
        clear: function () { buf = []; wrapped = 0; },
        size: function () { return buf.length; },
        getWrappedCount: function () { return wrapped; }
    };
};

DebugCore.setRing = function (ring) {
    _DBG_ring = ring;
};

/** Simple named counter. */
DebugCore.counter = function (name) {
    if (!_DBG_counters[name]) _DBG_counters[name] = { value: 0, total: 0, lastReset: 0 };
    var c = _DBG_counters[name];
    return {
        inc: function (n) { c.value += (n || 1); c.total += (n || 1); return c.value; },
        dec: function (n) { c.value -= (n || 1); return c.value; },
        get: function () { return c.value; },
        reset: function () { c.lastReset = c.total; c.value = 0; }
    };
};

DebugCore.getCounters = function () {
    return _DBG_counters;
};

/*
 * Minimal profiler — measure fn() duration, log it and
 * keep a rolling aggregate (count/sum/max). Gated by setEnabled.
 */
DebugCore.profile = function (name, fn) {
    // Zero-overhead when disabled: no Date.now() calls, no aggregate mutation.
    if (!DebugCore.isEnabled()) return fn();
    var start = Date.now();
    var result = fn();
    var ms = Date.now() - start;
    var agg = _DBG_profiles[name] || (_DBG_profiles[name] = { count: 0, sum: 0, max: 0 });
    agg.count++;
    agg.sum += ms;
    if (ms > agg.max) agg.max = ms;
    _dbgLog("PROF", name, ms + " ms (avg " + Math.round(agg.sum / agg.count) + ", max " + agg.max + ")");
    return result;
};

var _DBG_profiles = {};

DebugCore.getProfiles = function () {
    return _DBG_profiles;
};

/** Reset one named profile aggregate, or all when name is omitted. */
DebugCore.resetProfiles = function (name) {
    if (name === undefined || name === null) _DBG_profiles = {};
    else delete _DBG_profiles[name];
};

/** Reset every counter's current value in place (total/lastReset preserved). */
DebugCore.resetCounters = function () {
    for (var k in _DBG_counters) {
        var c = _DBG_counters[k];
        c.lastReset = c.total;
        c.value = 0;
    }
};

/**
 * Report an unexpected error: always logs (bypassing the enabled gate), feeds
 * the ring buffer and optionally opens the engine formatted dialog.
 * opts: { tag, title, dialog: false }
 */
DebugCore.report = function (error, opts) {
    opts = opts || {};
    var message = String(error && (error.stack || error.message || error) || error || "");
    var text = "[" + (opts.tag || "ERROR") + "] " + message;
    try {
        if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(text, "DebugCore");
    } catch (e) {}
    if (_DBG_ring) _DBG_ring.push("ERROR " + text);
    if (opts.dialog !== false) DebugCore.showReport(message, opts.title);
    return message;
};

/** Engine DialogHelper formatted dialog; returns false when unavailable. */
DebugCore.showReport = function (message, title) {
    try {
        if (typeof Packages != "undefined") {
            Packages.com.zhekasmirnov.innercore.api.log.DialogHelper.openFormattedDialog(String(message), String(title || "DebugCore"));
            return true;
        }
    } catch (e) {}
    return false;
};

EXPORT("DebugCore", DebugCore);
