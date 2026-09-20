var DiskData = [false];

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
				out[newKey].count = (out[newKey].count || 0) + (it.count || 0);
			} else {
				out[newKey] = it;
			}
		}
		elem.items = out;
	}
	return data;
}

SaveCore.scope("RSDiskData", {
	version: 2,
	defaults: function () { return [false]; },
	legacy: function (raw) {
		return (raw && raw.DiskData) ? raw.DiskData : [false];
	},
	migrations: {
		1: _diskRekeyMerge,
		2: function (data) { return data; }
	},
	deserialize: function (data) {
		if (!data || !Array.isArray(data)) { DiskData = [false]; return DiskData; }
		for (var e = 0; e < data.length; e++) {
			var elem = data[e];
			if (!elem || !elem.items) continue;
			if (elem.storage == 'Infinity') elem.storage = Infinity;
		}
		_diskRekeyMerge(data);
		DiskData = data;
		return data;
	},
	serialize: function (data) {
		return (data || [false]).map(function (elem) {
			if (elem && elem.storage == Infinity) {
				elem = Object.assign({}, elem);
				elem.storage = 'Infinity';
			}
			return elem;
		});
	},
	validate: function (data) { return Array.isArray(data); },
	onLevelLeft: function () { DiskData = [false]; }
});

const Disk = {
	getDiskData: function(item){
		if(!this.items[item.id]) return;
		if(!DiskData)DiskData = [false];
		if(item.data && !DiskData[item.data]) DiskData[item.data] = this.getDefaultData(this.items[item.id].storage);
		return DiskData[item.data];
	},
	getDefaultData: function(storage){
		var data = {
			storage: storage,
			items_stored: 0,
			items: {}
		}
		return data;
	},
	items: {},
	register: function (name, texture, storage, registerItem) {
		for (var i in this.items) {
			if (this.items[i].storage == storage) {
				log('Disk with such storage already exists');
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
			var disk_data = DiskData[item.data];
			if(!disk_data) return '§b' + name + "\n§7" + Translation.translate('Stored') + (storage != Infinity ? ': 0/' + storage : ': 0');
			name += "\n§7" + Translation.translate('Stored') + ': ' + disk_data.items_stored + (disk_data.storage != Infinity ? '/' + disk_data.storage : '');
			return name;
		});
		this.items[ItemID[itemIDName]] = { name: name, texture: texture, storage: storage };
		return ItemID[itemIDName];
	}
}
