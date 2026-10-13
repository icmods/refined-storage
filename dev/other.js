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

/* Detach a tile's current monitor listener from its network before it is replaced
 * (re-init must not leave the old closure registered). */
function rsDetachMonitorListener(tile){
	if (!tile || !tile._monitorListener) return;
	var net = (typeof RSNetworks != 'undefined' && tile.data) ? RSNetworks[tile.data.NETWORK_ID] : null;
	var info = net && net.info;
	if (info && info.removeMonitorListener) {
		try { info.removeMonitorListener(tile._monitorListener); } catch (e) {}
	}
	tile._monitorListenerOn = false;
}

function rsRemoveOpenedGrid(tile){
	if(!tile || tile.data.NETWORK_ID == 'f') return;
	/* Other players may still be watching this tile: keep the registration so push
	 * refreshes keep flowing for them (the close listener already removed this client). */
	if (tile.__mpClients) {
		for (var w in tile.__mpClients) { if (tile.__mpClients[w]) return; }
	}
	var net = RSNetworks[tile.data.NETWORK_ID];
	if(!net || !net.info) return;
	var coords_id = tile.coords_id();
	if(net[coords_id]) net[coords_id].isOpenedGrid = false;
	if(!net.info.openedGrids) return;
	var iIndex = net.info.openedGrids.findIndex(function(element){return cts(element) == coords_id});
	if(iIndex != -1) net.info.openedGrids.splice(iIndex, 1);
}

/* UI serialization: UI mutations are queued and replayed on a single thread. */
var _rsSerExec = null;
var _rsSerProviderWarned = false;

function rsThreadId(){
	try { return String(java.lang.Thread.currentThread().getName()); }
	catch(e) {
		if(!_rsSerProviderWarned){
			_rsSerProviderWarned = true;
			try { Logger.Log("thread id unavailable: " + e, "RS"); } catch(e2) {}
		}
		return "?";
	}
}

try { UiCore.setThreadIdProvider(rsThreadId); } catch(e){}

function rsExclusive(key, fn, label){
	var wrapped = UiCore.exclusive(key, fn, label);
	return function(){
		/* Calls from any other thread are queued and replayed on the executor
		 * thread, never run concurrently. */
		if(_rsSerExec && rsThreadId() !== _rsSerExec){
			UiCore.queueCall(key, wrapped, this, arguments);
			return false;
		}
		return wrapped.apply(this, arguments);
	};
}

function rsDropPending(key){
	UiCore.dropPending(key);
}

function rsReplayUI(key){
	if(!UiCore.hasPending(key)) return 0;
	return UiCore.replayPending(key);
}

function rsReplayAllUI(){
	if(!_rsSerExec) _rsSerExec = rsThreadId();
	if(rsIsUiGestureActive()) return;
	rsReplayUI("grid.ui");
	rsReplayUI("cg.updateGui");
	rsReplayUI("pg.updateGui");
}

function rsRefreshError(e){
	try { Logger.Log("local refresh error: " + e, "RS"); } catch(e2) {}
}

function rsIsUiGestureActive(){
	try {
		if (typeof __rsStorageTouch != "undefined" && __rsStorageTouch &&
			(__rsStorageTouch.swipeY !== false || __rsStorageTouch.moving)) return true;
		if (typeof __rsCraftsTouch != "undefined" && __rsCraftsTouch &&
			(__rsCraftsTouch.swipeY !== false || __rsCraftsTouch.moving)) return true;
	} catch(e) {}
	return false;
}

/* Per-tile UI state protocol (grid/crafting_grid/pattern_grid): server publishes
 * the state, the client applies it on a version change. Legacy path kept for
 * rollback: RS_NETSTATE=false. */
var RS_NETSTATE = true;
var rsItemsNs = (typeof ContainerSync != 'undefined' && ContainerSync && typeof ContainerSync.netState == 'function')
	? ContainerSync.netState({
		version: "itemsVersion",
		hash: "itemsHash",
		count: "itemsCount",
		retry: 20,
		fields: {
			sort: { type: "int", default: 0 },
			reverse_filter: { type: "boolean", default: false },
			isWorkAllowed: { type: "boolean", default: true },
			redstone_mode: { type: "int", default: 0 },
			isActive: { type: "boolean", default: false },
			disksStored: { type: "int", default: 0 },
			disksStorage: { type: "string", default: "0" },
			patternMode: { type: "boolean", default: false },
			oredictMode: { type: "boolean", default: false }
		}
	}) : null;
if (!rsItemsNs) RS_NETSTATE = false;

/* Crafting monitor state (JSON payload + full flag, no retry/hash). */
var rsMonitorNs = rsItemsNs ? ContainerSync.netState({
	version: "monitorVersion",
	retry: 0,
	fields: {
		monitorTasks: { type: "json", default: null },
		monitorFull: { type: "boolean", default: false }
	}
}) : null;

/* Server side: publish the per-tile UI state (version + optional hash/count). */
/* Stable signature of the published UI base state: identical values skip the whole publish. */
function rsUiStateSignature(values, st, extraFields) {
	var sig = st.h + '|' + st.n + '|' + values.disksStored + '|' + values.disksStorage + '|' +
		(values.isWorkAllowed ? 1 : 0) + '|' + values.redstone_mode + '|' + (values.isActive ? 1 : 0) + '|' +
		values.sort + '|' + (values.reverse_filter ? 1 : 0);
	if (extraFields) {
		for (var k in extraFields) {
			if (Object.prototype.hasOwnProperty.call(extraFields, k)) sig += '|' + k + '=' + extraFields[k];
		}
	}
	return sig;
}

function rsPublishUiState(tile, extraFields){
	if (!RS_NETSTATE) return rsPublishUiStateLegacy(tile, extraFields);
	var nd = tile.networkData;
	var _id = tile.coords_id();
	var _values = {
		disksStored: tile.getDisksStored(),
		disksStorage: tile.getDisksStorage() + "",
		isWorkAllowed: tile.isWorkAllowed(),
		redstone_mode: tile.data.redstone_mode || 0,
		isActive: !!tile.data.isActive,
		sort: tile.data.sort || 0,
		reverse_filter: !!tile.data.reverse_filter
	};
	if (extraFields) {
		for (var _k in extraFields) {
			if (Object.prototype.hasOwnProperty.call(extraFields, _k)) _values[_k] = extraFields[_k];
		}
	}
	var _st = rsItemsHash(tile.container, tile);
	var _sig = rsUiStateSignature(_values, _st, extraFields);
	if (tile._rsUiSig === _sig) return 0;
	tile._rsUiSig = _sig;
	return rsItemsNs.publish(nd, _id, _values, { hash: _st.h, count: _st.n });
}

function rsPublishUiStateLegacy(tile, extraFields){
	var nd = tile.networkData;
	var _id = tile.coords_id();
	var _work = tile.isWorkAllowed();
	var _st = rsItemsHash(tile.container, tile);
	var _values = {
		disksStored: tile.getDisksStored(),
		disksStorage: tile.getDisksStorage() + "",
		isWorkAllowed: _work,
		redstone_mode: tile.data.redstone_mode || 0,
		isActive: !!tile.data.isActive,
		sort: tile.data.sort || 0,
		reverse_filter: !!tile.data.reverse_filter
	};
	var _sig = rsUiStateSignature(_values, _st, extraFields);
	if (tile._rsUiSig === _sig) return;
	tile._rsUiSig = _sig;
	if (extraFields) {
		for (var _k in extraFields) {
			var _v = extraFields[_k];
			if (typeof _v == 'boolean') nd.putBoolean(_k + '@' + _id, _v);
			else if (typeof _v == 'number') nd.putInt(_k + '@' + _id, _v);
			else nd.putString(_k + '@' + _id, _v == null ? '' : String(_v));
		}
	}
	nd.putInt('disksStored@' + _id, _values.disksStored);
	nd.putString('disksStorage@' + _id, _values.disksStorage);
	nd.putBoolean('isWorkAllowed@' + _id, _work);
	nd.putInt('redstone_mode@' + _id, _values.redstone_mode);
	nd.putBoolean('isActive@' + _id, _values.isActive);
	nd.putInt('sort@' + _id, _values.sort);
	nd.putBoolean('reverse_filter@' + _id, _values.reverse_filter);
	nd.putInt('itemsHash@' + _id, _st.h);
	nd.putInt('itemsCount@' + _id, _st.n);
	var _ver = (nd.getInt('itemsVersion@' + _id, 0) + 1) & 0x7FFFFFFF;
	nd.putInt('itemsVersion@' + _id, _ver);
	nd.sendChanges();
}

/* Client side: apply the published base state into the open window's UI data. */
function rsApplyUiState(nd, id, eventData, ui){
	if (!RS_NETSTATE) return rsApplyUiStateLegacy(nd, id, eventData, ui);
	rsItemsNs.read(nd, id, eventData);
	ui.sort = eventData.sort;
	ui.reverse_filter = eventData.reverse_filter;
	ui.isWorkAllowed = eventData.isWorkAllowed;
	ui.redstone_mode = eventData.redstone_mode;
	ui.disksStorage = eventData.disksStorage;
	ui.disksStored = eventData.disksStored;
}

function rsApplyUiStateLegacy(nd, id, eventData, ui){
	var _sort = (typeof eventData.sort == 'number') ? eventData.sort : 0;
	var _rev = (typeof eventData.reverse_filter == 'boolean') ? eventData.reverse_filter : false;
	var _work = (typeof eventData.isWorkAllowed == 'boolean') ? eventData.isWorkAllowed : true;
	var _red = (typeof eventData.redstone_mode == 'number') ? eventData.redstone_mode : 0;
	var _active = (typeof eventData.isActive == 'boolean') ? eventData.isActive : false;
	eventData.sort = nd.getInt('sort@' + id, _sort);
	eventData.reverse_filter = nd.getBoolean('reverse_filter@' + id, _rev);
	eventData.isWorkAllowed = nd.getBoolean('isWorkAllowed@' + id, _work);
	eventData.redstone_mode = nd.getInt('redstone_mode@' + id, _red);
	eventData.isActive = nd.getBoolean('isActive@' + id, _active);
	ui.sort = eventData.sort;
	ui.reverse_filter = eventData.reverse_filter;
	ui.isWorkAllowed = eventData.isWorkAllowed;
	ui.redstone_mode = eventData.redstone_mode;
	ui.disksStorage = nd.getString('disksStorage@' + id, (typeof ui.disksStorage == 'string') ? ui.disksStorage : "0");
	ui.disksStored = nd.getInt('disksStored@' + id, (typeof ui.disksStored == 'number') ? ui.disksStored : 0);
}

/* Client tick: apply the published state on a version change (with bounded hash retry). */
function rsConsumeUiVersion(tile, ui, render){
	if (!RS_NETSTATE) return rsConsumeUiVersionLegacy(tile, ui, render);
	var nd = tile.networkData;
	var _id = (typeof tile.coords_id == 'function') ? tile.coords_id() : (tile.x + ',' + tile.y + ',' + tile.z);
	if (!tile._nsState) tile._nsState = rsItemsNs.createState();
	return rsItemsNs.consume(nd, _id, tile._nsState, {
		isLive: function(){
			try { return typeof ui != 'undefined' && ui && typeof ui.isUiLive == 'function' && ui.isUiLive(); } catch(e) { return false; }
		},
		isGestureActive: rsIsUiGestureActive,
		nameMatches: function(){ return ui.name == nd.getName(); },
		hash: function(){ return rsItemsHash(ui.container); },
		onApply: function(ver){ ui.applyServerState(nd, _id); render(); },
		onError: function(e){ rsRefreshError(e); }
	});
}

function rsConsumeUiVersionLegacy(tile, ui, render){
	var _id = (typeof tile.coords_id == 'function') ? tile.coords_id() : (tile.x + ',' + tile.y + ',' + tile.z);
	var _ver = tile.networkData.getInt('itemsVersion@' + _id, 0);
	if(tile._dataVersion === undefined) tile._dataVersion = _ver;
	if(_ver !== tile._dataVersion){
		try {
			var _open = typeof ui != 'undefined' && ui && typeof ui.isUiLive == 'function' && ui.isUiLive();
			if(!_open){
				tile._dataVersion = _ver;
			} else if(rsIsUiGestureActive()){
			} else if(ui.name == tile.networkData.getName() && typeof ui.applyServerState == 'function'){
				var _st = rsItemsHash(ui.container);
				var _match = (_st.n === tile.networkData.getInt('itemsCount@' + _id, -1)) && (_st.h === tile.networkData.getInt('itemsHash@' + _id, 0));
				tile._dataVersion = _ver;
				ui.applyServerState(tile.networkData, _id);
				render();
				if(!_match){ tile._hashRetry = 20; }
			}
		} catch(e) {
			rsRefreshError(e);
		}
	}
	if(tile._hashRetry > 0 && typeof ui != 'undefined' && ui && typeof ui.isUiLive == 'function' && ui.isUiLive()){
		var _st2 = rsItemsHash(ui.container);
		if(_st2.n === tile.networkData.getInt('itemsCount@' + _id, -1) && _st2.h === tile.networkData.getInt('itemsHash@' + _id, 0)){
			tile._hashRetry = 0;
			ui.applyServerState(tile.networkData, _id);
			render();
		} else {
			tile._hashRetry--;
		}
	}
}

/* Diff-based slot sync: true when the current slot already holds the desired content. */
/* Extra comparison for call sites that compare content strings: same reference,
 * both absent, or memoized content (CoreKit stores it on the wrapper) short-circuit
 * the NBT work; same result as fullExtraToString(a) !== fullExtraToString(b). */
function rsExtraDiffers(a, b) {
	var ea = a || null, eb = b || null;
	if (ea === eb) return false;
	try { return fullExtraToString(ea) !== fullExtraToString(eb); } catch (e) { return true; }
}

function rsSlotEquals(cur, want){
	if (!cur || (cur.id | 0) === 0) return !want || (want.id | 0) === 0;
	if (!want || (want.id | 0) === 0) return false;
	if ((cur.id | 0) !== (want.id | 0)) return false;
	if ((cur.count | 0) !== (want.count | 0)) return false;
	if ((cur.data | 0) !== (want.data | 0)) return false;
	var a = cur.extra || null, b = want.extra || null;
	if (a === b) return true;
	if (!a || !b) return false;
	try { return fullExtraToString(a) === fullExtraToString(b); } catch(e) { return false; }
}

/* Diff-based slot sync: write only changed slots, clear only removed digit slots. */
var _rsDiffErrorLogged = false;
var _rsSlotDiffSeq = 0; /* Bumped on every applied slot diff; invalidates the hash memo. */
function rsApplySlotDiff(container, desired){
	var changed = 0, cleared = 0;
	for (var k in desired) {
		var cur = container.getSlot(k);
		var want = desired[k];
		if (!rsSlotEquals(cur, want)) {
			try {
				container.setSlot(k, want.id | 0, want.count | 0, want.data | 0, want.extra || null);
			} catch (e) {
				if (!_rsDiffErrorLogged) { _rsDiffErrorLogged = true; rsRefreshError(e); }
				continue;
			}
			changed++;
		}
	}
	for (var key in container.slots) {
		if (!(key[0] >= '0' && key[0] <= '9')) continue;
		if (desired[key]) continue;
		var s = container.slots[key];
		if (s && s.id) {
			container.setSlot(key, 0, 0, 0);
			cleared++;
		}
	}
	if (changed || cleared) _rsSlotDiffSeq++;
	return { changed: changed, cleared: cleared };
}

/* Item-slot hash (same rule on client and server): id/count/data, order-independent.
 * With an owner tile, the result is memoized for the current server tick and slot-diff
 * generation, so items()+refreshGui publish only computes it once. */
function rsItemsHash(container, owner){
	if (!container || !container.slots) return { h: 0, n: 0 };
	var tick = -1;
	if (typeof TickScheduler != "undefined" && TickScheduler && TickScheduler.global) tick = TickScheduler.global.ticks;
	if (owner && tick >= 0 && owner._rsHash && owner._rsHash.seq === _rsSlotDiffSeq && owner._rsHash.tick === tick) {
		return owner._rsHash.value;
	}
	var keys = [];
	for (var k in container.slots) {
		if (!(k[0] >= '0' && k[0] <= '9')) continue;
		var s = container.slots[k];
		if (!s || !s.id) continue;
		keys.push(k);
	}
	keys.sort();
	var h = 0;
	for (var i = 0; i < keys.length; i++) {
		var s2 = container.slots[keys[i]];
		h = (h * 31 + s2.id * 7 + (s2.count | 0) * 13 + (s2.data | 0) * 17) | 0;
	}
	var result = { h: h, n: keys.length };
	if (owner && tick >= 0) owner._rsHash = { seq: _rsSlotDiffSeq, tick: tick, value: result };
	return result;
}

function rsEnsureUiRuntime(){
	try { UiCore.setThreadIdProvider(rsThreadId); } catch(e){}
	try { TickScheduler.local.ensureInterval("rs:uiReplay", 1, rsReplayAllUI); } catch(e){}
}

/* Disk payload write-back sweep (T3): coalesced, only dirty disks are serialized. */
function rsEnsureDiskFlush(){
	try { TickScheduler.global.ensureInterval("rs:diskFlush", 10, rsFlushAllDirtyDisks); } catch(e){}
}

function rsDisposeUiRuntime(){
	_rsSerExec = null;
	try { if (typeof UiCore != 'undefined' && UiCore && typeof UiCore.dispose == 'function') UiCore.dispose(); } catch(e){}
}

rsEnsureUiRuntime();
try { Callback.addCallback("LevelLoaded", rsEnsureUiRuntime); } catch(e){}

rsEnsureDiskFlush();
try { Callback.addCallback("LevelLoaded", rsEnsureDiskFlush); } catch(e){}

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
	/* Derived workbench metadata (callback recipe + tool ids); not persisted. */
	if (typeof rsWorkbenchDecorateCraft === 'function') rsWorkbenchDecorateCraft(craft);
	for (var ri = 0; ri < craft.result.length; ri++) {
		var resultUid = getItemUid(craft.result[ri]);
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
		var resultUid = getItemUid(craft.result[ri]);
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

function rsSafeServerRefresh(tile, label) {
	return MpCore.safeTileCall(tile, function (t) { t.refreshModel(); }, {
		requireNetworkEntity: true,
		label: label || 'refreshModel',
		logTag: 'RefinedStorageError'
	});
}
