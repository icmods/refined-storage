const _craftingGridTexture = [
	["disk_drive_bottom", 0], // bottom
	["grid_top", 0], // top
	["grid_back", 0], // back
	["crafting_grid_front", 0], // front
	["grid_left", 0], // left
	["grid_right", 0]  // right
];

function getCraftingGridTexture(variation, _active){
	return getRotatableTexture(_craftingGridTexture, variation, _active);
}

IDRegistry.genBlockID("RS_crafting_grid");
Block.createBlockWithRotation("RS_crafting_grid", [
	{
		name: "Crafting Grid",
		texture: _craftingGridTexture,
		inCreative: true
	}
])
RS_blocks.push(BlockID['RS_crafting_grid']);
EnergyUse[BlockID['RS_crafting_grid']] = Config.energy_uses.craftingGrid;


var craftingGridData = Object.assign({}, gridData);
craftingGridData.lastCraftsPage = -1;
craftingGridData.isCrafting = true;

var _elementsGUI_craftingGrid = {};

var _drawingGUI_craftingGrid = [];
var craftingGridGUI = new UI.StandartWindow({
	standart: {
		header: {
			text: {
				text: Translation.translate("Crafting Grid")
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

	drawing: _drawingGUI_craftingGrid,

	elements: _elementsGUI_craftingGrid
});
GUIs.push(craftingGridGUI);

function craftingGridSwitchPage(page, container, ignore, dontMoveSlider){
	var window_ = getClientGuiWindow(container, 'main');
	if(!window_ || typeof window_.isOpened != 'function' || !window_.isOpened()) return false;
	var slots = container.slots;
	var slotsKeys = craftingGridData.slotsKeys;
	var slots_count = craftingGridData.slots_count;
	var x_count = craftingGridData.x_count;
	var pages1 = craftingGridFuncs.getPages(slotsKeys.length);
	var pages = Math.max(1, pages1 + 1 - craftingGridData.y_count);
	page = Math.max(1, Math.min(page, pages)) - 1;
	if(page == craftingGridData.lastPage - 1 && !ignore) return false;
	craftingGridData.lastPage = page + 1;
	if(!dontMoveSlider){
		var pages = craftingGridFuncs.getPages(slotsKeys.length);
		var ___y = craftingGridFuncs.getCoordsFromPage(page + 1, pages);
		container.getUiAdapter().getElement("slider_button").setPosition(_elementsGUI_craftingGrid['slider_button'].x, ___y);
	}
	if (!craftingGridData.isWorkAllowed) {
		for (var i = 0; i < slots_count; i++) {
			container.setSlot("slot" + i, 0, 0, 0, null);
			container.setText("slot" + i, "0");
		}
		return false;
	}
	var elements_ = window_.getElements ? window_.getElements() : window_.getContent().elements;
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

function craftingGridSwitchCraftsPage(page, container, ignore, dontMoveSlider){
	var window_ = getClientGuiWindow(container, 'main');
	if(!window_ || typeof window_.isOpened != 'function' || !window_.isOpened()) return false;
	var crafts = craftingGridData.crafts;
	var slots_count = craftingGridData.crafts_slots_count;
	var x_count = craftingGridData.crafts_x_count;
	var pages1 = craftingGridFuncs.craftsPages(crafts.length);
	var pages = Math.max(1, pages1 + 1 - craftingGridData.crafts_y_count);
	page = Math.max(1, Math.min(page, pages)) - 1;
	if(page == craftingGridData.lastCraftsPage - 1 && !ignore) return false;
	craftingGridData.lastCraftsPage = page + 1;
	var uiAdapter = container.getUiAdapter();
	if(!dontMoveSlider){
		var ___y = craftingGridFuncs.getCraftsCoordsFromPage(page + 1, pages1);
		uiAdapter.getElement("crafts_slider").setPosition(_elementsGUI_craftingGrid['crafts_slider'].x, ___y);
	}
	if (!craftingGridData.isWorkAllowed) {
		for (var i = 0; i < slots_count; i++) {
			container.setSlot("item_craft_slot" + i, 0, 0, 0, null);
		}
		return false;
	}
	var content = typeof window_.getContent == 'function' ? window_.getContent() : null;
	var contentProvider = typeof window_.getContentProvider == 'function' ? window_.getContentProvider() : null;
	for (var i = 0; i < slots_count; i++) {
		var a = i + (page * x_count);
		var item = crafts[a] ? crafts[a].getResult() : { id: 0, data: 0, count: 0, extra: null };
		container.setSlot("item_craft_slot" + i, item.id, item.count, item.data > 0 ? item.data : 0, item.extra || null);
		if(crafts[a] && content && content.elements)content.elements["item_craft_slot" + i].darken = craftingGridData.isDarkenMap["e" + crafts[a].getRecipeUid()];
	}
	if(contentProvider)contentProvider.refreshElements();
	return true;
}

var craftingGridFuncs = makePageHelpers(_elementsGUI_craftingGrid, {countX: "x_count", countY: "y_count", maxY: "max_y", slider: "slider_button"});
var craftsPageHelpers = makePageHelpers(_elementsGUI_craftingGrid, {countX: "crafts_x_count", countY: "crafts_y_count", maxY: "crafts_max_y", slider: "crafts_slider"});
craftingGridFuncs.craftsPages = craftsPageHelpers.getPages;
craftingGridFuncs.getCraftsPageFromCoords = craftsPageHelpers.getPageFromCoords;
craftingGridFuncs.getCraftsCoordsFromPage = craftsPageHelpers.getCoordsFromPage;

testButtons(craftingGridGUI.getWindow('header').getContent().elements, function(){
	grid_set_elements(360 + 109, 70, CgridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_craftingGrid, craftingGridData, craftingGridGUI, craftingGridSwitchPage, craftingGridFuncs);
});

var CgridConsPercents = 49/(575.5 - 60);
grid_set_elements(360 + 109, 70, CgridConsPercents*(UI.getScreenHeight() - 60), 0, _elementsGUI_craftingGrid, craftingGridData, craftingGridGUI, craftingGridSwitchPage, craftingGridFuncs);

(function(){
	_elementsGUI_craftingGrid["reverse_filter_button"].y = _elementsGUI_craftingGrid["search_frame"].y;
	_elementsGUI_craftingGrid["reverse_filter_button"].x = 245 + ((_elementsGUI_craftingGrid["search_frame"].x - 245)/2 + _elementsGUI_craftingGrid["reverse_filter_button"].scale*10 + _elementsGUI_craftingGrid.settings_cons);
	_elementsGUI_craftingGrid["image_reverse_filter"].x = _elementsGUI_craftingGrid["reverse_filter_button"].x + (_elementsGUI_craftingGrid["reverse_filter_button"].scale * 20 - (_elementsGUI_craftingGrid["image_reverse_filter"].scale * 8)) / 2
	_elementsGUI_craftingGrid["image_reverse_filter"].y = _elementsGUI_craftingGrid["reverse_filter_button"].y + (_elementsGUI_craftingGrid["reverse_filter_button"].scale * 20 - (_elementsGUI_craftingGrid["image_reverse_filter"].scale * 10)) / 2
	_elementsGUI_craftingGrid["filter_button"].y = _elementsGUI_craftingGrid["reverse_filter_button"].y;
	_elementsGUI_craftingGrid["filter_button"].x = _elementsGUI_craftingGrid["reverse_filter_button"].x - _elementsGUI_craftingGrid["reverse_filter_button"].scale*20 - _elementsGUI_craftingGrid.settings_cons;
	_elementsGUI_craftingGrid["image_filter"].y = _elementsGUI_craftingGrid["filter_button"].y + (_elementsGUI_craftingGrid["filter_button"].scale * 20 - 24) / 2;
	_elementsGUI_craftingGrid["image_filter"].x = _elementsGUI_craftingGrid["filter_button"].x + (_elementsGUI_craftingGrid["filter_button"].scale * 20 - 24) / 2;
	_elementsGUI_craftingGrid["redstone_button"].y = _elementsGUI_craftingGrid["filter_button"].y;
	_elementsGUI_craftingGrid["redstone_button"].x = _elementsGUI_craftingGrid["filter_button"].x - _elementsGUI_craftingGrid["filter_button"].scale*20 - _elementsGUI_craftingGrid.settings_cons;
	_elementsGUI_craftingGrid["image_redstone"].y = _elementsGUI_craftingGrid["redstone_button"].y;
	_elementsGUI_craftingGrid["image_redstone"].x = _elementsGUI_craftingGrid["redstone_button"].x;

	var windowHeight = UI.getScreenHeight() - 60;
	var craftingPadding = 10;
	var craftingY = _elementsGUI_craftingGrid["redstone_button"].y + _elementsGUI_craftingGrid["redstone_button"].scale*20 + 10;
	var craftSlotsPercents = 37/(575.5 - 60);
	var craftSlotsSize = craftSlotsPercents*windowHeight;
	var craftResultPercents = (37+10)/37;
	var craftResultSize = craftResultPercents*craftSlotsSize;
	_elementsGUI_craftingGrid['craft_result'] = {
		type: "slot",
		x: _elementsGUI_craftingGrid["x_start"] - craftingPadding - 50 - 20,
		y: craftingY + craftSlotsSize*1.5 - craftResultSize/2,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				if(!craftingGridData.selectedRecipe || !craftingGridData.selectedRecipe.craftable) return;
				craftingGridFuncs.provideCraft(craftingGridData.selectedRecipe.result.count);
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
				if(!craftingGridData.selectedRecipe || !craftingGridData.selectedRecipe.craftable) return;
				var result = craftingGridData.selectedRecipe.result;
				var maxStack = Item.getMaxStack(result.id);
				craftingGridFuncs.provideCraft(maxStack);
			}
		},
		size: craftResultSize
	}

	_elementsGUI_craftingGrid['craft_cleaner'] = {
		type: "button",
		x: _elementsGUI_craftingGrid['craft_result'].x + _elementsGUI_craftingGrid['craft_result'].size/4,
		y: _elementsGUI_craftingGrid['craft_result'].y - 5 - _elementsGUI_craftingGrid['craft_result'].size/2,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				craftingGridData.selectedRecipe = null;
				itemContainer.setSlot('craft_result', 0, 0, 0);
				for(var i = 0; i < 9; i++){
					itemContainer.setSlot('craft_slot' + i, 0, 0, 0);
					itemContainer.setSlot('WB_craft_slot' + i, 0, 0, 0);
				}
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		},
		scale: _elementsGUI_craftingGrid['craft_result'].size/2/20
	}

	
	_elementsGUI_craftingGrid["image_craft_cleaner"] = {
		type: "image",
		x: _elementsGUI_craftingGrid["craft_cleaner"].x,
		y: _elementsGUI_craftingGrid["craft_cleaner"].y,
		z: 100,
		bitmap: "RS_close_button_icon",
		scale: _elementsGUI_craftingGrid['craft_cleaner'].scale,
	}

	var asd = 0;
	for(var y = 0; y < 3; y += 1){
		for(var x = 0; x < 3; x += 1){
			_elementsGUI_craftingGrid['craft_slot' + asd] = {
				id: 'craft_slot' + asd,
				type: "slot",
				x: 245 + craftingPadding + craftSlotsSize*x,
				y: craftingY + craftSlotsSize*y,
				clicker: {
					onClick: function (itemContainerUiHandler, itemContainer, element) {
						if(!this.parent) return;
						craftingGridData.setItemInfoSlot(this.parent, itemContainer);
					},
					onLongClick: function (itemContainerUiHandler, itemContainer, element) {
						
					}
				},
				size: craftSlotsSize
			}
			asd++;
		}
	}
	x = 245 + craftingPadding + craftSlotsSize*3;
	y = craftingY + craftSlotsSize*3;
	var craftSlotsEnd = y;

	var craftsSlotsXSettings = {
		count: 5,
		start: 245 + craftingPadding,
		end: _elementsGUI_craftingGrid['x_start'] - craftingPadding - 20
	}

	var craftsCtx = {
		elements: _elementsGUI_craftingGrid,
		gridData: craftingGridData,
		drawing: _drawingGUI_craftingGrid,
		xStart: craftsSlotsXSettings.start,
		xEnd: craftsSlotsXSettings.end,
		yStart: craftSlotsEnd + 30,
		columns: 5,
		windowHeight: windowHeight,
		switchPage: craftingGridSwitchCraftsPage,
		getPages: craftingGridFuncs.craftsPages,
		getPageFromCoords: craftingGridFuncs.getCraftsPageFromCoords,
		getCoordsFromPage: craftingGridFuncs.getCraftsCoordsFromPage,
		onSearch: function(keyword, container, uiHandler) {
			craftingGridData.craftsTextSearch = keyword.length ? keyword : false;
			uiHandler.setBinding('search_text_crafts', 'text', keyword.length ? keyword : Translation.translate('Search'));
			craftingGridData.crafts = craftingGridFuncs.updateCrafts(craftingGridData.slotsKeys, craftingGridData.craftsTextSearch, craftingGridData.originalOnlyItemsMap, container.slots);
			craftingGridSwitchCraftsPage(1, container, true);
		},
		onSelectCraft: function(craft, container) {
			craftingGridFuncs.selectRecipe(craft, container, craftingGridData.originalOnlyItemsExtraMap, craftingGridData.originalOnlyItemsMap, craftingGridData.originalItemsMap);
		}
	};
	var craftsPageConfig = buildCraftsSection(craftsCtx);
})();

var craftsInv_elements = craftingGridGUI.getWindow('inventory').getContent();
craftsInv_elements.elements["_CLICKFRAME_"] = {
	type: "frame",
	x: 0,
	y: 0,
	z: -100,
	width: 1000,
	height: 251*9,
	bitmap: "empty",
	scale: 1,
	onTouchEvent: createInventoryPushHandler(craftingGridData)
};
craftingGridGUI.getWindow('main').forceRefresh();

for (var izxc = 0; izxc < 4; izxc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCraftingGridTexture(izxc));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_crafting_grid"], izxc, render);
}

	craftingGridFuncs.updateCrafts = function(items, craftsTextSearch, onlyItemsMap, _object){
		var millis = java.lang.System.currentTimeMillis();
		var inventoryItems = searchInventory(Player, -1, -1, -1, true);
		var inventoryOnlyItemsMap = {};
		for(var i in inventoryItems){
			if(inventoryOnlyItemsMap[inventoryItems[i].id])
				inventoryOnlyItemsMap[inventoryItems[i].id].push(inventoryItems[i].data);
			else
				inventoryOnlyItemsMap[inventoryItems[i].id] = [inventoryItems[i].data];
		}
		var sorted = RefinedStorage.sortCrafts(items, craftsTextSearch || null, Object.assign(inventoryOnlyItemsMap, onlyItemsMap), _object, inventoryItems, craftingGridData.isDarkenMap);
		return sorted;
	};
	craftingGridFuncs.selectRecipe = function(javaRecipe, container, originalOnlyItemsExtraMap, originalOnlyItemsMap, originalItemsMap){
		if (!javaRecipe) return false;
		var result_item = javaRecipe.getResult();
		if(!result_item) return false;
		container.setSlot('craft_result', result_item.id, result_item.count, result_item.data, result_item.extra || null);
		var items = javaRecipe.getSortedEntries();
		if(!items) return false;
		var smallItemsMap = {};
		var fixedItemsMap = {};
		var craftable = true;
		for(i = 0; i < 9; i++){
			if(!items[i] || !items[i].id){
				container.setSlot('craft_slot' + i, 0, 0, 0);
				_elementsGUI_craftingGrid['craft_slot' + i].parent = null;
				continue;
			};
			var item = items[i];
			itemData = item.data != -1 ? item.data : ((originalItem = originalOnlyItemsMap[item.id]) ? originalItem[0] : 0);
			var itemUid = item.id+'_'+itemData;
			var itemExtra = (itemExtraExist = originalOnlyItemsExtraMap[itemUid]) ? itemExtraExist[0] : null;
			if(itemExtra) itemUid += '_' + getExtraUidSuffix(itemExtra);
			if(smallItemsMap[itemUid])
				smallItemsMap[itemUid]++;
			else
				smallItemsMap[itemUid] = 1;
			var itemCount = ((itemI = originalItemsMap.indexOf(itemUid)) != -1 && container.getSlot(craftingGridData.slotsKeys[itemI]).count >= smallItemsMap[itemUid]) ? 1 : 0;
			if(!itemCount) {
				var playerItem = searchItem(item.id, itemData, itemExtra);
				if(playerItem && playerItem.count >= smallItemsMap[itemUid] - (itemI != -1 ? container.getSlot(craftingGridData.slotsKeys[itemI]).count : 0)){
					itemExtra = playerItem.extra;
					itemCount = 1;
				} else {
					craftable = false;
				}
			}
			if(itemCount){
				if(fixedItemsMap[itemUid])
					fixedItemsMap[itemUid]++;
				else
					fixedItemsMap[itemUid] = 1;
			}
			container.setSlot('craft_slot' + i, item.id, itemCount, itemData, itemExtra);
			_elementsGUI_craftingGrid['craft_slot' + i].parent = craftingGridData.slotsKeys[itemI];
		}
		craftingGridData.selectedRecipe = {
			result: result_item,
			javaRecipe: javaRecipe,
			craftable: craftable,
			uid: javaRecipe.getRecipeUid()
		}
		return true;
	};
	craftingGridFuncs.provideCraft = function(count){
		if(!craftingGridData.selectedRecipe) return false;
		var _data = Object.assign({}, craftingGridData.selectedRecipe);
		_data.count = count;
		delete _data.javaRecipe;
		delete _data.result;
		craftingGridData.container.sendEvent('provideCraft', _data);
		return true;
	};

function craftingGridProvideCraft(tile, player){
	if(!tile.isWorkAllowed() || !tile.data.selectedRecipe || !tile.data.selectedRecipe.craftable) return false;
	var netFuncs = RSNetworks[tile.data.NETWORK_ID].info;
	var selectedRecipe = tile.data.selectedRecipe;
	var javaRecipe = selectedRecipe.javaRecipe;
	var items = javaRecipe.getSortedEntries();
	var smallItemsMap = {};
	for(i = 0; i < 9; i++){
		if(!items[i] || !items[i].id) {
			tile.container.setSlot('WB_craft_slot' + i, 0,0,0);
			continue;
		}
		var item = items[i];
		itemData = item.data != -1 ? item.data : ((originalItem = tile.originalOnlyItemsMap()[item.id]) ? originalItem[0] : 0);
		var itemUid = item.id+'_'+itemData;
		var itemExtra = (itemExtraExist = tile.originalOnlyItemsExtraMap()[itemUid]) ? itemExtraExist[0] : null;
		if(itemExtra) {
			itemUid += '_' + getExtraUidSuffix(itemExtra);
		}
		if(smallItemsMap[itemUid])
			smallItemsMap[itemUid].count++;
		else
			smallItemsMap[itemUid] = {id: item.id, count: 1, data: itemData, extra: itemExtra};
		tile.container.setSlot('WB_craft_slot' + i, item.id, 1, itemData, itemExtra);
	}
	var playerSlots = {};
	for(var i in smallItemsMap){
		if(!netFuncs.itemCanBeDeleted(smallItemsMap[i]) && (!(playerSlots[i] = searchItem(smallItemsMap[i].id, smallItemsMap[i].data, smallItemsMap[i].extra, false, false, player)) || playerSlots[i].count < smallItemsMap[i].count)) return false;
	}
	var result = javaRecipe.provideRecipeForPlayer(tile.container, player);
	if(!result) return false;
	if(result.data == -1)result.data = 0;
	var __PlayerActor = new PlayerActor(player);
	for(var i in smallItemsMap){
		var ndeleted = netFuncs.deleteItem(smallItemsMap[i], smallItemsMap[i].count, true);
		if(ndeleted > 0 && (playerSlotData = playerSlots[i])){
			__PlayerActor.setInventorySlot(playerSlotData.slot, playerSlotData.id, playerSlotData.count - ndeleted, playerSlotData.data, playerSlotData.extra);
		}
	};
	var cbkUsedFunc = function(){
		for(var i = 0; i < 9; i++){
			var slot_ = this.container.getSlot('WB_craft_slot' + i);
			if(slot_.count != 0){
				var answ = this.pushItem(slot_, slot_.count, true);
				if(answ != 0){
					__PlayerActor.addItemToInventory(slot_.id, answ, slot_.data, null, true);
				}
			}
		}
	};
	cbkUsedFunc.apply(tile);
	Callback.invokeCallback("VanillaWorkbenchCraft", result, tile.container);
	__PlayerActor.addItemToInventory(result.id, result.count, result.data, result.extra || null, true);
	Callback.invokeCallback("VanillaWorkbenchPostCraft", result, tile.container);
	return true;
}

function craftingGridProvideCraftEvent(tile, eventData, connectedClient){
	tile.data.selectedRecipe = eventData;
	tile.data.selectedRecipe.javaRecipe = Recipes.getRecipeByUid(eventData.uid);
	tile.data.selectedRecipe.result = tile.data.selectedRecipe.javaRecipe.getResult();
	var result = tile.data.selectedRecipe.result;
	var playerUid = connectedClient.getPlayerUid();
	var crafted = 0;
	for(var count = 0; count < eventData.count; count += result.count){
		if(!craftingGridProvideCraft(tile, playerUid)) break;
		crafted++;
	}
	tile.items();
	tile.refreshGui(false, false, true, true);
	tile.container.sendResponseEvent("reselectRecipe", {});
	if(crafted > 0)_RS._emit("wirelessGridAction", {netId: tile.data.NETWORK_ID, playerUid: playerUid, kind: 'craft', count: crafted * result.count, source: isWirelessSourceTile(tile) ? 'wireless' : 'block'});
}

function buildCraftingGridPayload(tile, first, updateFilters, updateCrafts){
	return {
		name: tile.networkData.getName() + '',
		isActive: tile.data.isActive,
		NETWORK_ID: tile.data.NETWORK_ID,
		redstone_mode: tile.data.redstone_mode,
		sort: tile.data.sort,
		reverse_filter: tile.data.reverse_filter,
		refresh: !first,
		updateFilters: first || updateFilters,
		updateCrafts: first || updateCrafts,
		disksStorage: tile.getDisksStorage() + "",
		disksStored: tile.getDisksStored(),
		isWorkAllowed: tile.isWorkAllowed(),
		craftsTextSearch: tile.data.craftsTextSearch,
		first: first
	};
}

function craftingGridOpenGui(container, window, content, eventData){
	if(!content || !window || !window.isOpened()) return;
	eventData.disksStorage = Number(eventData.disksStorage);
	Object.assign(craftingGridData, eventData);
	craftingGridData.container = container;
	craftingGridData.updateGui = function(refresh, updateFilters, updateCrafts, nonlocal){
		if(!content || !window || !window.isOpened()) return;
		delete container.slots.bindings;
		delete container.slots.slots;
		var synced = SyncedNetworkData.getClientSyncedData(eventData.name);
		if (!synced) return;
		craftingGridData.networkData = synced;
		var _slotKeys = [];
		if(updateFilters || refresh){
			var originalOnlyItemsExtraMap = {};
			var originalOnlyItemsMap = {};
			for(var i in container.slots)if(i[0] >= 0 && container.slots[i].id != 0){
				_slotKeys.push(i);
				var item_ = container.slots[i];
				if(originalOnlyItemsMap[item_.id] && originalOnlyItemsMap[item_.id].indexOf(item_.data) == -1){
					originalOnlyItemsMap[item_.id].push(item_.data);
				} else if(!originalOnlyItemsMap[item_.id]){
					originalOnlyItemsMap[item_.id] = [item_.data];
				}
				if(originalOnlyItemsExtraMap[item_.id+'_'+item_.data] && originalOnlyItemsExtraMap[item_.id+'_'+item_.data].indexOf(item_.extra) == -1){
					originalOnlyItemsExtraMap[item_.id+'_'+item_.data].push(item_.extra);
				} else if(!originalOnlyItemsExtraMap[item_.id+'_'+item_.data]){
					originalOnlyItemsExtraMap[item_.id+'_'+item_.data] = [item_.extra];
				}
			}
			craftingGridData.originalOnlyItemsExtraMap = originalOnlyItemsExtraMap;
			craftingGridData.originalOnlyItemsMap = originalOnlyItemsMap;
			craftingGridData.slotsKeys = _slotKeys;
			if(!refresh)craftingGridData.textSearch = false;
			var millis = 0;
			if(Config.dev)millis = java.lang.System.currentTimeMillis();
			craftingGridData.slotsKeys = RefinedStorage.sortItems(eventData.sort, eventData.reverse_filter, craftingGridData.textSearch || null, container, craftingGridData.slotsKeys);
			var originalItemsMap = craftingGridData.slotsKeys.map(function(__slot) {
				return getItemUid(container.slots[__slot]);
			});
			craftingGridData.originalItemsMap = originalItemsMap;
			if(craftingGridData.selectedItemInfoSlot)craftingGridData.setItemInfoSlot(craftingGridData.selectedItemInfoSlot, container);
		}
		content.elements["image_filter"].bitmap = 'RS_filter' + (eventData.sort + 1);
		content.elements["image_filter"].x = content.elements["filter_button"].x + (content.elements["filter_button"].scale * 20 - filter_size_map[eventData.sort]) / 2;
		if (eventData.reverse_filter) {
			content.elements["image_reverse_filter"].bitmap = 'RS_arrow_up';
		} else {
			content.elements["image_reverse_filter"].bitmap = 'RS_arrow_down';
		}
		content.elements["search_text"].text = craftingGridData.textSearch ? craftingGridData.textSearch : Translation.translate('Search');
		content.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
		var slots_count = content.elements.slots_count;
		content.elements["slider_button"].bitmap = craftingGridData.slotsKeys.length <= craftingGridData.slots_count ? 'slider_buttonOff' : 'slider_buttonOn';
		var crafts_slots_count = content.elements.crafts_slots_count;
		if (!eventData.isWorkAllowed) {
			for (var i = 0; i < slots_count; i++) {
				content.elements['slot' + i].bitmap = 'classic_darken_slot';
			}
			content.elements["slider_button"].bitmap = 'slider_buttonOff';
			for (var i = 0; i < crafts_slots_count; i++) {
				content.elements['item_craft_slot' + i].bitmap = 'classic_darken_slot';
			}
		} else if (content.elements['slot0'].bitmap == 'classic_darken_slot') {
			for (var i = 0; i < slots_count; i++) {
				content.elements['slot' + i].bitmap = 'classic_slot';
			}
			content.elements["slider_button"].bitmap = 'slider_buttonOn';
			for (var i = 0; i < crafts_slots_count; i++) {
				content.elements['item_craft_slot' + i].bitmap = 'classic_slot';
			}
		}
		craftingGridSwitchPage(refresh ? craftingGridData.lastPage : 1, container, true);
		if(updateCrafts){
			scheduleLowPrioritySort(function(){
				craftingGridData.isDarkenMap = {};
				craftingGridData.crafts = craftingGridFuncs.updateCrafts(craftingGridData.slotsKeys, craftingGridData.craftsTextSearch, craftingGridData.originalOnlyItemsMap, container.slots);
				craftingGridSwitchCraftsPage(refresh ? craftingGridData.lastCraftsPage : 1, container, true);
			});
		}
	}
	if(!eventData.refresh)craftingGridData.selectedRecipe = null;
	for(var s = 0; s < 9; s++)content.elements['craft_slot' + s].parent = null;
	if(craftingGridData.lowPriority){
		craftingGridData.lowPriority = false;
		scheduleLowPrioritySort(function(){
			craftingGridData.updateGui(eventData.refresh, eventData.updateFilters, eventData.updateCrafts, true);
		});
	} else {
		craftingGridData.updateGui(eventData.refresh, eventData.updateFilters, eventData.updateCrafts, true);
	}
}

RefinedStorage.copy(BlockID.RS_grid, BlockID.RS_crafting_grid, {
	blockInfo: {
		id: BlockID.RS_crafting_grid
	},
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.items();
		this.container.openFor(client, "main");
		if(InnerCore_pack.packVersionCode < 119)this.refreshGui(true, client); 
		return true;
	},
	refreshModel: function(){
		if(!this.networkEntity) return Logger.Log(Item.getName(this.blockInfo.id, this.blockInfo.data) + ' model on: ' + cts(this) + ' cannot be displayed');
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z, dimension: this.dimension}});
	},
	provideCraft: function(player){
		return craftingGridProvideCraft(this, player);
	},
	tick: function () {
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			if(this.data.refreshCurPage){
				this.items();
				this.refreshGui(false, false, this.data.fullRefreshPage, this.data.fullRefreshPage);
				this.data.refreshCurPage = false;
				this.data.fullRefreshPage = false;
			}
		}
	GridEvents.processPushDeleteEvents(this);
	},
	post_init: function () {
		this.container.setWorkbenchFieldPrefix('WB_craft_slot');
		this.data.pushDeleteEvents = {};
	},
	refreshGui: function(first, client, updateFilters, updateCrafts){
		var _data = buildCraftingGridPayload(this, first, updateFilters, updateCrafts);
		if(client){
			this.container.sendEvent(client, "openGui", _data);
		} else {
			this.container.sendEvent("openGui", _data);
		}
	},
	getScreenByName: function(screenName) {
		if(screenName == 'main')return craftingGridGUI;
	},
	client: {
		load: function(){
			this.refreshModel();
		},
		refreshModel: function(){
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getCraftingGridTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		ticks: 0,
		tick: function(){
			this.ticks++;
			if(this.networkData.getBoolean('update', false)){
				this.updateCrafts = true;
				this.networkData.putBoolean('update', false);
				var pushDeleteEvents = buildPushDeleteEvents(this.networkData);
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents})
			}
			if(this.updateCrafts && this.ticks%20 == 0){
				this.updateCrafts = false;
				if(craftingGridData.name == this.networkData.getName())craftingGridData.updateGui(true, false, true);
			}
		},
		events: {
			refreshModel: function(eventData, packetExtra) {
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getCraftingGridTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			reselectRecipe: function(container, window, content, eventData){
				craftingGridFuncs.selectRecipe(craftingGridData.selectedRecipe.javaRecipe, container, craftingGridData.originalOnlyItemsExtraMap, craftingGridData.originalOnlyItemsMap, craftingGridData.originalItemsMap);
			},
			openCraftPreview: function(container, window, content, eventData){
				openCraftPreview(container, eventData);
			},
			openGui: function(container, window, content, eventData){
				craftingGridOpenGui(container, window, content, eventData);
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
		provideCraft: function(eventData, connectedClient){
			craftingGridProvideCraftEvent(this, eventData, connectedClient);
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
});
