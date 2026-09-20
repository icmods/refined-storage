LIBRARY({
    name: "RecipeIndex",
    version: 1,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:1"]
});

IMPORT("CoreKit:1");

var RecipeIndex = {};

/*
 * ============================================================================
 * RecipeIndex — recipe discovery, inverse index, dedup, annotation, search
 * ============================================================================
 * Discovers engine workbench recipes, builds an inverse index (id → uids,
 * id_data → uids), dedups by result + ingredient signature, annotates
 * craftability (data:-1 wildcard), and searches names with a cache.
 *
 * The engine-specific pieces (recipe object access) are injected via opts —
 * the same index serves vanilla workbench recipes, custom recipe systems and
 * tests without the engine.
 * ============================================================================
 */

/**
 * Load all workbench recipes from the engine (yields during the scan).
 * Returns an array or null.
 */
RecipeIndex.loadWorkbenchRecipes = function () {
    try {
        if (typeof Recipes == "undefined" || !Recipes || typeof Recipes.getAllWorkbenchRecipes != "function") return null;
        var collection = Recipes.getAllWorkbenchRecipes();
        if (!collection) return null;
        var size = typeof collection.size == "function" ? collection.size() : collection.length;
        if (!size || size <= 0) return null;
        if (typeof collection.iterator != "function") return null;
        var arr = [];
        var iter = collection.iterator();
        while (iter.hasNext()) {
            arr.push(iter.next());
            if (arr.length % 500 == 0 && typeof java != "undefined") java.lang.Thread.yield();
        }
        return arr;
    } catch (e) {
        return null;
    }
};

/**
 * Build an index over a recipe list.
 * opts: {
 *   recipes: array,
 *   getUid(recipe) → string,            // default: recipe.getRecipeUid()
 *   getResult(recipe) → {id, data},     // default: recipe.getResult()
 *   getEntries(recipe) → [{id, data, count}]  // default: recipe.getSortedEntries()
 * }
 * Returns the index (with recipesByUid, inverseIndex, deduped).
 */
RecipeIndex.build = function (opts) {
    opts = opts || {};
    var recipes = opts.recipes || [];
    var getUid = opts.getUid || function (r) { return r.getRecipeUid(); };
    var getResult = opts.getResult || function (r) { return r.getResult(); };
    var getEntries = opts.getEntries || function (r) {
        var sorted = r.getSortedEntries();
        return sorted || [];
    };

    var index = {
        recipesByUid: Object.create(null),
        inverseIndex: Object.create(null),
        deduped: [],
        _getUid: getUid,
        _getResult: getResult,
        _getEntries: getEntries
    };

    var ingredientSignature = function (recipe) {
        var entries = getEntries(recipe);
        var sig = [];
        for (var i = 0; i < (entries.length || 0); i++) {
            var e = entries[i];
            if (e && e.id > 0 && isFinite(e.id)) sig.push(e.id + ":" + e.data + ":" + (e.count > 0 ? e.count : 1));
        }
        sig.sort();
        return sig.join(",");
    };

    var seen = Object.create(null);
    for (var r = 0; r < recipes.length; r++) {
        var recipe = recipes[r];
        try {
            var uid = getUid(recipe);
            if (index.recipesByUid[uid] === undefined) index.recipesByUid[uid] = recipe;
            var entries = getEntries(recipe);
            for (var i = 0; i < (entries.length || 0); i++) {
                var e = entries[i];
                if (!e || !(e.id > 0) || !isFinite(e.id)) continue;
                index.inverseIndex[e.id] = index.inverseIndex[e.id] || [];
                index.inverseIndex[e.id].push(uid);
                if (e.data >= 0) {
                    var key = e.id + "_" + e.data;
                    index.inverseIndex[key] = index.inverseIndex[key] || [];
                    index.inverseIndex[key].push(uid);
                }
            }
        } catch (x) {}
    }

    for (var d = 0; d < recipes.length; d++) {
        try {
            var res = getResult(recipes[d]);
            if (!res || !(res.id > 0) || !isFinite(res.id)) continue;
            var dedupKey = res.id + "_" + res.data + "_" + ingredientSignature(recipes[d]);
            if (seen[dedupKey] === undefined) {
                seen[dedupKey] = index.deduped.length;
                index.deduped.push(recipes[d]);
            }
        } catch (x) {}
    }

    index.byUid = function (uid) { return index.recipesByUid[uid] || null; };
    index.byIngredient = function (id, data) {
        if (data !== undefined && data !== null && data >= 0) {
            return (index.inverseIndex[id + "_" + data] || []).slice();
        }
        return (index.inverseIndex[id] || []).slice();
    };

    /**
     * Candidate recipes usable with the given available map
     * available: { "id" or "id_data": count }
     */
    index.findCandidates = function (available) {
        var candidateUids = Object.create(null);
        for (var k in available) {
            var id = parseInt(k.split("_")[0], 10);
            var byId = index.inverseIndex[id];
            if (byId) for (var i = 0; i < byId.length; i++) candidateUids[byId[i]] = true;
            var byKey = index.inverseIndex[k];
            if (byKey) for (var j = 0; j < byKey.length; j++) candidateUids[byKey[j]] = true;
        }
        var filtered = [];
        for (var r = 0; r < index.deduped.length; r++) {
            var uidR;
            try { uidR = getUid(index.deduped[r]); } catch (eUid) { continue; }
            if (candidateUids[uidR]) filtered.push(index.deduped[r]);
        }
        return filtered;
    };

    /**
     * Craftability annotation with data:-1 wildcard consumption.
     * Returns [{ recipe, result, craftable }], craftable-first, stable.
     */
    index.annotate = function (available) {
        var annotated = [];
        for (var r = 0; r < index.deduped.length; r++) {
            var recipe = index.deduped[r];
            var result = null;
            var craftable = false;
            try {
                result = getResult(recipe);
                var entries = getEntries(recipe);
                var len = entries.length || 0;
                var local = Object.create(null);
                for (var k in available) local[k] = available[k];
                craftable = true;
                var entryChecked = false;
                for (var pass = 0; pass < 2 && craftable; pass++) {
                    for (var i = 0; i < len && craftable; i++) {
                        var e = entries[i];
                        if (!e || !(e.id > 0) || !isFinite(e.id)) continue;
                        var isWild = (e.data == -1);
                        if ((pass === 0) === isWild) continue;
                        entryChecked = true;
                        var need = e.count > 0 ? e.count : 1;
                        if (isWild) {
                            var found = 0;
                            for (var k2 in local) {
                                if (parseInt(k2.split("_")[0], 10) == e.id && local[k2] > 0) {
                                    var take = Math.min(local[k2], need - found);
                                    local[k2] -= take;
                                    found += take;
                                    if (found >= need) break;
                                }
                            }
                            if (found < need) craftable = false;
                        } else {
                            var k3 = e.id + "_" + e.data;
                            if (!local[k3] || local[k3] < need) craftable = false;
                            else local[k3] -= need;
                        }
                    }
                }
                if (!entryChecked) craftable = false;
            } catch (e2) { craftable = false; }
            annotated.push({ recipe: recipe, result: result, craftable: craftable });
        }
        annotated.sort(function (a, b) {
            if (a.craftable && !b.craftable) return -1;
            if (!a.craftable && b.craftable) return 1;
            return 0;
        });
        return annotated;
    };

    /**
     * Name search over the deduped list, with a name cache.
     * getName(id, data) — cached by the host via opts.nameCache.
     */
    index.search = function (keyword, getName, nameCache) {
        nameCache = nameCache || {};
        if (!keyword) return index.deduped.slice();
        keyword = CoreKit.locale.normalizeSearch(keyword);
        var out = [];
        for (var r = 0; r < index.deduped.length; r++) {
            var res;
            try { res = getResult(index.deduped[r]); } catch (eRes) { continue; }
            var key = res.id + "_" + res.data;
            var name = nameCache[key];
            if (name === undefined) {
                try { name = getName(res.id, res.data); } catch (e) { name = ""; }
                nameCache[key] = name;
            }
            if (name && CoreKit.locale.normalizeSearch(name).indexOf(keyword) != -1) out.push(index.deduped[r]);
        }
        return out;
    };

    index.size = function () { return index.deduped.length; };

    return index;
};

/* --------------------------------------------------------- generic key sorting -- */

/**
 * Sort a list of opaque keys by an accessor-provided field, with optional text
 * filtering. Zero engine coupling: the host supplies the accessors.
 *
 * keys:    array of keys (host slot names, uids, ...)
 * accessors: {
 *   getId(key) → number      // also decides the "empty" (0) placement
 *   getCount(key) → number
 *   getName(key) → string
 *   hasItem(key) → boolean   // optional; used by the text filter (default getId(key) !== 0)
 * }
 * spec: {
 *   by: "count"|"name"|"id" | 0|1|2   // 0=count, 1=name, 2=id
 *   reverse: boolean
 *   textSearch: string|null           // case-insensitive substring on getName
 * }
 * Returns a fresh array (never mutates `keys`). With no textSearch every key is
 * kept (empty keys included) then sorted; with textSearch only keys where
 * hasItem(key) and the name matches are kept, preserving input order.
 */
RecipeIndex.sortKeys = function (keys, accessors, spec) {
    accessors = accessors || {};
    spec = spec || {};
    var getId = accessors.getId || function () { return 0; };
    var getCount = accessors.getCount || function () { return 0; };
    var getName = accessors.getName || function () { return ""; };
    var hasItem = accessors.hasItem || function (key) { return getId(key) !== 0; };
    keys = keys || [];

    var result;
    if (spec.textSearch) {
        var needle = CoreKit.locale.normalizeSearch(spec.textSearch);
        result = [];
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!hasItem(key)) continue;
            var name = getName(key);
            if (name && CoreKit.locale.normalizeSearch(name).indexOf(needle) !== -1) result.push(key);
        }
    } else {
        result = keys.slice();
    }

    var by = spec.by;
    var reverse = spec.reverse === true;
    var comparator = null;
    if (by === "id" || by === 2) {
        comparator = reverse
            ? function (a, b) { return getId(b) - getId(a); }
            : function (a, b) { var ia = getId(a), ib = getId(b); return ia === 0 || ib === 0 ? ib - ia : ia - ib; };
    } else if (by === "count" || by === 0) {
        comparator = reverse
            ? function (a, b) { var ca = getCount(a), cb = getCount(b); return ca === 0 || cb === 0 ? cb - ca : ca - cb; }
            : function (a, b) { return getCount(b) - getCount(a); };
    } else if (by === "name" || by === 1) {
        comparator = reverse
            ? function (a, b) { if (getId(a) === 0 || getId(b) === 0) return getId(b) - getId(a); var na = getName(a), nb = getName(b); return na > nb ? 1 : na < nb ? -1 : 0; }
            : function (a, b) { if (getId(a) === 0 || getId(b) === 0) return getId(b) - getId(a); var na = getName(a), nb = getName(b); return nb > na ? 1 : nb < na ? -1 : 0; };
    }
    if (comparator) result.sort(comparator);
    return result;
};

/**
 * Stable partition: items for which `isFirstGroup(item)` is true come first,
 * the rest after, preserving relative order inside each group. Optional
 * classification sink via opts.onClassify.
 *
 * opts: {
 *   filter(item) → boolean          // optional drop-in predicate (default: keep all)
 *   onClassify(item, isFirstGroup)  // optional, called per KEPT item
 * }
 * Returns { first, second, ordered } (ordered = first.concat(second)).
 */
RecipeIndex.partition = function (items, isFirstGroup, opts) {
    opts = opts || {};
    var first = [];
    var second = [];
    items = items || [];
    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (opts.filter && !opts.filter(item)) continue;
        var isFirst;
        try { isFirst = !!isFirstGroup(item); } catch (e) { isFirst = false; }
        if (typeof opts.onClassify == "function") {
            try { opts.onClassify(item, isFirst); } catch (e2) {}
        }
        if (isFirst) first.push(item); else second.push(item);
    }
    return { first: first, second: second, ordered: first.concat(second) };
};

/* ---------------------------------------------------------------- discovery (RS-style) -- */

var _RIDX_registryBridge = null;
var _RIDX_registryChecked = false;

/*
 * Native engine lookup via WRAP_JAVA:
 *   WorkbenchRecipeRegistry.addRecipesThatContainItem(id, data, collection)
 * Feature-detected once.
 */
function _ridxGetRegistryMethod() {
    if (_RIDX_registryChecked) return _RIDX_registryBridge;
    _RIDX_registryChecked = true;
    try {
        if (typeof WRAP_JAVA == "function") {
            var reg = WRAP_JAVA("com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipeRegistry");
            if (reg && typeof reg.addRecipesThatContainItem == "function") _RIDX_registryBridge = reg;
        }
    } catch (e) {
        _RIDX_registryBridge = null;
    }
    return _RIDX_registryBridge;
}

var _RIDX_ingredientCache = {};

/**
 * Clear the ingredient lookup cache. Recipes registered at runtime
 * (e.g. addShaped inside PostLoaded) invalidate cached lookups — call this
 * after all recipe registration is done, or disable caching via opts.
 */
RecipeIndex.clearIngredientCache = function () {
    _RIDX_ingredientCache = {};
};

/**
 * Load recipes containing an ingredient:
 * 1. native engine lookup via WRAP_JAVA (WorkbenchRecipeRegistry.addRecipesThatContainItem),
 * 2. fallback to Recipes.getWorkbenchRecipesByIngredient.
 * opts: { cache: true (default), refresh: true (bypass the cache) }.
 * Returns a FRESH array (never throws). Results are memoized because recipe
 * lists become stable after registration.
 */
RecipeIndex.loadRecipesByIngredient = function (id, data, opts) {
    if (data === undefined || data === null) data = -1;
    opts = opts || {};
    if (opts.cache !== false && !opts.refresh) {
        var cacheKey = id + "_" + data;
        if (_RIDX_ingredientCache[cacheKey]) return _RIDX_ingredientCache[cacheKey].slice();
    }
    var out = [];
    try {
        var reg = _ridxGetRegistryMethod();
        if (reg) {
            var set = new java.util.HashSet();
            reg.addRecipesThatContainItem(id, data, set);
            var it = set.iterator();
            while (it.hasNext()) out.push(it.next());
        }
    } catch (e) { out = []; }
    if (!out.length) {
        try {
            if (typeof Recipes != "undefined" && Recipes && typeof Recipes.getWorkbenchRecipesByIngredient == "function") {
                var col = Recipes.getWorkbenchRecipesByIngredient(id, data);
                if (col && col.iterator) {
                    var it2 = col.iterator();
                    while (it2.hasNext()) out.push(it2.next());
                }
            }
        } catch (e) { out = []; }
    }
    if (opts.cache !== false) _RIDX_ingredientCache[id + "_" + data] = out.slice();
    return out.slice();
};

/**
 * Candidate-only discovery: build the index from ONLY the recipes containing
 * the given ingredients — no full workbench scan.
 *   ingredients: [{ id, data }, ...] (data -1 = wildcard)
 *   opts: same as build() (getUid/getResult/getEntries).
 */
RecipeIndex.buildFromIngredients = function (ingredients, opts) {
    opts = opts || {};
    var getUid = opts.getUid || function (r) { return r.getRecipeUid(); };
    var seen = {};
    var recipes = [];
    for (var i = 0; i < ingredients.length; i++) {
        var ing = ingredients[i];
        if (!ing || !ing.id || ing.id <= 0) continue;
        var found = RecipeIndex.loadRecipesByIngredient(ing.id, ing.data);
        for (var r = 0; r < found.length; r++) {
            var uid = null;
            try { uid = getUid(found[r]); } catch (e) {}
            var key = (uid !== null && uid !== undefined) ? "u:" + uid : "o:" + i + ":" + r;
            if (seen[key]) continue;
            seen[key] = true;
            recipes.push(found[r]);
        }
    }
    return RecipeIndex.build({
        recipes: recipes,
        getUid: opts.getUid,
        getResult: opts.getResult,
        getEntries: opts.getEntries
    });
};

/* ------------------------------------------------------------ simulation -- */

var _RIDX_simCache = {};
var _RIDX_simContainer = null;
var _RIDX_simContainerFailed = false;

/**
 * Clear the simulation cache. Recipes registered at runtime invalidate
 * cached simulations — call this after all recipe registration is done.
 */
RecipeIndex.clearCraftSimulationCache = function () {
    _RIDX_simCache = {};
};

function _ridxGetSimContainer() {
    if (_RIDX_simContainer || _RIDX_simContainerFailed) return _RIDX_simContainer;
    try {
        if (typeof ItemContainer != "undefined" && typeof ItemContainer == "function") {
            var c = new ItemContainer();
            if (typeof c.setWorkbenchFieldPrefix == "function" && typeof c.setSlot == "function") {
                c.setWorkbenchFieldPrefix('craft_slot');
                _RIDX_simContainer = c;
                return c;
            }
        }
    } catch (e) { _RIDX_simContainer = null; }
    _RIDX_simContainerFailed = true;
    return null;
}

var _RIDX_wbfApi = null;
var _RIDX_wbfApiChecked = false;

function _ridxGetWorkbenchFieldAPI() {
    if (_RIDX_wbfApiChecked) return _RIDX_wbfApi;
    _RIDX_wbfApiChecked = true;
    try {
        if (typeof WRAP_JAVA == "function") {
            _RIDX_wbfApi = WRAP_JAVA("com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchFieldAPI") || null;
        }
    } catch (e) {
        _RIDX_wbfApi = null;
    }
    return _RIDX_wbfApi;
}

/**
 * Simulate a workbench recipe without a player: fill a scratch workbench-field
 * container from the recipe entries (data -1 → 0, count 1), statically reject
 * callbacks referencing `Player.*`, then run the callback with
 * (new WorkbenchFieldAPI(container), container.asScriptableField(), result).
 * The callback may mutate the container (craft_result) — the scratch container
 * is reused per call. Cached per recipe uid.
 * Returns true when the callback ran without throwing.
 *
 * opts (everything engine-specific is injectable):
 *   { cache, log, getUid, getEntries, getCallback, getResult,
 *     ItemContainer, WorkbenchFieldAPI, playerGlobals }
 */
RecipeIndex.simulateWorkbench = function (recipe, opts) {
    opts = opts || {};
    var getUid = opts.getUid || function (r) { return r.getRecipeUid(); };
    var getEntries = opts.getEntries || function (r) { return r.getSortedEntries(); };
    var getCallback = opts.getCallback || function (r) { return r.getCallback(); };
    var getResult = opts.getResult || function (r) { return r.getResult(); };
    var cache = opts.cache !== undefined ? opts.cache : _RIDX_simCache;
    var log = opts.log || function (msg) {
        if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, "RecipeIndex");
    };
    var playerGlobals = opts.playerGlobals !== undefined ? opts.playerGlobals
        : (typeof Player != "undefined" ? Player : null);
    var WbfCtor = opts.WorkbenchFieldAPI || _ridxGetWorkbenchFieldAPI();

    if (!recipe) return false;
    var uid = null;
    try { uid = getUid(recipe); } catch (e) { return false; }
    if (cache && cache[uid] !== undefined) return cache[uid];

    var entries = null;
    try { entries = getEntries(recipe); } catch (e) { entries = null; }
    function fail() {
        if (cache) cache[uid] = false;
        return false;
    }
    if (!entries) return fail();

    var container = null;
    if (opts.ItemContainer) {
        container = new opts.ItemContainer();
        if (typeof container.setWorkbenchFieldPrefix == "function") container.setWorkbenchFieldPrefix('craft_slot');
    } else {
        container = _ridxGetSimContainer();
    }
    if (!container || typeof container.setSlot != "function" || !WbfCtor) return fail();

    for (var i = 0; i < 9; i++) {
        var entry = entries[i];
        if (!entry || !entry.id) {
            container.setSlot('craft_slot' + i, 0, 0, 0);
            continue;
        }
        container.setSlot('craft_slot' + i, entry.id, 1, entry.data > -1 ? entry.data : 0, null);
    }
    try {
        var callback = getCallback(recipe);
        if (callback) {
            var src = String(callback);
            if (playerGlobals) {
                for (var k in playerGlobals) {
                    if (src.indexOf('Player.' + k) != -1) return fail();
                }
            }
            callback(new WbfCtor(container), container.asScriptableField(), getResult(recipe));
        }
        if (cache) cache[uid] = true;
        return true;
    } catch (err) {
        try { log('Recipe ' + uid + ' returned an error when called without a player: ' + err); } catch (e2) {}
        return fail();
    }
};

EXPORT("RecipeIndex", RecipeIndex);
