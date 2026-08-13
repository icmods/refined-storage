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
		requestCraft: function(netId, item, count) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info) return false;
			var result = info.constructCraft(item, count || 1);
			if (result && result.craftable) {
				info.provideCraft(result);
				return true;
			}
			return false;
		},
		cancelTask: function(netId, taskId) { var info = RSNetworks[netId] && RSNetworks[netId].info; return info ? info.cancelTask(taskId) : false; },
		getTask: function(netId, taskId) { return RSNetworks[netId] && RSNetworks[netId].info.getTask(taskId); },
		getTasks: function(netId) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info) return [];
			return info.craftingTasks.map(function(t) {
				return {
					id: t.id,
					requested: t.requestedUid,
					requestedCount: t.requestedCount,
					totalSteps: t.totalSteps,
					currentStep: t.currentStep || 0,
					progress: t.getProgress ? t.getProgress() : 0,
					cancelled: !!t.cancelled
				};
			});
		},
		getCrafts: function(netId) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info) return [];
			var out = [];
			for (var uid in info.crafts) {
				var crafts = info.crafts[uid];
				for (var i = 0; i < crafts.length; i++) {
					var c = crafts[i];
					out.push({uid: uid, isProcessed: !!c.isProcessed, coordsId: c.coordsId, result: c.result, ingridients: c.ingridients});
				}
			}
			return out;
		},
		on: function(netId, event, callback) {
			if (typeof event === 'function') {
				callback = event;
				event = netId;
				netId = null;
			}
			return _RS.on(event, function(payload) {
				if (netId === null || netId === undefined || (payload && payload.netId === netId)) callback(payload);
			});
		}
	},

	pattern: {
		create: function(inputs, outputs, isProcessed, oredict) {
			var extra = new ItemExtraData();
			extra.putBoolean('isProcessed', !!isProcessed);
			extra.putBoolean('oredictEnabled', isProcessed ? false : !!oredict);
			for (var i = 0; i < 9 && i < (inputs || []).length; i++) {
				var ing = inputs[i];
				extra.putString('craft' + i, ing.id + "," + (ing.count || 1) + "," + (oredict && !isProcessed ? -1 : (ing.data || 0)));
			}
			var maxOut = isProcessed ? 9 : 1;
			for (var i = 0; i < maxOut && i < (outputs || []).length; i++) {
				var res = outputs[i];
				extra.putString('result' + i, res.id + "," + (res.count || 1) + "," + (res.data || 0));
			}
			return extra;
		}
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

	getBlocks: function() { return RS_blocks; },
	getNetworks: function() { return RSNetworks; },
	getNetworksInfo: function() {
		var out = [];
		for (var i = 0; i < RSNetworks.length; i++) {
			var net = RSNetworks[i];
			if (!net || !net.info) continue;
			var controller = searchController_net(i);
			out.push({
				netId: i,
				controllerCoords: controller ? {x: controller.x, y: controller.y, z: controller.z} : null,
				storage: net.info.storage,
				stored: net.info.stored
			});
		}
		return out;
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
