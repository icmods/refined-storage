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
			var parts = uid.split('_');
			var extra = extraForUid(uid);
			var remainder = info.deleteItem({ id: parseInt(parts[0]), data: parseInt(parts[1]), count: count, extra: extra }, count, true, ['autocraft']);
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
