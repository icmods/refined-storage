var __rsStorageTouch = null;

function rsResetStorageTouch() {
	if (__rsStorageTouch) {
		__rsStorageTouch.swipeY = false;
		__rsStorageTouch.swipeSum = 0;
		__rsStorageTouch.moving = false;
	}
}

function createStorageContext(config) {
	var ctx = {
		x: config.x,
		y: config.y,
		cons: config.cons,
		limit: config.limit,
		elements: config.elements,
		gridSwitchPage: config.gridSwitchPage,
		gridData: config.gridData || {
			maxY: 0, lastPage: -1, textSearch: false, updateGui: function(){}
		},
		gridFuncs: config.gridFuncs,
		window_: config.window_,

		x_count: 0,
		y_count: 0,
		slots_count: 0,
		grid_end_x: 0,
		grid_end_y: 0,

		headerElements: null,
		headerWindow: null,
		fontName: null,
		fontDescr: null,

		moving: false,
		max_y: 0,
		swipe: { y: false, sum: 0 }
	};

	ctx.x_count = Math.round((910 - ctx.x) / ctx.cons);
	ctx.y_count = ctx.limit || Math.round((UI.getScreenHeight() - 60 - ctx.y - ctx.cons) / ctx.cons);

	return ctx;
}

function buildClickFrame(ctx) {
	ctx.elements.clickFrameTouchEvents = [];
	ctx.elements["click_frame"] = {
		type: "frame",
		x: -100,
		y: -100,
		z: -100,
		width: 1200,
		height: 1200,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			for(var i in ctx.elements.clickFrameTouchEvents){
				ctx.elements.clickFrameTouchEvents[i](element, event);
			}
		}
	};
}

function buildItemInfoPanel(ctx) {
	var headerWindow = ctx.window_.getWindow('header');
	var headerElements = headerWindow.getContent().elements;
	ctx.headerWindow = headerWindow;
	ctx.headerElements = headerElements;

	headerElements['itemInfoFrame'] = {
        type: "frame",
        x: 100,
        y: 15,
        width: 300,
        height: 50,
        bitmap: "itemInfoFrame",
        scale: 2
	}
	headerElements['itemInfoSlot'] = {
        type: "slot",
        x: headerElements['itemInfoFrame'].x + 5,
		y: headerElements['itemInfoFrame'].y + 5,
		z: 100,
		size: 40,
		bitmap: "_default_slot_empty",
		isTransparentBackground: true,
		visual: true
	}
	headerElements['itemInfoName'] = {
		type: "text",
		x: headerElements['itemInfoSlot'].x + headerElements['itemInfoSlot'].size + 3,
		y: headerElements['itemInfoSlot'].y + 1,
		z: 100,
		text: "",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0,
			size: 11
		}
	}
	headerElements['itemInfoDescription'] = {
		type: "text",
		x: headerElements['itemInfoSlot'].x + headerElements['itemInfoSlot'].size + 3,
		y: headerElements['itemInfoName'].y + Math.round(headerElements['itemInfoName'].font.size*1.1) + 2,
		z: 100,
		text: "",
		multiline: true,
		font: {
			color: android.graphics.Color.GRAY,
			shadow: 0,
			size: 9
		}
	}
	ctx.fontName = new JavaFONT(headerElements['itemInfoName'].font);
	ctx.fontDescr = new JavaFONT(headerElements['itemInfoDescription'].font);

	function setItemInfoSlot(_item, container){
		var item = container.getSlot(_item);
		var infoSignature = _item + '|' + item.id + '|' + item.data + '|' + item.count + '|' + (item.extra ? getExtraUidSuffix(item.extra) : '');
		if (ctx.gridData._lastInfoSignature === infoSignature) return;
		ctx.gridData._lastInfoSignature = infoSignature;
		ctx.gridData.selectedItemInfoSlot = _item;
		container.setSlot('itemInfoSlot', item.id, 1, item.data, item.extra);
		var fullName = Item.getName(item.id, item.data, item.extra).replace(/§./g, '');
		var splitedName = fullName.split('\n');
		var text = (splitedName[0].length > 40 ? splitedName[0].substr(0, 40) + '...' : splitedName[0]) + ' (' + numberWithCommas(item.count) + ')';
		if(Config.dev)splitedName.push('id: ' + item.id + '  data: ' + item.data);
		container.setText('itemInfoName', text);
		container.setText('itemInfoDescription', splitedName.slice(1).join('\n'));
		var frameWidth = 0;
		var drawScale = headerWindow.location.getDrawingScale();
		var nameWidth = ctx.fontName.getBounds(text, headerElements['itemInfoName'].x * drawScale, headerElements['itemInfoName'].y * drawScale, parseFloat(1.0)).width();
		frameWidth = nameWidth;
		var newSplitedName = splitedName.slice(1);
		for(var i in newSplitedName){
			var descrWidth = ctx.fontDescr.getBounds(newSplitedName[i], headerElements['itemInfoDescription'].x * drawScale, headerElements['itemInfoDescription'].y * drawScale, parseFloat(1.0)).width();
			if(descrWidth > frameWidth) frameWidth = descrWidth;
		}
		headerElements['itemInfoFrame'].width = 50 + frameWidth + 10;
		UiCore.safeRun(function () { headerWindow.forceRefresh(); }, "RS-itemInfo");
	}
	ctx.gridData.setItemInfoSlot = setItemInfoSlot;
}

function buildStorageSearch(ctx) {
	var searchBox = UiCore.searchBox(ctx.x, 30, ctx.x_count * ctx.cons, {
		title: Translation.translate("Please type the keywords"),
		textLabel: Translation.translate('Search'),
		positiveLabel: Translation.translate("Search"),
		fontSize: 20,
		onSearch: function (keyword, uiHandler, container) {
			ctx.gridData.textSearch = keyword.length ? keyword : false;
			ctx.gridData.updateGui(true, true, ctx.gridData.isCrafting);
		}
	});
	ctx.elements["search_frame"] = searchBox.frame;
	ctx.elements["search_text"] = searchBox.text;
}

function buildStorageSlots(ctx) {
	var asd = 0;
	var _y = ctx.y;
	var _x = ctx.x;
	for (var i = 0; i < ctx.y_count; i++) {
		_x = ctx.x;
		for (var k = 0; k < ctx.x_count; k++) {
			ctx.elements['slot' + asd] = {
				type: "slot",
				num: asd,
				x: _x,
				y: _y,
				visual: true,
				onTouchEvent: function(element, event){
					var itemContainerUiHandler = element.window.getContainer();
					var itemContainer = itemContainerUiHandler.getParent();
					var _num = this.num + (ctx.gridData.lastPage - 1) * ctx.x_count;
					var slot = ctx.gridData.slotsKeys[_num];
					if(!slot)return;
					ctx.gridData.setItemInfoSlot(slot, itemContainer);
				},
				clicker: {
					onClick: function (itemContainerUiHandler, itemContainer, element) {
						var itemContainer = itemContainer.slots ? itemContainer : element;
						if (!ctx.gridData.isWorkAllowed) return;
						var _num = this.num + (ctx.gridData.lastPage - 1) * ctx.x_count;
						var slot = ctx.gridData.slotsKeys[_num];
						var slotItem = itemContainer.slots[slot];
						if(!slotItem || slotItem.id == 0) return;
						if(slotItem.count == 0){
							if(typeof preSelectCraftItem !== 'undefined'){
								preCraftdata.container = itemContainer;
								preSelectCraftItem(slotItem);
								var maxStack = Item.getMaxStack(slotItem.id);
								preSetCraftCount(maxStack);
								if(typeof backgroundGUI !== 'undefined') backgroundGUI.open();
								preCraftCountGUI.open();
							}
							return;
						}
						var _count = StorageCore.Transfer.BUTTON(slotItem, 0, false);
						var updateFull = false;
						if(slotItem.count == _count) {
							updateFull = true;
						} else if(ctx.gridData.sort == 0){
							if(_num > 0 && slotItem.count - _count <= itemContainer.slots[ctx.gridData.slotsKeys[_num - 1]].count){
								updateFull = true;
							}
						}
						/* UI renders only the authoritative server state. */
						ctx.gridData.setItemInfoSlot(slot, itemContainer);
						ContainerSync.queueDelete(ctx.gridData.networkData, slot, _count, updateFull, { id: slotItem.id, data: slotItem.data, uid: getItemUid(slotItem) });
						if(ctx.gridData.clientTile && ctx.gridData.clientTile.flushPendingTransfer) ctx.gridData.clientTile.flushPendingTransfer();
					},
					onLongClick: function (itemContainerUiHandler, itemContainer, element) {
						var itemContainer = itemContainer.slots ? itemContainer : element;
						if (!ctx.gridData.isWorkAllowed) return;
						var _num = this.num + (ctx.gridData.lastPage - 1) * ctx.x_count;
						var slot = ctx.gridData.slotsKeys[_num];
						var slotItem = itemContainer.slots[slot];
						if(!slotItem || slotItem.id == 0) return;
						if(slotItem.count == 0){
							if(typeof preSelectCraftItem !== 'undefined'){
								preCraftdata.container = itemContainer;
								preSelectCraftItem(slotItem);
								var maxStack = Item.getMaxStack(slotItem.id);
								preSetCraftCount(maxStack);
								if(typeof backgroundGUI !== 'undefined') backgroundGUI.open();
								preCraftCountGUI.open();
							}
							return;
						}
						var maxStack = Item.getMaxStack(slotItem.id);
						var this_item = searchInventory(Player, slotItem.id, slotItem.data, -1, false, true);
						var _capacity = this_item && this_item.count < maxStack && this_item.extra === slotItem.extra ? maxStack - this_item.count : maxStack;
						var _count = StorageCore.Transfer.BUTTON(slotItem, _capacity, true);
						var updateFull = false;
						if(slotItem.count <= _count) {
							updateFull = true;
						} else if(ctx.gridData.sort == 0){
							if(_num > 0 && slotItem.count - _count <= itemContainer.slots[ctx.gridData.slotsKeys[_num - 1]].count){
								updateFull = true;
							}
						}
						/* UI renders only the authoritative server state. */
						ctx.gridData.setItemInfoSlot(slot, itemContainer);
						ContainerSync.queueDelete(ctx.gridData.networkData, slot, _count, updateFull, { id: slotItem.id, data: slotItem.data, uid: getItemUid(slotItem) });
						if(ctx.gridData.clientTile && ctx.gridData.clientTile.flushPendingTransfer) ctx.gridData.clientTile.flushPendingTransfer();
					}
				},
				size: ctx.cons + 1
			}
			asd++;
			_x += ctx.cons;
		}
		_y += ctx.cons;
	}
	ctx.elements["slots_count"] = asd;
	ctx.elements["x_count"] = ctx.x_count;
	ctx.elements["y_count"] = ctx.y_count;
	ctx.elements["x_start"] = ctx.x;
	ctx.elements["x_end"] = _x;
	ctx.elements["y_start"] = ctx.y;
	ctx.elements["y_end"] = _y;
	ctx.elements["cons"] = ctx.cons;

	ctx.gridData.slots_count = asd;
	ctx.gridData.x_count = ctx.x_count;
	ctx.gridData.y_count = ctx.y_count;
	ctx.gridData.cons = ctx.cons;

	ctx.slots_count = asd;
	ctx.grid_end_x = _x;
	ctx.grid_end_y = _y;
}

function buildStorageSlider(ctx) {
	var slider_frame_cons = 20;
	var slider_frame_border = 7;
	var __uiTouch = ctx.__uiTouch || (ctx.__uiTouch = { swipeY: false, swipeSum: 0, moving: false });
	__rsStorageTouch = __uiTouch;
	var __uiItemContainerUiHandler = null;
	var __uiItemContainer = null;
	var __uiSliderHandler = UiCore.attachSlider({
		itemCount: function () { return ctx.gridData.slotsKeys.length; },
		pagination: ctx.gridFuncs,
		switchPage: function (page) { ctx.gridSwitchPage(page, __uiItemContainer); },
		state: __uiTouch
	});
	ctx.elements["slider_frame"] = {
		type: "frame",
		x: 0,
		y: ctx.y,
		width: 50,
		height: ctx.y_count * ctx.cons,
		bitmap: "slider",
		scale: 1,
		onTouchEvent: function (element, event) {
			__uiItemContainerUiHandler = element.window.getContainer();
			__uiItemContainer = __uiItemContainerUiHandler.getParent();
			__uiSliderHandler(element, event);
		}
	}
	ctx.elements["slider_frame"].x = ctx.grid_end_x + ctx.cons / 3;
	ctx.elements["slider_button"] = {
		type: "button",
		x: ctx.elements["slider_frame"].x + slider_frame_border,
		start_y: ctx.elements["slider_frame"].y + slider_frame_border,
		y: ctx.elements["slider_frame"].y + slider_frame_border,
		bitmap: 'slider_buttonOff',
		scale: (ctx.elements["slider_frame"].width - slider_frame_border * 2) / 12
	}
	ctx.elements["button_up"] = {
		type: "button",
		x: 0,
		y: 0,
		bitmap: 'but_up',
		bitmap2: 'but_upPressed',
		scale: ctx.elements["slider_frame"].width/25,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				ctx.gridSwitchPage(ctx.gridData.lastPage - 1, itemContainer);
			},
			onLongClick: function (itemContainerUiHandler, container, element) {
			}
		}
	}
	ctx.elements["slider_frame"].height -= 20 + ctx.elements["button_up"].scale * 15;

	ctx.elements["button_up"].x = ctx.grid_end_x + (1000 - ctx.grid_end_x - ctx.elements["button_up"].scale * 25) / 2;
	ctx.elements["button_up"].y = 20 + (50 - ctx.elements["button_up"].scale * 15) / 2;

	ctx.elements["button_down"] = {
		type: "button",
		x: ctx.grid_end_x + slider_frame_cons,
		y: ctx.y + ctx.elements["slider_frame"].height + 20,
		bitmap: 'but_down',
		bitmap2: 'but_downPressed',
		scale: ctx.elements["button_up"].scale,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				ctx.gridSwitchPage(ctx.gridData.lastPage + 1, itemContainer);
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
	ctx.elements["button_down"].x = ctx.grid_end_x + (1000 - ctx.grid_end_x - ctx.elements["button_down"].scale * 25) / 2;
	ctx.elements["button_down"].y = ctx.y + ctx.elements["slider_frame"].height + (50 - ctx.elements["button_down"].scale * 15) / 2;
}

function buildStorageSwipeHandler(ctx) {
	var __uiTouch = ctx.__uiTouch || (ctx.__uiTouch = { swipeY: false, swipeSum: 0, moving: false });
	__rsStorageTouch = __uiTouch;
	var __uiItemContainerUiHandler = null;
	var __uiItemContainer = null;
	var __uiAdapter = {
		bounds: { xStart: 0, xEnd: 0, yStart: 0, yEnd: 0 },	// refreshed on every event (the x_* elements are set after this builder)
		itemCount: function () { return ctx.gridData.slotsKeys.length; },
		pagination: ctx.gridFuncs,
		getLastPage: function () { return ctx.gridData.lastPage; },
		switchPage: function (page, fromSwipe, dontMoveSlider) { ctx.gridSwitchPage(page, __uiItemContainer, fromSwipe, dontMoveSlider); },
		state: __uiTouch,
		maxY: 0,
		sliderStartY: 0,
		sliderScale: 0,
		sliderX: 0,
		sliderElementName: "slider_button",
		getElement: function (name) { return rsGetLiveElement(__uiItemContainer, name); },
		snapSliderOnRelease: false
	};
	var __uiSwipeHandler = UiCore.attachSwipe(__uiAdapter);
	ctx.elements.clickFrameTouchEvents.push(function (element, event) {
		__uiItemContainerUiHandler = element.window.getContainer();
		__uiItemContainer = __uiItemContainerUiHandler.getParent();
		__uiAdapter.maxY = ctx.max_y;
		__uiAdapter.bounds = { xStart: ctx.elements["x_start"], xEnd: ctx.elements["x_end"], yStart: ctx.elements["y_start"], yEnd: ctx.elements["y_end"] };
		var __slider = ctx.elements["slider_button"];
		if (__slider) {
			__uiAdapter.sliderStartY = __slider.start_y;
			__uiAdapter.sliderScale = __slider.scale;
			__uiAdapter.sliderX = __slider.x;
		}
		__uiSwipeHandler(element, event);
	});
}


function buildSettingsButtons(ctx) {
	var settings_cons = 10;
	ctx.elements.settings_cons = settings_cons;
	ctx.elements["redstone_button"] = {
		type: "button",
		x: 0,
		y: ctx.y,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: 2,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateRedstoneMode", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {

			}
		}
	}
	ctx.elements["redstone_button"].x = ctx.x - settings_cons - (20 * ctx.elements["redstone_button"].scale);

	ctx.elements["image_redstone"] = {
		type: "image",
		x: ctx.elements["redstone_button"].x,
		y: ctx.elements["redstone_button"].y,
		z: 100,
		bitmap: "redstone_GUI_0",
		scale: ctx.elements["redstone_button"].scale*20/16,
	}

	ctx.elements["filter_button"] = {
		type: "button",
		x: 0,
		y: ctx.elements["redstone_button"].y + (ctx.elements["redstone_button"].scale * 20) + settings_cons,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: 2,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateFilter", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {
				
			}
		}
	}
	ctx.elements["filter_button"].x = ctx.x - settings_cons - (20 * ctx.elements["filter_button"].scale);

	ctx.elements["image_filter"] = {
		type: "image",
		x: ctx.elements["filter_button"].x + (ctx.elements["filter_button"].scale * 20 - 24) / 2,
		y: ctx.elements["filter_button"].y + (ctx.elements["filter_button"].scale * 20 - 24) / 2,
		z: 1000,
		bitmap: "RS_filter1",
		scale: 4,
	}

	ctx.elements["reverse_filter_button"] = {
		type: "button",
		x: 0,
		y: ctx.elements["filter_button"].y + (ctx.elements["filter_button"].scale * 20) + settings_cons,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: 2,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateReverseFilter", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {
				
			}
		}
	}
	ctx.elements["reverse_filter_button"].x = ctx.x - settings_cons - (20 * ctx.elements["reverse_filter_button"].scale);

	ctx.elements["image_reverse_filter"] = {
		type: "image",
		x: 0,
		y: 0,
		z: 1000,
		bitmap: "RS_arrow_down",
		scale: 3.5,
	}
	ctx.elements["image_reverse_filter"].x = ctx.elements["reverse_filter_button"].x + (ctx.elements["reverse_filter_button"].scale * 20 - (ctx.elements["image_reverse_filter"].scale * 8)) / 2
	ctx.elements["image_reverse_filter"].y = ctx.elements["reverse_filter_button"].y + (ctx.elements["reverse_filter_button"].scale * 20 - (ctx.elements["image_reverse_filter"].scale * 10)) / 2

	ctx.max_y = (ctx.elements["slider_frame"].y + ctx.elements["slider_frame"].height) - 7 - ctx.elements["slider_button"].scale * 15;
	ctx.elements["max_y"] = ctx.max_y;
	ctx.gridData.maxY = ctx.max_y;
}

function grid_set_elements(x, y, cons, limit, elementsGUI_grid, grid_Data, _window, __gridSwitchPage, __gridFuncs) {
	var ctx = createStorageContext({
		x: x,
		y: y,
		cons: cons,
		limit: limit,
		x_count: grid_Data.x_count,
		elements: elementsGUI_grid,
		gridData: grid_Data,
		gridSwitchPage: __gridSwitchPage || _gridSwitchPage__,
		gridFuncs: __gridFuncs || gridFuncs,
		window_: _window
	});

	buildClickFrame(ctx);
	buildItemInfoPanel(ctx);
	buildStorageSwipeHandler(ctx);
	buildStorageSearch(ctx);
	buildStorageSlots(ctx);
	buildStorageSlider(ctx);
	buildSettingsButtons(ctx);
}

