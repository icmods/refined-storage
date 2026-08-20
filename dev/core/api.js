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
		if (!list) return;
		for (var i = 0; i < list.length; i++) {
			try {
				list[i](data);
			} catch (e) {
				Logger.Log('Event listener for "' + event + '" failed: ' + e, 'RefinedStorageError');
			}
		}
	},

	networks: {
		getItems: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.items; },
		getStorage: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.storage; },
		getStored: function(netId) { return RSNetworks[netId] && RSNetworks[netId].info.stored; },
		pushItem: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.pushItem(item, count); },
		deleteItem: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.deleteItem(item, count); },
		searchController: function(coords, self) { return searchController(coords, self); },
		searchBlocks: function(netId, blockId) { return searchBlocksInNetwork(netId, blockId); },
		getController: function(netId) { return searchController_net(netId); },
		refreshItems: function(netId) { var info = RSNetworks[netId] && RSNetworks[netId].info; if (info) info.updateItems(); },
		constructCraft: function(netId, item, count) { return RSNetworks[netId] && RSNetworks[netId].info.constructCraft(item, count || 1); },
		provideCraft: function(netId, tree) { var info = RSNetworks[netId] && RSNetworks[netId].info; if (info) info.provideCraft(tree); },
		requestCraft: function(netId, item, count) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info) return false;
			var now = World.getThreadTime();
			if (info.isRequestThrottled('api:' + netId, now)) return false;
			var result = info.constructCraft(item, count || 1);
			if (result && result.deduped) return true;
			if (result && result.craftable) {
				info.provideCraft(result);
				return true;
			}
			info.markRequestFailed('api:' + netId, now);
			return false;
		},
		keepStock: function(netId, item, minimum) {
			var result = { have: 0, requested: 0, status: 'noNetwork' };
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info) return result;
			minimum = minimum || 1;
			var targetId = item.id;
			var targetData = item.data || 0;
			var have = 0;
			var items = info.items || [];
			for (var i = 0; i < items.length; i++) {
				var entry = items[i];
				if (entry && entry.id === targetId && (entry.data || 0) === targetData) {
					have += entry.count || 0;
				}
			}
			result.have = have;
			if (have >= minimum) {
				result.status = 'satisfied';
				return result;
			}
			var needed = minimum - have;
			var sourceKey = 'keepStock:' + netId + ':' + targetId + '_' + targetData;
			var now = World.getThreadTime();
			if (info.isRequestThrottled(sourceKey, now)) {
				result.status = 'throttled';
				return result;
			}
			var craft = info.constructCraft({id: targetId, count: needed, data: targetData}, needed);
			if (craft && craft.deduped) {
				result.status = 'deduped';
				return result;
			}
			if (craft && craft.craftable) {
				info.provideCraft(craft);
				result.requested = needed;
				result.status = 'ok';
				return result;
			}
			info.markRequestFailed(sourceKey, now);
			result.status = 'failed';
			return result;
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

	crafters: {
		getFrontSide: function(tile) { return getCrafterFrontSide(tile); },
		getPatternContainers: function(netId, uid) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			return info ? info.getPatternContainers(uid) : [];
		},
		registerContainer: function(tile, container) {
			return PatternContainerRegistry.register(tile, container);
		},
		unregisterContainer: function(tile) {
			return PatternContainerRegistry.unregister(tile);
		},
		registerPattern: function(netId, coordsId, pattern) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
			if (!info || !pattern || !coordsId) return null;
			var normalized = PatternContainerRegistry.validatePattern(pattern);
			if (!normalized) return null;
			var craft = {
				id: normalized.id,
				coordsId: coordsId,
				isProcessed: normalized.isProcessed,
				oredictEnabled: normalized.oredictEnabled,
				ingridients: normalized.ingridients,
				result: normalized.result
			};
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
			}
			info.netMapDirty = true;
			info.refreshOpenedGrids(true);
			return craft;
		},
		unregisterPattern: function(netId, coordsId, craft) {
			var info = RSNetworks[netId] && RSNetworks[netId].info;
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
			}
			info.netMapDirty = true;
			info.refreshOpenedGrids(true);
		}
	},

	disks: {
		get: function(index) { return DiskData[index]; },
		getByItem: function(item) { return Disk.getDiskData(item); },
		register: function(name, texture, storage, registerItem) { return Disk.register(name, texture, storage, registerItem); }
	},

	blocks: {
		create: function(id, params) { RS_blocks.push(id); World.setBlockChangeCallbackEnabled(id, true); return RefinedStorage.createTile(id, params); },
		copy: function(fromId, toId, params) { RS_blocks.push(toId); World.setBlockChangeCallbackEnabled(toId, true); return RefinedStorage.copy(fromId, toId, params); },
		createMapBlock: function(name, params, types) { RS_blocks.push(BlockID[name]); World.setBlockChangeCallbackEnabled(BlockID[name], true); return RefinedStorage.createMapBlock(name, params, types); },
		mapTexture: function(coords, texture, meta) { RefinedStorage.mapTexture(coords, texture, meta); }
	},

	upgrades: {
		register: function(name, nameID, texture, params, usage, registerItem) { return UpgradeRegistry.register(name, nameID, texture, params, usage, registerItem); },
		get: function(id) { return UpgradeRegistry.get(id); }
	},

	energy: {
		set: function(blockId, value) { EnergyUse[blockId] = value; },
		get: function(blockId) { return EnergyUse[blockId]; },
		usage: function(netId, blockSource) {
			if (!RSNetworks[netId]) return null;
			var result = computeNetMap(netId, blockSource);
			return result ? result.usage : null;
		}
	},

	config: {
		get: function() { return Config; }
	},

	storage: {
		registerProvider: function(blockId, provider) { return registerStorageProvider(blockId, provider); },
		getProvider: function(blockId) { return getStorageProvider(blockId); }
	},

	registerStorageProvider: function(blockId, provider) { return registerStorageProvider(blockId, provider); },

	// Addon-facing Network Timer API. Tasks are runtime-only: re-register on
	// ModAPI.addAPICallback / PostLoaded (same pattern as StorageProviders) and
	// unregister at teardown; the registry is cleared on LevelLeft and on
	// networkDestroyed. Callback signature: fn(netId). Callbacks run on the
	// server thread inside the controller heartbeat, i.e. only while the
	// network's controller chunk is ticking. A throwing callback is logged and
	// isolated (failures are counted, other tasks keep running). Prefer
	// interval >= 20 for expensive work; do NOT persist task state.
	timer: {
		register: function(netId, name, interval, offset, fn) {
			if (typeof NetworkTimer === 'undefined') return false;
			if (typeof fn !== 'function' || typeof name !== 'string' || !name) return false;
			if (NetworkTimer.RESERVED[name]) return false;
			var net = NetworkTimer.networks[netId];
			var existing = net && net.tasks[name];
			if (existing && existing.internal) return false;
			return NetworkTimer.register(netId, name, interval, offset, function(_netId) {
				fn(_netId);
			}, false);
		},
		unregister: function(netId, name) {
			if (typeof NetworkTimer === 'undefined') return false;
			var net = NetworkTimer.networks[netId];
			var t = net && net.tasks[name];
			if (!t) return false;
			if (t.internal) return false;
			return NetworkTimer.unregister(netId, name);
		},
		get: function(netId, name) {
			if (typeof NetworkTimer === 'undefined') return null;
			return NetworkTimer.get(netId, name);
		},
		list: function(netId) {
			if (typeof NetworkTimer === 'undefined') return null;
			return NetworkTimer.list(netId);
		},
		listAll: function() {
			if (typeof NetworkTimer === 'undefined') return {};
			return NetworkTimer.listAll();
		}
	},

	wireless: {
		open: function(cfg) { return rsOpenWirelessTerminal(cfg); },
		drain: function(tile, playerUid, amount, itemId, capacity, sessionMap, outOfEnergyMsg, closedCallback) { return rsDrainWirelessItem(tile, playerUid, amount, itemId, capacity, sessionMap, outOfEnergyMsg, closedCallback); },
		bind: function(itemId, capacity, coords, playerUid, blockSource) { return rsBindWirelessItem(itemId, capacity, coords, playerUid, blockSource); },
		getProperties: function(transmitter) { return rsGetTransmitterProperties(transmitter); },
		findNearestTransmitter: function(playerUid, netId, crossDimension) { return rsFindNearestTransmitter(playerUid, netId, crossDimension); },
		getSession: function(playerUid) {
			var session = PhantomSessions.get(playerUid);
			if (!session || !session.tile || session.tile.data.removed) return null;
			return { tile: session.tile, netId: session.netId, screen: session.tile.data.screen };
		}
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
	}
};
