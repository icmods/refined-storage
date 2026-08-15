IDRegistry.genBlockID("RS_wireless_transmitter");
Block.createBlockWithRotation("RS_wireless_transmitter", [
	{
		name: "Wireless Transmitter",
		texture: [
			["wireless_transmitter", 0]
		],
		inCreative: true
	}
], { renderlayer: 1 });
RS_blocks.push(BlockID.RS_wireless_transmitter);
EnergyUse[BlockID.RS_wireless_transmitter] = Config.energy_uses.wirelessTransmitter || 8;
Block.setupAsRedstoneReceiver("RS_wireless_transmitter", true);

function getTransmitterModel(active) {
	var render = new ICRender.Model();
	render.addEntry(new BlockRenderer.Model(7/16, 0, 7/16, 9/16, 10/16, 9/16, active ? "stick_on" : "stick_off", 0));
	return render;
}

for (var wti = 0; wti < 4; wti++) {
	BlockRenderer.enableCoordMapping(BlockID.RS_wireless_transmitter, wti, getTransmitterModel(false));
}

var stickShape = new ICRender.CollisionShape();
stickShape.addEntry().addBox(6/16, 6/16, 6/16, 10/16, 1, 10/16);
BlockRenderer.setCustomCollisionShape(BlockID.RS_wireless_transmitter, -1, stickShape);
BlockRenderer.setCustomRaycastShape(BlockID.RS_wireless_transmitter, -1, stickShape);

ItemModel.getFor(BlockID.RS_wireless_transmitter, 0).setModel(getTransmitterModel(true));

Block.registerPlaceFunction("RS_wireless_transmitter", function (coords, item, block, player, region) {
	if (coords.side != 1) return coords;
});

var elementsGUI_transmitter = {};
(function initTransmitterElements() {
	var screenHeight = UI.getScreenHeight() - 80;

	elementsGUI_transmitter["redstone_button"] = {
		type: "button",
		x: 225 + 20 + 10,
		y: 40,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: 2,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateRedstoneMode", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {}
		}
	}

	elementsGUI_transmitter["image_redstone"] = {
		type: "image",
		x: elementsGUI_transmitter["redstone_button"].x,
		y: elementsGUI_transmitter["redstone_button"].y,
		z: 1000,
		bitmap: "redstone_GUI_0",
		scale: elementsGUI_transmitter["redstone_button"].scale * 20 / 16
	}

	var upgradesFullSize = screenHeight * 0.45;
	var upgradesYstart = screenHeight * 0.6 - upgradesFullSize / 2;
	var upgradesYend = screenHeight * 0.6 + upgradesFullSize / 2;
	var upgradesSlotsSize = (upgradesYend - upgradesYstart) / 4;
	for (var i = 0; i < 4; i++) {
		elementsGUI_transmitter["slot_upgrades" + i] = {
			type: "slot",
			num: i,
			name: "slot_upgrades" + i,
			x: 225 + 20 + 10,
			y: upgradesYstart + i * upgradesSlotsSize,
			size: upgradesSlotsSize + 1
		}
	}

	elementsGUI_transmitter["image_transmitter"] = {
		type: "image",
		x: 400,
		y: 150,
		bitmap: "wireless_transmitter_ui_element",
		scale: 8
	}

	elementsGUI_transmitter["range_text"] = {
		type: "text",
		x: 570,
		y: 175,
		text: "0",
		font: { color: android.graphics.Color.WHITE, shadow: 0.5, size: 20 }
	}

	if (Config.dev) {
		elementsGUI_transmitter["dev_craftingGrid_button"] = {
			type: "button",
			x: 400,
			y: 500,
			bitmap: 'RS_empty_button',
			bitmap2: 'RS_empty_button_pressed',
			scale: 2,
			clicker: {
				onClick: function (itemContainerUiHandler, container, element) {
					container.sendEvent("devOpenCraftingGrid", {});
				},
				onLongClick: function (itemContainerUiHandler, container, element) {}
			}
		}
		elementsGUI_transmitter["dev_craftingGrid_text"] = {
			type: "text",
			x: 440,
			y: 505,
			text: "CG",
			font: { color: android.graphics.Color.WHITE, shadow: 0.5, size: 20 }
		}
	}
})();

var transmitterConfigGUI = new UI.StandartWindow({
	standart: {
		header: { text: { text: Translation.translate("Wireless Transmitter") } },
		inventory: { padding: 20, width: 300 / 4 * 3 },
		background: { standart: true }
	},
	drawing: [],
	elements: elementsGUI_transmitter
});
GUIs.push(transmitterConfigGUI);

var gridClient = RefinedStorage.paramsMap[BlockID.RS_grid].client;

RefinedStorage.copy(BlockID.RS_grid, BlockID.RS_wireless_transmitter, {
	blockInfo: { id: BlockID.RS_wireless_transmitter },
	upgradesSlots: ["slot_upgrades0", "slot_upgrades1", "slot_upgrades2", "slot_upgrades3"],
	containerEvents: Object.assign({}, RefinedStorage.paramsMap[BlockID.RS_grid].containerEvents, {
		cancelTask: function (eventData, connectedClient) {
			var uid = connectedClient.getPlayerUid();
			if (this.data.wirelessMonitorPlayers && this.data.wirelessMonitorPlayers[uid]) {
				rsDrainWirelessItem(this, uid, Config.wirelessCraftingMonitor.cancelUsage, ItemID.RSwirelessCraftingMonitor, Config.wirelessCraftingMonitor.capacity, 'wirelessMonitorPlayers', 'Wireless Crafting Monitor is out of energy.');
			}
			var info = getNetworkInfo(this);
			if (info && eventData && eventData.taskId) info.cancelTask(eventData.taskId);
		},
		cancelAllTasks: function (eventData, connectedClient) {
			var uid = connectedClient.getPlayerUid();
			if (this.data.wirelessMonitorPlayers && this.data.wirelessMonitorPlayers[uid]) {
				rsDrainWirelessItem(this, uid, Config.wirelessCraftingMonitor.cancelAllUsage, ItemID.RSwirelessCraftingMonitor, Config.wirelessCraftingMonitor.capacity, 'wirelessMonitorPlayers', 'Wireless Crafting Monitor is out of energy.');
			}
			var info = getNetworkInfo(this);
			if (info) info.cancelAllTasks();
		},
		provideCraft: function (eventData, connectedClient) {
			craftingGridProvideCraftEvent(this, eventData, connectedClient);
		},
		devOpenCraftingGrid: function (eventData, connectedClient) {
			var uid = connectedClient.getPlayerUid();
			if (!this.data.openedScreens) this.data.openedScreens = {};
			this.data.openedScreens[uid] = 'craftingGrid';
			this.items();
			this.container.openFor(connectedClient, "craftingGrid");
			this.refreshGui(true, connectedClient, false, "craftingGrid");
		}
	}),
	tick: function () {
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			if (this.data.refreshCurPage) {
				this.items();
				var screens = {};
				var foundAny = false;
				if (this.data.openedScreens) {
					for (var sk in this.data.openedScreens) { screens[this.data.openedScreens[sk]] = true; foundAny = true; }
				}
				if (!foundAny) screens['grid'] = true;
				for (var sn in screens) {
					if (sn == 'craftingGrid') this.refreshGui(false, false, this.data.fullRefreshPage, 'craftingGrid', this.data.fullRefreshPage);
					else if (sn == 'grid') this.refreshGui(false, false, this.data.fullRefreshPage, 'grid');
				}
				this.data.refreshCurPage = false;
				this.data.fullRefreshPage = false;
			}
		}
		if (this.data.refreshMonitorPage) {
			var _nowM = World.getThreadTime();
			if (this.data.lastMonitorRefresh === undefined || _nowM - this.data.lastMonitorRefresh >= 5) {
				this.data.lastMonitorRefresh = _nowM;
				this.data.refreshMonitorPage = false;
				var anyMonitor = false;
				if (this.data.wirelessMonitorPlayers) {
					for (var mk in this.data.wirelessMonitorPlayers) { anyMonitor = true; break; }
				}
				if (anyMonitor) this.refreshGui(false, false, false, 'monitor');
			}
		}
		this.processPushDeleteEvents();
	},
	processPushDeleteEvents: function () {
		var tile = this;
		GridEvents.processPushDeleteEvents(this, function (playerUid, eventType) {
			if (tile.data.wirelessPlayers && tile.data.wirelessPlayers[playerUid]) {
				rsDrainWirelessGrid(tile, Number(playerUid), eventType == 'push' ? Config.wirelessGrid.insertUsage : Config.wirelessGrid.extractUsage);
			}
		});
	},
	refreshModel: function () {
		this.sendPacket("refreshModel", { isActive: this.data.isActive, coords: { x: this.x, y: this.y, z: this.z, dimension: this.dimension } });
	},
	getRange: function () {
		var count = this.data.upgrades.RSRangeUpgrade || 0;
		return Config.wirelessTransmitter.baseRange + count * Config.wirelessTransmitter.rangePerUpgrade;
	},
	click: function (id, count, data, coords, player, extra) {
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		if (Entity.getSneaking(player)) return true;
		this.container.openFor(client, "main");
		this.refreshGui(true, client, false, "main");
		return true;
	},
	refreshGui: function (first, client, updateFilters, screen, updateCrafts) {
		screen = screen || 'grid';
		if (screen == 'main') {
			var _data = {
				screen: screen,
				redstone_mode: this.data.redstone_mode,
				rangeText: Translation.translate('Range') + ': ' + this.getRange() + ' ' + Translation.translate('block(s)')
			};
			if (client) this.container.sendEvent(client, "openGui", _data);
			else this.container.sendEvent("openGui", _data);
			return;
		}
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
	getScreenByName: function (screenName) {
		if (screenName == 'grid') return gridGUI;
		if (screenName == 'monitor') return craftingMonitorGUI;
		if (screenName == 'craftingGrid') return craftingGridGUI;
		return transmitterConfigGUI;
	},
	onWindowOpen: function (container, client) {
		var uid = client.getPlayerUid();
		var screen = (this.data.openedScreens && this.data.openedScreens[uid]) || 'grid';
		if (screen == 'monitor') {
			if (getNetworkInfo(this)) {
				RSNetworks[this.data.NETWORK_ID].info.addMonitorListener(this._monitorListener);
			}
			if (InnerCore_pack.packVersionCode >= 119) this.refreshGui(true, client, false, 'monitor');
			return;
		}
		if (InnerCore_pack.packVersionCode >= 119) this.refreshGui(true, client, false, screen);
		if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var coords_id = this.coords_id();
		RSNetworks[this.data.NETWORK_ID][coords_id].isOpenedGrid = true;
		if (RSNetworks[this.data.NETWORK_ID].info.openedGrids.findIndex(function (element) { return cts(element) == coords_id }) == -1) RSNetworks[this.data.NETWORK_ID].info.openedGrids.push({ x: this.x, y: this.y, z: this.z });
	},
	onWindowClose: function (container, client) {
		var uid = client.getPlayerUid();
		var screen = (this.data.openedScreens && this.data.openedScreens[uid]) || 'grid';
		if (screen == 'monitor') {
			if (this.data.wirelessMonitorPlayers) delete this.data.wirelessMonitorPlayers[uid];
			var anyMonitor = false;
			if (this.data.wirelessMonitorPlayers) {
				for (var k in this.data.wirelessMonitorPlayers) { anyMonitor = true; break; }
			}
			if (!anyMonitor) {
				if (getNetworkInfo(this)) {
					RSNetworks[this.data.NETWORK_ID].info.removeMonitorListener(this._monitorListener);
				}
			}
			if (this.data.openedScreens) delete this.data.openedScreens[uid];
			return;
		}
		if (client && this.data.wirelessPlayers) delete this.data.wirelessPlayers[client.getPlayerUid()];
		if (this.data.wirelessCraftingGridPlayers) delete this.data.wirelessCraftingGridPlayers[uid];
		if (this.data.openedScreens) delete this.data.openedScreens[uid];
		if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var coords_id = this.coords_id();
		RSNetworks[this.data.NETWORK_ID][coords_id].isOpenedGrid = false;
		var iIndex;
		if ((iIndex = RSNetworks[this.data.NETWORK_ID].info.openedGrids.findIndex(function (element) { return cts(element) == coords_id })) != -1) RSNetworks[this.data.NETWORK_ID].info.openedGrids.splice(iIndex, 1);
	},
	post_init: function () {
		this.data.pushDeleteEvents = {};
		this.data.openedScreens = {};
		this.data.wirelessPlayers = {};
		this.data.wirelessMonitorPlayers = {};
		this.data.wirelessCraftingGridPlayers = {};
		this._monitorListener = makeMonitorListener(this, 'refreshMonitorPage', '_monitorChangedTaskId');
		this.container.setWorkbenchFieldPrefix('WB_craft_slot');
		recountUpgrades(this);
		for (var i = 0; i < 4; i++) {
			this.container.setSlotSavingEnabled("slot_upgrades" + i, true);
		}
	},
	post_update_network: function (net_id) {
		if (this.data.LAST_NETWORK_ID != 'f' && RSNetworks[this.data.LAST_NETWORK_ID]) {
			var oldInfo = RSNetworks[this.data.LAST_NETWORK_ID].info;
			if (oldInfo && oldInfo.removeMonitorListener) {
				oldInfo.removeMonitorListener(this._monitorListener);
			}
		}
		if (net_id != 'f' && RSNetworks[net_id]) {
			var newInfo = RSNetworks[net_id].info;
			var anyMonitor = false;
			if (this.data.wirelessMonitorPlayers) {
				for (var mk in this.data.wirelessMonitorPlayers) { anyMonitor = true; break; }
			}
			if (anyMonitor && newInfo && newInfo.addMonitorListener) {
				newInfo.addMonitorListener(this._monitorListener);
			}
		}
		this.data.controller_coords = searchController_net(this.data.NETWORK_ID);
		this.refreshGui(false, false, true);
	},
	post_destroy: function () {
		for (var i in this.container.slots) {
			if (i[0] >= '0' && i[0] <= '9') this.container.clearSlot(i);
		}
		if (this.data.LAST_NETWORK_ID != 'f' && RSNetworks[this.data.LAST_NETWORK_ID]) {
			var coords_id = this.coords_id();
			var info = RSNetworks[this.data.LAST_NETWORK_ID].info;
			if (info && info.removeMonitorListener) {
				info.removeMonitorListener(this._monitorListener);
			}
			var iIndex;
			if (info.openedGrids && (iIndex = info.openedGrids.findIndex(function (element) { return cts(element) == coords_id })) != -1) info.openedGrids.splice(iIndex, 1);
		}
	},
	client: Object.assign({}, gridClient, {
		ticks: 0,
		tick: function () {
			this.ticks++;
			if (this.networkData.getBoolean('update', false)) {
				this.updateCrafts = true;
				this.networkData.putBoolean('update', false);
				var pushDeleteEvents = buildPushDeleteEvents(this.networkData);
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents});
			}
			if (this.updateCrafts && this.ticks % 20 == 0) {
				this.updateCrafts = false;
				craftingGridData.updateGui(true, false, true);
			}
		},
		load: function () {
			if (this.pre_load) this.pre_load();
			this.refreshModel();
			if (this.post_load) this.post_load();
		},
		unload: function () {
			if (this.pre_unload) this.pre_unload();
			BlockRenderer.unmapAtCoords(this.x, this.y, this.z);
			if (this.post_unload) this.post_unload();
		},
		refreshModel: function () {
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, getTransmitterModel(this.networkData.getBoolean('isActive')));
		},
		events: {
			refreshModel: function (eventData, packetExtra) {
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, getTransmitterModel(eventData.isActive));
			}
		},
		containerEvents: {
			reselectRecipe: function (container, window, content, eventData) {
				if (craftingGridData.selectedRecipe && craftingGridData.selectedRecipe.javaRecipe) {
					craftingGridFuncs.selectRecipe(craftingGridData.selectedRecipe.javaRecipe, container, craftingGridData.originalOnlyItemsExtraMap, craftingGridData.originalOnlyItemsMap, craftingGridData.originalItemsMap);
				}
			},
			openGui: function (container, window, content, eventData) {
				if (!content || !window || !window.isOpened()) return;
				if (eventData.screen == 'main') {
					if (!content.elements["range_text"]) return;
					content.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
					content.elements["range_text"].text = eventData.rangeText || '0';
					window.getWindow('main').forceRefresh();
					return;
				}
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
			},
			openCraftPreview: function (container, window, content, eventData) {
				openCraftPreview(container, eventData);
			}
		}
	})
});
