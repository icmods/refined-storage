IDRegistry.genItemID("RSwirelessGrid");
Item.createItem("RSwirelessGrid", "Wireless Grid", {
	name: 'rs_wireless_grid_disconnected'
}, {
	stack: 1
});
var RSChargeRegistry = null;
var RSItemName = null;

Item.registerNameOverrideFunction(ItemID.RSwirelessGrid, function (item, name) {
	if (!item.extra) return name;
	if (RSItemName) {
		return name + "\n§7" + RSItemName.getItemStorageText(item);
	}
	return name + "\n§7Energy: " + item.extra.getInt('energy', 0) + '/' + Config.wirelessGrid.capacity;
});

Item.registerIconOverrideFunction(ItemID.RSwirelessGrid, function (item, isModUi) {
	if (item.extra && item.extra.getInt('controllerX', -1) != -1) {
		return { name: 'rs_wireless_grid_connected', data: 0 };
	}
	return { name: 'rs_wireless_grid_disconnected', data: 0 };
});

Callback.addCallback("PostLoaded", function () {
	var api = ModAPI.requireAPI("ICore");
	if (api && api.ChargeRegistry) {
		RSChargeRegistry = api.ChargeRegistry;
		RSItemName = api.ItemName;
		RSChargeRegistry.registerItem(ItemID.RSwirelessGrid, "Eu", Config.wirelessGrid.capacity, 128, 1, false, false);
		Item.addToCreative(ItemID.RSwirelessGrid, 1, 27, new ItemExtraData().putInt('energy', 0));
	} else {
		Item.addToCreative(ItemID.RSwirelessGrid, 1);
	}
});

function rsFindNetworkByBinding(binding) {
	for (var netId = 0; netId < RSNetworks.length; netId++) {
		var net = RSNetworks[netId];
		if (!net) continue;
		var entry = net[cts(binding)];
		if (entry && entry.id == BlockID.RS_controller) return netId;
	}
	return -1;
}

function rsDrainWirelessItem(tile, playerUid, amount, itemId, capacity, sessionMap, outOfEnergyMsg, closedCallback) {
	var slotItem = searchItem(itemId, -1, -1, false, false, playerUid);
	if (!slotItem || !slotItem.extra) return;
	var extra = slotItem.extra;
	var energy = Math.max(extra.getInt('energy', 0) - amount, 0);
	extra.putInt('energy', energy);
	if (RSChargeRegistry) slotItem.data = RSChargeRegistry.getDisplayData(energy, capacity);
	new PlayerActor(playerUid).setInventorySlot(slotItem.slot, slotItem.id, slotItem.count, slotItem.data, extra);
	if (energy <= 0) {
		if (tile.data[sessionMap]) delete tile.data[sessionMap][playerUid];
		var client = Network.getClientForPlayer(playerUid);
		if (client) tile.container.closeFor(client);
		Game.message(Translation.translate(outOfEnergyMsg));
		if (closedCallback) closedCallback();
	}
}

function rsDrainWirelessGrid(tile, playerUid, amount) {
	rsDrainWirelessItem(tile, playerUid, amount, ItemID.RSwirelessGrid, Config.wirelessGrid.capacity, 'wirelessPlayers', 'Wireless Grid is out of energy.');
}

var rsWirelessGridLastOpen = {};

function isWirelessSourceTile(tile) {
	if (!tile || !tile.data) return false;
	if (tile.data.phantom) return true;
	if (tile.data.wirelessPlayers) { for (var uid in tile.data.wirelessPlayers) return true; }
	if (tile.data.wirelessCraftingGridPlayers) { for (var uid in tile.data.wirelessCraftingGridPlayers) return true; }
	if (tile.data.wirelessMonitorPlayers) { for (var uid in tile.data.wirelessMonitorPlayers) return true; }
	return false;
}

function rsGetTransmitterProperties(transmitter) {
	var properties = { range: Config.wirelessTransmitter.baseRange, infiniteRange: false, crossDimension: false };
	var upgrades = transmitter.upgrades || (transmitter.data && transmitter.data.upgrades) || {};
	for (var nameID in upgrades) {
		var count = upgrades[nameID] || 0;
		if (count <= 0) continue;
		var upgrade = UpgradeRegistry.get(nameID);
		if (!upgrade) continue;
		if (upgrade.rangeBonus) properties.range += upgrade.rangeBonus * count;
		if (upgrade.infiniteRange) properties.infiniteRange = true;
		if (upgrade.crossDimension) properties.crossDimension = true;
	}
	return properties;
}

function rsFindNearestTransmitter(playerUid, netId, crossDimension) {
	var transmitters = searchBlocksInNetwork(netId, BlockID.RS_wireless_transmitter);
	var playerPos = crossDimension ? null : Entity.getPosition(playerUid);
	var best = null;
	var bestDist = 0;
	for (var i = 0; i < transmitters.length; i++) {
		var transmitter = transmitters[i];
		if (!transmitter.isActive) continue;
		var properties = rsGetTransmitterProperties(transmitter);
		if (crossDimension) {
			if (!properties.crossDimension || best) continue;
			best = transmitter;
			continue;
		}
		var dist = Entity.getDistanceBetweenCoords(transmitter.coords, playerPos);
		if (!properties.infiniteRange && dist >= properties.range) continue;
		if (!best || dist < bestDist) {
			best = transmitter;
			bestDist = dist;
		}
	}
	return best;
}

function rsBindWirelessItem(itemId, capacity, coords, playerUid, blockSource) {
	var controllerCoords = searchController({ x: coords.x, y: coords.y, z: coords.z }, true, blockSource);
	if (!controllerCoords) return;
	var slotItem = searchItem(itemId, -1, -1, false, false, playerUid);
	if (!slotItem) return;
	var extra = slotItem.extra || new ItemExtraData();
	extra.putInt('controllerX', controllerCoords.x);
	extra.putInt('controllerY', controllerCoords.y);
	extra.putInt('controllerZ', controllerCoords.z);
	extra.putInt('dimension', blockSource.getDimension());
	if (extra.getInt('energy', -1) < 0) extra.putInt('energy', capacity);
	if (RSChargeRegistry) slotItem.data = RSChargeRegistry.getDisplayData(extra.getInt('energy'), capacity);
	new PlayerActor(playerUid).setInventorySlot(slotItem.slot, slotItem.id, slotItem.count, slotItem.data, extra);
	log(Translation.translate('Linked to') + ' ' + controllerCoords.x + ', ' + controllerCoords.y + ', ' + controllerCoords.z);
}

function rsOpenWirelessTerminal(cfg) {
	var playerUid = cfg.playerUid;
	var now = World.getThreadTime();
	if (cfg.throttle[playerUid] && now - cfg.throttle[playerUid] < 10) return;
	cfg.throttle[playerUid] = now;
	var slotItem = searchItem(cfg.itemId, -1, -1, false, false, playerUid);
	if (!slotItem || !slotItem.extra) return log(Translation.translate(cfg.noBindMsg));
	var extra = slotItem.extra;
	var binding = { x: extra.getInt('controllerX', -1), y: extra.getInt('controllerY', -1), z: extra.getInt('controllerZ', -1) };
	if (binding.x == -1) return log(Translation.translate(cfg.noBindMsg));
	var bindingDimension = extra.getInt('dimension', -1);
	var crossDimension = Entity.getDimension(playerUid) != bindingDimension;
	var netId = rsFindNetworkByBinding(binding);
	if (netId == -1 || !RSNetworks[netId] || !RSNetworks[netId].info) return log(Translation.translate(cfg.noBindMsg));
	var best = rsFindNearestTransmitter(playerUid, netId, crossDimension);
	if (!best) {
		var transmitterEntries = searchBlocksInNetwork(netId, BlockID.RS_wireless_transmitter);
		if (transmitterEntries.length === 0) return log(Translation.translate(cfg.noTransmitterMsg));
		var checkSource = crossDimension ? BlockSource.getDefaultForDimension(bindingDimension) : BlockSource.getDefaultForActor(playerUid);
		var hasLoadedActive = false;
		for (var ti = 0; ti < transmitterEntries.length; ti++) {
			var _t = transmitterEntries[ti];
			if (!_t.isActive) continue;
			var _tile = World.getTileEntity(_t.coords.x, _t.coords.y, _t.coords.z, checkSource);
			if (_tile) { hasLoadedActive = true; break; }
		}
		if (!hasLoadedActive) return log(Translation.translate(cfg.transmitterUnloadedMsg));
		return log(Translation.translate(cfg.noRangeMsg));
	}
	var energy = extra.getInt('energy', 0);
	if (energy <= cfg.config.openUsage) return log(Translation.translate(cfg.noEnergyMsg));
	var client = Network.getClientForPlayer(playerUid);
	if (!client) return;
	var phantom = null;
	var session = PhantomSessions.get(playerUid);
	if (session && session.tile && !session.tile.data.removed && session.netId == netId && TileEntity.isTileEntityLoaded(session.tile)) {
		phantom = session.tile;
		if (phantom.data.screen != cfg.screen) {
			if (phantom.data.screen == 'monitor' && phantom._monitorListener) {
				var oldNet = phantom.data.NETWORK_ID != 'f' ? RSNetworks[phantom.data.NETWORK_ID] : null;
				if (oldNet && oldNet.info) oldNet.info.removeMonitorListener(phantom._monitorListener);
			}
			phantom.data.screen = cfg.screen;
		}
	} else {
		if (session) PhantomSessions.remove(playerUid, session.tile);
		phantom = spawnPhantom(playerUid, netId, cfg.screen, BlockSource.getDefaultForActor(playerUid));
	}
	if (phantom) {
		if (!phantom.data.openedScreens) phantom.data.openedScreens = {};
		phantom.data.openedScreens[playerUid] = cfg.screen;
		phantom.data.wirelessConfig = cfg.config;
		phantom.data.wirelessSessionMap = cfg.sessionMap;
		phantom.data.wirelessItemId = cfg.itemId;
		if (phantom.data[cfg.otherSessionMap]) delete phantom.data[cfg.otherSessionMap][playerUid];
		if (cfg.screen != 'monitor') phantom.items();
		if (phantom.__initialized) {
			phantom.container.openFor(client, cfg.screen);
			phantom.refreshGui(true, client, false, cfg.screen);
		} else {
			phantom.data.pendingOpen = {screen: cfg.screen};
		}
		if (!phantom.data[cfg.sessionMap]) phantom.data[cfg.sessionMap] = {};
		phantom.data[cfg.sessionMap][playerUid] = true;
		extra.putInt('energy', energy - cfg.config.openUsage);
		if (RSChargeRegistry) slotItem.data = RSChargeRegistry.getDisplayData(energy - cfg.config.openUsage, cfg.config.capacity);
		new PlayerActor(playerUid).setInventorySlot(slotItem.slot, slotItem.id, slotItem.count, slotItem.data, extra);
		return;
	}
	var blockSource = crossDimension ? BlockSource.getDefaultForDimension(bindingDimension) : BlockSource.getDefaultForActor(playerUid);
	var tile = World.getTileEntity(best.coords.x, best.coords.y, best.coords.z, blockSource);
	if (!tile || !tile.container) return log(Translation.translate(cfg.noRangeMsg));
	if (!tile.data.openedScreens) tile.data.openedScreens = {};
	tile.data.openedScreens[playerUid] = cfg.screen;
	if (tile.data[cfg.otherSessionMap]) delete tile.data[cfg.otherSessionMap][playerUid];
	if (cfg.screen != 'monitor') tile.items();
	tile.container.openFor(client, cfg.screen);
	tile.refreshGui(true, client, false, cfg.screen);
	if (!tile.data[cfg.sessionMap]) tile.data[cfg.sessionMap] = {};
	tile.data[cfg.sessionMap][playerUid] = true;
	extra.putInt('energy', energy - cfg.config.openUsage);
	if (RSChargeRegistry) slotItem.data = RSChargeRegistry.getDisplayData(energy - cfg.config.openUsage, cfg.config.capacity);
	new PlayerActor(playerUid).setInventorySlot(slotItem.slot, slotItem.id, slotItem.count, slotItem.data, extra);
}

function rsOpenWirelessGrid(playerUid) {
	rsOpenWirelessTerminal({
		playerUid: playerUid,
		itemId: ItemID.RSwirelessGrid,
		config: Config.wirelessGrid,
		screen: 'grid',
		sessionMap: 'wirelessPlayers',
		otherSessionMap: 'wirelessMonitorPlayers',
		throttle: rsWirelessGridLastOpen,
		noBindMsg: 'Wireless Grid is not bound to a network.',
		noRangeMsg: 'There is no Wireless Transmitter in range.',
		noTransmitterMsg: 'There is no Wireless Transmitter in the network.',
		transmitterUnloadedMsg: 'The Wireless Transmitter is not loaded.',
		noEnergyMsg: 'Wireless Grid is out of energy.'
	});
}

Callback.addCallback("ItemUseServer", function (coords, item, block, playerUid) {
	if (item.id != ItemID.RSwirelessGrid) return;
	rsBindWirelessItem(ItemID.RSwirelessGrid, Config.wirelessGrid.capacity, coords, playerUid, BlockSource.getDefaultForActor(playerUid));
});

function rsRequestOpen(player) {
	if (LowLevelUtils.getCurrentThreadType() == "SERVER") {
		rsOpenWirelessGrid(player);
	} else if (LowLevelUtils.getCurrentThreadType() == "CLIENT") {
		Network.sendToServer("rsWirelessGridOpen", {});
	}
}

Item.registerNoTargetUseFunction("RSwirelessGrid", function (item, player) {
	rsRequestOpen(player);
});

Item.setMaxUseDuration(ItemID.RSwirelessGrid, 1);
Item.registerUsingCompleteFunction(ItemID.RSwirelessGrid, function (item, player) {
	rsRequestOpen(player);
});

Callback.addCallback("PlayerAttack", function (attackerUid, victimUid) {
	if (victimUid) return;
	if (Entity.getCarriedItem(attackerUid).id == ItemID.RSwirelessGrid) rsOpenWirelessGrid(attackerUid);
});

Network.addServerPacket("rsWirelessGridOpen", function (client, data) {
	rsOpenWirelessGrid(client.getPlayerUid());
});
