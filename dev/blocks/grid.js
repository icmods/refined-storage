

const _gridTexture = [
	["disk_drive_bottom", 0], // bottom
	["grid_top", 0], // top
	["grid_back", 0], // back
	["grid_front", 0], // front
	["grid_left", 0], // left
	["grid_right", 0]  // right
];

function getGridTexture(variation, _active){
	return getRotatableTexture(_gridTexture, variation, _active);
}

IDRegistry.genBlockID("RS_grid");
Block.createBlockWithRotation("RS_grid", [
	{
		name: "Grid",
		texture: getGridTexture(),
		inCreative: true
	}
]);
RS_blocks.push(BlockID['RS_grid']);
EnergyUse[BlockID['RS_grid']] = Config.energy_uses.grid;

for (var izxc = 0; izxc < 4; izxc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getGridTexture(izxc));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_grid"], izxc, render);
}

var filter_size_map = [24, 36, 32];//6,9,8  *4

var gridData = {
	maxY: 0,
	lastPage: -1,
	textSearch: false,
	lowPriority: false,
	slotsKeys: [],
	updateGui: function(){}
}

function gridSwitchPage(page, container, ignore, dontMoveSlider){
	var window_ = getClientGuiWindow(container, 'main');
	if(!window_ || typeof window_.isOpened != 'function' || !window_.isOpened()) return false;
	var content = typeof window_.getContent == 'function' ? window_.getContent() : null;
	if(!content || !content.elements) return false;
	var slots = container.slots;
	var slotsKeys = gridData.slotsKeys;
	var slots_count = gridData.slots_count;
	var x_count = gridData.x_count;
	var pages1 = gridFuncs.getPages(slotsKeys.length);
	var pages = Math.max(1, pages1 + 1 - gridData.y_count);
	page = Math.max(1, Math.min(page, pages)) - 1;
	if(page == gridData.lastPage - 1 && !ignore) return false;
	gridData.lastPage = page + 1;
	var pages = gridFuncs.getPages(slotsKeys.length);
	var ___y = gridFuncs.getCoordsFromPage(page + 1, pages);
	if(!dontMoveSlider)container.getUiAdapter().getElement("slider_button").setPosition(_elementsGUI_grid['slider_button'].x, ___y);
	if (!gridData.isWorkAllowed) {
		for (var i = 0; i < slots_count; i++) {
			container.setSlot("slot" + i, 0, 0, 0, null);
			container.setText("slot" + i, "0");
		}
		return false;
	}
	var elements_ = window_.getElements ? window_.getElements() : content.elements;
	for (var i = page * x_count; i < page * x_count + slots_count; i++) {
		var a = i - (page * x_count);
		var item = slots[slotsKeys[i]] || { id: 0, data: 0, count: 0, extra: null };
		container.markSlotDirty("slot" + a);
		if(elements_.get) elements_.get("slot" + a).setBinding('text', (!item.count ? 'Craft' : cutNumber(item.count, true) + ""));
		else if(elements_["slot" + a] && elements_["slot" + a].setBinding) elements_["slot" + a].setBinding('text', (!item.count ? 'Craft' : cutNumber(item.count, true) + ""));
		container.setSlot("slot" + a, item.id, item.count, item.data, item.extra || null);
	}
	return true;
}
var _gridSwitchPage__ = gridSwitchPage;

var _elementsGUI_grid = {};

var gridGUI = new UI.StandartWindow({
	standart: {
		header: {
			text: {
				text: Translation.translate("Grid")
			}
		},
		inventory: {
			padding: 20,
			width: 300 / 4 * 3
		},
		background: {
			standart: true
		}
	},

	drawing: [],

	elements: _elementsGUI_grid
});
GUIs.push(gridGUI);

var gridConsPercents = 50/(575.5 - 60);
grid_set_elements(315, 70, gridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_grid, gridData, gridGUI, null, gridFuncs);
gridGUI.getWindow('main').forceRefresh();

testButtons(gridGUI.getWindow('header').getContent().elements, function(){
	grid_set_elements(315, 70, gridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_grid, gridData, null, null, gridFuncs);
});

var inv_elements = gridGUI.getWindow('inventory').getContent();
inv_elements.elements["_CLICKFRAME_"] = {
	type: "frame",
	x: 0,
	y: 0,
	z: -100,
	width: 1000,
	height: 251*9,
	bitmap: "empty",
	scale: 1,
	onTouchEvent: createInventoryPushHandler(gridData)
}

var gridFuncs = makePageHelpers(_elementsGUI_grid, {countX: "x_count", countY: "y_count", maxY: "max_y", slider: "slider_button"});

function gridOpenGui(container, window, content, eventData){
	if(!content || !window || !window.isOpened()) return;
	eventData.disksStorage = Number(eventData.disksStorage);
	Object.assign(gridData, eventData);
	gridData.updateGui = function(refresh, updateFilters, nonlocal){
		delete container.slots.bindings;
		delete container.slots.slots;
		var synced = SyncedNetworkData.getClientSyncedData(eventData.name);
		if (!synced) return;
		gridData.networkData = synced;
		if(updateFilters || refresh){
			var _slotKeys = [];
			for(var i in container.slots)if(i[0] >= 0 && container.slots[i].id != 0)_slotKeys.push(i);
			gridData.slotsKeys = _slotKeys;
			if(!refresh)gridData.textSearch = false;
			var millis = 0;
			if(Config.dev)millis = java.lang.System.currentTimeMillis();
			gridData.slotsKeys = RefinedStorage.sortItems(eventData.sort, eventData.reverse_filter, gridData.textSearch || null, container, gridData.slotsKeys);
			if(gridData.selectedItemInfoSlot)gridData.setItemInfoSlot(gridData.selectedItemInfoSlot, container);
		}
		content.elements["image_filter"].bitmap = 'RS_filter' + (eventData.sort + 1);
		content.elements["image_filter"].x = content.elements["filter_button"].x + (content.elements["filter_button"].scale * 20 - filter_size_map[eventData.sort]) / 2;
		if (eventData.reverse_filter) {
			content.elements["image_reverse_filter"].bitmap = 'RS_arrow_up';
		} else {
			content.elements["image_reverse_filter"].bitmap = 'RS_arrow_down';
		}
		content.elements["search_text"].text = gridData.textSearch ? gridData.textSearch : Translation.translate('Search');
		content.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
		var slots_count = content.elements.slots_count;
		content.elements["slider_button"].bitmap = gridData.slotsKeys.length <= gridData.slots_count ? 'slider_buttonOff' : 'slider_buttonOn';
		if (!eventData.isWorkAllowed) {
			for (var i = 0; i < slots_count; i++) {
				content.elements['slot' + i].bitmap = 'classic_darken_slot';
			}
			content.elements["slider_button"].bitmap = 'slider_buttonOff';
		} else if (content.elements['slot0'].bitmap == 'classic_darken_slot') {
			for (var i = 0; i < slots_count; i++) {
				content.elements['slot' + i].bitmap = 'classic_slot';
			}
		}
		gridSwitchPage(refresh ? gridData.lastPage : 1, container, true);
	}
	if(gridData.lowPriority){
		gridData.lowPriority = false;
		scheduleLowPrioritySort(function(){
			gridData.updateGui(eventData.refresh, eventData.updateFilters, true);
		});
	} else {
		gridData.updateGui(eventData.refresh, eventData.updateFilters, true);
	}
}

function buildGridPayload(tile, first, updateFilters){
	return {
		name: tile.networkData.getName() + '',
		isActive: tile.data.isActive,
		NETWORK_ID: tile.data.NETWORK_ID,
		redstone_mode: tile.data.redstone_mode,
		sort: tile.data.sort,
		reverse_filter: tile.data.reverse_filter,
		refresh: !first,
		updateFilters: first || updateFilters,
		disksStorage: tile.getDisksStorage() + "",
		disksStored: tile.getDisksStored(),
		isWorkAllowed: tile.isWorkAllowed()
	};
}

RefinedStorage.createTile(BlockID.RS_grid, {
	defaultValues: {
		NETWORK_ID: 'f',
		LAST_NETWORK_ID: 0,
		block_data: 0,
		items: [],
		event: { x: 0, y: 0 },
		sort: 0,
		sort_map: ['count', 'name', 'id'],
		reverse_filter: false,
		controller_coords: { x: 0, y: 0, z: 0 },
		textSearch: false,
		pushDeleteEvents: {},
		fullRefreshPage: false
	},
	unsaveableSlots: true,
	useNetworkItemContainer: true,
	setActiveNotUpdateGui: true,
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.items();
		this.container.openFor(client, "main");
		if(InnerCore_pack.packVersionCode < 119)this.refreshGui(true, client); 
		return true;
	},
	onWindowClose: function(){
		if(this.data.NETWORK_ID == 'f') return;
		var coords_id = this.coords_id();
		RSNetworks[this.data.NETWORK_ID][coords_id].isOpenedGrid = false;
		var iIndex;
		if((iIndex = RSNetworks[this.data.NETWORK_ID].info.openedGrids.findIndex(function(element){return cts(element) == coords_id})) != -1) RSNetworks[this.data.NETWORK_ID].info.openedGrids.splice(iIndex, 1);
	},
	onWindowOpen: function(container, client){
		if(InnerCore_pack.packVersionCode >= 119)this.refreshGui(true, client); 
		if(this.data.NETWORK_ID == 'f') return;
		var coords_id = this.coords_id();
		RSNetworks[this.data.NETWORK_ID][coords_id].isOpenedGrid = true;
		if(RSNetworks[this.data.NETWORK_ID].info.openedGrids.findIndex(function(element){return cts(element) == coords_id}) == -1) RSNetworks[this.data.NETWORK_ID].info.openedGrids.push({x: this.x, y: this.y, z: this.z});
	},
	pre_init: function(){
		this.container.setGlobalGetTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player){
				return 0;
			}
		})
		this.container.setGlobalAddTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player){
				if(slot[0] >= '0' && slot[0] <= '9') return count;
				return 0;
			}
		})
	},
	post_init: function(){
		this.data.pushDeleteEvents = {};
	},
	tick: function () {
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			if(this.data.refreshCurPage){
				this.items();
				this.refreshGui(false, false, this.data.fullRefreshPage);
				this.data.refreshCurPage = false;
				this.data.fullRefreshPage = false;
			}
		}
		GridEvents.processPushDeleteEvents(this);
	},
	post_update_network: function () {
		this.data.controller_coords = searchController_net(this.data.NETWORK_ID);
		this.refreshGui(false, false, true);
	},
	post_setActive: function(){
		this.items();
		this.refreshGui(false, false, true, true);
	},
	originalCrafts: function(){
		if (!this.isWorkAllowed()) return {};
		var info = RSNetworks[this.data.NETWORK_ID].info;
		var items = this.originalItems();
		var itemMap = {};
		for(var i = 0; i < items.length; i++) itemMap[items[i].id + '_' + items[i].data] = true;
		var crafts = {};
		for(var uid in info.crafts){
			if(!itemMap[uid]){
				var parts = uid.split('_');
				crafts[uid] = {id: parseInt(parts[0]), data: parseInt(parts[1]), count: 0};
			}
		}
		return crafts;
	},
	items: function (forced) {
		if (!this.isWorkAllowed()) {
			return [];
		}
		var items = this.originalItems().slice();
		var allSlots = Object.keys(this.container.slots);
		for (var ci = 0; ci < allSlots.length; ci++) {
			if (allSlots[ci][0] >= '0' && allSlots[ci][0] <= '9') this.container.setSlot(allSlots[ci], 0, 0, 0);
		}
		var crafts = this.originalCrafts();
		var craftsPush = Object.keys(crafts);
		var craftSlots = [];
		for(var i = 0; i < items.length; i++){
			this.container.setSlot(i+'slot', items[i].id, items[i].count, items[i].data, items[i].extra || null);
			var uid1 = items[i].id + '_' + items[i].data;
			if(crafts[uid1]) craftsPush.splice(craftsPush.indexOf(uid1), 1);
			else if(crafts[items[i].id + '_-1']) craftsPush.splice(craftsPush.indexOf(items[i].id + '_-1'), 1);
			craftSlots.push(i+'slot');
		}
		for(var k in craftsPush){
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
	originalItems: function(){
		if (!this.isWorkAllowed()) {
			return [];
		}
		return RSNetworks[this.data.NETWORK_ID].info.items;
	},
	originalItemsMap: function(){
		if (!this.isWorkAllowed()) {
			return [];
		}
		return RSNetworks[this.data.NETWORK_ID].info.items_map;
	},
	originalOnlyItemsMap: function(){
		if (!this.isWorkAllowed()) {
			return {};
		}
		return RSNetworks[this.data.NETWORK_ID].info.just_items_map;
	},
	originalOnlyItemsExtraMap: function(){
		if (!this.isWorkAllowed()) {
			return {};
		}
		return RSNetworks[this.data.NETWORK_ID].info.just_items_map_extra;
	},
	getDisksStorage: function(){
		if (!this.isWorkAllowed()) {
			return 0;
		}
		return RSNetworks[this.data.NETWORK_ID].info.storage;
	},
	getDisksStored: function(){
		if (!this.isWorkAllowed()) {
			return 0;
		}
		return RSNetworks[this.data.NETWORK_ID].info.stored;
	},
	pushItem: function (item, count, nonUpdate) {
		count = count || item.count;
		if (!this.isWorkAllowed()) return count;
		var res = RSNetworks[this.data.NETWORK_ID].info.pushItem(item, count, nonUpdate);
		if(this.post_pushItem)this.post_pushItem(item, count, res);
		return res;
	},
	deleteItem: function (item, count, nonUpdate) {
		count = count || item.count;
		if (!this.isWorkAllowed()) return count;
		var res = RSNetworks[this.data.NETWORK_ID].info.deleteItem(item, count, nonUpdate);
		if(this.post_deleteItem)this.post_deleteItem(item, count, res);
		return res;
	},
	post_destroy: function () {
		for(var i in this.container.slots){
			this.container.clearSlot(i);
		}
	},
	refreshModel: function(){
		if(!this.networkEntity) return Logger.Log(Item.getName(this.blockInfo.id, this.blockInfo.data) + ' model on: ' + cts(this) + ' cannot be displayed');
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z, dimension: this.dimension}});
	},
	refreshGui: function(first, client, updateFilters){
		var _data = buildGridPayload(this, first, updateFilters);
		if(client){
			this.container.sendEvent(client, "openGui", _data);
		} else {
			this.container.sendEvent("openGui", _data);
		}
	},
	getScreenByName: function(screenName) {
		if(screenName == 'main')return gridGUI;
	},
	client: {
		refreshModel: function(){
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getGridTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		tick: function(){
			if(this.networkData.getBoolean('update', false)){
				this.networkData.putBoolean('update', false);
				var pushDeleteEvents = buildPushDeleteEvents(this.networkData);
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents})
			}
		},
		events: {
			refreshModel: function(eventData, packetExtra) {
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getGridTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			openGui: function(container, window, content, eventData){
				gridOpenGui(container, window, content, eventData);
			},
			openCraftPreview: function(container, window, content, eventData){
				openCraftPreview(container, eventData);
			}
		}
	},
	containerEvents: {
		updateFilter: function(eventData, connectedClient) {
			GridEvents.updateFilter(this);
		},
		updateReverseFilter: function(eventData, connectedClient) {
			GridEvents.updateReverseFilter(this);
		},
		craftPreview: function(eventData, connectedClient){
			GridEvents.craftPreview(this, eventData, connectedClient);
		},
		provideConstructedCraft: function(eventData, connectedClient){
			GridEvents.provideConstructedCraft(this, eventData, connectedClient);
		}
	},
	events: {
		pushDeleteEvents: function(packetData, packetExtra, connectedClient) {
			this.data.pushDeleteEvents[connectedClient.getPlayerUid()] = packetData.pushDeleteEvents;
		}
	}
})
