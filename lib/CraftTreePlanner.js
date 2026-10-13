LIBRARY({
    name: "CraftTreePlanner",
    version: 2,
    shared: true,
    api: "CoreEngine"
});

var CraftTreePlanner = {};

/*
 * ============================================================================
 * CraftTreePlanner — host-neutral crafting planner
 * ============================================================================
 * Computes a crafting plan for a requested resource against a simulated
 * inventory. The engine knows nothing about the host: resources are opaque
 * keys, recipes are plain descriptors supplied by the host, and every host
 * policy is injected through callbacks.
 *
 * Engine owns: demand recursion, quantity propagation, the planning inventory,
 * candidate evaluation order, cycle detection, complexity limits, deterministic
 * traversal, plan representation, the generic result and optional aggregation.
 * Host owns: resource identity, recipe/pattern format, storage snapshot,
 * candidate ordering policy, processing semantics and serialization.
 *
 * Host contract (ctx):
 *   recipesFor(key)  -> [recipe]     candidate recipes producing `key`
 *   inventory        -> Inventory    simulated storage (createInventory)
 *   keyString?(key)  -> string       stable map key (default _ceString)
 *   identityOf?(r)   -> string       cycle identity (default r.id)
 *   policy?          -> Policy       candidate/recipe policy (defaultPolicy)
 *   limits?          -> {            host-configurable complexity limits
 *                        deadline,   absolute ms (clock from now())
 *                        maxNodes, maxSteps, maxDepth }
 *   now?()           -> ms           clock (default Date.now)
 *   cycleGuard?      -> CycleGuard   shared guard (default fresh guard)
 *
 * Recipe descriptor:
 *   { id, isProcessing?, hostRef?, outputs: [stack], inputs: [slot] }
 * Slot:
 *   { candidates: [ { key, amount, autocraftable?, hostRef? } ] }
 *   Candidates in one slot are interchangeable at their own `amount` (the
 *   amount needed for a single craft); `autocraftable === false` marks
 *   substitutes the host must not recurse into.
 * Stack:
 *   { key, amount }
 *
 * Time base: host-provided clock; the library never reads engine internals.
 * ============================================================================
 */

/* ------------------------------------------------------------------ errors -- */

CraftTreePlanner.ERRORS = {
    NO_RECIPE: "NO_RECIPE",
    MISSING: "MISSING",
    RECURSIVE: "RECURSIVE",
    TOO_COMPLEX: "TOO_COMPLEX",
    TIMEOUT: "TIMEOUT",
    INVALID: "INVALID_RECIPE"
};

/* ----------------------------------------------------------------- helpers -- */

function _ceString(key) {
    if (key === null || key === undefined) return "" + key;
    if (typeof key === "object") {
        if (typeof key.uid === "string") return key.uid;
        return JSON.stringify(key);
    }
    return "" + key;
}

function _ceStack(key, amount) {
    return { key: key, amount: amount };
}

CraftTreePlanner.stack = function (key, amount) {
    return _ceStack(key, amount);
};

function _ceAmountFor(recipe, key) {
    var outs = recipe && recipe.outputs;
    if (!outs || !outs.length) return 1;
    if (key !== null && key !== undefined) {
        var target = _ceString(key);
        for (var i = 0; i < outs.length; i++) {
            if (outs[i] && _ceString(outs[i].key) === target && typeof outs[i].amount === "number" && outs[i].amount > 0) {
                return outs[i].amount;
            }
        }
    }
    if (outs[0] && typeof outs[0].amount === "number" && outs[0].amount > 0) return outs[0].amount;
    return 1;
}

function _cePrimaryAmount(recipe) {
    return _ceAmountFor(recipe, null);
}

/* ----------------------------------------------------------------- policy -- */

/*
 * Default policy preserves the host-declared order (stable) and accepts
 * everything. Hosts override only what they need.
 */
CraftTreePlanner.defaultPolicy = {
    compareCandidates: function () { return 0; },
    acceptCandidate: function () { return true; },
    compareRecipes: function () { return 0; },
    acceptRecipe: function () { return true; }
};

function _ceOrder(list, accept, compare) {
    var accepted = [];
    var i;
    for (i = 0; i < list.length; i++) {
        if (accept(list[i])) accepted.push(list[i]);
    }
    /* stable insertion sort (Array.sort is not stable in older engines) */
    for (i = 1; i < accepted.length; i++) {
        var item = accepted[i];
        var j = i - 1;
        while (j >= 0 && compare(accepted[j], item) > 0) {
            accepted[j + 1] = accepted[j];
            j--;
        }
        accepted[j + 1] = item;
    }
    return accepted;
}

function _cePickRecipe(ctx, key, policy) {
    var list = ctx.recipesFor ? (ctx.recipesFor(key) || []) : [];
    var best = null;
    var have = false;
    for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (!policy.acceptRecipe(r)) continue;
        if (!have) { best = r; have = true; continue; }
        if (policy.compareRecipes(best, r) > 0) best = r;
    }
    return best;
}

/* -------------------------------------------------------------- inventory -- */

/*
 * Simulated planning storage over an initial snapshot. `extract` records both
 * the total taken and the portion that came from the initial snapshot
 * (`realExtracted`), so a host can distinguish real storage consumption from
 * re-consumption of crafted output without the engine knowing the difference.
 */
CraftTreePlanner.createInventory = function (options) {
    options = options || {};
    var keyString = options.keyString || _ceString;
    var byKey = Object.create(null);
    var order = [];
    var initial = Object.create(null);
    var realExtracted = Object.create(null);
    var reserved = Object.create(null);

    function entry(key, create) {
        var uid = keyString(key);
        var e = byKey[uid];
        if (!e && create) {
            e = { uid: uid, key: key, amount: 0 };
            byKey[uid] = e;
            order.push(e);
        }
        return e;
    }

    var inv = {
        amount: function (key) {
            var e = byKey[keyString(key)];
            return e ? e.amount : 0;
        },
        initialAmount: function (key) {
            return initial[keyString(key)] || 0;
        },
        realExtracted: function (key) {
            return realExtracted[keyString(key)] || 0;
        },
        reservedFor: function (key) {
            return reserved[keyString(key)] || 0;
        },
        available: function (key) {
            return inv.amount(key) - inv.reservedFor(key);
        },
        insert: function (key, amount) {
            if (!(amount > 0)) return 0;
            entry(key, true).amount += amount;
            return amount;
        },
        extract: function (key, amount) {
            if (!(amount > 0)) return 0;
            var uid = keyString(key);
            var e = byKey[uid];
            if (!e) return 0;
            var taken = e.amount < amount ? e.amount : amount;
            e.amount -= taken;
            var realAvail = (initial[uid] || 0) - (realExtracted[uid] || 0);
            var real = realAvail > 0 ? (taken < realAvail ? taken : realAvail) : 0;
            realExtracted[uid] = (realExtracted[uid] || 0) + real;
            return taken;
        },
        reserve: function (key, amount) {
            var uid = keyString(key);
            reserved[uid] = (reserved[uid] || 0) + amount;
        },
        entries: function () {
            return order.slice();
        }
    };

    var src = options.initial || [];
    if (src && typeof src.length === "number") {
        for (var i = 0; i < src.length; i++) {
            if (src[i]) inv.insert(src[i].key, src[i].amount);
        }
    } else {
        for (var k in src) {
            if (Object.prototype.hasOwnProperty.call(src, k)) inv.insert(k, src[k]);
        }
    }

    var snapshot = inv.entries();
    for (var s = 0; s < snapshot.length; s++) {
        initial[snapshot[s].uid] = snapshot[s].amount;
    }

    return inv;
};

/* ------------------------------------------------------------- cycleGuard -- */

CraftTreePlanner.createCycleGuard = function () {
    var marks = {};
    var stack = [];
    return {
        contains: function (id) { return marks[id] === true; },
        push: function (id) { marks[id] = true; stack.push(id); },
        pop: function (id) {
            delete marks[id];
            for (var i = stack.length - 1; i >= 0; i--) {
                if (stack[i] === id) { stack.splice(i, 1); break; }
            }
        },
        depth: function () { return stack.length; }
    };
};

/* ----------------------------------------------------------------- limits -- */

// Limits are OPT-IN and disabled by default: falsy (0/null/undefined) = disabled.
// maxSteps/maxDepth are checked at recursion entry; maxNodes is checked BEFORE a
// node is pushed (so the artifact never exceeds the cap); the deadline is checked
// at recursion entry AND per candidate inside slot resolution.
function _ceCheckLimits(state, limits, now, depth) {
    if (!limits) return;
    if (limits.maxSteps && state.stats.steps > limits.maxSteps) {
        throw { errorType: CraftTreePlanner.ERRORS.TOO_COMPLEX, limit: "maxSteps" };
    }
    if (limits.maxDepth && depth > limits.maxDepth) {
        throw { errorType: CraftTreePlanner.ERRORS.TOO_COMPLEX, limit: "maxDepth" };
    }
    if (limits.deadline && now() > limits.deadline) {
        throw { errorType: CraftTreePlanner.ERRORS.TIMEOUT, limit: "deadline" };
    }
}

/* ------------------------------------------------------------- core recurse */

function _ceResolveSlot(slot, multiplier, node, ctx, state, env, depth) {
    var cands = _ceOrder(slot.candidates || [], env.policy.acceptCandidate, env.policy.compareCandidates);
    var remainingUnits = multiplier;
    var lastShort = null;

    for (var ci = 0; ci < cands.length && remainingUnits > 0; ci++) {
        _ceCheckLimits(state, env.limits, env.now, depth);
        var cand = cands[ci];
        var perUnit = cand.amount || 1;
        var required = perUnit * remainingUnits;
        var uid = env.keyString(cand.key);

        var taken = env.inv.extract(cand.key, required);
        var realReal = env.inv.realExtracted(cand.key);
        if (taken > 0) {
            node.inputs.push({ key: cand.key, amount: taken, fromInventory: true, autocrafted: false });
            state.extraction[uid] = realReal;
            state.toTake[uid] = realReal;
        }
        var short = required - taken;

        if (short > 0 && cand.autocraftable !== false) {
            var subRecipe = _cePickRecipe(ctx, cand.key, env.policy);
            if (subRecipe) {
                var subBase = _ceAmountFor(subRecipe, cand.key) || 1;
                var subQty = Math.ceil(short / subBase);
                _ceRecurse(subRecipe, subQty, ctx, state, env, depth + 1);
                state.toCraft[uid] = (state.toCraft[uid] || 0) + (subQty * subBase);
                var produced = env.inv.extract(cand.key, short);
                if (produced > 0) {
                    short -= produced;
                    node.inputs.push({ key: cand.key, amount: produced, fromInventory: false, autocrafted: true });
                }
            }
        }

        if (short > 0) lastShort = cand;

        var covered = (required - short) / perUnit;
        remainingUnits -= covered;
        if (remainingUnits < 0) remainingUnits = 0;
    }

    if (remainingUnits > 0) {
        var mRef = lastShort || ((slot.candidates && slot.candidates[0]) || null);
        var mKey = mRef ? env.keyString(mRef.key) : "?";
        var mAmount = Math.ceil((mRef && mRef.amount ? mRef.amount : 1) * remainingUnits);
        state.missing[mKey] = (state.missing[mKey] || 0) + mAmount;
    }
}

function _ceRecurse(recipe, multiplier, ctx, state, env, depth) {
    var id = env.identityOf(recipe);
    if (env.guard.contains(id)) {
        throw { errorType: CraftTreePlanner.ERRORS.RECURSIVE, errorRecipe: id };
    }

    state.stats.steps++;
    if (depth > state.stats.depth) state.stats.depth = depth;
    _ceCheckLimits(state, env.limits, env.now, depth);

    env.guard.push(id);
    try {
        var node = {
            recipeId: recipe.id,
            quantity: multiplier,
            isProcessing: !!recipe.isProcessing,
            inputs: [],
            outputs: [],
            hostRef: recipe.hostRef !== undefined ? recipe.hostRef : null
        };

        var slots = recipe.inputs || [];
        for (var si = 0; si < slots.length; si++) {
            _ceResolveSlot(slots[si], multiplier, node, ctx, state, env, depth);
        }

        var outs = recipe.outputs || [];
        for (var oi = 0; oi < outs.length; oi++) {
            var out = outs[oi];
            var amount = out.amount * multiplier;
            env.inv.insert(out.key, amount);
            node.outputs.push({ key: out.key, amount: amount });
        }

        if (env.limits && env.limits.maxNodes && state.stats.nodes >= env.limits.maxNodes) {
            throw { errorType: CraftTreePlanner.ERRORS.TOO_COMPLEX, limit: "maxNodes" };
        }
        state.nodes.push(node);
        state.stats.nodes++;
    } finally {
        env.guard.pop(id);
    }
}

/* -------------------------------------------------------------------- plan -- */

function _ceResult(ok, error, state) {
    return {
        ok: ok,
        errorType: error ? error.errorType : null,
        errorRecipe: error && error.errorRecipe ? error.errorRecipe : null,
        errorLimit: error && error.limit ? error.limit : null,
        nodes: state.nodes,
        missing: state.missing,
        extraction: state.extraction,
        toTake: state.toTake,
        toCraft: state.toCraft,
        stats: state.stats
    };
}

CraftTreePlanner.plan = function (request, ctx) {
    request = request || {};
    ctx = ctx || {};

    var env = {
        policy: ctx.policy || CraftTreePlanner.defaultPolicy,
        keyString: ctx.keyString || _ceString,
        identityOf: ctx.identityOf || function (r) { return r.id; },
        now: ctx.now || function () { return Date.now(); },
        limits: ctx.limits || null,
        guard: ctx.cycleGuard || CraftTreePlanner.createCycleGuard(),
        inv: ctx.inventory || CraftTreePlanner.createInventory()
    };

    var state = {
        nodes: [],
        missing: {},
        extraction: {},
        toTake: {},
        toCraft: {},
        stats: { steps: 0, nodes: 0, depth: 0, start: env.now() }
    };

    if (env.limits && env.limits.deadline && env.now() > env.limits.deadline) {
        state.stats.elapsed = env.now() - state.stats.start;
        return _ceResult(false, { errorType: CraftTreePlanner.ERRORS.TIMEOUT, limit: "deadline" }, state);
    }

    var rootRecipe = _cePickRecipe(ctx, request.key, env.policy);
    if (!rootRecipe) {
        state.stats.elapsed = env.now() - state.stats.start;
        return _ceResult(false, { errorType: CraftTreePlanner.ERRORS.NO_RECIPE }, state);
    }

    var amount = request.amount && request.amount > 0 ? request.amount : 1;
    var base = _ceAmountFor(rootRecipe, request.key);
    var multiplier = amount > base ? Math.ceil(amount / base) : 1;
    if (!(multiplier > 0)) multiplier = 1;

    var error = null;
    try {
        _ceRecurse(rootRecipe, multiplier, ctx, state, env, 1);
    } catch (e) {
        error = e && e.errorType ? e : { errorType: (e instanceof RangeError ? CraftTreePlanner.ERRORS.TOO_COMPLEX : CraftTreePlanner.ERRORS.INVALID) };
    }

    state.stats.elapsed = env.now() - state.stats.start;

    if (error) return _ceResult(false, error, state);

    var hasMissing = false;
    for (var mk in state.missing) {
        if (Object.prototype.hasOwnProperty.call(state.missing, mk)) { hasMissing = true; break; }
    }
    if (hasMissing) return _ceResult(false, { errorType: CraftTreePlanner.ERRORS.MISSING }, state);

    return _ceResult(true, null, state);
};

/* --------------------------------------------------------------- aggregate -- */

/*
 * Optional post-pass: merge planning nodes that share a host-provided key,
 * summing quantities and merging inputs/outputs. Structural only — it never
 * re-runs the accounting, so it cannot change feasibility, only the plan size.
 */
CraftTreePlanner.aggregate = function (nodes, nodeKey) {
    nodeKey = nodeKey || function (n) { return n.recipeId; };
    var byKey = {};
    var order = [];

    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var k = _ceString(nodeKey(n));
        var agg = byKey[k];
        if (!agg) {
            agg = {
                recipeId: n.recipeId,
                quantity: 0,
                isProcessing: n.isProcessing,
                hostRef: n.hostRef,
                count: 0,
                inputs: [],
                outputs: []
            };
            byKey[k] = agg;
            order.push(agg);
        }
        agg.quantity += n.quantity;
        agg.count++;

        var ii;
        for (ii = 0; ii < n.inputs.length; ii++) {
            var inp = n.inputs[ii];
            var ik = _ceString(inp.key) + "|" + (inp.fromInventory ? "inv" : "craft");
            var found = null;
            for (var ai = 0; ai < agg.inputs.length; ai++) {
                if (agg.inputs[ai]._k === ik) { found = agg.inputs[ai]; break; }
            }
            if (found) {
                found.amount += inp.amount;
            } else {
                agg.inputs.push({
                    key: inp.key, amount: inp.amount,
                    fromInventory: !!inp.fromInventory, autocrafted: !!inp.autocrafted, _k: ik
                });
            }
        }

        for (ii = 0; ii < n.outputs.length; ii++) {
            var ok = _ceString(n.outputs[ii].key);
            var f = null;
            for (var ao = 0; ao < agg.outputs.length; ao++) {
                if (_ceString(agg.outputs[ao].key) === ok) { f = agg.outputs[ao]; break; }
            }
            if (f) f.amount += n.outputs[ii].amount;
            else agg.outputs.push({ key: n.outputs[ii].key, amount: n.outputs[ii].amount });
        }
    }

    for (var m = 0; m < order.length; m++) {
        for (var c = 0; c < order[m].inputs.length; c++) delete order[m].inputs[c]._k;
    }

    return order;
};

EXPORT("CraftTreePlanner", CraftTreePlanner);
