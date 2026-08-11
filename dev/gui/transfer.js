
function buildPushDeleteEvents(networkData) {
	var pushDeleteEvents = {};
	var asdgfasdasddsad;
	var map = (asdgfasdasddsad = networkData.getString('deleteItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
	for(var i in map){
		pushDeleteEvents[map[i]] = {
			type: 'delete',
			count: Number(networkData.getInt(map[i], 0)),
			updateFull: networkData.getBoolean('updateFull'+map[i], false)
		}
		networkData.putInt(map[i], 0);
	}
	networkData.putString('deleteItemsMap', 'null');
	var map = (asdgfasdasddsad = networkData.getString('pushItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
	for(var i in map){
		pushDeleteEvents[map[i]] = {
			type: 'push',
			count: Number(networkData.getInt(map[i], 0)),
			slot: map[i],
			updateFull: networkData.getBoolean('updateFull'+map[i], false)
		}
		networkData.putInt(map[i], 0);
	}
	networkData.putString('pushItemsMap', 'null');
	return pushDeleteEvents;
}

function createInventoryPushHandler(data) {
	var asdgfasdasddsad;
	return function(element, event){
		if(event.type == 'CLICK' || event.type == 'LONG_CLICK'){
			if (!data.isWorkAllowed) return;
			var itemContainerUiHandler = element.window.getContainer();
			var itemContainer = itemContainerUiHandler.getParent();
			var slot_id = Math.floor(event.x/251)+Math.floor(event.y/250)*4;
			var updateFull = false;
			var item = Player.getInventorySlot(slot_id);
			if(item.id == 0)return;
			if(data.disksStored >= data.disksStorage) return
			if(event.type == 'CLICK'){
				var count = 1;
			} else {
				var count = Math.min(Item.getMaxStack(item.id), data.disksStorage - data.disksStored, item.count);
			}
			if(Config.dev)Logger.Log('Grid local pushing item: ' + getItemUid(item) + ' ; count: ' + count + ' ; slot: ' + slot_id + " ; extra: " + fullExtraToString(item.extra), 'RefinedStorageDebug');
			var slotFounded = false;
			for(var i in data.slotsKeys){
				var _slotName = data.slotsKeys[i];
				var _slot = itemContainer.slots[_slotName];
				if(_slot && (_slot.id == 0 || (_slot.id == item.id && _slot.data == item.data && (item.extra == _slot.extra || (item.extra && _slot.extra && fullExtraToString(item.extra) == fullExtraToString(_slot.extra)))))){
					item.extra = _slot.extra;
					if(Config.dev)Logger.Log('Founded slot: ' + _slotName + ' : ' + JSON.stringify(_slot.asScriptable()), 'RefinedStorageDebug');
					slotFounded = true;
					itemContainer.setSlot(_slotName, item.id, _slot.count + count, item.data, item.extra || null);
					data.setItemInfoSlot(_slotName, itemContainer);
					if(data.sort == 0) updateFull = true;
					data.updateGui(true, updateFull);
					data.lowPriority = true;
					break
				}
			}
			if(!slotFounded){
				var _slotName = data.slotsKeys.length + 'slot';
				if(Config.dev)Logger.Log('Slot not founded, new slot name: ' + _slotName, 'RefinedStorageDebug');
				data.slotsKeys.push(_slotName);
				itemContainer.setSlot(_slotName, item.id, count, item.data, item.extra || null);
				data.setItemInfoSlot(_slotName, itemContainer);
				updateFull = true;
				data.updateGui(true, updateFull);
				data.lowPriority = true;
			}
			var map = (asdgfasdasddsad = data.networkData.getString('pushItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
			if(map.indexOf(slot_id) == -1){
				map.push(slot_id);
				data.networkData.putString('pushItemsMap', JSON.stringify(map));
			}
			var currentCount = data.networkData.getInt(slot_id, 0);
			data.networkData.putInt(slot_id, currentCount + count);
			data.networkData.putBoolean('update', true);
			data.networkData.putBoolean('updateFull'+slot_id, updateFull);
		}
	};
}
