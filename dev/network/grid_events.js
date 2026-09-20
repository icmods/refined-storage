var GridEvents = {
	// CS-B02: two packets from the same player before the server tick must NOT
	// overwrite each other. Same key+type: counts add, updateFull ORs; unsafe or
	// inherited keys are skipped.
	mergePushDeleteEvents: function(target, incoming) {
		if(!incoming) return target || {};
		if(!target) target = {};
		for(var key in incoming){
			if(!Object.prototype.hasOwnProperty.call(incoming, key)) continue;
			if(key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
			var ev = incoming[key];
			if(!ev) continue;
			var existing = target[key];
			if(existing && existing.type === ev.type){
				existing.count = (existing.count || 0) + (ev.count || 0);
				if(ev.updateFull) existing.updateFull = true;
			} else {
				target[key] = { type: ev.type, count: ev.count || 0, slot: ev.slot, slotKey: ev.slotKey, updateFull: !!ev.updateFull };
			}
		}
		return target;
	},

	maxConstructCount: function() {
		if (typeof Config !== 'undefined' && Config.craftingMaxRequestCount > 0) return Math.floor(Config.craftingMaxRequestCount);
		return 64;
	},

	validatedCraftCount: function(eventData) {
		if(!eventData || !eventData.item || typeof eventData.item.id !== 'number' || eventData.item.id < 0) return 0;
		var count = Math.floor(Number(eventData.count));
		if(!isFinite(count) || count <= 0) return 0;
		var maxCount = GridEvents.maxConstructCount();
		return count > maxCount ? maxCount : count;
	},

	craftPreview: function(tile, eventData, connectedClient) {
		if(!MpCore.isWatching(tile, connectedClient)) return;
		if(tile.data.NETWORK_ID == 'f') return;
		var count = GridEvents.validatedCraftCount(eventData);
		if(!count) return;
		var net = RSNetworks[tile.data.NETWORK_ID];
		if (!net || !net.info) return;
		var info = net.info;
		var sourceKey = connectedClient ? connectedClient.getPlayerUid() : 'unknown';
		var now = TickScheduler.global.ticks;
		if (info.isRequestThrottled(sourceKey, now)) return;
		var constructedCraft = info.constructCraft(eventData.item, count, true);
		if (!constructedCraft || !constructedCraft.craftable) info.markRequestFailed(sourceKey, now);
		if(constructedCraft){
			var craftsData = constructedCraft.crafts ? constructedCraft.crafts.map(function(c){ return {completedIngridients: c.completedIngridients, result: c.result, craftable: c.craftable}; }) : [];
			var planData = constructedCraft.plan ? {toTake: constructedCraft.plan.toTake || {}, toCraft: constructedCraft.plan.toCraft || {}, missing: constructedCraft.plan.missing || {}} : null;
			tile.container.sendEvent(connectedClient, "openCraftPreview", {results: constructedCraft.results, ingridients: constructedCraft.ingridients, craftable: constructedCraft.craftable, crafts: craftsData, plan: planData, errorType: constructedCraft.errorType || null});
		}
	},

	provideConstructedCraft: function(tile, eventData, connectedClient) {
		if(!MpCore.isWatching(tile, connectedClient)) return;
		if(tile.data.NETWORK_ID == 'f') return;
		var count = GridEvents.validatedCraftCount(eventData);
		if(!count) return;
		var net = RSNetworks[tile.data.NETWORK_ID];
		if (!net || !net.info) return;
		var info = net.info;
		var sourceKey = connectedClient ? connectedClient.getPlayerUid() : 'unknown';
		var now = TickScheduler.global.ticks;
		if (info.isRequestThrottled(sourceKey, now)) return;
		var constructedCraft = info.constructCraft(eventData.item, count);
		if(constructedCraft && constructedCraft.deduped) return;
		if(constructedCraft && constructedCraft.craftable){
			var task = info.provideCraft(constructedCraft);
			tile.items();
			tile.refreshGui(false, false, true);
			_RS._emit("wirelessGridAction", {netId: tile.data.NETWORK_ID, playerUid: sourceKey, kind: 'autocraft', count: task ? task.requestedCount : count, source: isWirelessSourceTile(tile) ? 'wireless' : 'block'});
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
		ContainerSync.processEvents(tile.data.pushDeleteEvents, {
			push: function(item, count) { return tile.pushItem(item, count, true); },
			remove: function(item, count) { return tile.deleteItem(item, count, true); },
			getSlot: function(slotKey) { return tile.container.getSlot(slotKey); },
			onPushed: function(item, pushed) {
				var _index;
				if((_index = tile.originalItemsMap().indexOf(getItemUid(item))) != -1)tile.container.markSlotDirty(_index+'slot');
			},
			onLeftover: function(playerUid, leftover, items) {
				// Return leftover items to the player's inventory instead of dropping them.
				if(items && items.length){
					var player = new PlayerActor(playerUid);
					if(player && player.addItemToInventory){
						for(var i = 0; i < items.length; i++){
							var it = items[i];
							player.addItemToInventory(it.id, it.count, it.data, it.extra || null, true);
						}
					}
				}
			},
			onHandled: function(playerUid, kind) {
				if(onEventHandled)onEventHandled(playerUid, kind);
			},
			onChanged: function(playerUid, fullUpdate) {
				tile.items();
				tile.refreshGui(false, false, fullUpdate);
			},
			onInvalid: function(record) {
				if (Config.dev) Logger.Log('[CS] rejected ' + record.reason + ' type=' + record.type + ' slot=' + record.slotKey + ' count=' + record.count, 'RefinedStorageDebug');
			}
		});

	}
};
