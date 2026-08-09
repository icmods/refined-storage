var DiskData = [false];
Saver.addSavesScope("RSDiskData",
	function read(scope){
		DiskData = scope && scope.DiskData ? scope.DiskData.map(function(elem){
			if(elem){
				if(elem.storage == 'Infinity')elem.storage = Infinity;
				var itemsReplacing = [];
				for(var i in elem.items){
					if(elem.items[i].extra){
						itemsReplacing.push([i, getItemUid(elem.items[i]), elem.items[i]]);
					}
				}
				for(var i in itemsReplacing){
					elem.items[itemsReplacing[i][1]] = itemsReplacing[i][2];
					delete elem.items[itemsReplacing[i][0]];
				}
			}
			return elem;
		}) : [false];
	},

	function save(){
		return {DiskData: DiskData.map(function(elem){
			if(elem && elem.storage == Infinity){
				elem = Object.assign({}, elem);
				elem.storage = 'Infinity';
			}
			return elem;
		})};
	}
);
Callback.addCallback("LevelLeft", function(){
	DiskData = [false];
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
	getDefaultExtra: function(storage){
		var extra = new ItemExtraData();
		var data = {
			storage: storage,
			items_stored: 0,
			items: {}
		}
		extra.putSerializable('disk_data', data);
		return extra;
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
				//isTech: true,
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
	},
	update: function (item) {
		var diskData = this.getDiskData(item);
		var items_stored = 0;
		for (var i in diskData.items) {
			var item = diskData.items[i];
			if (!item) return alert('Wow, this is a bad disk');
			items_stored += item.count;
		}
		diskData.items_stored = items_stored;
	},
	freeSpace: function (item) {
		var diskData = this.getDiskData(item);
		return diskData.storage - diskData.items_stored;
	}
}
