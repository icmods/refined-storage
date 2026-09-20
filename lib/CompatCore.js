LIBRARY({
    name: "CompatCore",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var CompatCore = {};

/*
 * ============================================================================
 * CompatCore — cross-mod discovery + shared energy types
 * ============================================================================
 * Cross-mod discovery goes through ModAPI.addAPICallback (load order is
 * non-deterministic, so never touch other mods' globals at load time).
 * Shared energy types are reused by name — never create one a mod may already own.
 * ============================================================================
 */

var _COMPAT_called = Object.create(null);

function _compatLog(msg) {
    try {
        if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, "CompatCore");
    } catch (e) {}
}

/**
 * Optional timeout driver: TickScheduler.global.defer (feature-detected; the
 * library keeps zero dependencies). Without it no timeout can be armed.
 */
function _compatArmTimer(ticks, fn) {
    try {
        if (typeof TickScheduler != "undefined" && TickScheduler &&
            TickScheduler.global && typeof TickScheduler.global.defer == "function") {
            return TickScheduler.global.defer(fn, { ticks: ticks, retries: 1, reason: "CompatCore timeout" });
        }
    } catch (e) {}
    return null;
}

/**
 * Run a callback when a cross-mod API is available (ModAPI.addAPICallback is the
 * only load-order-safe access path).
 * opts: {
 *   once?: boolean,       // default true — dedup only when hostId is given
 *   hostId?: string,      // caller identity for the dedup key
 *   timeout?: number,     // ticks; requires TickScheduler (optional)
 *   onTimeout?(apiName)   // called when the timeout fires
 * }
 * Returns a handle { cancel(), isActive(), isResolved() }, or null when
 * ModAPI is unavailable or the hostId+apiName pair was already registered.
 * The engine cannot unregister callbacks: cancel() only makes this wrapper
 * ignore the late callback. Callback errors are logged (Logger) and never
 * propagate into the engine.
 */
CompatCore.whenAvailable = function (apiName, callback, opts) {
    opts = opts || {};
    if (typeof ModAPI == "undefined" || !ModAPI || typeof ModAPI.addAPICallback != "function") return null;
    apiName = String(apiName);
    if (opts.once !== false && opts.hostId) {
        var hostKey = String(opts.hostId);
        var byApi = _COMPAT_called[hostKey];
        if (byApi && byApi[apiName]) return null;
        if (!byApi) byApi = _COMPAT_called[hostKey] = Object.create(null);
        byApi[apiName] = true;
    }

    var state = { cancelled: false, timedOut: false, resolved: false };
    var timer = null;
    var handle = {
        cancel: function () {
            if (state.cancelled) return false;
            state.cancelled = true;
            if (timer && typeof timer.cancel == "function") {
                try { timer.cancel(); } catch (e) {}
            }
            return true;
        },
        isActive: function () {
            return !state.cancelled && !state.timedOut && !state.resolved;
        },
        isResolved: function () {
            return state.resolved;
        }
    };

    var timeoutTicks = Number(opts.timeout);
    if (isFinite(timeoutTicks) && timeoutTicks > 0) {
        timer = _compatArmTimer(timeoutTicks, function () {
            if (state.cancelled || state.resolved) return;
            state.timedOut = true;
            if (typeof opts.onTimeout == "function") {
                try { opts.onTimeout(apiName); }
                catch (e) { _compatLog("CompatCore: onTimeout failed for '" + apiName + "': " + e); }
            }
        });
        if (!timer && typeof opts.onTimeout == "function") {
            _compatLog("CompatCore: timeout requested for '" + apiName + "' but TickScheduler is unavailable");
        }
    }

    ModAPI.addAPICallback(apiName, function (api) {
        if (state.cancelled || state.timedOut) return;
        state.resolved = true;
        if (timer && typeof timer.cancel == "function") {
            try { timer.cancel(); } catch (e) {}
        }
        try { callback(api); }
        catch (e) { _compatLog("CompatCore: callback for '" + apiName + "' failed: " + e); }
    });
    return handle;
};

/* ------------------------------------------------------------ energy ----- */

/**
 * Get-or-create a shared energy type by name (reuse by name so mods share one
 * network; never create one another mod may already own). Returns the EnergyType
 * or null when EnergyNet is absent.
 */
CompatCore.energyType = function (name, value) {
    if (typeof EnergyTypeRegistry != "undefined" && EnergyTypeRegistry && typeof EnergyTypeRegistry.assureEnergyType == "function") {
        try { return EnergyTypeRegistry.assureEnergyType(name, value); } catch (e) { return null; }
    }
    return null;
};

/**
 * Read-only energy type lookup: returns the registered EnergyType or null.
 * Use this to check before calling energyType() (assure is get-or-create and
 * silently keeps an existing type's value).
 */
CompatCore.peekEnergyType = function (name) {
    if (typeof EnergyTypeRegistry != "undefined" && EnergyTypeRegistry && typeof EnergyTypeRegistry.getEnergyType == "function") {
        try { return EnergyTypeRegistry.getEnergyType(name) || null; } catch (e) { return null; }
    }
    return null;
};

EXPORT("CompatCore", CompatCore);
