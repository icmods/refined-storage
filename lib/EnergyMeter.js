LIBRARY({
    name: "EnergyMeter",
    version: 2,
    shared: true,
    api: "CoreEngine"
});

var EnergyMeter = {};

/*
 * ============================================================================
 * EnergyMeter — usage aggregation, budgets, UI scaling over EnergyNet
 * ============================================================================
 * Aggregates per-network usage (per-block + per-upgrade + per-container extras)
 * and computes budgets / UI scaling. EnergyNet remains the network; this is the
 * accounting layer. The usage registry is cleared on LevelLeft.
 * ============================================================================
 */

var _EM_usages = Object.create(null);

if (typeof Callback != "undefined" && Callback && typeof Callback.addCallback == "function") {
    Callback.addCallback("LevelLeft", function () {
        _EM_usages = Object.create(null);
    });
}

/**
 * Numeric contract: non-finite (NaN/±Infinity), non-number and negative
 * values collapse to 0. Callers clamp to capacity themselves (host policy).
 */
function _emSanitize(value) {
    value = Number(value);
    if (!isFinite(value) || value < 0) return 0;
    return value;
}

/**
 * Register a per-tick usage for a block id. Invalid values → 0.
 */
EnergyMeter.registerUsage = function (blockId, perTick) {
    _EM_usages[String(blockId)] = _emSanitize(perTick);
};

/** Remove a registered usage. Returns true when the key existed. */
EnergyMeter.unregisterUsage = function (blockId) {
    var key = String(blockId);
    if (!Object.prototype.hasOwnProperty.call(_EM_usages, key)) return false;
    delete _EM_usages[key];
    return true;
};

EnergyMeter.getUsage = function (blockId) {
    return _EM_usages[String(blockId)] || 0;
};

EnergyMeter.getAllUsages = function () {
    var out = {};
    for (var k in _EM_usages) out[k] = _EM_usages[k];
    return out;
};

/** Clear the whole usage registry (also runs automatically on LevelLeft). */
EnergyMeter.clearUsages = function () {
    _EM_usages = Object.create(null);
};

/**
 * Aggregate usage for a set of nodes.
 * nodes: [{ blockId, count?, usage?, extras? }] — flat per-tick values.
 *   count  : multiplies the registered usage (e.g. disks per drive)
 *   usage  : explicit override
 *   extras : additional flat costs (e.g. per-upgrade)
 * Returns { usage, perNode } — perNode carries the per-node contributions
 * for UI display. Every contribution is sanitized; the total is re-validated
 * (non-finite → 0).
 */
EnergyMeter.measure = function (nodes) {
    var total = 0;
    var perNode = [];
    if (!nodes || typeof nodes.length !== "number") return { usage: 0, perNode: perNode };
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i] || {};
        var usage = 0;
        if (n.usage !== undefined && n.usage !== null) usage = Number(n.usage);
        else usage = EnergyMeter.getUsage(n.blockId);
        // count is a multiplier; 0 is meaningful (zero machines → zero cost).
        if (n.count !== undefined && n.count !== null) {
            var c = Number(n.count);
            if (isFinite(c)) usage *= c;
        }
        if (n.extras) usage += Number(n.extras);
        usage = _emSanitize(usage);
        perNode.push({ blockId: n.blockId, usage: usage });
        total += usage;
    }
    total = _emSanitize(total);
    return { usage: total, perNode: perNode };
};

/**
 * Budget check + UI scale (energy vs usage → scale).
 * budget: { energy, usage, capacity }
 * Numeric contract: energy/usage are sanitized (negative/non-finite → 0),
 * capacity ≤ 0 or non-finite → 1, energy is clamped to capacity.
 * Returns { ok, ratio, scaled } — scaled is 0..1 for scales/textures.
 */
EnergyMeter.budget = function (energy, usage, capacity) {
    energy = _emSanitize(energy);
    usage = _emSanitize(usage);
    capacity = Number(capacity);
    if (!isFinite(capacity) || capacity <= 0) capacity = 1;
    if (energy > capacity) energy = capacity;
    var ok = energy >= usage;
    var ratio = Math.max(0, Math.min(1, energy / capacity));
    return { ok: ok, ratio: ratio, scaled: ratio };
};

EXPORT("EnergyMeter", EnergyMeter);
