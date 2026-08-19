

var _patternGridTextureOff = [
	["RScrafter_bot", 0], ["RScrafter_top", 0], ["RScrafter_bottom", 0],
	["pattern_grid_front", 0], ["RScrafter_side_left", 0], ["RScrafter_side", 0]
];
var _patternGridTextureOn = [
	["RScrafter_bot_on", 0], ["RScrafter_top_on", 0], ["RScrafter_bottom_on", 0],
	["pattern_grid_front", 1], ["RScrafter_side_left_on", 0], ["RScrafter_side_on", 0]
];

function getPatternGridTexture(variation, _active){
	var base = _active ? _patternGridTextureOn : _patternGridTextureOff;
	variation = variation || 0;
	return [[base[0], [base[1][0], variation], base[2], base[3], base[4], base[5]], [base[0], [base[1][0], variation], base[3], base[2], base[5], base[4]], [base[0], [base[1][0], variation], base[5], base[4], base[2], base[3]], [base[0], [base[1][0], variation], base[4], base[5], base[3], base[2]]][variation];
}

IDRegistry.genBlockID("RS_pattern_grid");
Block.createBlockWithRotation("RS_pattern_grid", [
	{
		name: "Pattern Grid",
		texture: getPatternGridTexture(),
		inCreative: true
	}
]);
RS_blocks.push(BlockID['RS_pattern_grid']);
EnergyUse[BlockID['RS_pattern_grid']] = Config.energy_uses.patternGrid || 4;


var patternGridData = Object.assign({}, craftingGridData);
patternGridData.lastCraftsPage = -1;
patternGridData.isCrafting = true;
patternGridData.patternMode = false;
patternGridData.oredictMode = false;
patternGridData.selectedSlot = null;
patternGridData.craftingPadding = 10;
patternGridData.craftSlotsEnd = 0;
patternGridData.deselectSlots = function(){
	var elements_ = patternGridGUI.getWindow('main').getElements();
	elements_.get("pattern_slot_input").onReset();
	elements_.get("pattern_slot_export").onReset();
	elements_.get("craft_result").onReset();
	for(var i = 0; i < 9; i++){
		elements_.get("craft_slot" + i).onReset();
		elements_.get("hcraft_slot" + i).onReset();
	}
	patternGridData.selectedSlot = null;
};

var checkedCrafts = {};
var checkContainer = new ItemContainer();
checkContainer.setWorkbenchFieldPrefix('craft_slot');
function checkCraft(javaRecipe){
	if(!javaRecipe) return false;
	var recipeUid = javaRecipe.getRecipeUid();
	var items = javaRecipe.getSortedEntries();
	if(checkedCrafts[recipeUid] != undefined) return checkedCrafts[recipeUid];
	if(!items) return false;
	for(var i = 0; i < 9; i++){
		if(!items[i] || !items[i].id){
			checkContainer.setSlot('craft_slot' + i, 0, 0, 0);
			continue;
		}
		checkContainer.setSlot('craft_slot' + i, items[i].id, 1, items[i].data > -1 ? items[i].data : 0, null);
	}
	try {
		var callback2 = javaRecipe.getCallback();
		if(callback2){
			var strcallback = callback2.toString();
			for(var k in Player){
				if(strcallback.indexOf('Player.' + k) != -1){
					checkedCrafts[recipeUid] = false;
					return false;
				}
			}
			callback2(new WorkbenchFieldAPI(checkContainer), checkContainer.asScriptableField(), javaRecipe.getResult());
		}
		checkedCrafts[recipeUid] = true;
		return true;
	} catch(err) {
		Logger.Log('Recipe ' + javaRecipe.getRecipeUid() + ' (' + JSON.stringify(javaRecipe.getResult()) + ') return error when called without player. Error: ' + JSON.stringify(err));
		checkedCrafts[recipeUid] = false;
		return false;
	}
}


var _elementsGUI_patternGrid = {};
var patternGridFuncs = makePageHelpers(_elementsGUI_patternGrid, {countX:"x_count", countY:"y_count", maxY:"max_y", slider:"slider_button"});
var craftsPageHelpers = makePageHelpers(_elementsGUI_patternGrid, {countX:"crafts_x_count", countY:"crafts_y_count", maxY:"crafts_max_y", slider:"crafts_slider"});
patternGridFuncs.craftsPages = craftsPageHelpers.getPages;
patternGridFuncs.getCraftsPageFromCoords = craftsPageHelpers.getPageFromCoords;
patternGridFuncs.getCraftsCoordsFromPage = craftsPageHelpers.getCoordsFromPage;
patternGridFuncs.updateCrafts = function(items, craftsTextSearch, onlyItemsMap, _object){
		var inventoryItems = searchInventory(Player, -1, -1, -1, true);
		var inventoryOnlyItemsMap = {};
		for(var i in inventoryItems){
			if(inventoryOnlyItemsMap[inventoryItems[i].id])
				inventoryOnlyItemsMap[inventoryItems[i].id].push(inventoryItems[i].data);
			else
				inventoryOnlyItemsMap[inventoryItems[i].id] = [inventoryItems[i].data];
		}
		var sorted = RefinedStorage.sortCrafts(items, craftsTextSearch || null, Object.assign(inventoryOnlyItemsMap, onlyItemsMap), _object, inventoryItems, patternGridData.isDarkenMap);
		return sorted;
	};
	patternGridFuncs.selectRecipe = function(javaRecipe, container){
		if (!javaRecipe) return false;
		patternGridData.selectedRecipe = {
			result: javaRecipe.getResult(),
			javaRecipe: javaRecipe,
			craftable: true,
			uid: javaRecipe.getRecipeUid()
		}
		container.sendEvent('selectRecipe', {uid: javaRecipe.getRecipeUid()});
		return true;
	};
	patternGridFuncs.provideCraft = function(count){
		patternGridData.container.sendEvent('provideCraft', {count:count});
		return true;
	};



function patternGridSwitchPage(page, container, ignore, dontMoveSlider){
	var window_ = getClientGuiWindow(container, 'main');
	if(!window_ || typeof window_.isOpened != 'function' || !window_.isOpened()) return false;
	var slots = container.slots;
	var slotsKeys = patternGridData.slotsKeys;
	var slots_count = patternGridData.slots_count;
	var x_count = patternGridData.x_count;
	var pages1 = patternGridFuncs.getPages(slotsKeys.length);
	var pages = Math.max(1, pages1 + 1 - patternGridData.y_count);
	page = Math.max(1, Math.min(page, pages)) - 1;
	if(page == patternGridData.lastPage - 1 && !ignore) return false;
	patternGridData.lastPage = page + 1;
	if(!dontMoveSlider){
		var pages = patternGridFuncs.getPages(slotsKeys.length);
		var ___y = patternGridFuncs.getCoordsFromPage(page + 1, pages);
		container.getUiAdapter().getElement("slider_button").setPosition(_elementsGUI_patternGrid['slider_button'].x, ___y);
	}
	if (!patternGridData.isWorkAllowed) {
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
		if(elements_.get) elements_.get("slot" + a).setBinding('text', (!item.count ? 'Craft' : (cutNumber(item.count, true) + "")));
		else if(elements_["slot" + a] && elements_["slot" + a].setBinding) elements_["slot" + a].setBinding('text', (!item.count ? 'Craft' : (cutNumber(item.count, true) + "")));
		container.setSlot("slot" + a, item.id, item.count || 2, item.data, item.extra || null);
	}
	return true;
}

function patternGridSwitchCraftsPage(page, container, ignore, dontMoveSlider){
	var window_ = getClientGuiWindow(container, 'main');
	if(!window_ || typeof window_.isOpened != 'function' || !window_.isOpened()) return false;
	var crafts = patternGridData.crafts;
	var slots_count = patternGridData.crafts_slots_count;
	var x_count = patternGridData.crafts_x_count;
	var pages1 = patternGridFuncs.craftsPages(crafts.length);
	var pages = Math.max(1, pages1 + 1 - patternGridData.crafts_y_count);
	page = Math.max(1, Math.min(page, pages)) - 1;
	if(page == patternGridData.lastCraftsPage - 1 && !ignore) return false;
	patternGridData.lastCraftsPage = page + 1;
	var uiAdapter = container.getUiAdapter();
	if(!dontMoveSlider){
		var ___y = patternGridFuncs.getCraftsCoordsFromPage(page + 1, pages1);
		uiAdapter.getElement("crafts_slider").setPosition(_elementsGUI_patternGrid['crafts_slider'].x, ___y);
	}
	if (!patternGridData.isWorkAllowed) {
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
		if(crafts[a] && content && content.elements)content.elements["item_craft_slot" + i].darken = patternGridData.isDarkenMap["e" + crafts[a].getRecipeUid()];
	}
	if(contentProvider)contentProvider.refreshElements();
	return true;
}

var _drawingGUI_patternGrid = [];
var patternGridGUI = new UI.StandartWindow({
	standart: {
		header: {
			text: {
				text: Translation.translate("Pattern Grid")
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
	drawing: _drawingGUI_patternGrid,
	elements: _elementsGUI_patternGrid
});
GUIs.push(patternGridGUI);


function moveCraftsSlots(_mode){
	var elements_ = patternGridGUI.getWindow('main').getElements();
    if(_mode){
        elements_.get("craft_result").setPosition(_elementsGUI_patternGrid['craft_result'].x, -80);
        elements_.get("craft_cleaner").setPosition(Math.max(_elementsGUI_patternGrid['hcraft_slot2'].x + (_elementsGUI_patternGrid['hcraft_slot2'].size - _elementsGUI_patternGrid['craft_cleaner'].scale*20)/2, _elementsGUI_patternGrid['reverse_filter_button'].x + _elementsGUI_patternGrid['reverse_filter_button'].scale*20 + _elementsGUI_patternGrid.settings_cons), _elementsGUI_patternGrid['reverse_filter_button'].y + _elementsGUI_patternGrid['reverse_filter_button'].scale*20 - _elementsGUI_patternGrid['craft_cleaner'].scale*20);
        elements_.get("image_craft_cleaner").setPosition(Math.max(_elementsGUI_patternGrid['hcraft_slot2'].x + (_elementsGUI_patternGrid['hcraft_slot2'].size - _elementsGUI_patternGrid['craft_cleaner'].scale*20)/2, _elementsGUI_patternGrid['reverse_filter_button'].x + _elementsGUI_patternGrid['reverse_filter_button'].scale*20 + _elementsGUI_patternGrid.settings_cons), _elementsGUI_patternGrid['reverse_filter_button'].y + _elementsGUI_patternGrid['reverse_filter_button'].scale*20 - _elementsGUI_patternGrid['craft_cleaner'].scale*20);
        for(var i = 0; i < 9; i++) elements_.get("hcraft_slot" + i).setPosition(_elementsGUI_patternGrid["hcraft_slot" + i].x, _elementsGUI_patternGrid["hcraft_slot" + i].sy);
        var craftSlotsSize = _elementsGUI_patternGrid['craft_slot0'].size;
        var __x = 245 + patternGridData.craftingPadding + craftSlotsSize*3;
        var craftArrowPadding = _elementsGUI_patternGrid["image_craft_arrow"].padding;
        _elementsGUI_patternGrid["image_craft_arrow"].scale = (_elementsGUI_patternGrid["hcraft_slot3"].x - craftArrowPadding*2 - __x)/22;
        _elementsGUI_patternGrid["image_craft_arrow"].y = _elementsGUI_patternGrid["hcraft_slot3"].sy + _elementsGUI_patternGrid['hcraft_slot3'].size/2 - _elementsGUI_patternGrid["image_craft_arrow"].scale*15/2;
    } else {
        elements_.get("craft_result").setPosition(_elementsGUI_patternGrid['craft_result'].x, _elementsGUI_patternGrid['craft_result'].sy);
        elements_.get("craft_cleaner").setPosition(_elementsGUI_patternGrid['craft_cleaner'].sx, _elementsGUI_patternGrid['craft_cleaner'].sy);
        elements_.get("image_craft_cleaner").setPosition(_elementsGUI_patternGrid['craft_cleaner'].sx, _elementsGUI_patternGrid['craft_cleaner'].sy);
        for(var i = 0; i < 9; i++) elements_.get("hcraft_slot" + i).setPosition(_elementsGUI_patternGrid["hcraft_slot" + i].x, -80);
        var craftSlotsSize = _elementsGUI_patternGrid['craft_slot0'].size;
        var __x = 245 + patternGridData.craftingPadding + craftSlotsSize*3;
        var craftArrowPadding = _elementsGUI_patternGrid["image_craft_arrow"].padding;
        _elementsGUI_patternGrid["image_craft_arrow"].scale = (_elementsGUI_patternGrid['craft_result'].x - craftArrowPadding*2 - __x)/22;
        _elementsGUI_patternGrid["image_craft_arrow"].y = _elementsGUI_patternGrid['craft_result'].y + _elementsGUI_patternGrid['craft_result'].size/2 - _elementsGUI_patternGrid["image_craft_arrow"].scale*15/2;
    }
}

function patternGrid_set_elements(_elementsGUI_patternGrid, patternGridFuncs){
    _elementsGUI_patternGrid['reverse_filter_button'].y = _elementsGUI_patternGrid['search_frame'].y;
    _elementsGUI_patternGrid['reverse_filter_button'].x = 245 + ((_elementsGUI_patternGrid['search_frame'].x - 245)/2 + _elementsGUI_patternGrid['reverse_filter_button'].scale*10 + _elementsGUI_patternGrid.settings_cons);
    _elementsGUI_patternGrid['image_reverse_filter'].x = _elementsGUI_patternGrid['reverse_filter_button'].x + (_elementsGUI_patternGrid['reverse_filter_button'].scale*20 - (_elementsGUI_patternGrid['image_reverse_filter'].scale*8))/2;
    _elementsGUI_patternGrid['image_reverse_filter'].y = _elementsGUI_patternGrid['reverse_filter_button'].y + (_elementsGUI_patternGrid['reverse_filter_button'].scale*20 - (_elementsGUI_patternGrid['image_reverse_filter'].scale*10))/2;
    _elementsGUI_patternGrid['filter_button'].y = _elementsGUI_patternGrid['reverse_filter_button'].y;
    _elementsGUI_patternGrid['filter_button'].x = _elementsGUI_patternGrid['reverse_filter_button'].x - _elementsGUI_patternGrid['reverse_filter_button'].scale*20 - _elementsGUI_patternGrid.settings_cons;
    _elementsGUI_patternGrid['image_filter'].y = _elementsGUI_patternGrid['filter_button'].y + (_elementsGUI_patternGrid['filter_button'].scale*20 - 24)/2;
    _elementsGUI_patternGrid['image_filter'].x = _elementsGUI_patternGrid['filter_button'].x + (_elementsGUI_patternGrid['filter_button'].scale*20 - 24)/2;
    _elementsGUI_patternGrid['redstone_button'].y = _elementsGUI_patternGrid['filter_button'].y;
    _elementsGUI_patternGrid['redstone_button'].x = _elementsGUI_patternGrid['filter_button'].x - _elementsGUI_patternGrid['filter_button'].scale*20 - _elementsGUI_patternGrid.settings_cons;
    _elementsGUI_patternGrid['image_redstone'].y = _elementsGUI_patternGrid['redstone_button'].y;
    _elementsGUI_patternGrid['image_redstone'].x = _elementsGUI_patternGrid['redstone_button'].x;
    _elementsGUI_patternGrid['craft_result'].sy = _elementsGUI_patternGrid['craft_result'].y;
    _elementsGUI_patternGrid['craft_cleaner'].sy = _elementsGUI_patternGrid['craft_cleaner'].y;
    _elementsGUI_patternGrid['craft_cleaner'].sx = _elementsGUI_patternGrid['craft_cleaner'].x;
	_elementsGUI_patternGrid['craft_cleaner'].clicker = {
		onClick: function (itemContainerUiHandler, itemContainer, element) {
			patternGridData.deselectSlots();
			patternGridData.selectedRecipe = null;
			itemContainer.sendEvent("clearCraft", {});
		},
		onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			patternGridData.deselectSlots();
		}
	};
	patternGridData.selectedSlot = null;
	function updateSlot(element) {
		var itemContainerUiHandler = element.window.getContainer();
		var itemContainer = itemContainerUiHandler.getParent();
		if(patternGridData.selectedSlot != element){
			patternGridData.selectedSlot = element;
		} else if(patternGridData.selectedSlot == element && (itemContainer.getSlot(element.slotName).id == 0 || itemContainer.getSlot(element.slotName).count <= 0)){
			if(element.slotName.indexOf('craft_slot') != -1){
				patternGridData.deselectSlots();
			} else {
				patternGridData.selectedSlot = null;
				element.onReset();
				element.refresh();
			}
		}
	}
	for(var i = 0; i < 9; i++) {
		delete _elementsGUI_patternGrid['craft_slot' + i].clicker;
	}
	_elementsGUI_patternGrid["click_frame_craft_slots"] = {
		type: "frame",
		x: _elementsGUI_patternGrid['craft_slot0'].x,
		y: _elementsGUI_patternGrid['craft_slot0'].y,
		z: 100,
		width: (_elementsGUI_patternGrid['craft_slot8'].x + _elementsGUI_patternGrid['craft_slot8'].size) - _elementsGUI_patternGrid['craft_slot0'].x - 1,
		height: (_elementsGUI_patternGrid['craft_slot8'].y + _elementsGUI_patternGrid['craft_slot8'].size) - _elementsGUI_patternGrid['craft_slot0'].y - 1,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			var itemContainerUiHandler = element.window.getContainer();
			var itemContainer = itemContainerUiHandler.getParent();
			var slot_id = Math.floor((event.x - _elementsGUI_patternGrid['craft_slot0'].x)/_elementsGUI_patternGrid['craft_slot8'].size)+Math.floor((event.y - _elementsGUI_patternGrid['craft_slot0'].y)/_elementsGUI_patternGrid['craft_slot8'].size)*3;
			if(event.type == "CLICK"){
				updateSlot(itemContainerUiHandler.getElement("craft_slot" + slot_id));
			}
			if(_elementsGUI_patternGrid["craft_slot" + slot_id] && _elementsGUI_patternGrid["craft_slot" + slot_id].parent)patternGridData.setItemInfoSlot(_elementsGUI_patternGrid["craft_slot" + slot_id].parent, itemContainer);
		}
	};
    var craftSlotsSize = _elementsGUI_patternGrid['craft_slot0'].size;
    var craftingY = _elementsGUI_patternGrid['craft_slot0'].y;
    var startX = _elementsGUI_patternGrid["x_start"] - patternGridData.craftingPadding - craftSlotsSize*3 - PgridCons;
	var asd = 0;
	for(var y = 0; y < 3; y += 1){
		for(var x = 0; x < 3; x += 1){
			_elementsGUI_patternGrid['hcraft_slot' + asd] = {
				id: 'hcraft_slot' + asd,
				type: "slot",
				x: startX + craftSlotsSize*x,
                y: -80,
				sy: craftingY + craftSlotsSize*y,
				size: craftSlotsSize
			}
			asd++;
		}
	}
	var hcraftSlotsXend = _elementsGUI_patternGrid["hcraft_slot2"].x + craftSlotsSize;
	var hcraftSlotsYend = _elementsGUI_patternGrid["hcraft_slot8"].sy + craftSlotsSize;
	_elementsGUI_patternGrid["click_frame_hcraft_slots"] = {
		type: "frame",
		x: startX,
		y: craftingY,
		width: hcraftSlotsXend - startX - 1,
		height: hcraftSlotsYend - craftingY - 1,
		z: 101,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			if(event.type == "CLICK" && patternGridData.patternMode){
				var itemContainerUiHandler = element.window.getContainer();
				updateSlot(itemContainerUiHandler.getElement("hcraft_slot" + (Math.floor((event.x - startX)/craftSlotsSize)+Math.floor((event.y - craftingY)/craftSlotsSize)*3)));
			}
		}
	};


	_elementsGUI_patternGrid['craft_proccessing'] = {
		type: "button",
		x: 0,
		y: 0,
		bitmap: 'RSoptionsButton',
		scale: 18/20
	}
	_elementsGUI_patternGrid['craft_proccessing'].x = _elementsGUI_patternGrid['craft_slot0'].x + (_elementsGUI_patternGrid['craft_slot0'].size - _elementsGUI_patternGrid['craft_proccessing'].scale*20)/2;
	_elementsGUI_patternGrid['craft_proccessing'].y = patternGridData.craftSlotsEnd + ((_elementsGUI_patternGrid["search_frame_crafts"].y - patternGridData.craftSlotsEnd)/2 - _elementsGUI_patternGrid['craft_proccessing'].scale*20)/2;
	var toggleX = _elementsGUI_patternGrid['craft_proccessing'].x;
	var toggleY = _elementsGUI_patternGrid['craft_proccessing'].y;
	var toggleScale = 1.0;
	var toggleTextX = toggleX + 26;
	_elementsGUI_patternGrid["img_processing_bg"] = {
		type: "image",
		x: toggleX,
		y: toggleY,
		z: 5,
		bitmap: "RSoptionsButton",
		scale: toggleScale
	};
	_elementsGUI_patternGrid["switch_processing"] = {
		type: "switch",
		x: toggleX,
		y: toggleY,
		z: 10,
		scale: toggleScale,
		bitmapOff: "empty1",
		bitmapOn: "RSoption_selected",
		state: false,
		onNewState: function(value, container){
			if(patternGridData._settingSwitchState) return;
			if(patternGridData.patternMode === value) return;
			var c = container && container.getParent ? container.getParent() : container;
			if(c) c.sendEvent("updatePatternMode", {val: value});
		}
	};
	_elementsGUI_patternGrid["text_craft_proccessing"] = {
		type: "text",
		x: toggleTextX,
		y: toggleY + 2,
		text: Translation.translate('Processing'),
		font: {
			color: android.graphics.Color.WHITE,
			size: 14,
			shadow: 0.5
		}
	};
	var oredictYstart = toggleY + 28;
	_elementsGUI_patternGrid["img_oredict_bg"] = {
		type: "image",
		x: toggleX,
		y: oredictYstart,
		z: 5,
		bitmap: "RSoptionsButton",
		scale: toggleScale
	};
	_elementsGUI_patternGrid["switch_oredict"] = {
		type: "switch",
		x: toggleX,
		y: oredictYstart,
		z: 10,
		scale: toggleScale,
		bitmapOff: "empty1",
		bitmapOn: "RSoption_selected",
		state: false,
		onNewState: function(value, container){
			if(patternGridData._settingSwitchState) return;
			if(patternGridData.oredictMode === value) return;
			var c = container && container.getParent ? container.getParent() : container;
			if(c) c.sendEvent("updateOredictMode", {val: value});
		}
	};
	_elementsGUI_patternGrid["text_oredict"] = {
		type: "text",
		x: toggleTextX,
		y: oredictYstart + 2,
		text: Translation.translate('Oredict'),
		font: {
			color: android.graphics.Color.WHITE,
			size: 14,
			shadow: 0.5
		}
	};

	var patternSlotsOffset = 7;
	var patternSlotsPadding = 5;
	var patternSlotsSize = _elementsGUI_patternGrid["x_start"] - hcraftSlotsXend - patternSlotsOffset*2;
	var patternButtonSize = patternSlotsSize - 5;
	_elementsGUI_patternGrid['pattern_slot_input'] = {
		id: 'pattern_slot_input',
		type: "slot",
		x: hcraftSlotsXend + patternSlotsOffset,
		y: _elementsGUI_patternGrid["slot0"].y,
		size: patternSlotsSize
	};
	_elementsGUI_patternGrid["click_frame_pattern_slot_input"] = {
		type: "frame",
		x: _elementsGUI_patternGrid['pattern_slot_input'].x,
		y: _elementsGUI_patternGrid['pattern_slot_input'].y,
		z: 100,
		width: (_elementsGUI_patternGrid['pattern_slot_input'].x + _elementsGUI_patternGrid['pattern_slot_input'].size) - _elementsGUI_patternGrid['pattern_slot_input'].x - 1,
		height: (_elementsGUI_patternGrid['pattern_slot_input'].y + _elementsGUI_patternGrid['pattern_slot_input'].size) - _elementsGUI_patternGrid['pattern_slot_input'].y - 1,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			if(event.type == "CLICK"){
				var itemContainerUiHandler = element.window.getContainer();
				updateSlot(itemContainerUiHandler.getElement("pattern_slot_input"));
			}
		}
	};
	_elementsGUI_patternGrid['pattern_craft'] = {
		type: "button",
		x: 0,
		y: 0,
		bitmap: 'patternButtonCraft_default',
		bitmap2: 'patternButtonCraft_pressed',
		scale: patternButtonSize/16,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				itemContainer.sendEvent("craftPattern", {});
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
				itemContainer.sendEvent("craftPattern", {});
			}
		}
	};
	_elementsGUI_patternGrid['pattern_craft'].x = _elementsGUI_patternGrid['pattern_slot_input'].x + (_elementsGUI_patternGrid['pattern_slot_input'].size - _elementsGUI_patternGrid['pattern_craft'].scale*16)/2;
	_elementsGUI_patternGrid['pattern_craft'].y = _elementsGUI_patternGrid['pattern_slot_input'].y + _elementsGUI_patternGrid['pattern_slot_input'].size + patternSlotsPadding;
	_elementsGUI_patternGrid['pattern_slot_export'] = {
		id: 'pattern_slot_export',
		type: "slot",
		x: _elementsGUI_patternGrid['pattern_slot_input'].x,
		y: _elementsGUI_patternGrid['pattern_craft'].y + _elementsGUI_patternGrid['pattern_craft'].scale*16 + patternSlotsPadding,
		size: patternSlotsSize
	};
	_elementsGUI_patternGrid["click_frame_pattern_slot_export"] = {
		type: "frame",
		x: _elementsGUI_patternGrid['pattern_slot_export'].x,
		y: _elementsGUI_patternGrid['pattern_slot_export'].y,
		z: 100,
		width: (_elementsGUI_patternGrid['pattern_slot_export'].x + _elementsGUI_patternGrid['pattern_slot_export'].size) - _elementsGUI_patternGrid['pattern_slot_export'].x - 1,
		height: (_elementsGUI_patternGrid['pattern_slot_export'].y + _elementsGUI_patternGrid['pattern_slot_export'].size) - _elementsGUI_patternGrid['pattern_slot_export'].y - 1,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			if(event.type == "CLICK"){
				var itemContainerUiHandler = element.window.getContainer();
				updateSlot(itemContainerUiHandler.getElement("pattern_slot_export"));
			}
		}
	};
};
var PgridConsPercents = 49/(575.5 - 60);
var PgridCons = PgridConsPercents*(UI.getScreenHeight() - 60);
grid_set_elements(360 + 109 + PgridCons + PgridCons, 70, PgridCons, 0, _elementsGUI_patternGrid, patternGridData, patternGridGUI, patternGridSwitchPage, patternGridFuncs);

var craftingPadding = patternGridData.craftingPadding;
var craftSlotsSize = (37/(575.5-60)) * (UI.getScreenHeight() - 60);
var craftingY = _elementsGUI_patternGrid['redstone_button'].y + 5;
for(var y = 0; y < 3; y++){
	for(var x = 0; x < 3; x++){
		var idx = y * 3 + x;
		_elementsGUI_patternGrid['craft_slot' + idx] = {
			id: 'craft_slot' + idx,
			type: "slot",
			x: 245 + craftingPadding + craftSlotsSize * x,
			y: craftingY + craftSlotsSize * y,
			size: craftSlotsSize
		};
	}
}
var x_arrow = 245 + craftingPadding + craftSlotsSize * 3;
var craftResultSize = (47/37) * craftSlotsSize;
_elementsGUI_patternGrid['craft_result'] = {
	type: "slot",
	x: x_arrow + (_elementsGUI_patternGrid["x_start"] - x_arrow) / 2 - craftResultSize / 2,
	y: craftingY + craftSlotsSize * 1.5 - craftResultSize / 2,
	clicker: {
		onClick: function (itemContainerUiHandler, itemContainer, element) {
			if(!patternGridData.selectedRecipe || !patternGridData.selectedRecipe.craftable) return;
			patternGridFuncs.provideCraft(patternGridData.selectedRecipe.result.count);
		},
		onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			if(!patternGridData.selectedRecipe || !patternGridData.selectedRecipe.craftable) return;
			var result = patternGridData.selectedRecipe.result;
			var maxStack = Item.getMaxStack(result.id);
			patternGridFuncs.provideCraft(maxStack);
		}
	},
	size: craftResultSize
};
_elementsGUI_patternGrid['craft_cleaner'] = {
	type: "button",
	x: _elementsGUI_patternGrid['craft_result'].x + _elementsGUI_patternGrid['craft_result'].size / 4,
	y: _elementsGUI_patternGrid['craft_result'].y - 5 - _elementsGUI_patternGrid['craft_result'].size / 2,
	bitmap: 'RS_empty_button',
	bitmap2: 'RS_empty_button_pressed',
	scale: _elementsGUI_patternGrid['craft_result'].size / 2 / 20
};
_elementsGUI_patternGrid["image_craft_cleaner"] = {
	type: "image",
	x: _elementsGUI_patternGrid["craft_cleaner"].x,
	y: _elementsGUI_patternGrid["craft_cleaner"].y,
	z: 100,
	bitmap: "RS_close_button_icon",
	scale: _elementsGUI_patternGrid['craft_cleaner'].scale,
};
var craftArrowPadding = 6;
_elementsGUI_patternGrid["image_craft_arrow"] = {
	type: "image",
	x: x_arrow + craftArrowPadding,
	y: 0,
	z: 100,
	bitmap: "craft_arrow",
	padding: craftArrowPadding,
	scale: (_elementsGUI_patternGrid['craft_result'].x - craftArrowPadding * 2 - x_arrow) / 22
};
_elementsGUI_patternGrid["image_craft_arrow"].y = _elementsGUI_patternGrid['craft_result'].y + _elementsGUI_patternGrid['craft_result'].size / 2 - _elementsGUI_patternGrid["image_craft_arrow"].scale * 15 / 2;

(function(){
	var windowHeight = UI.getScreenHeight() - 60;
	var craftsSlotsXSettings = {
		count: 8,
		start: 245 + patternGridData.craftingPadding,
		end: _elementsGUI_patternGrid['x_start'] - patternGridData.craftingPadding - 20
	};
	var craftSlotsEnd = _elementsGUI_patternGrid['craft_slot0'] ? (_elementsGUI_patternGrid['craft_slot0'].y + _elementsGUI_patternGrid['craft_slot0'].size * 3) : patternGridData.craftSlotsEnd;
	patternGridData.craftSlotsEnd = craftSlotsEnd;
	var craftsCtx = {
		elements: _elementsGUI_patternGrid,
		gridData: patternGridData,
		drawing: _drawingGUI_patternGrid,
		xStart: craftsSlotsXSettings.start,
		xEnd: craftsSlotsXSettings.end,
		yStart: craftSlotsEnd + 80,
		columns: 8,
		windowHeight: windowHeight,
		switchPage: patternGridSwitchCraftsPage,
		getPages: patternGridFuncs.craftsPages,
		getPageFromCoords: patternGridFuncs.getCraftsPageFromCoords,
		getCoordsFromPage: patternGridFuncs.getCraftsCoordsFromPage,
		onSearch: function(keyword, container, uiHandler) {
			patternGridData.craftsTextSearch = keyword.length ? keyword : false;
			uiHandler.setBinding('search_text_crafts', 'text', keyword.length ? keyword : Translation.translate('Search'));
			patternGridData.crafts = patternGridFuncs.updateCrafts(patternGridData.slotsKeys, patternGridData.craftsTextSearch, patternGridData.originalOnlyItemsMap, container.slots);
			patternGridSwitchCraftsPage(1, container, true);
		},
		onSelectCraft: function(craft, container) {
			if(patternGridData.patternMode) return;
			patternGridFuncs.selectRecipe(craft, container);
		}
	};
	buildCraftsSection(craftsCtx);
})();

patternGrid_set_elements(_elementsGUI_patternGrid, patternGridFuncs);



var patternInv_elements = patternGridGUI.getWindow('inventory').getContent();
patternInv_elements.elements["_CLICKFRAME_"] = {
	type: "frame",
	x: 0,
	y: 0,
	z: -100,
	width: 1000,
	height: 251*9,
	bitmap: "empty",
	scale: 1,
	onTouchEvent: function(){}
};

for (var izxc = 0; izxc < 4; izxc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getPatternGridTexture(izxc));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_pattern_grid"], izxc, render);
}
for (var izxc = 4; izxc < 8; izxc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getPatternGridTexture(izxc - 4, true));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_pattern_grid"], izxc, render);
}


RefinedStorage.copy(BlockID.RS_crafting_grid, BlockID.RS_pattern_grid, {
	defaultValues:{
		patternMode: false,
		oredictMode: false
	},
	blockInfo: {
		id: BlockID.RS_pattern_grid
	},
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.items();
		this.container.openFor(client, "main");
		return true;
	},
	pre_init: function(){
		var tile = this;
		this.container.setGlobalAddTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player){
				if(slot.indexOf('craft_slot') == -1) {
					if(slot.indexOf('pattern_slot_export') != -1) return 0;
					else if(slot.indexOf('pattern_slot_input') != -1 && id != ItemID.RSpattern) return 0;
					else return count;
				}
				var slotItem = itemContainer.getSlot(slot);
				itemContainer.setSlot(slot, id, tile.data.patternMode ? Math.min(slotItem.count + count, Item.getMaxStack(id)) : 1, data, extra);
				if(slot[0] == "c"){
					itemContainer.setSlot("WB_" +slot, id, tile.data.patternMode ? Math.min(slotItem.count + count, Item.getMaxStack(id)) : 1, data, extra);
					var javaRecipe = Recipes.getRecipeByField(itemContainer, null);
					tile.selectRecipe(javaRecipe, player);
				}
				return 0;
			}
		})
		this.container.setGlobalGetTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player){
				if(slot.indexOf('craft_slot') == -1) return count;
				var slotItem = itemContainer.getSlot(slot);
				itemContainer.setSlot(slot, id, slotItem.count - count, data, extra);
				slotItem.validate();
				if(slot[0] == "c"){
					itemContainer.setSlot("WB_" + slot, slotItem.id, slotItem.count, slotItem.data, slotItem.extra);
					var javaRecipe = Recipes.getRecipeByField(itemContainer, null);
					tile.selectRecipe(javaRecipe, player);
				}
				return 0;
			}
		})
	},
	post_init: function () {
		this.container.setWorkbenchFieldPrefix('WB_craft_slot');
		this.data.pushDeleteEvents = {};
		this.data.selectedRecipe = null;
		this.container.setSlotSavingEnabled('pattern_slot_export', true);
		this.container.setSlotSavingEnabled('pattern_slot_input', true);
		this.container.setSlotSavingEnabled('craft_result', true);
		for(var i = 0; i < 9; i++){
			this.container.setSlotSavingEnabled('craft_slot' + i, true);
			this.container.setSlotSavingEnabled('WB_craft_slot' + i, true);
			this.container.setSlotSavingEnabled('hcraft_slot' + i, true);
		}
	},
	selectRecipe: function(javaRecipe, player){
		if(this.data.patternMode) return false;
		if (!javaRecipe) return false;
		var result = javaRecipe.getResult();
		if (!result) return false;
		this.container.setSlot('craft_result', result.id, result.count, result.data == -1 ? 0 : result.data, result.extra || null);
		this.data.selectedRecipe = {
			result: result,
			javaRecipe: javaRecipe,
			craftable: true,
			uid: javaRecipe.getRecipeUid()
		};
		var items = javaRecipe.getSortedEntries();
		if(items){
			for(var i = 0; i < 9; i++){
				if(!items[i] || !items[i].id){
					this.container.setSlot('craft_slot' + i, 0, 0, 0);
					this.container.setSlot('WB_craft_slot' + i, 0, 0, 0);
					continue;
				}
				this.container.setSlot('craft_slot' + i, items[i].id, 1, items[i].data > -1 ? items[i].data : 0, items[i].extra || null);
				this.container.setSlot('WB_craft_slot' + i, items[i].id, 1, items[i].data > -1 ? items[i].data : 0, items[i].extra || null);
			}
		}
		this.container.sendChanges();
		return true;
	},
	provideCraft: function(player){
		if (!this.isWorkAllowed() || !this.data.selectedRecipe || !this.data.selectedRecipe.craftable) return false;
		var netFuncs = RSNetworks[this.data.NETWORK_ID].info;
		var selectedRecipe = this.data.selectedRecipe;
		var javaRecipe = selectedRecipe.javaRecipe;
		var items = javaRecipe.getSortedEntries();
		var smallItemsMap = {};
		for (var i = 0; i < 9; i++) {
			if (!items[i] || !items[i].id) {
				this.container.setSlot('WB_craft_slot' + i, 0, 0, 0);
				continue;
			}
			var item = items[i];
			var itemData = item.data != -1 ? item.data : ((this.originalOnlyItemsMap()[item.id] || [0])[0]);
			var itemUid = item.id + '_' + itemData;
			var itemExtra = (this.originalOnlyItemsExtraMap()[itemUid] || [null])[0];
			if (itemExtra) itemUid += '_' + getExtraUidSuffix(itemExtra);
			if (smallItemsMap[itemUid])
				smallItemsMap[itemUid].count++;
			else
				smallItemsMap[itemUid] = {id: item.id, count: 1, data: itemData, extra: itemExtra};
			this.container.setSlot('WB_craft_slot' + i, item.id, 1, itemData, itemExtra);
		}
		var playerSlots = {};
		for (var i in smallItemsMap) {
			if (!netFuncs.itemCanBeDeleted(smallItemsMap[i]) &&
				(!(playerSlots[i] = searchItem(smallItemsMap[i].id, smallItemsMap[i].data, smallItemsMap[i].extra, false, false, player)) ||
				 playerSlots[i].count < smallItemsMap[i].count)) return false;
		}
		var result = javaRecipe.provideRecipeForPlayer(this.container, player);
		if (!result) return false;
		if (result.data == -1) result.data = 0;
		var __PlayerActor = new PlayerActor(player);
		var fixedEntries = this.container.asScriptableField();
		for (var i in smallItemsMap) {
			var ndeleted = netFuncs.deleteItem(smallItemsMap[i], smallItemsMap[i].count, true);
			if (ndeleted > 0 && (playerSlotData = playerSlots[i])) {
				__PlayerActor.setInventorySlot(playerSlotData.slot, playerSlotData.id,
					playerSlotData.count - ndeleted, playerSlotData.data, playerSlotData.extra);
			}
		}
		(function() {
			for (var i = 0; i < 9; i++) {
				var slot_ = fixedEntries[i];
				if (slot_.count != 0) {
					var answ = netFuncs.pushItem(slot_, slot_.count, true);
					if (answ != 0) {
						__PlayerActor.addItemToInventory(slot_.id, answ, slot_.data, null, true);
					}
				}
			}
		})();
		Callback.invokeCallback("VanillaWorkbenchCraft", result, this.container);
		__PlayerActor.addItemToInventory(result.id, result.count, result.data, result.extra || null, true);
		Callback.invokeCallback("VanillaWorkbenchPostCraft", result, this.container);
		return true;
	},
	refreshGui: function(first, client, updateFilters, updateCrafts){
		var _data = buildCraftingGridPayload(this, first, updateFilters, updateCrafts);
		_data.patternMode = this.data.patternMode;
		_data.oredictMode = this.data.oredictMode;
		_data.craftSlots = this.data.craftSlots || [];
		if(client){
			this.container.sendEvent(client, "openGui", _data);
		} else {
			this.container.sendEvent("openGui", _data);
		}
	},
	refreshModel: function(){
		if(!this.networkEntity) return;
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z}});
	},
	getScreenByName: function(screenName) {
		return patternGridGUI;
	},
	containerEvents: {
		updateFilter: function(eventData, connectedClient){
			GridEvents.updateFilter(this);
		},
		updateReverseFilter: function(eventData, connectedClient){
			GridEvents.updateReverseFilter(this);
		},
		craftPattern: function(eventData, connectedClient){
			if(!this.data.patternMode && this.data.selectedRecipe){
				if(!checkCraft(this.data.selectedRecipe.javaRecipe)) return;
			}
			var slotInput = this.container.getSlot('pattern_slot_input');
			var slotExport = this.container.getSlot('pattern_slot_export');
			if(slotInput.id != ItemID.RSpattern || slotInput.count < 1 || slotExport.id != 0) return;
			var extra = new ItemExtraData();
			extra.putBoolean('isProcessed', this.data.patternMode);
			var oredictMode = this.data.patternMode ? false : this.data.oredictMode;
			extra.putBoolean('oredictEnabled', oredictMode);
			var results = [];
			for(var i = 0; i < 9; i++){
				var slotItem = this.container.getSlot('craft_slot' + i);
				if(!slotItem.id) continue;
				extra.putString('craft' + i, slotItem.id + "," + slotItem.count + "," + (oredictMode ? -1 : slotItem.data));
			}
			if(this.data.patternMode){
				for(var i = 0; i < 9; i++){
					var resultItem = this.container.getSlot('hcraft_slot' + i);
					if(resultItem.id) results.push(resultItem.id + "," + resultItem.count + "," + resultItem.data);
				}
			} else {
				var resultItem = this.container.getSlot('craft_result');
				if(resultItem.id) extra.putString('result0', resultItem.id + "," + resultItem.count + "," + resultItem.data);
			}
			var hasResult = false;
			for(var i in results){
				extra.putString('result' + i, results[i]);
				hasResult = true;
			}
			if(!this.data.patternMode && this.container.getSlot('craft_result').id) hasResult = true;
			if(!hasResult) return;
			this.container.setSlot('pattern_slot_export', ItemID.RSpattern, 1, 0, extra);
			this.container.setSlot('pattern_slot_input', slotInput.id, slotInput.count - 1, slotInput.data);
			slotInput.validate();
			this.container.sendChanges();
		},
		updatePatternMode: function(eventData, connectedClient){
			this.data.patternMode = eventData.val != null ? eventData.val : !this.data.patternMode;
			if(!this.data.patternMode){
				for(var i = 0; i < 9; i++){
					var slotItem = this.container.getSlot('hcraft_slot' + i);
					if(slotItem.id) {
						this.container.setSlot('craft_slot' + i, slotItem.id, slotItem.id ? 1 : 0, slotItem.data, slotItem.extra);
						this.container.setSlot('WB_craft_slot' + i, slotItem.id, slotItem.id ? 1 : 0, slotItem.data, slotItem.extra);
					}
					this.container.setSlot('hcraft_slot' + i, 0, 0, 0);
				}
				this.container.sendChanges();
				var javaRecipe = Recipes.getRecipeByField(this.container, null);
				if(javaRecipe) this.selectRecipe(javaRecipe, connectedClient.getPlayerUid());
			}
			this.refreshGui();
		},
		updateOredictMode: function(eventData, connectedClient){
			this.data.oredictMode = eventData.val != null ? eventData.val : !this.data.oredictMode;
			this.refreshGui();
		},
		clearCraft: function(eventData, connectedClient){
			this.container.setSlot('craft_result', 0, 0, 0);
			for(var i = 0; i < 9; i++){
				this.container.setSlot('craft_slot' + i, 0, 0, 0);
				this.container.setSlot('WB_craft_slot' + i, 0, 0, 0);
				this.container.setSlot('hcraft_slot' + i, 0, 0, 0);
			}
			this.data.selectedRecipe = null;
			this.container.sendChanges();
		},
		selectRecipe: function(eventData, connectedClient){
			if(eventData.uid == undefined) return;
			var javaRecipe = Recipes.getRecipeByUid(eventData.uid);
			this.selectRecipe(javaRecipe, connectedClient.getPlayerUid());
		},
		provideCraft: function(eventData, connectedClient){
			if(!this.data.selectedRecipe || !this.data.selectedRecipe.craftable) return;
			var result = this.data.selectedRecipe.result;
			for(var count = 0; count < eventData.count; count += result.count){
				if(!this.provideCraft(connectedClient.getPlayerUid())) break;
			}
		this.items();
		this.refreshGui(false, false, true);
	},
	craftPreview: function(eventData, connectedClient){
		GridEvents.craftPreview(this, eventData, connectedClient);
	},
	provideConstructedCraft: function(eventData, connectedClient){
		GridEvents.provideConstructedCraft(this, eventData, connectedClient);
	}
},
	client: {
		refreshModel: function(){
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getPatternGridTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		ticks: 0,
		tick: function(){
			this.ticks++;
			if(this.networkData.getBoolean('update', false)){
				this.networkData.putBoolean('update', false);
				this.updateCrafts = true;
				var pushDeleteEvents = buildPushDeleteEvents(this.networkData);
				this.sendPacket("pushDeleteEvents", {pushDeleteEvents: pushDeleteEvents});
			}
			if(this.updateCrafts && this.ticks%20 == 0){
				this.updateCrafts = false;
				if(patternGridData.name == this.networkData.getName())patternGridData.updateGui(true, false, true);
			}
		},
		events: {
			refreshModel: function(eventData, packetExtra) {
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getPatternGridTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			openCraftPreview: function(container, window, content, eventData){
				openCraftPreview(container, eventData);
			},
			openGui: function(container, window, content, eventData){
				if(!content || !window || !window.isOpened()) return;
				eventData.disksStorage = Number(eventData.disksStorage);
				patternGridData._settingSwitchState = true;
				Object.assign(patternGridData, eventData);
				patternGridData._settingSwitchState = false;
				patternGridData.container = container;
				patternGridData.updateGui = function(refresh, updateFilters, updateCrafts, nonlocal){
					if(!content || !window || !window.isOpened()) return;
					delete container.slots.bindings;
					delete container.slots.slots;
					var synced = SyncedNetworkData.getClientSyncedData(eventData.name);
					if (!synced) return;
					patternGridData.networkData = synced;
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
						patternGridData.originalOnlyItemsExtraMap = originalOnlyItemsExtraMap;
						patternGridData.originalOnlyItemsMap = originalOnlyItemsMap;
						patternGridData.slotsKeys = _slotKeys;
						if(!refresh)patternGridData.textSearch = false;
						patternGridData.slotsKeys = RefinedStorage.sortItems(eventData.sort, eventData.reverse_filter, patternGridData.textSearch || null, container, patternGridData.slotsKeys);
						var originalItemsMap = patternGridData.slotsKeys.map(function(__slot) {
							return getItemUid(container.slots[__slot]);
						});
						patternGridData.originalItemsMap = originalItemsMap;
					}
					content.elements["image_filter"].bitmap = 'RS_filter' + (eventData.sort + 1);
					if (eventData.reverse_filter) {
						content.elements["image_reverse_filter"].bitmap = 'RS_arrow_up';
					} else {
						content.elements["image_reverse_filter"].bitmap = 'RS_arrow_down';
					}
					content.elements["search_text"].text = patternGridData.textSearch ? patternGridData.textSearch : Translation.translate('Search');
					content.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
					var slots_count = content.elements.slots_count;
					content.elements["slider_button"].bitmap = patternGridData.slotsKeys.length <= patternGridData.slots_count ? 'slider_buttonOff' : 'slider_buttonOn';
					var crafts_slots_count = content.elements.crafts_slots_count;
					if (!eventData.isWorkAllowed) {
						for (var i = 0; i < slots_count; i++) content.elements['slot' + i].bitmap = 'classic_darken_slot';
						content.elements["slider_button"].bitmap = 'slider_buttonOff';
						for (var i = 0; i < crafts_slots_count; i++) content.elements['item_craft_slot' + i].bitmap = 'classic_darken_slot';
					} else if (content.elements['slot0'].bitmap == 'classic_darken_slot') {
						for (var i = 0; i < slots_count; i++) content.elements['slot' + i].bitmap = 'classic_slot';
						content.elements["slider_button"].bitmap = 'slider_buttonOn';
						for (var i = 0; i < crafts_slots_count; i++) content.elements['item_craft_slot' + i].bitmap = 'classic_slot';
					}
					patternGridSwitchPage(refresh ? patternGridData.lastPage : 1, container, true);
					if(updateCrafts){
						scheduleLowPrioritySort(function(){
							patternGridData.isDarkenMap = {};
							patternGridData.crafts = patternGridFuncs.updateCrafts(patternGridData.slotsKeys, patternGridData.craftsTextSearch, patternGridData.originalOnlyItemsMap, container.slots);
							patternGridSwitchCraftsPage(refresh ? patternGridData.lastCraftsPage : 1, container, true);
						});
					}
					moveCraftsSlots(patternGridData.patternMode);
					patternGridData._settingSwitchState = true;
					try {
						if(content.elements["switch_processing"]) content.elements["switch_processing"].state = patternGridData.patternMode;
						if(content.elements["switch_oredict"]) content.elements["switch_oredict"].state = patternGridData.oredictMode;
						patternGridGUI.getWindow('main').forceRefresh();
					} finally {
						patternGridData._settingSwitchState = false;
					}
				}
				if(patternGridData.lowPriority){
					patternGridData.lowPriority = false;
					scheduleLowPrioritySort(function(){
						patternGridData.updateGui(eventData.refresh, eventData.updateFilters, eventData.updateCrafts, true);
					});
				} else {
					patternGridData.updateGui(eventData.refresh, eventData.updateFilters, eventData.updateCrafts, true);
				}
			}
		}
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
	post_destroy: function () {
		for(var i in this.container.slots){
			if(i.indexOf('pattern_slot') == -1)this.container.clearSlot(i);
		}
	}
});
