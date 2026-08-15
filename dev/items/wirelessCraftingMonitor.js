IDRegistry.genItemID("RSwirelessCraftingMonitor");
Item.createItem("RSwirelessCraftingMonitor", "Wireless Crafting Monitor", {
	name: 'rs_wireless_crafting_monitor_disconnected'
}, {
	stack: 1
});

Item.registerNameOverrideFunction(ItemID.RSwirelessCraftingMonitor, function (item, name) {
	if (!item.extra) return name;
	if (RSItemName) {
		return name + "\n§7" + RSItemName.getItemStorageText(item);
	}
	return name + "\n§7Energy: " + item.extra.getInt('energy', 0) + '/' + Config.wirelessCraftingMonitor.capacity;
});

Item.registerIconOverrideFunction(ItemID.RSwirelessCraftingMonitor, function (item, isModUi) {
	if (item.extra && item.extra.getInt('controllerX', -1) != -1) {
		return { name: 'rs_wireless_crafting_monitor_connected', data: 0 };
	}
	return { name: 'rs_wireless_crafting_monitor_disconnected', data: 0 };
});

Callback.addCallback("PostLoaded", function () {
	var api = ModAPI.requireAPI("ICore");
	if (api && api.ChargeRegistry) {
		RSChargeRegistry = api.ChargeRegistry;
		RSItemName = api.ItemName;
		RSChargeRegistry.registerItem(ItemID.RSwirelessCraftingMonitor, "Eu", Config.wirelessCraftingMonitor.capacity, 128, 1, false, false);
		Item.addToCreative(ItemID.RSwirelessCraftingMonitor, 1, 27, new ItemExtraData().putInt('energy', 0));
	} else {
		Item.addToCreative(ItemID.RSwirelessCraftingMonitor, 1);
	}
});

var rsWirelessMonitorLastOpen = {};

function rsOpenWirelessCraftingMonitor(playerUid) {
	rsOpenWirelessTerminal({
		playerUid: playerUid,
		itemId: ItemID.RSwirelessCraftingMonitor,
		config: Config.wirelessCraftingMonitor,
		screen: 'monitor',
		sessionMap: 'wirelessMonitorPlayers',
		otherSessionMap: 'wirelessPlayers',
		throttle: rsWirelessMonitorLastOpen,
		noBindMsg: 'Wireless Crafting Monitor is not bound to a network.',
		noRangeMsg: 'There is no Wireless Transmitter in range.',
		noEnergyMsg: 'Wireless Crafting Monitor is out of energy.'
	});
}

Callback.addCallback("ItemUseServer", function (coords, item, block, playerUid) {
	if (item.id != ItemID.RSwirelessCraftingMonitor) return;
	rsBindWirelessItem(ItemID.RSwirelessCraftingMonitor, Config.wirelessCraftingMonitor.capacity, coords, playerUid, BlockSource.getDefaultForActor(playerUid));
});

function rsMonitorRequestOpen(player) {
	if (LowLevelUtils.getCurrentThreadType() == "SERVER") {
		rsOpenWirelessCraftingMonitor(player);
	} else if (LowLevelUtils.getCurrentThreadType() == "CLIENT") {
		Network.sendToServer("rsWirelessCraftingMonitorOpen", {});
	}
}

Item.registerNoTargetUseFunction("RSwirelessCraftingMonitor", function (item, player) {
	rsMonitorRequestOpen(player);
});

Item.setMaxUseDuration(ItemID.RSwirelessCraftingMonitor, 1);
Item.registerUsingCompleteFunction(ItemID.RSwirelessCraftingMonitor, function (item, player) {
	rsMonitorRequestOpen(player);
});

Callback.addCallback("PlayerAttack", function (attackerUid, victimUid) {
	if (victimUid) return;
	if (Entity.getCarriedItem(attackerUid).id == ItemID.RSwirelessCraftingMonitor) rsOpenWirelessCraftingMonitor(attackerUid);
});

Network.addServerPacket("rsWirelessCraftingMonitorOpen", function (client, data) {
	rsOpenWirelessCraftingMonitor(client.getPlayerUid());
});
