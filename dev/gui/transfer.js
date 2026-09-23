
function buildPushDeleteEvents(networkData) {
	var out = {};
	var events = ContainerSync.buildEvents(networkData, out);
	return { events: events, requestNumber: out.requestNumber || 0 };
}

function createInventoryPushHandler(data) {
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
		var count = ContainerSync.clickCount(item, event.type == 'LONG_CLICK', data.disksStorage - data.disksStored);
			for(var i in data.slotsKeys){
				var _slotName = data.slotsKeys[i];
				var _slot = itemContainer.slots[_slotName];
				if(_slot && (_slot.id == 0 || (_slot.id == item.id && _slot.data == item.data && (item.extra === _slot.extra || (item.extra && _slot.extra && fullExtraToString(item.extra) == fullExtraToString(_slot.extra)))))){
					item.extra = _slot.extra;
					data.setItemInfoSlot(_slotName, itemContainer);
					if(data.sort == 0) updateFull = true;
					break
				}
			}
		ContainerSync.queuePush(data.networkData, slot_id, count, updateFull, { id: item.id, data: item.data, uid: getItemUid(item) });
		if(data.clientTile && data.clientTile.flushPendingTransfer) data.clientTile.flushPendingTransfer();
		}
	};
}
