

const _gridTexture = [
	["disk_drive_bottom", 0], // bottom
	["grid_top", 0], // top
	["grid_back", 0], // back
	["grid_front", 0], // front
	["grid_left", 0], // left
	["grid_right", 0]  // right
];

function getGridTexture(variation, _active){
	variation = variation || 0;
	var i = _active ? 1 : 0;
	return [[_gridTexture[0], [_gridTexture[1][0], 0], _gridTexture[2], [_gridTexture[3][0], i], _gridTexture[4], _gridTexture[5]], [_gridTexture[0], [_gridTexture[1][0], 1], [_gridTexture[3][0], i], _gridTexture[2], _gridTexture[5], _gridTexture[4]], [_gridTexture[0], [_gridTexture[1][0], 2], _gridTexture[5], _gridTexture[4], _gridTexture[2], [_gridTexture[3][0], i]], [_gridTexture[0], [_gridTexture[1][0], 3], _gridTexture[4], _gridTexture[5], [_gridTexture[3][0], i], _gridTexture[2]]][variation];
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
	if(Config.dev)Logger.Log('Switch grid Page; page: ' + page + ' ; ignore: ' + ignore + ' ; dontMoveSlider: ' + dontMoveSlider + ' ; container: ' + container, 'RefinedStorageDebug');
	if(!container.getUiAdapter() || !container.getUiAdapter().getWindow() || !container.getUiAdapter().getWindow().isOpened()) return false;
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
	var elements_ = container.getUiAdapter().getWindow().getWindow('main').getElements();
	for (var i = page * x_count; i < page * x_count + slots_count; i++) {
		var a = i - (page * x_count);
		var item = slots[slotsKeys[i]] || { id: 0, data: 0, count: 0, extra: null };
		//container.markSlotDirty("slot" + a);
		container.markSlotDirty("slot" + a);
		elements_.get("slot" + a).setBinding('text', cutNumber(item.count, true) + "");
		//container.setText("slot" + a, cutNumber(item.count));
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
grid_set_elements(315, 70, gridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_grid, gridData, gridGUI);
gridGUI.getWindow('main').forceRefresh();

testButtons(gridGUI.getWindow('header').getContent().elements, function(){
	grid_set_elements(315, 70, gridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_grid, gridData);
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
	onTouchEvent: function(element, event){
		if(event.type == 'CLICK' || event.type == 'LONG_CLICK'){
			if (!gridData.isWorkAllowed) return;
			var itemContainerUiHandler = element.window.getContainer();
			var itemContainer = itemContainerUiHandler.getParent();
			var slot_id = Math.floor(event.x/251)+Math.floor(event.y/250)*4;
			var updateFull = false;
			var item = Player.getInventorySlot(slot_id);
			if(item.id == 0)return;
			//alert(JSON.stringify(item));
			if(gridData.disksStored >= gridData.disksStorage) return
			if(event.type == 'CLICK'){
				var count = 1;
			} else {
				var count = Math.min(Item.getMaxStack(item.id), gridData.disksStorage - gridData.disksStored, item.count);
			}
			if(Config.dev)Logger.Log('Grid local pushing item: ' + getItemUid(item) + ' ; count: ' + count + ' ; slot: ' + slot_id + " ; extra: " + fullExtraToString(item.extra), 'RefinedStorageDebug');
			var slotFounded = false;
			for(var i in gridData.slotsKeys){
				var _slotName = gridData.slotsKeys[i];
				var _slot = itemContainer.slots[_slotName];
				//if(Config.dev)Logger.Log('Checking item: ' + getItemUid(_slot) + " ; extra: " + fullExtraToString(_slot.extra), 'RefinedStorageDebug');
				if(_slot && (_slot.id == 0 || (_slot.id == item.id && _slot.data == item.data && (item.extra == _slot.extra || (item.extra && _slot.extra && fullExtraToString(item.extra) == fullExtraToString(_slot.extra)))))){
					item.extra = _slot.extra;
					if(Config.dev)Logger.Log('Founded slot: ' + _slotName + ' : ' + JSON.stringify(_slot.asScriptable()), 'RefinedStorageDebug');
					slotFounded = true;
					itemContainer.setSlot(_slotName, item.id, _slot.count + count, item.data, item.extra || null);
					gridData.setItemInfoSlot(_slotName, itemContainer);
					if(gridData.sort == 0) updateFull = true;
					gridData.updateGui(true, updateFull);
					gridData.lowPriority = true;
					break
				}
			}
			if(!slotFounded){
				var _slotName = gridData.slotsKeys.length + 'slot';
				if(Config.dev)Logger.Log('Slot not founded, new slot name: ' + _slotName, 'RefinedStorageDebug');
				gridData.slotsKeys.push(_slotName);
				itemContainer.setSlot(_slotName, item.id, count, item.data, item.extra || null);
				gridData.setItemInfoSlot(_slotName, itemContainer);
				updateFull = true;
				gridData.updateGui(true, updateFull);
				gridData.lowPriority = true;
			}
			var map = (asdgfasdasddsad = gridData.networkData.getString('pushItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
			if(map.indexOf(slot_id) == -1){
				map.push(slot_id);
				gridData.networkData.putString('pushItemsMap', JSON.stringify(map));
			}
			var currentCount = gridData.networkData.getInt(slot_id, 0);
			gridData.networkData.putInt(slot_id, currentCount + count);
			gridData.networkData.putBoolean('update', true);
			gridData.networkData.putBoolean('updateFull'+slot_id, updateFull);
		}
	}
}
function least_sort(a, b) { return a - b; };

function error(message) {
	alert(message);
	return false;
}

var gridFuncs = {
	getPages: function(_length){
		if(_length == 0) return 1;
		_length = Math.ceil(_length / _elementsGUI_grid["x_count"]);
		return _length;
	},
	getPageFromCoords: function(_coords, pages){
		pages -= _elementsGUI_craftingGrid['y_count'] - 1;
		var interval = (pages - 1) > 0 ? (_elementsGUI_grid["max_y"] - _elementsGUI_grid["slider_button"].start_y) / (pages - 1) : 0;
		function __getY(i) {
			return ((interval * i) + _elementsGUI_grid["slider_button"].start_y);
		}
		var least_dec = 10001;
		var finish_i = 0;
		for (var i = 0; i < pages; i++) {
			var dec = Math.abs(Math.round(_coords.y - __getY(i)));
			if (dec < least_dec) {
				least_dec = dec;
				finish_i = i;
			}
		};
		var page = finish_i;
		return page + 1;
	},
	getCoordsFromPage: function(page, pages){
		pages -= _elementsGUI_craftingGrid['y_count'] - 1;
		var interval = (pages - 1) > 0 ? (_elementsGUI_grid["max_y"] - _elementsGUI_grid["slider_button"].start_y) / (pages - 1) : 0;
		function __getY(i) {
			return ((interval * i) + _elementsGUI_grid["slider_button"].start_y);
		}
		if (page > pages) page = pages;
		if (page < 1) page = 1;
		return __getY(page - 1);
	},
}

RefinedStorage.createTile(BlockID.RS_grid, {
	defaultValues: {
		NETWORK_ID: 'f',
		LAST_NETWORK_ID: 0,
		block_data: 0,
		page: 1,
		items: [],
		event: { x: 0, y: 0 },
		sort: 0,
		sort_map: ['count', 'name', 'id'],
		reverse_filter: false,
		page_switched: false,
		controller_coords: { x: 0, y: 0, z: 0 },
		slots_count: 0,
		textSearch: false,
		privateRemaked: false,
		pushDeleteEvents: {},
		firstOpen: false,
		firstOpenClients: [],
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
		/* this.data.firstOpen = World.getThreadTime() + 40;
		this.data.firstOpenClients.push(client); */
		/* var ths = this;
		setTimeout(function(){
			ths.refreshGui(true, client);
		},40); */
		if(InnerCore_pack.packVersionCode < 119)this.refreshGui(true, client); 
		return true;
	},
	onWindowClose: function(){
		if(this.data.NETWORK_ID == 'f') return;
		var coords_id = this.coords_id();
		RSNetworks[this.data.NETWORK_ID][coords_id].isOpenedGrid = false;
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
	},
	post_init: function(){
		/* this.data.firstOpen = false;
		this.data.firstOpenClients = []; */
		this.data.pushDeleteEvents = {};
	},
	tick: function () {
		/* if(this.data.firstOpen && this.data.firstOpen == World.getThreadTime()){
			for(var i in this.data.firstOpenClients){
				this.refreshGui(true, this.data.firstOpenClients[i]);
			}
			this.data.firstOpenClients = [];
			this.data.firstOpen = false;
		} */
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			if(this.data.refreshCurPage){
				this.items();
				this.refreshGui(false, false, this.data.fullRefreshPage);
				this.data.refreshCurPage = false;
				this.data.fullRefreshPage = false;
			}
		}
		for(var p in this.data.pushDeleteEvents){
			var player = new PlayerActor(Number(p));
			//alert('Checking event of: ' + p);
			for(var i in this.data.pushDeleteEvents[p]){
				var event = this.data.pushDeleteEvents[p][i];
				//alert('Event: ' + JSON.stringify(event));
				if(!event) {
					delete this.data.pushDeleteEvents[p][i];
					continue;
				}
				if(event.type == 'push'){
					var item = player.getInventorySlot(event.slot);
					if(item.id == 0) return;
					var count = Math.min(event.count, item.count);
					var pushed = this.pushItem(item, count, true);
					if(pushed < count){
						player.setInventorySlot(event.slot, item.id, item.count - (count - pushed), item.data, item.extra);
					}
					if((_index = this.originalItemsMap().indexOf(getItemUid(item))) != -1)this.container.markSlotDirty(_index+'slot');
					this.items();
					this.refreshGui(false, false, item.count <= count || event.updateFull);
					delete this.data.pushDeleteEvents[p][i];
				}
				if(event.type == 'delete'){
					var item = this.container.getSlot(i);//event.item;
					var itemMaxStack = Item.getMaxStack(item.id);
					var this_item = searchItem(item.id, item.data, item.extra, false, true, p);
					var count = this_item && this_item.count < itemMaxStack ? Math.min(event.count, item.count, itemMaxStack - this_item.count) : Math.min(event.count, item.count/* , itemMaxStack*emptySlots.length */);
					if((res = this.deleteItem(item, count, true)) < count) {
						var _extra = (this_item ? this_item.extra : item.extra);
						player.addItemToInventory(item.id, count - res, item.data, _extra || null, true);
						this.items();
						this.refreshGui(false, false, item.count <= count || event.updateFull);
					}
					delete this.data.pushDeleteEvents[p][i];
				}
			}
			delete this.data.pushDeleteEvents[p];
		}
	},
	post_update_network: function () {
		this.data.controller_coords = searchController_net(this.data.NETWORK_ID);
		this.refreshGui(false, false, true);
	},
	post_setActive: function(){
		this.items();
		this.refreshGui(false, false, true, true);
	},
	controller_id: function () {
		if (this.data.NETWORK_ID == "f") return '0,0,0';
		return this.data.controller_coords.x + ',' + this.data.controller_coords.y + ',' + this.data.controller_coords.z;
	},
	pages: function () {
		if (this.container.getNetworkEntity().getClients().iterator().hasNext() && this.data.NETWORK_ID != "f") {
			return gridFuncs.getPages(this.originalItems().length)
		} else {
			return 1;
		}
	},
	items: function (forced) {
		if (!this.isWorkAllowed()) {
			return [];
		}
		var items = this.originalItems();
		var slotsKeys = Object.keys(this.container.slots);
		for(var i = 0; i < Math.max(slotsKeys.length, items.length); i++){
			var slot = this.container.getSlot(i+'slot');
			var slot2 = items[i] || {id:0, data:0, count:0, extra: null};
			if(forced || !compareSlots(slot, slot2)){
				this.container.setSlot(i+'slot', slot2.id, slot2.count, slot2.data, slot2.extra || null);
			}
		}
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
		delete temp_data[this.coords_id()];
		for(var i in this.container.slots){
			this.container.clearSlot(i);
		}
	},
	refreshModel: function(){
		if(!this.networkEntity) return Logger.Log(Item.getName(this.blockInfo.id, this.blockInfo.data) + ' model on: ' + cts(this) + ' cannot be displayed');
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z, dimension: this.dimension}});
	},
	refreshGui: function(first, client, updateFilters){
		var _data = {
			name: this.networkData.getName() + '', 
			isActive: this.data.isActive, 
			NETWORK_ID: this.data.NETWORK_ID,
			redstone_mode: this.data.redstone_mode,
			sort: this.data.sort,
			reverse_filter: this.data.reverse_filter,
			refresh: !first,
			updateFilters: first || updateFilters,
			disksStorage: this.getDisksStorage() + "",
			disksStored: this.getDisksStored(),
			isWorkAllowed: this.isWorkAllowed()
			//slotsLength: Object.keys(this.container.slots).length
		};
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
			if(Config.dev)Logger.Log('Local refreshing Grid model: block_data: ' + this.networkData.getInt('block_data') + ' ; isActive: ' + this.networkData.getBoolean('isActive'), 'RefinedStorageDebug');
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getGridTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		tick: function(){
			if(this.networkData.getBoolean('update', false)){
				this.networkData.putBoolean('update', false);
				var pushDeleteEvents = {};
				var map = (asdgfasdasddsad = this.networkData.getString('deleteItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
				for(var i in map){
					pushDeleteEvents[map[i]] = {
						type: 'delete',
						count: Number(this.networkData.getInt(map[i], 0)),
						updateFull: this.networkData.getBoolean('updateFull'+map[i], false)
					}
					this.networkData.putInt(map[i], 0);
				}
				this.networkData.putString('deleteItemsMap', 'null');
				var map = (asdgfasdasddsad = this.networkData.getString('pushItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
				for(var i in map){
					pushDeleteEvents[map[i]] = {
						type: 'push',
						count: Number(this.networkData.getInt(map[i], 0)),
						slot: map[i],
						updateFull: this.networkData.getBoolean('updateFull'+map[i], false)
					}
					this.networkData.putInt(map[i], 0);
				}
				this.networkData.putString('pushItemsMap', 'null');
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents})
			}
		},
		events: {
			refreshModel: function(eventData, packetExtra) {
				if(Config.dev)Logger.Log('Event refreshing Grid model: block_data: ' + this.networkData.getInt('block_data') + ' ; isActive: ' + this.networkData.getBoolean('isActive') + ' ; eventIsActive: ' + eventData.isActive, 'RefinedStorageDebug');
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getGridTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			openGui: function(container, window, content, eventData){
				if(!content || !window || !window.isOpened()) return;
				eventData.disksStorage = Number(eventData.disksStorage);
				Object.assign(gridData, eventData);
				gridData.updateGui = function(refresh, updateFilters, nonlocal){
					if(Config.dev)Logger.Log((nonlocal ? 'Server ' : 'Local ') + (refresh ? 'Updating' : 'Openning') + ' window: refresh:' + refresh + ' updateFilters:' + updateFilters + ' eventdata:' + JSON.stringify(eventData), 'RefinedStorageDebug');
					delete container.slots.bindings;
					delete container.slots.slots;
					gridData.networkData = SyncedNetworkData.getClientSyncedData(eventData.name);
					if(updateFilters){
						var _slotKeys = [];
						for(var i in container.slots)if(i[0] >= 0 && container.slots[i].id != 0)_slotKeys.push(i);
						gridData.slotsKeys = _slotKeys;
						if(!refresh)gridData.textSearch = false;
						var millis = 0;
						if(Config.dev)millis = java.lang.System.currentTimeMillis();
						gridData.slotsKeys = RefinedStorage.sortItems(eventData.sort, eventData.reverse_filter, gridData.textSearch || null, container, gridData.slotsKeys);
						if(Config.dev)Logger.Log('Items array sorted on: ' + (java.lang.System.currentTimeMillis() - millis), "RefinedStorageDebug");
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
					//if(refresh)window.getWindow('main').getElements().get("slider_button").setPosition(content.elements['slider_button'].x, gridFuncs.getCoordsFromPage(gridData.lastPage, gridFuncs.getPages(gridData.slotsKeys.length)));
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
					var craftsThread = java.lang.Thread({
						run: function(){
							try {
								gridData.updateGui(eventData.refresh, eventData.updateFilters, true);
							} catch(err){
								alert('Sorry, i broke :_(' + JSON.stringify(err));
							}
						}
					});
					craftsThread.setPriority(java.lang.Thread.MIN_PRIORITY);
					craftsThread.start();
				} else {
					gridData.updateGui(eventData.refresh, eventData.updateFilters, true);
				}
			}
		}
	},
	containerEvents: {
		updateFilter: function(eventData, connectedClient) {
			if(this.data.sort == undefined) this.data.sort = 0;
			this.data.sort = this.data.sort >= 2 ? 0 : this.data.sort + 1;
			this.refreshGui(false, false, true);
		},
		updateReverseFilter: function(eventData, connectedClient) {
			this.data.reverse_filter = !this.data.reverse_filter;
			this.refreshGui(false, false, true);
		}
	},
	events: {
		pushDeleteEvents: function(packetData, packetExtra, connectedClient) {
			this.data.pushDeleteEvents[connectedClient.getPlayerUid()] = packetData.pushDeleteEvents;
			if(Config.dev)Logger.Log('Getted pushDeleteEvents from: ' + connectedClient.getPlayerUid() + ' : ' + JSON.stringify(packetData.pushDeleteEvents), 'RefinedStorageDebug');
		}
	}
})