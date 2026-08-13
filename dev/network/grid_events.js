var GridEvents = {
	craftPreview: function(tile, eventData, connectedClient) {
		if(!eventData.item || !eventData.count || tile.data.NETWORK_ID == 'f') return;
		var constructedCraft = RSNetworks[tile.data.NETWORK_ID].info.constructCraft(eventData.item, eventData.count);
		if(constructedCraft){
			var craftsData = constructedCraft.crafts ? constructedCraft.crafts.map(function(c){ return {completedIngridients: c.completedIngridients, result: c.result, craftable: c.craftable}; }) : [];
			tile.container.sendEvent(connectedClient, "openCraftPreview", {results: constructedCraft.results, ingridients: constructedCraft.ingridients, craftable: constructedCraft.craftable, crafts: craftsData, errorType: constructedCraft.errorType || null});
		}
	},

	provideConstructedCraft: function(tile, eventData, connectedClient) {
		if(!eventData.item || !eventData.count || tile.data.NETWORK_ID == 'f') return;
		var constructedCraft = RSNetworks[tile.data.NETWORK_ID].info.constructCraft(eventData.item, eventData.count);
		if(constructedCraft && constructedCraft.craftable){
			RSNetworks[tile.data.NETWORK_ID].info.provideCraft(constructedCraft);
			tile.items();
			tile.refreshGui(false, false, true);
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

	processPushDeleteEvents: function(tile) {
		for(var p in tile.data.pushDeleteEvents){
			var player = new PlayerActor(Number(p));
			for(var i in tile.data.pushDeleteEvents[p]){
				var event = tile.data.pushDeleteEvents[p][i];
				if(!event) {
					delete tile.data.pushDeleteEvents[p][i];
					continue;
				}
				if(event.type == 'push'){
					var item = player.getInventorySlot(event.slot);
					if(item.id == 0) continue;
					var count = Math.min(event.count, item.count);
					var pushed = tile.pushItem(item, count, true);
					if(pushed < count){
						player.setInventorySlot(event.slot, item.id, item.count - (count - pushed), item.data, item.extra);
					}
					var _index;
					if((_index = tile.originalItemsMap().indexOf(getItemUid(item))) != -1)tile.container.markSlotDirty(_index+'slot');
					tile.items();
					tile.refreshGui(false, false, item.count <= count || event.updateFull);
					delete tile.data.pushDeleteEvents[p][i];
				}
				if(event.type == 'delete'){
					var item = tile.container.getSlot(i);
					var itemMaxStack = Item.getMaxStack(item.id);
					var this_item = searchItem(item.id, item.data, item.extra, false, true, p);
					var count = this_item && this_item.count < itemMaxStack ? Math.min(event.count, item.count, itemMaxStack - this_item.count) : Math.min(event.count, item.count);
					var res;
					if((res = tile.deleteItem(item, count, true)) < count) {
						var _extra = (this_item ? this_item.extra : item.extra);
						player.addItemToInventory(item.id, count - res, item.data, _extra || null, true);
						tile.items();
						tile.refreshGui(false, false, item.count <= count || event.updateFull);
					}
					delete tile.data.pushDeleteEvents[p][i];
				}
			}
			delete tile.data.pushDeleteEvents[p];
		}
	}
};
