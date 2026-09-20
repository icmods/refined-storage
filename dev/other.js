IMPORT("CoreKit");
IMPORT("UiCore");
IMPORT("TickScheduler");
IMPORT("EnergyMeter");
IMPORT("StorageCore");
IMPORT("ContainerSync");
IMPORT("EventBus");
IMPORT("CraftTreeExecutor");
IMPORT("CraftTreePlanner");
IMPORT("TopologyCore");
IMPORT("SaveCore");
IMPORT("RecipeIndex");
IMPORT("MpCore");


const Timer = java.util.Timer;
const TimerTask = java.util.TimerTask;

var InnerCore_pack = FileTools.ReadJSON(__packdir__ + 'manifest.json');

var levelloaded = false;

const searchItem = function (id, data, extra, list, reverse, playerUid) {
	var player = playerUid ? new PlayerActor(playerUid) : Player;
	if(typeof(data) != "number")data = -1;
	if(typeof(id) != "number")id = -1;
	if(typeof(extra) == "boolean"){
		playerUid = reverse; reverse = list; list = extra;
		extra = -1;
	}
	return searchInventory(player, id, data, extra, list, reverse);
}

const searchInventory = function (player, id, data, extra, list, reverse) {
	if(typeof(data) != "number")data = -1;
	if(typeof(id) != "number")id = -1;
	if(extra === undefined)extra = -1;
	if(reverse){
		if(list){
			var itemsList = [];
			for (var i = 35; i >= 0; i--) {
				var item = player.getInventorySlot(i);
				if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra === -1 || item.extra === extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
					itemsList.push({
						id: item.id,
						data: item.data,
						extra: item.extra,
						count: item.count,
						slot: i
					})
				}
			}
			return itemsList;
		} else for (var i = 35; i >= 0; i--) {
			var item = player.getInventorySlot(i);
			if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra === -1 || item.extra === extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
				return {
					id: item.id,
					data: item.data,
					extra: item.extra,
					count: item.count,
					slot: i
				}
			}
		}
	} else {
		if(list){
			var itemsList = [];
			for (var i = 0; i <= 35; i++) {
				var item = player.getInventorySlot(i);
				if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra === -1 || item.extra === extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
					itemsList.push({
						id: item.id,
						data: item.data,
						extra: item.extra,
						count: item.count,
						slot: i
					})
				}
			}
			return itemsList;
		} else for (var i = 0; i <= 35; i++) {
			var item = player.getInventorySlot(i);
			if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra === -1 || item.extra === extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
				return {
					id: item.id,
					data: item.data,
					extra: item.extra,
					count: item.count,
					slot: i
				}
			}
		}
	}
}

const log = function (text) {
	if (levelloaded) {
		Game.message(text);
	};
	Logger.Log(text, __name__ + " Log");
}

Callback.addCallback("LevelLoaded", function () {
	levelloaded = true
})

Callback.addCallback("LevelLeft", function () {
	levelloaded = false
});

var _LevelDisplayed = false;
Callback.addCallback("LevelDisplayed", function () {
	_LevelDisplayed = true;
});
Callback.addCallback("LevelLeft", function () {
	_LevelDisplayed = false;
});

const jSetInterval = function (__fun, __mil) {
	var timer = new Timer();
	var task = new TimerTask({
		run: function () {
			if (__fun()) timer.cancel();
		}
	})
	timer.scheduleAtFixedRate(task, 0, __mil);
	return timer;
}

const sides = CoreKit.coords.sides;

const onCallbacks = {};

function onCallback(name, func) {
	if (!onCallbacks[name]) {
		onCallbacks[name] = [];
		Callback.addCallback(name, function (a, b, c, d, e, f, g, h) {
			for (var i in onCallbacks[name]) {
				var res = onCallbacks[name][i](a, b, c, d, e, f, g, h);
				if (res == "delete") onCallbacks[name].splice(i, 1);
			}
		});
	}
	onCallbacks[name].push(func);
	return onCallbacks[name].length - 1;
}

const setInterval = function (func, _ticks, _first) {
	if (_first && func()) return;
	var ticks__ = 0;
	return {
		id: onCallback('tick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				ticks__ = 0;
				if (func()) return 'delete';
			}
		}),
		name: 'tick'
	}
}

const setIntervalLocal = function (func, _ticks, _first) {
	if (_first && func()) return;
	var ticks__ = 0;
	return {
		id: onCallback('LocalTick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				if (func()) return 'delete';
			}
		}),
		name: 'LocalTick'
	}
}

const cts = function (coords) {
	return CoreKit.coords.cts(coords);
}

if (!Object.assign) {
	Object.defineProperty(Object, 'assign', {
		enumerable: false,
		configurable: true,
		writable: true,
		value: function (target, firstSource) {
			'use strict';
			if (target === undefined || target === null) {
				throw new TypeError('Cannot convert first argument to object');
			}

			var to = Object(target);
			for (var i = 1; i < arguments.length; i++) {
				var nextSource = arguments[i];
				if (nextSource === undefined || nextSource === null) {
					continue;
				}

				var keysArray = Object.keys(Object(nextSource));
				for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
					var nextKey = keysArray[nextIndex];
					var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
					if (desc !== undefined && desc.enumerable) {
						to[nextKey] = nextSource[nextKey];
					}
				}
			}
			return to;
		}
	});
}

const numberWithCommas = function(_num) {
	return CoreKit.util.numberWithCommas(_num);
}

function getExtraUidSuffix(extra){
	// Deprecated wrapper over the canonical CoreKit extra key.
	return extra ? CoreKit.Items.extraKey(extra) : "";
}

function getClientGuiWindow(container, name) {
	var window = null;
	if (container && typeof container.getWindow == 'function') {
		try { window = container.getWindow(); } catch(e) { window = null; }
	}
	if (!window && container && typeof container.getUiAdapter == 'function') {
		try {
			var adapter = container.getUiAdapter();
			if (adapter && typeof adapter.getWindow == 'function') window = adapter.getWindow();
		} catch(e) { window = null; }
	}
	if (window && typeof window.getWindow == 'function') {
		if (window.getAllWindows) {
			try {
				var all = window.getAllWindows();
				var it = all && all.iterator ? all.iterator() : null;
				while (it && it.hasNext()) {
					var w = it.next();
					if (w && typeof w.isOpened == 'function' && w.isOpened()) return w;
				}
			} catch(e) {}
		}
		if (name) {
			try { return window.getWindow(name) || window; } catch(e) {}
		}
	}
	return window;
}

function getItemUid(item){
	return CoreKit.Items.uidOf(item);
}

function rsRemoveOpenedGrid(tile){
	if(!tile || tile.data.NETWORK_ID == 'f') return;
	var net = RSNetworks[tile.data.NETWORK_ID];
	if(!net || !net.info) return;
	var coords_id = tile.coords_id();
	if(net[coords_id]) net[coords_id].isOpenedGrid = false;
	if(!net.info.openedGrids) return;
	var iIndex = net.info.openedGrids.findIndex(function(element){return cts(element) == coords_id});
	if(iIndex != -1) net.info.openedGrids.splice(iIndex, 1);
}

function cutNumber(num, forGrid){
	return CoreKit.util.cutNumber(num, forGrid);
}

function fullExtraToString(extra, usenbt){
	return CoreKit.Items.fullExtraToString(extra);
}

// Java-like pattern identity: content-based (id/processed/oredict/ingredients/result),
// NOT the physical tile. All containers holding the same pattern share this key, so
// duplicate crafters keep working in parallel; different patterns with the same
// result never share containers.
function rsPatternKey(craft, resultUid) {
	var ing = "";
	for (var i = 0; i < (craft.ingridients || []).length; i++) {
		var g = craft.ingridients[i];
		ing += (i ? "," : "") + g.id + ":" + g.data + ":" + (g.count || 1);
	}
	return craft.id + "|" + (craft.isProcessed ? 1 : 0) + "|" + (craft.oredictEnabled ? 1 : 0) + "|" + ing + "|" + resultUid;
}

function rsRegisterCraftInInfo(info, craft, coordsId) {
	if (!info || !craft || !coordsId) return;
	for (var ri = 0; ri < craft.result.length; ri++) {
		var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
		if (!info.crafts[resultUid]) info.crafts[resultUid] = [];
		var exists = false;
		for (var ci = 0; ci < info.crafts[resultUid].length; ci++) {
			var existing = info.crafts[resultUid][ci];
			if (existing.coordsId === coordsId && existing.id === craft.id && existing.isProcessed === craft.isProcessed) {
				exists = true;
				break;
			}
		}
		if (!exists) info.crafts[resultUid].push(craft);
		if (!info.craftsIDS[craft.result[ri].id]) info.craftsIDS[craft.result[ri].id] = [];
		if (info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data) == -1) info.craftsIDS[craft.result[ri].id].push(craft.result[ri].data);
		info.addPatternContainer(resultUid, coordsId);
		var pkey = rsPatternKey(craft, resultUid);
		if (!info.craftsByKey[pkey]) info.craftsByKey[pkey] = craft;
		info.addPatternContainerKey(pkey, coordsId);
	}
	info.netMapDirty = true;
	info.refreshOpenedGrids(true);
}

function rsUnregisterCraftFromInfo(info, craft, coordsId) {
	if (!info || !craft) return;
	for (var ri = 0; ri < craft.result.length; ri++) {
		var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
		if (info.crafts[resultUid]) {
			for (var ci = info.crafts[resultUid].length - 1; ci >= 0; ci--) {
				var existing = info.crafts[resultUid][ci];
				if (existing.coordsId === coordsId && existing.id === craft.id && existing.isProcessed === craft.isProcessed) {
					info.crafts[resultUid].splice(ci, 1);
				}
			}
			if (info.crafts[resultUid].length == 0) delete info.crafts[resultUid];
		}
		if (!info.crafts[resultUid] && info.craftsIDS[craft.result[ri].id]) {
			var idIdx = info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data);
			if (idIdx != -1) info.craftsIDS[craft.result[ri].id].splice(idIdx, 1);
			if (info.craftsIDS[craft.result[ri].id].length == 0) delete info.craftsIDS[craft.result[ri].id];
		}
		info.removePatternContainer(resultUid, coordsId);
		var pkeyU = rsPatternKey(craft, resultUid);
		if (info.craftsByKey[pkeyU] === craft) delete info.craftsByKey[pkeyU];
		info.removePatternContainerKey(pkeyU, coordsId);
	}
	info.netMapDirty = true;
	info.refreshOpenedGrids(true);
}

function rsAllocNetId() {
	for (var i = 0; i < RSNetworks.length; i++) if (!RSNetworks[i]) return i;
	return RSNetworks.length;
}

function rsRunOnUiThread(fn) {
	return UiCore.safeRun(fn, 'RefinedStorageError');
}

function rsSafeServerRefresh(tile, label) {
	return MpCore.safeTileCall(tile, function (t) { t.refreshModel(); }, {
		requireNetworkEntity: true,
		label: label || 'refreshModel',
		logTag: 'RefinedStorageError'
	});
}
