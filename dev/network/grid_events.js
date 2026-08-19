var GridEvents = {
	craftPreview: function(tile, eventData, connectedClient) {
		if(!eventData.item || !eventData.count || tile.data.NETWORK_ID == 'f') return;
		var net = RSNetworks[tile.data.NETWORK_ID];
		if (!net || !net.info) return;
		var info = net.info;
		var sourceKey = connectedClient ? connectedClient.getPlayerUid() : 'unknown';
		var now = World.getThreadTime();
		if (info.isRequestThrottled(sourceKey, now)) return;
		var constructedCraft = info.constructCraft(eventData.item, eventData.count, true);
		if (!constructedCraft || !constructedCraft.craftable) info.markRequestFailed(sourceKey, now);
		if(constructedCraft){
			var craftsData = constructedCraft.crafts ? constructedCraft.crafts.map(function(c){ return {completedIngridients: c.completedIngridients, result: c.result, craftable: c.craftable}; }) : [];
			var planData = constructedCraft.plan ? {toTake: constructedCraft.plan.toTake || {}, toCraft: constructedCraft.plan.toCraft || {}, missing: constructedCraft.plan.missing || {}} : null;
			tile.container.sendEvent(connectedClient, "openCraftPreview", {results: constructedCraft.results, ingridients: constructedCraft.ingridients, craftable: constructedCraft.craftable, crafts: craftsData, plan: planData, errorType: constructedCraft.errorType || null});
		}
	},

	provideConstructedCraft: function(tile, eventData, connectedClient) {
		if(!eventData.item || !eventData.count || tile.data.NETWORK_ID == 'f') return;
		var net = RSNetworks[tile.data.NETWORK_ID];
		if (!net || !net.info) return;
		var info = net.info;
		var sourceKey = connectedClient ? connectedClient.getPlayerUid() : 'unknown';
		var now = World.getThreadTime();
		if (info.isRequestThrottled(sourceKey, now)) return;
		var constructedCraft = info.constructCraft(eventData.item, eventData.count);
		if(constructedCraft && constructedCraft.deduped) return;
		if(constructedCraft && constructedCraft.craftable){
			var task = info.provideCraft(constructedCraft);
			tile.items();
			tile.refreshGui(false, false, true);
			_RS._emit("wirelessGridAction", {netId: tile.data.NETWORK_ID, playerUid: sourceKey, kind: 'autocraft', count: task ? task.requestedCount : eventData.count, source: isWirelessSourceTile(tile) ? 'wireless' : 'block'});
		} else {
			info.markRequestFailed(sourceKey, now);
		}
	},

	updateFilter: function(tile) {
		if(tile.data.sort == undefined) tile.data.sort = 0;
		tile.data.sort = tile.data.sort >= 2 ? 0 : tile.data.sort + 1;
		tile.refreshGui(false, false, true);
	},

	updateReverseFilter: function(tile) {
		tile.data.reverse_filter = !tile.data.reverse_filter;
		tile.refreshGui(false, false, true);
	},

	processPushDeleteEvents: function(tile, onEventHandled) {
		for(var p in tile.data.pushDeleteEvents){
			var events = tile.data.pushDeleteEvents[p];
			var player = null;
			var needRefresh = false;
			var fullRefresh = false;
			for(var slotKey in events){
				var event = events[slotKey];
				if(!event) {
					delete events[slotKey];
					continue;
				}
				if(!player) player = new PlayerActor(Number(p));
				if(event.type == 'push'){
					var item = player.getInventorySlot(event.slot);
					if(item.id == 0) {
						delete events[slotKey];
						continue;
					}
					var count = Math.min(event.count, item.count);
					var pushed = tile.pushItem(item, count, true);
					if(pushed < count){
						player.setInventorySlot(event.slot, item.id, item.count - (count - pushed), item.data, item.extra);
					}
					var _index;
					if((_index = tile.originalItemsMap().indexOf(getItemUid(item))) != -1)tile.container.markSlotDirty(_index+'slot');
					needRefresh = true;
					if(item.count <= count || event.updateFull) fullRefresh = true;
					if(onEventHandled)onEventHandled(Number(p), 'push');
					delete events[slotKey];
				}
				if(event.type == 'delete'){
					var item = tile.container.getSlot(slotKey);
					var itemMaxStack = Item.getMaxStack(item.id);
					var this_item = searchItem(item.id, item.data, item.extra, false, true, p);
					var count = this_item && this_item.count < itemMaxStack ? Math.min(event.count, item.count, itemMaxStack - this_item.count) : Math.min(event.count, item.count);
					var res;
					if((res = tile.deleteItem(item, count, true)) < count) {
						var _extra = (this_item ? this_item.extra : item.extra);
						player.addItemToInventory(item.id, count - res, item.data, _extra || null, true);
						needRefresh = true;
						if(item.count <= count || event.updateFull) fullRefresh = true;
					}
					if(onEventHandled)onEventHandled(Number(p), 'delete');
					delete events[slotKey];
				}
			}
			if(needRefresh){
				tile.items();
				tile.refreshGui(false, false, fullRefresh);
			}
			delete tile.data.pushDeleteEvents[p];
		}
	}
};
