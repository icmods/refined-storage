var _RS = {
	_listeners: {},

	on: function(event, callback) {
		if (!this._listeners[event]) this._listeners[event] = [];
		this._listeners[event].push(callback);
		return function() {
			var list = _RS._listeners[event];
			if (list) _RS._listeners[event] = list.filter(function(h) { return h !== callback; });
		};
	},

	_emit: function(event, data) {
		var list = this._listeners[event];
		if (list) for (var i in list) list[i](data);
	},

	networks: {
		getItems: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.items; },
		getStorage: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.storage; },
		getStored: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.stored; },
		pushItem: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.pushItem(item, count); },
		deleteItem: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.deleteItem(item, count); },
		searchController: function(coords, self) { return searchController(coords, self); },
		searchBlocks: function(netId, blockId) { return searchBlocksInNetwork(netId, blockId); },
		constructCraft: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.constructCraft(item, count || 1); },
		provideCraft: function(netId, tree) { var info = RSNetworks[netId] && RSNetworks[netId].info; if (info) info.provideCraft(tree); },
		cancelTask: function(netId, taskId) { var info = RSNetworks[netId] && RSNetworks[netId].info; return info ? info.cancelTask(taskId) : false; },
		getTask: function(netId, taskId) { return RSNetworks[netId] && RSNetworks[netId].info.getTask(taskId); },
		getCrafts: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.providingCrafts; },
		on: function(netId, event, callback) { return _RS.on(event, callback); }
	},

	disks: {
		get: function(index) { return DiskData[index]; },
		register: function(name, texture, storage, registerItem) { return Disk.register(name, texture, storage, registerItem); }
	},

	blocks: {
		create: function(id, params) { RS_blocks.push(id); return RefinedStorage.createTile(id, params); },
		copy: function(fromId, toId, params) { RS_blocks.push(toId); return RefinedStorage.copy(fromId, toId, params); },
		createMapBlock: function(name, params, types) { RS_blocks.push(BlockID[name]); return RefinedStorage.createMapBlock(name, params, types); },
		mapTexture: function(coords, texture, meta) { RefinedStorage.mapTexture(coords, texture, meta); }
	},

	upgrades: {
		register: function(name, nameID, texture, params, usage, registerItem) { return UpgradeRegistry.register(name, nameID, texture, params, usage, registerItem); }
	},

	energy: {
		set: function(blockId, value) { EnergyUse[blockId] = value; },
		get: function(blockId) { return EnergyUse[blockId]; }
	},

	config: {
		get: function() { return Config; }
	},

	ui: {
		createStorageContext: function(config) { return createStorageContext(config); },
		buildClickFrame: function(ctx) { buildClickFrame(ctx); },
		buildItemInfoPanel: function(ctx) { buildItemInfoPanel(ctx); },
		buildStorageSearch: function(ctx) { buildStorageSearch(ctx); },
		buildStorageSlots: function(ctx) { buildStorageSlots(ctx); },
		buildStorageSlider: function(ctx) { buildStorageSlider(ctx); },
		buildStorageSwipeHandler: function(ctx) { buildStorageSwipeHandler(ctx); },
		buildSettingsButtons: function(ctx) { buildSettingsButtons(ctx); },
		grid_set_elements: function(x, y, cons, limit, elements, gridData, window_, switchPage, funcs) {
			grid_set_elements(x, y, cons, limit, elements, gridData, window_, switchPage, funcs);
		},
		buildCraftsSection: function(ctx) { return buildCraftsSection(ctx); },
		makePageHelpers: function(elements, config) { return makePageHelpers(elements, config); },
		createInventoryPushHandler: function(data) { return createInventoryPushHandler(data); },
		buildPushDeleteEvents: function(networkData) { return buildPushDeleteEvents(networkData); },
		openCraftPreview: function(container, data) { openCraftPreview(container, data); },
		createCraftPreviewPostData: function(data) { return createCraftPreviewPostData(data); }
	},

	getBlocks: function() { return RS_blocks; },
	getNetworks: function() { return RSNetworks; }
};
