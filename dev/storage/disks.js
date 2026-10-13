var DiskData = [false];

/* --------------------------------------------------------- flush helpers -- */

/* Cheap per-entry counters, taken before a storage op; compared after it so only the
 * disk(s) that actually changed are marked dirty (a network op usually touches one). */
function rsDiskCounts(entries) {
	var counts = [];
	for (var i = 0; i < entries.length; i++) {
		counts.push(entries[i] ? (entries[i].items_stored | 0) : -1);
	}
	return counts;
}

function rsMarkChangedDisks(entries, before) {
	if (!RS_DISK_DATA_IN_EXTRA || !entries || !before) return;
	for (var i = 0; i < entries.length && i < before.length; i++) {
		var entry = entries[i];
		if (!entry || !entry.stacks) continue;
		if ((entry.items_stored | 0) !== before[i]) entry._rsDirty = true;
	}
}

/* Flushes the dirty disks of one network through their drive slots. Returns false when
 * at least one payload write failed (the caller keeps the network marked dirty). */
function rsFlushNetworkDisks(info) {
	if (!RS_DISK_DATA_IN_EXTRA || !info || info.net_id == null) return true;
	if (typeof RSNetworks == 'undefined' || !RSNetworks[info.net_id] || RSNetworks[info.net_id].info !== info) return true;
	var bs = null;
	try { bs = BlockSource.getDefaultForDimension(info.dimension); } catch (e) { bs = null; }
	var net = RSNetworks[info.net_id];
	var ok = true;
	for (var cid in net) {
		if (cid === 'info') continue;
		var entry = net[cid];
		if (!entry || entry.id !== BlockID.diskDrive) continue;
		var tile = null;
		try { tile = World.getTileEntity(entry.coords.x, entry.coords.y, entry.coords.z, bs); } catch (e) { tile = null; }
		if (!tile || !tile.container) continue;
		for (var s = 0; s < 8; s++) {
			var item = null;
			try { item = tile.container.getSlot('slot' + s); } catch (e) { item = null; }
			if (!item || !Disk.items[item.id]) continue;
			if (!Disk.flushItem(item, 'slot' + s, tile.container)) ok = false;
		}
	}
	return ok;
}

function rsFlushAllDirtyDisks(force) {
	if (!RS_DISK_DATA_IN_EXTRA) return;
	for (var netId in RSNetworks) {
		var net = RSNetworks[netId];
		if (!net || !net.info) continue;
		if (!force && !net.info.disksDirty) continue;
		net.info.disksDirty = false;
		if (rsFlushNetworkDisks(net.info) === false) net.info.disksDirty = true;
	}
}

/* Runs fn(tile, entry) for every drive tile inside one chunk. */
function rsForEachChunkDrive(dim, chunkX, chunkZ, fn) {
	if (typeof RSNetworks == 'undefined') return;
	var bs = null;
	try { bs = BlockSource.getDefaultForDimension(dim); } catch (e) { bs = null; }
	for (var netId in RSNetworks) {
		var net = RSNetworks[netId];
		if (!net) continue;
		for (var cid in net) {
			if (cid === 'info') continue;
			var entry = net[cid];
			if (!entry || entry.id !== BlockID.diskDrive) continue;
			var x = entry.coords.x, y = entry.coords.y, z = entry.coords.z;
			if (Math.floor(x / 16) !== chunkX || Math.floor(z / 16) !== chunkZ) continue;
			var tile = null;
			try { tile = World.getTileEntity(x, y, z, bs); } catch (e) { tile = null; }
			fn(tile, entry);
		}
	}
}

/* Chunk discard: flush the disk payloads, then drop their cache entries so a later
 * reload re-hydrates them from the item extra. */
function rsFlushChunkDisks(dim, chunkX, chunkZ) {
	if (!RS_DISK_DATA_IN_EXTRA) return true;
	var ok = true;
	rsForEachChunkDrive(dim, chunkX, chunkZ, function (tile) {
		if (!tile || !tile.container) return;
		for (var s = 0; s < 8; s++) {
			var item = null;
			try { item = tile.container.getSlot('slot' + s); } catch (e) { item = null; }
			if (!item || !Disk.items[item.id]) continue;
			if (!Disk.flushItem(item, 'slot' + s, tile.container)) ok = false;
		}
	});
	return ok;
}

function rsDropChunkDiskCache(dim, chunkX, chunkZ) {
	if (!RS_DISK_DATA_IN_EXTRA) return;
	rsForEachChunkDrive(dim, chunkX, chunkZ, function (tile) {
		if (!tile || !tile.container) return;
		for (var s = 0; s < 8; s++) {
			var item = null;
			try { item = tile.container.getSlot('slot' + s); } catch (e) { item = null; }
			if (!item || !Disk.items[item.id]) continue;
			var numericId = _diskNumericId(item, false);
			if (numericId && DiskData[numericId]) {
				if (typeof StorageCore != 'undefined' && StorageCore && StorageCore.forgetEntry) {
					try { StorageCore.forgetEntry(DiskData[numericId]); } catch (e) {}
				}
				DiskData[numericId] = false;
			}
		}
	});
}

/* Before the world save (runs before WorldDataSaverHandler.onLevelLeft). */
Callback.addCallback("LevelPreLeft", function () {
	rsFlushAllDirtyDisks(true);
});

/* ------------------------------------------------- disk persistence mode -- */
if (typeof RS_DISK_DATA_IN_EXTRA == 'undefined') RS_DISK_DATA_IN_EXTRA = true;
var DiskScopeData = [false];
/* Savecore mode: the live cache is the scope array from the start, so records created before the
 * first scope read (no moddata.json yet) are still written by the engine save. */
if (!RS_DISK_DATA_IN_EXTRA) DiskData = DiskScopeData;
var RS_DISK_MODE_KEY = '$rs.diskMode';
var RS_DISK_PAYLOAD_KEY = '$rs.diskData';
var RS_DISK_MODE_EXTRA = 'extra';
var RS_DISK_MODE_SAVECORE = 'savecore';
var RS_DISK_PAYLOAD_VERSION = 1;
var _diskWarned = {};

// v1 to v2: canonical uid re-key with count merge on collisions.
function _diskRekeyMerge(data) {
	if (!data || !Array.isArray(data)) return data;
	for (var e = 0; e < data.length; e++) {
		var elem = data[e];
		if (!elem || !elem.items) continue;
		var items = elem.items;
		var out = {};
		for (var key in items) {
			if (!Object.prototype.hasOwnProperty.call(items, key)) continue;
			var it = items[key];
			if (!it) continue;
			var newKey = it.extra ? getItemUid(it) : key;
			if (out[newKey]) {
				if (CoreKit.ItemContent.sameExtra(out[newKey].extra, it.extra)) {
					out[newKey].count = (out[newKey].count || 0) + (it.count || 0);
				} else {
					Logger.Log('[MIGRATION] unsupported extra variant dropped (item ' + it.id + ':' + it.data + ')', 'RefinedStorageError');
				}
			} else {
				out[newKey] = it;
			}
		}
		elem.items = out;
	}
	return data;
}

// v2 to v3: uid map -> stacks, deduplicated by canonical content key.
function _diskUpgradeV3(data) {
	if (!data || !Array.isArray(data)) return data;
	for (var e = 0; e < data.length; e++) {
		var elem = data[e];
		if (!elem || elem.stacks !== undefined) continue;
		var items = elem.items || {};
		var stacks = [];
		var byKey = Object.create(null);
		for (var key in items) {
			if (!Object.prototype.hasOwnProperty.call(items, key)) continue;
			var it = items[key];
			if (!it || !it.count) continue;
			var uid = CoreKit.Items.uidOf(it);
			if (byKey[uid]) {
				if (CoreKit.ItemContent.sameExtra(byKey[uid].extra, it.extra)) {
					byKey[uid].count += it.count;
				} else {
					Logger.Log('[MIGRATION] unsupported extra variant dropped (item ' + it.id + ':' + it.data + ')', 'RefinedStorageError');
				}
				continue;
			}
			var stack = { id: it.id, data: it.data, count: it.count, extra: it.extra || null };
			if (stack.extra) CoreKit.ItemContent.fold(stack.extra);
			byKey[uid] = stack;
			stacks.push(stack);
		}
		var stored = 0;
		for (var si = 0; si < stacks.length; si++) stored += stacks[si].count;
		elem.stacks = stacks;
		elem.items_stored = stored;
		delete elem.items;
	}
	return data;
}

function _diskWarnOnce(key, msg) {
	if (_diskWarned[key]) return;
	_diskWarned[key] = true;
	try { Logger.Log('[DISK] ' + msg, 'RefinedStorageError'); } catch (e) {}
}

/* Marker on the disk item: '' = unknown, otherwise 'extra' | 'savecore'. */
function _diskModeOf(item) {
	if (!item || !item.extra || typeof item.extra.getString != 'function') return '';
	try {
		var mode = item.extra.getString(RS_DISK_MODE_KEY, null);
		return (mode === RS_DISK_MODE_EXTRA || mode === RS_DISK_MODE_SAVECORE) ? mode : '';
	} catch (e) { return ''; }
}

function _diskExtraWrite(item, key, value) {
	if (!item.extra) { try { item.extra = new ItemExtraData(); } catch (e) { return false; } }
	try { item.extra.putString(key, value); return true; } catch (e) { return false; }
}

function _diskIdentityKey(item) {
	try { if (typeof DiskRegistry != 'undefined') { var u = DiskRegistry.uuidOf(item); if (u) return u; } } catch (e) {}
	return (item && item.data != null) ? String(item.data) : '?';
}

/* numericId via the registry (uuid first); optionally repairs anchors. */
function _diskNumericId(item, allowRepair) {
	if (typeof DiskRegistry != 'undefined') {
		try {
			var uuid = DiskRegistry.uuidOf(item);
			if (uuid && DiskRegistry.byUuid[uuid]) {
				var owned = DiskRegistry.byUuid[uuid].numericId;
				if (owned && item && item.data !== owned) {
					/* Keep the numeric mirror in step with the UUID identity. */
					try { item.data = owned; } catch (e) {}
				}
				return owned;
			}
			if (allowRepair) {
				var repair = DiskRegistry.repairAnchors(item);
				if (repair && repair.numericId) return repair.numericId;
			}
		} catch (e) {}
	}
	return (item && item.data) ? (item.data | 0) : 0;
}

function _diskRecordFromScope(scopeRecord, item) {
	var record = {
		storage: scopeRecord.storage,
		items_stored: scopeRecord.items_stored | 0,
		stacks: scopeRecord.stacks || [],
		uuid: _diskIdentityKey(item),
		_rsDirty: false
	};
	return record;
}

/* Item extra <-> plain JSON: a stack must carry a real ItemExtraData when it goes
 * back into a container, so payload extras are stored as {e,n,m} and rebuilt. */
function _diskExtraToPlain(extra) {
	if (!extra) return null;
	var plain = {};
	try {
		var ench = extra.getEnchants();
		var arr = [];
		for (var id in ench) {
			if (!Object.prototype.hasOwnProperty.call(ench, id)) continue;
			arr.push([Number(id), Number(ench[id])]);
		}
		if (arr.length) plain.e = arr;
	} catch (e) {}
	try { var name = extra.getCustomName(); if (name) plain.n = String(name); } catch (e2) {}
	try { var data = extra.getAllCustomData(); if (data) plain.m = String(data); } catch (e3) {}
	return plain;
}

function _diskExtraFromPlain(plain) {
	if (!plain) return null;
	var extra = null;
	try { extra = new ItemExtraData(); } catch (e) { return null; }
	try {
		var arr = plain.e || [];
		for (var i = 0; i < arr.length; i++) extra.addEnchant(arr[i][0], arr[i][1]);
	} catch (e2) {}
	try { if (plain.n) extra.setCustomName(String(plain.n)); } catch (e3) {}
	try { if (plain.m) extra.setAllCustomData(String(plain.m)); } catch (e4) {}
	try { if (extra.isEmpty && extra.isEmpty()) return null; } catch (e5) {}
	return extra;
}

/* Canonical payload record; malformed stacks are skipped, items_stored is recomputed. */
function _diskPayloadNormalize(payload) {
	var stacks = [];
	var raw = payload.stacks;
	if (raw && raw.length !== undefined) {
		for (var i = 0; i < raw.length; i++) {
			var s = raw[i];
			if (!s || !s.id || !(s.count > 0)) continue;
			var extra = _diskExtraFromPlain(s.extra);
			if (extra) { try { CoreKit.ItemContent.fold(extra); } catch (e) {} }
			stacks.push({ id: s.id | 0, data: s.data | 0, count: s.count | 0, extra: extra });
		}
	}
	var stored = 0;
	for (var j = 0; j < stacks.length; j++) stored += stacks[j].count;
	return {
		storage: payload.storage === 'Infinity' ? Infinity : (payload.storage || 0),
		items_stored: stored,
		stacks: stacks,
		uuid: '',
		_rsDirty: false
	};
}

/* null when there is no usable payload (absent, "null", malformed, unknown version). */
function _diskPayloadRead(item) {
	if (!item || !item.extra || typeof item.extra.getString != 'function') return null;
	var raw = null;
	try { raw = item.extra.getString(RS_DISK_PAYLOAD_KEY, null); } catch (e) { return null; }
	if (!raw || raw === 'null') return null;
	var payload = null;
	try { payload = JSON.parse(raw); } catch (e) { payload = null; }
	if (!payload || typeof payload != 'object' || payload.v !== RS_DISK_PAYLOAD_VERSION) {
		_diskWarnOnce('payload:' + _diskIdentityKey(item), 'invalid disk payload ignored');
		return null;
	}
	return _diskPayloadNormalize(payload);
}

function _diskPayloadWrite(item, record) {
	if (!item) return false;
	if (!item.extra) { try { item.extra = new ItemExtraData(); } catch (e) { return false; } }
	var stacks = [];
	var src = record.stacks || [];
	for (var i = 0; i < src.length; i++) {
		var s = src[i];
		if (!s) continue;
		stacks.push({ id: s.id, data: s.data, count: s.count, extra: _diskExtraToPlain(s.extra) });
	}
	try {
		item.extra.putString(RS_DISK_PAYLOAD_KEY, JSON.stringify({
			v: RS_DISK_PAYLOAD_VERSION,
			storage: record.storage === Infinity ? 'Infinity' : record.storage,
			items_stored: record.items_stored | 0,
			stacks: stacks
		}));
	} catch (e) { return false; }
	/* Marker last: a failed payload write must not leave the disk flagged as extra. */
	return _diskExtraWrite(item, RS_DISK_MODE_KEY, RS_DISK_MODE_EXTRA);
}

SaveCore.scope("RSDiskData", {
	version: 3,
	defaults: function () { return [false]; },
	legacy: function (raw) {
		return (raw && raw.DiskData) ? raw.DiskData : [false];
	},
	migrations: {
		1: _diskRekeyMerge,
		2: function (data) { return data; },
		3: _diskUpgradeV3
	},
	deserialize: function (data) {
		if (!data || !Array.isArray(data)) {
			DiskScopeData = [false];
			if (!RS_DISK_DATA_IN_EXTRA) DiskData = DiskScopeData;
			return DiskScopeData;
		}
		for (var e = 0; e < data.length; e++) {
			var elem = data[e];
			if (!elem) continue;
			if (elem.storage == 'Infinity') elem.storage = Infinity;
		}
		_diskUpgradeV3(data);
		for (var e2 = 0; e2 < data.length; e2++) {
			var elem2 = data[e2];
			if (!elem2 || !elem2.stacks) continue;
			for (var s2 = 0; s2 < elem2.stacks.length; s2++) {
				var stack2 = elem2.stacks[s2];
				if (stack2 && stack2.extra) CoreKit.ItemContent.fold(stack2.extra);
			}
		}
		DiskScopeData = data;
		if (!RS_DISK_DATA_IN_EXTRA) {
			/* scope mode: the scope array IS the live cache */
			DiskData = data;
			if (typeof DiskRegistry != "undefined") DiskRegistry.rebuild(DiskData);
		}
		return data;
	},
	serialize: function (data) {
		var src = RS_DISK_DATA_IN_EXTRA ? DiskScopeData : (DiskData || DiskScopeData);
		src = src || [false];
		var last = src.length - 1;
		while (last > 0 && !src[last]) last--;
		return src.slice(0, last + 1).map(function (elem) {
			if (elem && elem.storage == Infinity) {
				elem = Object.assign({}, elem);
				elem.storage = 'Infinity';
			}
			return elem;
		});
	},
	validate: function (data) { return Array.isArray(data); },
	onLevelLeft: function () {
		DiskData = [false];
		DiskScopeData = [false];
		if (!RS_DISK_DATA_IN_EXTRA) DiskData = DiskScopeData;
		_diskWarned = {};
		if (typeof DiskRegistry != "undefined") DiskRegistry.reset();
	}
});

var Disk = {
	getDiskData: function(item){
		if(!this.items[item.id]) return;
		if(!DiskData)DiskData = [false];
		if (RS_DISK_DATA_IN_EXTRA) {
			var numericId = _diskNumericId(item, true);
			if (!numericId) return;
			var record = DiskData[numericId];
			var itemUuid = (typeof DiskRegistry != 'undefined') ? DiskRegistry.uuidOf(item) : '';
			if (record && record.uuid && itemUuid && record.uuid !== itemUuid) {
				var repaired = (typeof DiskRegistry != 'undefined') ? DiskRegistry.repairAnchors(item) : null;
				var repairedUuid = (typeof DiskRegistry != 'undefined') ? DiskRegistry.uuidOf(item) : '';
				if (repaired && repairedUuid && record.uuid === repairedUuid) {
					/* Repaired to the record's own identity (adopted from the numeric mirror). */
				} else if (repaired && repaired.numericId && repaired.numericId !== numericId) {
					numericId = repaired.numericId;
					record = DiskData[numericId];
				} else {
					return;
				}
			}
			if (record) return record;
			record = _diskPayloadRead(item);
			if (!record && _diskModeOf(item) !== RS_DISK_MODE_EXTRA) {
				var scopeRecord = DiskScopeData[numericId];
				if (scopeRecord) record = _diskRecordFromScope(scopeRecord, item);
			}
			if (!record) record = this.getDefaultData(this.items[item.id].storage);
			record.uuid = record.uuid || _diskIdentityKey(item);
			if (typeof record._rsDirty == 'undefined') record._rsDirty = false;
			DiskData[numericId] = record;
			return record;
		}
		var legacyId = item.data;
		if(typeof DiskRegistry != "undefined"){
			var uuid = DiskRegistry.uuidOf(item);
			if(uuid){
				var known = DiskRegistry.byUuid[uuid];
				if(known && known.numericId) legacyId = known.numericId;
			}
		}
		if(legacyId && !DiskData[legacyId]) DiskData[legacyId] = this.getDefaultData(this.items[item.id].storage);
		return DiskData[legacyId];
	},
	getDefaultData: function(storage){
		var data = {
			storage: storage,
			items_stored: 0,
			stacks: [],
			uuid: '',
			_rsDirty: false
		};
		return data;
	},

	/* Moves content between the item payload and the scope array, decided by the disk
	 * marker vs the active mode. Runs on the server (drive tick, container available). */
	syncMode: function(item, slotName, container){
		if (!item || !item.extra || !container) return false;
		var numericId = _diskNumericId(item, true);
		if (!numericId) return false;
		var mode = _diskModeOf(item);
		if (RS_DISK_DATA_IN_EXTRA) {
			if (mode === RS_DISK_MODE_EXTRA) return true;
			var payload = _diskPayloadRead(item);
			if (payload) {
				payload.uuid = _diskIdentityKey(item);
				DiskData[numericId] = payload;
				if (!_diskExtraWrite(item, RS_DISK_MODE_KEY, RS_DISK_MODE_EXTRA)) return false;
				if (DiskScopeData[numericId]) DiskScopeData[numericId] = false;
				try { container.setSlot(slotName, item.id, item.count, item.data, item.extra); } catch (e) {}
				return true;
			}
			if (DiskScopeData[numericId]) {
				var record = DiskData[numericId];
				if (!record) {
					record = _diskRecordFromScope(DiskScopeData[numericId], item);
					DiskData[numericId] = record;
				}
				record._rsDirty = true;
				if (!this.flushItem(item, slotName, container)) return false;
				DiskScopeData[numericId] = false;
				return true;
			}
			return true;
		}
		if (mode !== RS_DISK_MODE_EXTRA) return true;
		var stored = _diskPayloadRead(item);
		if (!stored) return true;
		stored.uuid = _diskIdentityKey(item);
		DiskData[numericId] = stored;
		_diskExtraWrite(item, RS_DISK_MODE_KEY, RS_DISK_MODE_SAVECORE);
		_diskExtraWrite(item, RS_DISK_PAYLOAD_KEY, 'null');
		try { container.setSlot(slotName, item.id, item.count, item.data, item.extra); } catch (e) {}
		return true;
	},

	/* Writes the live record into the disk item's extra (only when dirty). */
	flushItem: function(item, slotName, container){
		if (!RS_DISK_DATA_IN_EXTRA || !item || !container) return true;
		var numericId = _diskNumericId(item, false);
		var record = DiskData[numericId];
		if (!record || !record._rsDirty) return true;
		if (typeof DiskRegistry != 'undefined' && !DiskRegistry.uuidOf(item)) {
			try { DiskRegistry.repairAnchors(item); } catch (e) {}
		}
		if (!_diskPayloadWrite(item, record)) {
			_diskWarnOnce('write:' + _diskIdentityKey(item), 'disk payload write failed');
			return false;
		}
		record._rsDirty = false;
		record.uuid = record.uuid || _diskIdentityKey(item);
		try { container.setSlot(slotName, item.id, item.count, item.data, item.extra); } catch (e) {}
		return true;
	},

	/* Read-only record for display (lore): live cache, then payload, then scope. */
	peekRecord: function(item){
		if (!item) return false;
		if (!RS_DISK_DATA_IN_EXTRA) return DiskData[item.data] || false;
		var numericId = _diskNumericId(item, false);
		if (numericId && DiskData[numericId]) return DiskData[numericId];
		var payload = _diskPayloadRead(item);
		if (payload) return payload;
		return (numericId && DiskScopeData[numericId]) ? DiskScopeData[numericId] : false;
	},
	items: {},
	register: function (name, texture, storage, registerItem) {
		if (storage !== Infinity) {
			if (typeof storage != 'number' || !isFinite(storage) || storage < 0) storage = 0;
			else if (storage > 2147483647) storage = 2147483647;
		}
		for (var i in this.items) {
			if (this.items[i].storage == storage) {
				rsNotify('Disk with such storage already exists');
				return  -1;
			}
		}
		var itemIDName = registerItem ? registerItem : "storageDisk" + storage;
		if(registerItem == undefined){
			IDRegistry.genItemID(itemIDName);
			Item.createItem(itemIDName, name, {
				name: texture,
			}, {
				stack: 1
			});
		}
		Item.registerNameOverrideFunction(ItemID[itemIDName], function (item, name) {
			var disk_data = Disk.peekRecord(item);
			if(!disk_data) return '§b' + name + "\n§7" + Translation.translate('Stored') + (storage != Infinity ? ': 0/' + storage : ': 0');
			name += "\n§7" + Translation.translate('Stored') + ': ' + disk_data.items_stored + (disk_data.storage != Infinity ? '/' + disk_data.storage : '');
			return name;
		});
		this.items[ItemID[itemIDName]] = { name: name, texture: texture, storage: storage };
		return ItemID[itemIDName];
	}
}
