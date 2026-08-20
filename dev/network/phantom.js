IDRegistry.genBlockID("RS_phantom");
Block.createBlock("RS_phantom", [
	{ name: "RS Phantom", texture: [["RSmachine_casing", 0]], inCreative: false }
]);
BlockRenderer.setStaticICRender(BlockID.RS_phantom, -1, new ICRender.Model());
var phantomEmptyCollision = new ICRender.CollisionShape();
BlockRenderer.setCustomCollisionShape(BlockID.RS_phantom, -1, phantomEmptyCollision);
BlockRenderer.setCustomRaycastShape(BlockID.RS_phantom, -1, phantomEmptyCollision);

var PhantomSessions = {
	sessions: {},
	nextId: 0,
	get: function(playerUid) {
		return this.sessions[playerUid] || null;
	},
	register: function(playerUid, tile) {
		this.sessions[playerUid] = { tile: tile, netId: tile.data.NETWORK_ID };
		return tile;
	},
	remove: function(playerUid, tile) {
		var session = this.sessions[playerUid];
		if (!session) return;
		if (tile && session.tile !== tile) return;
		delete this.sessions[playerUid];
	}
};

var phantomClientPending = {};

var RSPhantomDeferredDestroy = [];

function rsDeferPhantomDestroy(tile, reason) {
	if (!tile || tile.data.removed) return;
	tile.data.removed = true;
	RSPhantomDeferredDestroy.push({ tile: tile, reason: reason || 'deferred', ticks: 5 });
	Logger.Log('Phantom #' + (tile.data.phantomId != null ? tile.data.phantomId : '?') + ' at ' + tile.x + ',' + tile.y + ',' + tile.z + ' teardown deferred (' + (reason || 'deferred') + ')', 'RSPhantom');
}

Callback.addCallback("tick", function () {
	AutocraftingTickManager.flushTick();
	if (RSPhantomDeferredDestroy.length === 0) return;
	var remaining = [];
	for (var i = 0; i < RSPhantomDeferredDestroy.length; i++) {
		var entry = RSPhantomDeferredDestroy[i];
		entry.ticks--;
		if (entry.ticks > 0) { remaining.push(entry); continue; }
		try {
			entry.tile.performPhantomTeardown(entry.reason);
		} catch (e) {
			Logger.Log('Phantom deferred teardown failed: ' + e, 'RSPhantom');
			entry.attempts = (entry.attempts || 0) + 1;
			if (entry.attempts < 3) {
				entry.tile.data.teardownDone = false;
				entry.tile.data.removed = false;
				entry.ticks = 5;
				remaining.push(entry);
			} else {
				Logger.Log('Phantom teardown permanently failed after 3 attempts (' + entry.reason + ')', 'RSPhantom');
			}
		}
	}
	RSPhantomDeferredDestroy = remaining;
});

function phantomIsWorkAllowed(tile) {
	return tile && !tile.data.removed && tile.data.NETWORK_ID != 'f' && RSNetworks[tile.data.NETWORK_ID] && tile.data.isActive !== false;
}

function spawnPhantom(playerUid, netId, screen, blockSource) {
	var position = Entity.getPosition(playerUid);
	var baseX = Math.floor(position.x);
	var baseZ = Math.floor(position.z);
	var baseY = Math.floor(position.y);
	for (var offset = 0; offset < 3; offset++) {
		var y = baseY + offset;
		if (blockSource.getBlockId(baseX, y, baseZ) != 0) continue;
		blockSource.setBlock(baseX, y, baseZ, BlockID.RS_phantom, 0);
		var tile = World.addTileEntity(baseX, y, baseZ, blockSource);
		if (tile && tile.data) {
			tile.data.NETWORK_ID = netId;
			tile.data.playerUid = playerUid;
			tile.data.screen = screen;
			tile.data.phantomId = ++PhantomSessions.nextId;
			PhantomSessions.register(playerUid, tile);
			Logger.Log('Phantom #' + tile.data.phantomId + ' spawned at ' + baseX + ',' + y + ',' + baseZ + ' player=' + playerUid + ' net=' + netId + ' screen=' + screen, 'RSPhantom');
			return tile;
		}
		blockSource.setBlock(baseX, y, baseZ, 0);
	}
	Logger.Log('Phantom spawn FAILED at ' + baseX + ',' + baseY + ',' + baseZ + ' player=' + playerUid + ' net=' + netId + ' screen=' + screen, 'RSPhantom');
	return null;
}

function registerPhantomListeners(tile) {
	if (tile.__listenersRegistered || !tile.container) return;
	tile.__listenersRegistered = true;
	tile.container.addServerOpenListener({ onOpen: function(container, client) {
		if (tile.onWindowOpen) tile.onWindowOpen(container, client);
	}});
	tile.container.addServerCloseListener({ onClose: function(container, client) {
		if (tile.onWindowClose) tile.onWindowClose(container, client);
	}});
}

function phantomClientOpenGui(container, window, content, eventData) {
	if (eventData.screen == 'monitor') {
		if (!content.elements["craftsFrame"]) return;
		craftingMonitorOpenGui(container, window, content, eventData);
		return;
	}
	if (eventData.screen == 'craftingGrid') {
		if (!content.elements["crafts_slider"]) return;
		craftingGridOpenGui(container, window, content, eventData);
		return;
	}
	if (!content.elements["image_filter"]) return;
	gridOpenGui(container, window, content, eventData);
}

TileEntity.registerPrototype(BlockID.RS_phantom, {
	useNetworkItemContainer: true,
	defaultValues: {
		NETWORK_ID: 'f',
		playerUid: -1,
		screen: 'grid',
		removed: false,
		isActive: true,
		sort: 0,
		reverse_filter: false,
		redstone_mode: 0,
		refreshCurPage: false,
		fullRefreshPage: false,
		refreshMonitorPage: false,
		lastMonitorRefresh: 0,
		_monitorChangedTaskId: null,
		deadTicks: 0,
		orphanTicks: 0,
		pollTicks: 0,
		safetyTicks: 0,
		pollDirty: false,
		ageTicks: 0,
		phantom: true,
		wirelessConfig: null,
		wirelessSessionMap: 'wirelessPlayers',
		wirelessItemId: 0,
		openedScreens: {},
		wirelessPlayers: {},
		wirelessMonitorPlayers: {},
		wirelessCraftingGridPlayers: {},
		pushDeleteEvents: {},
		craftsTextSearch: null,
		selectedRecipe: null
	},
	created: function() {
		if (!this.blockSource) this.blockSource = BlockSource.getDefaultForDimension(this.dimension);
		this.data.removed = false;
		registerPhantomListeners(this);
	},
	init: function() {
		if (!this.blockSource) this.blockSource = BlockSource.getDefaultForDimension(this.dimension);
		registerPhantomListeners(this);
		this.container.setWorkbenchFieldPrefix('WB_craft_slot');
		this.container.setGlobalGetTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player) {
				return 0;
			}
		});
		this.container.setGlobalAddTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player) {
				if (slot[0] >= '0' && slot[0] <= '9') return count;
				return 0;
			}
		});
		this.container.setGlobalSlotSavingEnabled(false);
		this._monitorListener = makeMonitorListener(this, 'refreshMonitorPage', '_monitorChangedTaskId');
		this.__initialized = true;
	},
	clearPhantomContainer: function() {
		for (var slotName in this.container.slots) {
			this.container.clearSlot(slotName);
		}
	},
	isWorkAllowed: function() {
		return phantomIsWorkAllowed(this);
	},
	originalCrafts: function() {
		if (!this.isWorkAllowed()) return {};
		var info = RSNetworks[this.data.NETWORK_ID].info;
		var items = this.originalItems();
		var itemMap = {};
		for (var i = 0; i < items.length; i++) itemMap[items[i].id + '_' + items[i].data] = true;
		var crafts = {};
		for (var uid in info.crafts) {
			if (!itemMap[uid]) {
				var parts = uid.split('_');
				crafts[uid] = {id: parseInt(parts[0]), data: parseInt(parts[1]), count: 0};
			}
		}
		return crafts;
	},
	items: function(forced) {
		if (!this.isWorkAllowed()) return [];
		var items = this.originalItems().slice();
		var allSlots = Object.keys(this.container.slots);
		for (var ci = 0; ci < allSlots.length; ci++) {
			if (allSlots[ci][0] >= '0' && allSlots[ci][0] <= '9') this.container.setSlot(allSlots[ci], 0, 0, 0);
		}
		var crafts = this.originalCrafts();
		var craftsPush = Object.keys(crafts);
		var craftSlots = [];
		for (var i = 0; i < items.length; i++) {
			this.container.setSlot(i + 'slot', items[i].id, items[i].count, items[i].data, items[i].extra || null);
			var uid1 = items[i].id + '_' + items[i].data;
			if (crafts[uid1]) craftsPush.splice(craftsPush.indexOf(uid1), 1);
			else if (crafts[items[i].id + '_-1']) craftsPush.splice(craftsPush.indexOf(items[i].id + '_-1'), 1);
			craftSlots.push(i + 'slot');
		}
		for (var k in craftsPush) {
			var slotId = items.length + Number(k);
			var splitedItem = craftsPush[k].split('_');
			var item = {id: Number(splitedItem[0]), data: Number(splitedItem[1]), count: 0};
			this.container.setSlot(slotId + 'slot', item.id, 0, item.data);
			items.push(item);
			craftSlots.push(slotId + 'slot');
		}
		this.data.craftSlots = craftSlots;
		this.container.sendChanges();
		return items;
	},
	originalItems: function() {
		if (!this.isWorkAllowed()) return [];
		return RSNetworks[this.data.NETWORK_ID].info.items;
	},
	originalItemsMap: function() {
		if (!this.isWorkAllowed()) return [];
		return RSNetworks[this.data.NETWORK_ID].info.items_map;
	},
	originalOnlyItemsMap: function() {
		if (!this.isWorkAllowed()) return {};
		return RSNetworks[this.data.NETWORK_ID].info.just_items_map;
	},
	originalOnlyItemsExtraMap: function() {
		if (!this.isWorkAllowed()) return {};
		return RSNetworks[this.data.NETWORK_ID].info.just_items_map_extra;
	},
	getDisksStorage: function() {
		if (!this.isWorkAllowed()) return 0;
		return RSNetworks[this.data.NETWORK_ID].info.storage;
	},
	getDisksStored: function() {
		if (!this.isWorkAllowed()) return 0;
		return RSNetworks[this.data.NETWORK_ID].info.stored;
	},
	pushItem: function(item, count, nonUpdate) {
		count = count || item.count;
		if (!this.isWorkAllowed()) return count;
		return RSNetworks[this.data.NETWORK_ID].info.pushItem(item, count, nonUpdate);
	},
	deleteItem: function(item, count, nonUpdate) {
		count = count || item.count;
		if (!this.isWorkAllowed()) return count;
		return RSNetworks[this.data.NETWORK_ID].info.deleteItem(item, count, nonUpdate);
	},
	refreshGui: function(first, client, updateFilters, screen, updateCrafts) {
		screen = screen || this.data.screen || 'grid';
		if (screen == 'monitor') {
			if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID] || !RSNetworks[this.data.NETWORK_ID].info) return;
			var info = RSNetworks[this.data.NETWORK_ID].info;
			var _data = buildCraftingMonitorPayload(this, info.providingCrafts, first, null, '_monitorChangedTaskId');
			_data.screen = 'monitor';
			if (client) this.container.sendEvent(client, "openGui", _data);
			else this.container.sendEvent("openGui", _data);
			return;
		}
		if (screen == 'craftingGrid') {
			if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
			var _data = buildCraftingGridPayload(this, first, updateFilters, updateCrafts);
			_data.screen = 'craftingGrid';
			if (client) this.container.sendEvent(client, "openGui", _data);
			else this.container.sendEvent("openGui", _data);
			return;
		}
		var _data = buildGridPayload(this, first, updateFilters);
		_data.screen = 'grid';
		if (client) this.container.sendEvent(client, "openGui", _data);
		else this.container.sendEvent("openGui", _data);
	},
	getScreenByName: function(screenName) {
		if (screenName == 'grid') return gridGUI;
		if (screenName == 'monitor') return craftingMonitorGUI;
		if (screenName == 'craftingGrid') return craftingGridGUI;
		return gridGUI;
	},
	onWindowOpen: function(container, client) {
		this.data.everOpened = true;
		var uid = client.getPlayerUid();
		if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID] || !RSNetworks[this.data.NETWORK_ID].info) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		var screen = this.data.screen || 'grid';
		if (screen == 'monitor') {
			info.addMonitorListener(this._monitorListener);
			if (InnerCore_pack.packVersionCode >= 119) this.refreshGui(true, client, false, 'monitor');
			return;
		}
		if (InnerCore_pack.packVersionCode >= 119) this.refreshGui(true, client, false, screen);
		var coords_id = this.x + ',' + this.y + ',' + this.z;
		var found = false;
		for (var i = 0; i < info.openedGrids.length; i++) {
			if (cts(info.openedGrids[i]) == coords_id) { found = true; break; }
		}
		if (!found) info.openedGrids.push({x: this.x, y: this.y, z: this.z});
	},
	onWindowClose: function(container, client) {
		var uid = client.getPlayerUid();
		if (this.data.wirelessPlayers) delete this.data.wirelessPlayers[uid];
		if (this.data.wirelessMonitorPlayers) delete this.data.wirelessMonitorPlayers[uid];
		if (this.data.wirelessCraftingGridPlayers) delete this.data.wirelessCraftingGridPlayers[uid];
		if (this.data.openedScreens) delete this.data.openedScreens[uid];
		var screen = this.data.screen || 'grid';
		var net = this.data.NETWORK_ID != 'f' ? RSNetworks[this.data.NETWORK_ID] : null;
		if (net && net.info) {
			if (screen == 'monitor' && this._monitorListener) net.info.removeMonitorListener(this._monitorListener);
			var coords_id = this.x + ',' + this.y + ',' + this.z;
			for (var i = net.info.openedGrids.length - 1; i >= 0; i--) {
				if (cts(net.info.openedGrids[i]) == coords_id) net.info.openedGrids.splice(i, 1);
			}
		}
	},
	tick: function() {
		if (this.data.removed) return;
		if (this.data.pendingOpen) {
			if (this.__initialized) {
				var pending = this.data.pendingOpen;
				this.data.pendingOpen = null;
				var client = Network.getClientForPlayer(this.data.playerUid);
				if (client && !this.data.removed) {
					this.container.openFor(client, pending.screen);
					this.refreshGui(true, client, false, pending.screen);
				}
			}
		}
		var uid = this.data.playerUid;
		if (uid == -1) {
			this.data.orphanTicks = (this.data.orphanTicks || 0) + 1;
			if (this.data.orphanTicks > 40) rsDeferPhantomDestroy(this, 'no player');
			return;
		}
		this.data.orphanTicks = 0;
		var hasClients = this.container.getNetworkEntity().getClients().iterator().hasNext();
		if (!hasClients) {
			this.data.deadTicks = (this.data.deadTicks || 0) + 1;
			var deadTimeout = this.data.everOpened ? 600 : 60;
			if (this.data.deadTicks > deadTimeout * 10 || (this.data.deadTicks > deadTimeout && !this.data.pendingOpen)) { rsDeferPhantomDestroy(this, 'no clients timeout'); return; }
			return;
		}
		this.data.deadTicks = 0;
		this.data.pollTicks = (this.data.pollTicks || 0) + 1;
		this.data.safetyTicks = (this.data.safetyTicks || 0) + 1;
		this.data.ageTicks = (this.data.ageTicks || 0) + 1;
		var pollDirty = this.data.pollDirty === true;
		this.data.pollDirty = false;
		if (this.data.pollTicks >= 10 && pollDirty) {
			this.data.pollTicks = 0;
			if (this.data.screen == 'grid' || this.data.screen == 'craftingGrid') this.refreshGui(false, false, false, this.data.screen);
		}
		if (this.data.safetyTicks >= 30) {
			this.data.safetyTicks = 0;
			this.data.pollTicks = 0;
			if (this.data.ageTicks >= 40) {
				var carried = Entity.getCarriedItem(uid);
				if (this.data.screen == 'grid' && carried.id != ItemID.RSwirelessGrid) { rsDeferPhantomDestroy(this, 'carried item changed'); return; }
				if (this.data.screen == 'monitor' && carried.id != ItemID.RSwirelessCraftingMonitor) { rsDeferPhantomDestroy(this, 'carried item changed'); return; }
			}
			if (this.data.screen == 'grid' || this.data.screen == 'craftingGrid') this.refreshGui(false, false, false, this.data.screen);
		}
		if (this.data.refreshCurPage) {
			this.data.refreshCurPage = false;
			var full = this.data.fullRefreshPage;
			this.data.fullRefreshPage = false;
			if (this.data.screen == 'monitor') this.refreshGui(false, false, false, 'monitor');
			else { this.items(); this.refreshGui(false, false, full, this.data.screen, full); }
		}
		if (this.data.refreshMonitorPage) {
			var now = World.getThreadTime();
			if (this.data.lastMonitorRefresh === undefined || now - this.data.lastMonitorRefresh >= 5) {
				this.data.lastMonitorRefresh = now;
				this.data.refreshMonitorPage = false;
				this.refreshGui(false, false, false, 'monitor');
			}
		}
		this.processPushDeleteEvents();
	},
	processPushDeleteEvents: function() {
		var tile = this;
		var sessionMap = this.data.wirelessSessionMap || 'wirelessPlayers';
		var config = this.data.wirelessConfig || Config.wirelessGrid;
		var itemId = this.data.wirelessItemId || ItemID.RSwirelessGrid;
		GridEvents.processPushDeleteEvents(this, function(playerUid, eventType) {
			if (tile.data[sessionMap] && tile.data[sessionMap][playerUid]) {
				rsDrainWirelessItem(tile, Number(playerUid), eventType == 'push' ? config.insertUsage : config.extractUsage, itemId, config.capacity, sessionMap, 'Wireless terminal is out of energy.');
				_RS._emit("phantomItemMoved", {netId: tile.data.NETWORK_ID, playerUid: Number(playerUid), kind: eventType});
			}
		});
		this.data.pollDirty = true;
	},
	events: {
		pushDeleteEvents: function(packetData, packetExtra, connectedClient) {
			this.data.pushDeleteEvents[connectedClient.getPlayerUid()] = packetData.pushDeleteEvents;
		}
	},
	containerEvents: {
		updateFilter: function(eventData, connectedClient) {
			GridEvents.updateFilter(this);
		},
		updateReverseFilter: function(eventData, connectedClient) {
			GridEvents.updateReverseFilter(this);
		},
		craftPreview: function(eventData, connectedClient) {
			GridEvents.craftPreview(this, eventData, connectedClient);
		},
		provideConstructedCraft: function(eventData, connectedClient) {
			GridEvents.provideConstructedCraft(this, eventData, connectedClient);
		},
		provideCraft: function(eventData, connectedClient) {
			craftingGridProvideCraftEvent(this, eventData, connectedClient);
		},
		cancelTask: function(eventData, connectedClient) {
			var uid = connectedClient.getPlayerUid();
			var info = RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID].info;
			var cancelled = info && eventData && eventData.taskId ? info.cancelTask(eventData.taskId) : false;
			if (cancelled && this.data.wirelessMonitorPlayers && this.data.wirelessMonitorPlayers[uid]) {
				rsDrainWirelessItem(this, uid, Config.wirelessCraftingMonitor.cancelUsage, ItemID.RSwirelessCraftingMonitor, Config.wirelessCraftingMonitor.capacity, 'wirelessMonitorPlayers', 'Wireless Crafting Monitor is out of energy.');
			}
		},
		cancelAllTasks: function(eventData, connectedClient) {
			var uid = connectedClient.getPlayerUid();
			var info = RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID].info;
			if (info && info.craftingTasks && info.craftingTasks.length > 0) {
				info.cancelAllTasks();
				if (this.data.wirelessMonitorPlayers && this.data.wirelessMonitorPlayers[uid]) {
					rsDrainWirelessItem(this, uid, Config.wirelessCraftingMonitor.cancelAllUsage, ItemID.RSwirelessCraftingMonitor, Config.wirelessCraftingMonitor.capacity, 'wirelessMonitorPlayers', 'Wireless Crafting Monitor is out of energy.');
				}
			}
		},
		updateRedstoneMode: function(eventData, connectedClient) {
			this.data.redstone_mode = this.data.redstone_mode >= 2 ? 0 : this.data.redstone_mode + 1;
			this.data.pollDirty = true;
		}
	},
	destroyPhantom: function(reason) {
		if (this.data.removed) return;
		this.performPhantomTeardown(reason || 'unknown');
	},
	performPhantomTeardown: function(reason) {
		if (this.data.teardownDone) return;
		this.data.teardownDone = true;
		this.data.removed = true;
		Logger.Log('Phantom #' + (this.data.phantomId != null ? this.data.phantomId : '?') + ' at ' + this.x + ',' + this.y + ',' + this.z + ' destroyed (' + (reason || 'unknown') + ')', 'RSPhantom');
		var net = this.data.NETWORK_ID != 'f' ? RSNetworks[this.data.NETWORK_ID] : null;
		if (net && net.info) {
			if (this._monitorListener) net.info.removeMonitorListener(this._monitorListener);
			var coords_id = this.x + ',' + this.y + ',' + this.z;
			for (var i = net.info.openedGrids.length - 1; i >= 0; i--) {
				if (cts(net.info.openedGrids[i]) == coords_id) net.info.openedGrids.splice(i, 1);
			}
		}
		this.container.close();
		PhantomSessions.remove(this.data.playerUid, this);
		this.clearPhantomContainer();
		var blockSource = this.blockSource || BlockSource.getDefaultForDimension(this.dimension);
		if (blockSource && isChunkLoadedAtSafe(blockSource, this.x, this.y, this.z)) blockSource.setBlock(this.x, this.y, this.z, 0);
		TileEntity.destroyTileEntity(this, false, false);
	},
	destroy: function(fromDestroyBlock, isDropAllowed) {
		if (this.data.teardownDone) return;
		this.data.teardownDone = true;
		this.data.removed = true;
		Logger.Log('Phantom #' + (this.data.phantomId != null ? this.data.phantomId : '?') + ' at ' + this.x + ',' + this.y + ',' + this.z + ' destroyed (engine destroy)', 'RSPhantom');
		this.clearPhantomContainer();
		var net = this.data.NETWORK_ID != 'f' ? RSNetworks[this.data.NETWORK_ID] : null;
		if (net && net.info) {
			if (this._monitorListener) net.info.removeMonitorListener(this._monitorListener);
			var coords_id = this.x + ',' + this.y + ',' + this.z;
			for (var i = net.info.openedGrids.length - 1; i >= 0; i--) {
				if (cts(net.info.openedGrids[i]) == coords_id) net.info.openedGrids.splice(i, 1);
			}
		}
		PhantomSessions.remove(this.data.playerUid, this);
	},
	onDisconnectionPlayer: function(client) {
		if (client && client.getPlayerUid() == this.data.playerUid) rsDeferPhantomDestroy(this, 'player disconnected');
	},
	client: {
		ticks: 0,
		tick: function() {
			this.ticks++;
			var pendingKey = this.networkData.getName();
			var pending = phantomClientPending[pendingKey];
			if (pending) {
				pending.ticks = (pending.ticks || 0) + 1;
				if (pending.window && pending.window.isOpened() && pending.content) {
					delete phantomClientPending[pendingKey];
					phantomClientOpenGui(pending.container, pending.window, pending.content, pending.eventData);
				} else if (pending.ticks > 200) {
					delete phantomClientPending[pendingKey];
				}
			}
			if (this.networkData.getBoolean('update', false)) {
				this.updateCrafts = true;
				this.networkData.putBoolean('update', false);
				var pushDeleteEvents = buildPushDeleteEvents(this.networkData);
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents});
			}
			if (this.updateCrafts && this.ticks % 20 == 0) {
				this.updateCrafts = false;
				if (craftingGridData.name == this.networkData.getName()) craftingGridData.updateGui(true, false, true);
			}
		},
		containerEvents: {
			reselectRecipe: function(container, window, content, eventData) {
				if (craftingGridData.selectedRecipe && craftingGridData.selectedRecipe.javaRecipe) {
					craftingGridFuncs.selectRecipe(craftingGridData.selectedRecipe.javaRecipe, container, craftingGridData.originalOnlyItemsExtraMap, craftingGridData.originalOnlyItemsMap, craftingGridData.originalItemsMap);
				}
			},
			openGui: function(container, window, content, eventData) {
				if (!content || !window) return;
				if (!window.isOpened()) {
					phantomClientPending[eventData.name] = {container: container, window: window, content: content, eventData: eventData, ticks: 0};
					return;
				}
				delete phantomClientPending[eventData.name];
				phantomClientOpenGui(container, window, content, eventData);
			},
			openCraftPreview: function(container, window, content, eventData) {
				openCraftPreview(container, eventData);
			}
		}
	}
});

Callback.addCallback("ServerPlayerLeft", function(playerUid) {
	var session = PhantomSessions.get(playerUid);
	if (session && session.tile && !session.tile.data.removed) rsDeferPhantomDestroy(session.tile, 'player left');
});
Callback.addCallback("EntityDeath", function(entityUid, attackerUid, damageType) {
	var session = PhantomSessions.get(entityUid);
	if (session && session.tile && !session.tile.data.removed) rsDeferPhantomDestroy(session.tile, 'player died');
});
Callback.addCallback("PlayerChangedDimension", function(playerUid, currentId, lastId) {
	var session = PhantomSessions.get(playerUid);
	if (session && session.tile && !session.tile.data.removed) rsDeferPhantomDestroy(session.tile, 'dimension changed');
});

var AutocraftingTickManager = {
	areas: {},
	bboxes: {},
	names: {},
	dirty: {},
	markDirty: function(netId) {
		if (netId == null) return;
		this.dirty[netId] = true;
	},
	flushTick: function() {
		for (var netId in this.dirty) {
			delete this.dirty[netId];
			this.recomputeArea(netId);
		}
	},
	recomputeArea: function(netId) {
		var info = RSNetworks[netId] && RSNetworks[netId].info;
		if (!info) return;
		var hasTasks = info.craftingTasks && info.craftingTasks.length > 0;
		if (!hasTasks) {
			if (this.areas[netId]) {
				this.areas[netId] = false;
				delete this.bboxes[netId];
				var removedName = this.names[netId] || ('rsnet_' + netId);
				Commands.exec('/tickingarea remove ' + removedName);
				Logger.Log('Ticking area REMOVED: ' + removedName + ' (net ' + netId + ', no tasks)', 'RSTickingArea');
				delete this.names[netId];
			}
			return;
		}
		var minX = Infinity, minY = Infinity, minZ = Infinity;
		var maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
		var controller = searchController_net(netId);
		if (controller) {
			minX = Math.min(minX, controller.x); maxX = Math.max(maxX, controller.x);
			minY = Math.min(minY, controller.y); maxY = Math.max(maxY, controller.y);
			minZ = Math.min(minZ, controller.z); maxZ = Math.max(maxZ, controller.z);
		}
		for (var ti = 0; ti < info.craftingTasks.length; ti++) {
			var task = info.craftingTasks[ti];
			if (!task || task.cancelled || task.completing) continue;
			var nodes = task.nodes || [];
			for (var ni = 0; ni < nodes.length; ni++) {
				var node = nodes[ni];
				if (node.done || node.remaining <= 0) continue;
				var containers = info.getPatternContainers(node.patternUid);
				for (var ci = 0; ci < containers.length; ci++) {
					var parsedCoords = info.patternContainersParsed ? info.patternContainersParsed[containers[ci]] : null;
					if (parsedCoords) {
						minX = Math.min(minX, parsedCoords.x); maxX = Math.max(maxX, parsedCoords.x);
						minY = Math.min(minY, parsedCoords.y); maxY = Math.max(maxY, parsedCoords.y);
						minZ = Math.min(minZ, parsedCoords.z); maxZ = Math.max(maxZ, parsedCoords.z);
						continue;
					}
					var parts = containers[ci].split(',');
					if (parts.length < 3) continue;
					var cx = parseInt(parts[0]), cy = parseInt(parts[1]), cz = parseInt(parts[2]);
					minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
					minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
					minZ = Math.min(minZ, cz); maxZ = Math.max(maxZ, cz);
				}
			}
		}
		if (!isFinite(minX)) return;
		minX = Math.floor(minX) - 1; maxX = Math.floor(maxX) + 1;
		minZ = Math.floor(minZ) - 1; maxZ = Math.floor(maxZ) + 1;
		minY = Math.max(-64, Math.floor(minY) - 2);
		maxY = Math.min(319, Math.floor(maxY) + 2);
		var bboxKey = minX + ',' + minY + ',' + minZ + ',' + maxX + ',' + maxY + ',' + maxZ;
		var current = this.bboxes[netId];
		if (this.areas[netId] && current) {
			var currentParts = current.split(',');
			var contained = parseInt(currentParts[0]) <= minX && parseInt(currentParts[1]) <= minY && parseInt(currentParts[2]) <= minZ
				&& parseInt(currentParts[3]) >= maxX && parseInt(currentParts[4]) >= maxY && parseInt(currentParts[5]) >= maxZ;
			if (contained) return;
		}
		var baseName = 'rsnet_' + netId;
		var activeName = this.names[netId] || baseName;
		var tempName = activeName == baseName ? baseName + '_b' : baseName;
		var command = '/tickingarea add ' + minX + ' ' + minY + ' ' + minZ + ' ' + maxX + ' ' + maxY + ' ' + maxZ + ' ' + tempName;
		var error = Commands.exec(command);
		if (error != null) {
			if (this.areas[netId]) return;
			var fallbackError = Commands.exec('/tickingarea add ' + minX + ' ' + minY + ' ' + minZ + ' ' + maxX + ' ' + maxY + ' ' + maxZ + ' ' + baseName);
			if (fallbackError != null) {
				this.areas[netId] = false;
				Logger.Log('Ticking area ADD FAILED: ' + baseName + ' (net ' + netId + ') error: ' + fallbackError, 'RSTickingArea');
			} else {
				this.areas[netId] = true;
				this.names[netId] = baseName;
				this.bboxes[netId] = bboxKey;
				Logger.Log('Ticking area ADDED (fallback): ' + baseName + ' bbox=' + bboxKey + ' (net ' + netId + ')', 'RSTickingArea');
			}
			return;
		}
		if (this.areas[netId]) {
			Commands.exec('/tickingarea remove ' + activeName);
			Logger.Log('Ticking area REMOVED (resized): ' + activeName + ' (net ' + netId + ')', 'RSTickingArea');
		}
		this.areas[netId] = true;
		this.names[netId] = tempName;
		this.bboxes[netId] = bboxKey;
		Logger.Log('Ticking area ADDED: ' + tempName + ' bbox=' + bboxKey + ' (net ' + netId + ')', 'RSTickingArea');
	}
};

(function initAutocraftingTickManager() {
	_RS.on("taskAdded", function(data) { AutocraftingTickManager.markDirty(data.netId); });
	_RS.on("taskCompleted", function(data) { AutocraftingTickManager.markDirty(data.netId); });
	_RS.on("taskCancelled", function(data) { AutocraftingTickManager.markDirty(data.netId); });
	_RS.on("taskRemoved", function(data) { AutocraftingTickManager.markDirty(data.netId); });
	_RS.on("networkDestroyed", function(data) {
		if (!data || data.netId == null) return;
		if (AutocraftingTickManager.areas[data.netId]) {
			var removedName = AutocraftingTickManager.names[data.netId] || ('rsnet_' + data.netId);
			Commands.exec('/tickingarea remove ' + removedName);
			Logger.Log('Ticking area REMOVED: ' + removedName + ' (net ' + data.netId + ', network destroyed)', 'RSTickingArea');
			AutocraftingTickManager.areas[data.netId] = false;
			delete AutocraftingTickManager.names[data.netId];
			delete AutocraftingTickManager.bboxes[data.netId];
		}
		for (var uid in PhantomSessions.sessions) {
			var session = PhantomSessions.sessions[uid];
			if (session && session.tile && session.netId == data.netId && !session.tile.data.removed) {
				rsDeferPhantomDestroy(session.tile, 'network destroyed');
			}
		}
	});
})();

Callback.addCallback("ServerLevelLoaded", function() {
	for (var netId in AutocraftingTickManager.areas) AutocraftingTickManager.areas[netId] = false;
	AutocraftingTickManager.bboxes = {};
	AutocraftingTickManager.names = {};
	AutocraftingTickManager.dirty = {};
	for (var i = 0; i < RSNetworks.length; i++) {
		if (RSNetworks[i] && RSNetworks[i].info && RSNetworks[i].info.craftingTasks && RSNetworks[i].info.craftingTasks.length > 0) {
			AutocraftingTickManager.recomputeArea(i);
		}
	}
});

Callback.addCallback("LevelLeft", function() {
	PhantomSessions.sessions = {};
	phantomClientPending = {};
	RSPhantomDeferredDestroy = [];
	AutocraftingTickManager.areas = {};
	AutocraftingTickManager.bboxes = {};
	AutocraftingTickManager.names = {};
	AutocraftingTickManager.dirty = {};
});
