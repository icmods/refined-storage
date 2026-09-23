// Maps NetworkInfo (crafts + storage) onto CraftTreeExecutor's world view and task host.

function buildCraftWorld(info) {
	var storage = {};
	for (var i = 0; i < info.items.length; i++) {
		storage[info.items_map[i]] = info.items[i].count;
	}
	return {
		crafts: info.crafts,
		craftsIDS: info.craftsIDS,
		altDatas: info.just_items_map,
		storage: storage
	};
}

function buildCraftHost(info, carriedExtras) {
	// Extras captured when an NBT/extra item is physically extracted, so a later
	// flushBuffer re-inserts the SAME variant (extraKey is a string, not a Java object).
	var reservedExtras = carriedExtras || {};
	function extraForUid(uid) {
		if (!info.itemsIndex) return null;
		var idx = info.itemsIndex[uid];
		if (idx === undefined || idx === null) return null;
		var stack = info.items[idx];
		return (stack && stack.extra) ? stack.extra : null;
	}
	return {
		reservedExtras: reservedExtras,
		extract: function (uid, count) {
			var parts = CoreKit.Items.parseUid(uid);
			var extra = extraForUid(uid);
			var remainder = info.deleteItem({ id: parts.id, data: parts.data, count: count, extra: extra }, count, true, ['autocraft']);
			if (extra && remainder < count) reservedExtras[uid] = extra;
			return remainder;
		},
		resolveExtra: function (uid) {
			return reservedExtras[uid] || null;
		},
		insert: function (item, count) {
			return info.pushItem(item, count, true, ['autocraft']);
		},
		registerExpectedOutput: function (uid, task) {
			if (info.registerExpectedOutputTask) info.registerExpectedOutputTask(uid, task);
		},
		unregisterExpectedOutput: function (uid, task) {
			if (info.unregisterExpectedOutputTask) info.unregisterExpectedOutputTask(uid, task);
		}
	};
}

/* ---------------------------------------------------------------------------
 * Workbench callback recipes (tool recipes).
 * A pattern may map to an engine workbench recipe whose callback mutates the
 * field (e.g. Forge Hammer: tool damage +1, consumed at max damage). Detection
 * is derived from the engine registry and cached; nothing is persisted.
 * ------------------------------------------------------------------------- */

var _rsWbField = null;
var _rsWbFieldFailed = false;
var _rsWbRecipeCache = {};

/* Invalidate the detection cache (call when pattern/recipe registrations change). */
function rsWorkbenchResetCache() {
	_rsWbRecipeCache = {};
	if (typeof _ceResetIdentityCache === 'function') _ceResetIdentityCache();
}

function rsWorkbenchField() {
	if (_rsWbField || _rsWbFieldFailed) return _rsWbField;
	try {
		if (typeof ItemContainer != "undefined" && typeof ItemContainer == "function") {
			var c = new ItemContainer();
			if (typeof c.setWorkbenchFieldPrefix == "function" && typeof c.setSlot == "function") {
				c.setWorkbenchFieldPrefix('craft_slot');
				_rsWbField = c;
				return c;
			}
		}
	} catch (e) { _rsWbField = null; }
	_rsWbFieldFailed = true;
	return null;
}

/*
 * Detection: fill a scratch workbench field with the pattern ingredients and ask
 * the engine for the recipe. Only recipes WITH a callback qualify (the callback
 * is what mutates the field / wears the tool). Ingredients are placed in list
 * order — matching the shapeless tool recipes; shaped callback recipes that
 * need exact positions simply fail to resolve here and stay on the old path.
 */
function rsWorkbenchRecipeForCraft(craft) {
	if (!craft || !craft.ingridients || !craft.result || !craft.result.length) return null;
	if (typeof Recipes == "undefined" || !Recipes || typeof Recipes.getRecipeByField != "function") return null;
	var key = (craft.isProcessed ? '1' : '0') + '|';
	for (var k = 0; k < craft.ingridients.length; k++) {
		var ing = craft.ingridients[k];
		if (!ing || !ing.id) continue;
		key += ing.id + ':' + ing.data + ':' + (ing.count || 1) + ',';
	}
	var r0 = craft.result[0];
	key += '=>' + r0.id + ':' + r0.data + ':' + (r0.count || 1);
	var hit = _rsWbRecipeCache[key];
	if (hit !== undefined) return hit;
	var out = null;
	var field = rsWorkbenchField();
	if (field) {
		try {
			for (var i = 0; i < 9; i++) field.setSlot('craft_slot' + i, 0, 0, 0);
			for (var j = 0; j < craft.ingridients.length && j < 9; j++) {
				var it = craft.ingridients[j];
				if (!it || !it.id) continue;
				field.setSlot('craft_slot' + j, it.id, 1, it.data > -1 ? it.data : 0, null);
			}
			var recipe = Recipes.getRecipeByField(field, null);
			if (recipe) {
				var callback = null;
				try { callback = recipe.getCallback ? recipe.getCallback() : null; } catch (e1) { callback = null; }
				if (callback) out = { recipe: recipe, toolIds: rsWorkbenchToolIds(recipe) };
			}
		} catch (e2) { out = null; }
	}
	_rsWbRecipeCache[key] = out;
	return out;
}

/* Tool entries of a recipe: wildcard damage (-1) on an item that has durability. */
function rsWorkbenchToolIds(recipe) {
	var ids = {};
	try {
		var entries = recipe.getSortedEntries ? recipe.getSortedEntries() : null;
		if (!entries) return ids;
		for (var i = 0; i < entries.length; i++) {
			var e = entries[i];
			if (!e || !e.id || e.data !== -1) continue;
			var max = (typeof Item != "undefined" && Item.getMaxDamage) ? Item.getMaxDamage(e.id) : 0;
			if (max > 0) ids[e.id] = true;
		}
	} catch (e2) {}
	return ids;
}

/*
 * Attach the workbench metadata to a craft/pattern object (derived only, never
 * persisted; recomputed on registration and on pattern rebuild).
 *   craft.hasWorkbenchCallback — the engine recipe has a field-mutating callback
 *   craft.toolIds              — item ids used as tools (any damage)
 *   ing.uid / res.uid          — precomputed plan keys (identity ignores extras),
 *                                so planning does not recompute them per request
 */
function rsWorkbenchDecorateCraft(craft) {
	if (!craft) return craft;
	var hit = rsWorkbenchRecipeForCraft(craft);
	craft.hasWorkbenchCallback = !!hit;
	craft.toolIds = hit ? hit.toolIds : null;
	var canKey = (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items && CoreKit.Items.uidOf);
	if (canKey && craft.ingridients) {
		for (var i = 0; i < craft.ingridients.length; i++) {
			var ing = craft.ingridients[i];
			if (ing && ing.uid == null) ing.uid = CoreKit.Items.uidOf({ id: ing.id, data: ing.data, extra: null });
		}
	}
	if (canKey && craft.result) {
		for (var k = 0; k < craft.result.length; k++) {
			var res = craft.result[k];
			if (res && res.uid == null) res.uid = CoreKit.Items.uidOf({ id: res.id, data: res.data, extra: null });
		}
	}
	return craft;
}
