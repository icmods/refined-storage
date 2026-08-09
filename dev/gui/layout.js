function grid_set_elements(x, y, cons, limit, elementsGUI_grid, grid_Data, _window, __gridSwitchPage) {
	var gridSwitchPage = __gridSwitchPage || _gridSwitchPage__;
	var gridData = grid_Data || {
		maxY: 0,
		lastPage: -1,
		textSearch: false,
		updateGui: function(){}
	};
	var moving = false;
	var max_y = 0;
	var swipe_y;
	var swipe_sum = 0;
	elementsGUI_grid.clickFrameTouchEvents = [];
	elementsGUI_grid["click_frame"] = {
		type: "frame",
		x: -100,
		y: -100,
		z: -100,
		width: 1200,
		height: 1200,
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			for(var i in elementsGUI_grid.clickFrameTouchEvents){
				elementsGUI_grid.clickFrameTouchEvents[i](element, event);
			}
		}
	};
	var headerWindow = _window.getWindow('header');
	var headerElements = headerWindow.getContent().elements;
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
	var _font = new JavaFONT(headerElements['itemInfoName'].font);
	var _font2 = new JavaFONT(headerElements['itemInfoDescription'].font);
	function setItemInfoSlot(_item, container){
		gridData.selectedItemInfoSlot = _item;
		var item = container.getSlot(_item);
		container.setSlot('itemInfoSlot', item.id, 1, item.data, item.extra);
		var fullName = Item.getName(item.id, item.data, item.extra).replace(/§./g, '');
		var splitedName = fullName.split('\n');
		//if(splitedName[0][0] == '§') headerElements['itemInfoName'].font.color = parseMineColor(splitedName[0][1]);
		var text = (splitedName[0].length > 40 ? splitedName[0].substr(0, 40) + '...' : splitedName[0]) + ' (' + numberWithCommas(item.count) + ')';
		if(Config.dev)splitedName.push('id: ' + item.id + '  data: ' + item.data);
		container.setText('itemInfoName', text);
		container.setText('itemInfoDescription', splitedName.slice(1).join('\n'));
		var frameWidth = 0;
		var drawScale = headerWindow.location.getDrawingScale();
		var nameWidth = _font.getBounds(text, headerElements['itemInfoName'].x * drawScale, headerElements['itemInfoName'].y * drawScale, parseFloat(1.0)).width();
		frameWidth = nameWidth;
		var newSplitedName = splitedName.slice(1);
		for(var i in newSplitedName){
			var descrWidth = _font2.getBounds(newSplitedName[i], headerElements['itemInfoDescription'].x * drawScale, headerElements['itemInfoDescription'].y * drawScale, parseFloat(1.0)).width();
			if(descrWidth > frameWidth) frameWidth = descrWidth;
		}
		//alert(headerElements['itemInfoName'].x + " + " + frameWidth + " + " + 5 + " = " + (headerElements['itemInfoName'].x + frameWidth + 5));
		headerElements['itemInfoFrame'].width = 50 + frameWidth + 10;
		headerWindow.forceRefresh();
	}
	gridData.setItemInfoSlot = setItemInfoSlot;
	elementsGUI_grid.clickFrameTouchEvents.push(function (element, event) {
		var content = {elements:elementsGUI_grid};/* element.window.getContent(); *///getContainer().getGuiContent();
		var itemContainerUiHandler = element.window.getContainer();
		var itemContainer = itemContainerUiHandler.getParent();
		if (event.type == "DOWN" && !swipe_y && event.x > elementsGUI_grid["x_start"] && event.x < elementsGUI_grid["x_end"] && event.y > elementsGUI_grid["y_start"] && event.y < elementsGUI_grid["y_end"]) {
			swipe_y = event.y;
		} else if (swipe_y && event.type == "MOVE") {
			var distance = Math.abs(event.y - swipe_y);
			function moveSwitchPage_(_n){
				_n = (_n ? 1 : -1);
				gridSwitchPage(gridData.lastPage + _n, itemContainer);
			}
			if (distance > 7) {
				if (event.y > swipe_y) moveSwitchPage_(false);
				if (event.y < swipe_y) moveSwitchPage_(true);
				swipe_sum = 0;
			} else {
				swipe_sum += distance;
				if (swipe_sum > 15) {
					if (event.y > swipe_y) moveSwitchPage_(false);
					if (event.y < swipe_y) moveSwitchPage_(true);
					swipe_sum = 0;
				}
			}
			swipe_y = event.y;
		} else if (swipe_y && (event.type == "UP" || event.type == "CLICK")) {
			swipe_y = false;
		}
		if (!moving) return;
		event.y -= content.elements["slider_button"].scale * 15 / 2;
		if (event.type != 'UP' && event.type != "CLICK") {
			var page = gridFuncs.getPageFromCoords(event, gridFuncs.getPages(gridData.slotsKeys.length));
			itemContainerUiHandler.getElement("slider_button").setPosition(content.elements['slider_button'].x, Math.max(Math.min(event.y, max_y), content.elements["slider_button"].start_y));
			gridSwitchPage(page, itemContainer, false, true);
		}
		if (event.type == "UP" || event.type == "CLICK") {
			moving = false;
			var pages = gridFuncs.getPages(gridData.slotsKeys.length);
			var page = gridFuncs.getPageFromCoords(event, pages);
			gridSwitchPage(page, itemContainer);
		}
	})

	var x_count = Math.round((910 - x) / cons);
	var y_count = limit || Math.round((UI.getScreenHeight()- 60 - y - cons) / cons);

	elementsGUI_grid["search_frame"] = {
		type: "frame",
		x: x,
		y: 30,
		width: x_count*cons,
		height: 30,
		bitmap: "search_bar",
		scale: 0.8,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UI.getContext().runOnUiThread(new java.lang.Runnable({// I take this from Recipe Viewer https://icmods.mineprogramming.org/mod?id=455 :D
					run: function () {
						try {
							var editText = new android.widget.EditText(UI.getContext());
							//editText.setHint(Translation.translate("Type here item name"));
							new android.app.AlertDialog.Builder(UI.getContext())
								.setTitle(Translation.translate("Please type the keywords"))
								.setView(editText)
								.setPositiveButton(Translation.translate("Search"), {
									onClick: function () {
										if (!itemContainerUiHandler.getWindow().isOpened()) return;
										var keyword = editText.getText() + "";
										gridData.textSearch = keyword.length ? keyword : false;
										gridData.updateGui(true, true, gridData.isCrafting);
									}
								}).show();
							//UI.getContext().getActionBar().hide();
						} catch (e) {
							alert(e);
						}
					}
				}));
			}
		}
	}

	elementsGUI_grid["search_text"] = {
		type: "text",
		x: x + 10,
		y: 30 + 1,
		z: 100,
		text: Translation.translate('Search'),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 20
		}
	}

	var asd = 0;
	var _y = y;
	var _x = x;
	for (var i = 0; i < y_count; i++) {
		_x = x;
		for (var k = 0; k < x_count; k++) {
			elementsGUI_grid['slot' + asd] = {
				type: "slot",
				num: asd,
				x: _x,
				y: _y,
				visual: true,
				onTouchEvent: function(element, event){
					var itemContainerUiHandler = element.window.getContainer();
					var itemContainer = itemContainerUiHandler.getParent();
					var _num = this.num + (gridData.lastPage - 1) * x_count;
					var slot = gridData.slotsKeys[_num];
					if(!slot)return;
					setItemInfoSlot(slot, itemContainer);
				},
				clicker: {
					onClick: function (itemContainerUiHandler, itemContainer, element) {
						var itemContainer = itemContainer.slots ? itemContainer : element;
						if (!gridData.isWorkAllowed) return;
						var _num = this.num + (gridData.lastPage - 1) * x_count;
						var slot = gridData.slotsKeys[_num];
						var slotItem = itemContainer.slots[slot];
						if(!slotItem || slotItem.id == 0) return;
						var _count = 1;
						var updateFull = false;
						if(Config.dev)Logger.Log('Deleting slot: ' + slot + ' ; num: ' + this.num + '(' + _num + ') ; lastPage: ' + gridData.lastPage + ' ; count: ' + _count + ' ; x_count: ' + x_count, 'RefinedStorageDebug');
						var elements_ = itemContainer.getUiAdapter().getWindow().getWindow('main').getElements();
						if(slotItem.count == _count) {
							itemContainer.setSlot(slot, 0, 0, 0);
							gridData.slotsKeys.splice(_num, 1);
							updateFull = true;
							gridData.updateGui(true, true);
						} else {
							if(gridData.sort == 0){
								if(_num > 0 && slotItem.count - _count <= itemContainer.slots[gridData.slotsKeys[_num - 1]].count){
									itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
									updateFull = true;
									gridData.updateGui(true, true);
								} else {
									itemContainer.markSlotDirty('slot' + this.num);
									elements_.get('slot' + this.num).setBinding('text', cutNumber(slotItem.count - _count, true) + "");
									itemContainer.setSlot('slot' + this.num, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
									//itemContainer.setText('slot' + this.num, cutNumber(slotItem.count - _count));
									itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
								}
							} else {
								itemContainer.markSlotDirty('slot' + this.num);
								elements_.get('slot' + this.num).setBinding('text', cutNumber(slotItem.count - _count, true) + "");
								itemContainer.setSlot('slot' + this.num, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
								//itemContainer.setText('slot' + this.num, cutNumber(slotItem.count - _count));
								itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
							}
						}
						setItemInfoSlot(slot, itemContainer);
						var map = (asdgfasdasddsad = gridData.networkData.getString('deleteItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
						if(map.indexOf(slot) == -1){
							map.push(slot);
							gridData.networkData.putString('deleteItemsMap', JSON.stringify(map));
						}
						gridData.lowPriority = true;
						var currentCount = gridData.networkData.getInt(slot, 0);
						gridData.networkData.putInt(slot, currentCount + _count);
						gridData.networkData.putBoolean('update', true);
						gridData.networkData.putBoolean('updateFull'+slot, updateFull);
					},
					onLongClick: function (itemContainerUiHandler, itemContainer, element) {
						var itemContainer = itemContainer.slots ? itemContainer : element;
						if (!gridData.isWorkAllowed) return;
						var _num = this.num + (gridData.lastPage - 1) * x_count;
						var slot = gridData.slotsKeys[_num];
						var slotItem = itemContainer.slots[slot];
						if(!slotItem || slotItem.id == 0) return;
						var maxStack = Item.getMaxStack(slotItem.id);
						var this_item = searchItem(slotItem.id, slotItem.data, false, true);
						var _count = this_item && this_item.count < maxStack && this_item.extra == slotItem.extra ? Math.min(slotItem.count, maxStack - this_item.count) : Math.min(slotItem.count, maxStack);
						var updateFull = false;
						if(Config.dev)Logger.Log('Deleting slot: ' + slot + ' ; num: ' + this.num + '(' + _num + ') ; lastPage: ' + gridData.lastPage + ' ; count: ' + _count + ' ; x_count: ' + x_count, 'RefinedStorageDebug');
						var elements_ = itemContainer.getUiAdapter().getWindow().getWindow('main').getElements();
						if(slotItem.count <= _count) {
							itemContainer.setSlot(slot, 0, 0, 0);
							gridData.slotsKeys.splice(_num, 1);
							updateFull = true;
							gridData.updateGui(true, true);
						} else {
							if(gridData.sort == 0){
								if(_num > 0 && slotItem.count - _count <= itemContainer.slots[gridData.slotsKeys[_num - 1]].count){
									itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
									updateFull = true;
									gridData.updateGui(true, true);
								} else {
									itemContainer.markSlotDirty('slot' + this.num);
									elements_.get('slot' + this.num).setBinding('text', cutNumber(slotItem.count - _count, true) + "");
									itemContainer.setSlot('slot' + this.num, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
									//itemContainer.setText('slot' + this.num, cutNumber(slotItem.count - _count));
									itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
								}
							} else {
								itemContainer.markSlotDirty('slot' + this.num);
								elements_.get('slot' + this.num).setBinding('text', cutNumber(slotItem.count - _count, true) + "");
								itemContainer.setSlot('slot' + this.num, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
								//itemContainer.setText('slot' + this.num, cutNumber(slotItem.count - _count));
								itemContainer.setSlot(slot, slotItem.id, slotItem.count - _count, slotItem.data, slotItem.extra);
							}
						}
						setItemInfoSlot(slot, itemContainer);
						gridData.lowPriority = true;
						var map = (asdgfasdasddsad = gridData.networkData.getString('deleteItemsMap', 'null')) != 'null' ? JSON.parse(asdgfasdasddsad) : [];
						if(map.indexOf(slot) == -1){
							map.push(slot);
							gridData.networkData.putString('deleteItemsMap', JSON.stringify(map));
						}
						var currentCount = gridData.networkData.getInt(slot, 0);
						gridData.networkData.putInt(slot, currentCount + _count);
						gridData.networkData.putBoolean('update', true);
						gridData.networkData.putBoolean('updateFull'+slot, updateFull);
					}
				},
				size: cons + 1
			}
			asd++;
			_x += cons;
		}
		_y += cons;
	}
	elementsGUI_grid["slots_count"] = asd;
	elementsGUI_grid["x_count"] = x_count;
	elementsGUI_grid["y_count"] = y_count;
	elementsGUI_grid["x_start"] = x;
	elementsGUI_grid["x_end"] = _x;
	elementsGUI_grid["y_start"] = y;
	elementsGUI_grid["y_end"] = _y;
	elementsGUI_grid["cons"] = cons;

	gridData.slots_count = asd;
	gridData.x_count = x_count;
	gridData.y_count = y_count;
	gridData.cons = cons;

	var slider_frame_cons = 20;
	var slider_frame_border = 7;
	elementsGUI_grid["slider_frame"] = {
		type: "frame",
		x: 0,//_x + slider_frame_cons,
		y: y,
		width: 50,//(1000 - (_x + slider_frame_cons) - slider_frame_cons),
		height: y_count * cons,
		bitmap: "slider",
		scale: 1,
		onTouchEvent: function (element, event) {
			if (event.type == 'DOWN') {
				moving = true;
			}
			if (event.type == 'CLICK') {
				var itemContainerUiHandler = element.window.getContainer();
				var itemContainer = itemContainerUiHandler.getParent();
				var pages = gridFuncs.getPages(gridData.slotsKeys.length);
				var page = gridFuncs.getPageFromCoords(event, pages);
				gridSwitchPage(page, itemContainer);
			}
		}
	}
	elementsGUI_grid["slider_frame"].x = _x + (1000 - _x - elementsGUI_grid["slider_frame"].width) / 2;
	elementsGUI_grid["slider_button"] = {
		type: "button",
		x: elementsGUI_grid["slider_frame"].x + slider_frame_border,
		start_y: elementsGUI_grid["slider_frame"].y + slider_frame_border,
		y: elementsGUI_grid["slider_frame"].y + slider_frame_border,
		bitmap: 'slider_buttonOff',
		scale: (elementsGUI_grid["slider_frame"].width - slider_frame_border * 2) / 12
	}
	elementsGUI_grid["button_up"] = {
		type: "button",
		x: 0,
		y: 0,
		bitmap: 'but_up',
		bitmap2: 'but_upPressed',
		scale: elementsGUI_grid["slider_frame"].width/25,//Math.min((1000 - _x - slider_frame_cons * 2) / 25, (y - 30 - 10) / 15),
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				gridSwitchPage(gridData.lastPage - 1, itemContainer);
			},
			onLongClick: function (itemContainerUiHandler, container, element) {
			}
		}
	}
	elementsGUI_grid["slider_frame"].height -= 20 + elementsGUI_grid["button_up"].scale * 15;

	elementsGUI_grid["button_up"].x = _x + (1000 - _x - elementsGUI_grid["button_up"].scale * 25) / 2;
	elementsGUI_grid["button_up"].y = 20 + (50 - elementsGUI_grid["button_up"].scale * 15) / 2;

	elementsGUI_grid["button_down"] = {
		type: "button",
		x: _x + slider_frame_cons,
		y: y + elementsGUI_grid["slider_frame"].height + 20,
		bitmap: 'but_down',
		bitmap2: 'but_downPressed',
		scale: elementsGUI_grid["button_up"].scale,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				gridSwitchPage(gridData.lastPage + 1, itemContainer);
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
	elementsGUI_grid["button_down"].x = _x + (1000 - _x - elementsGUI_grid["button_down"].scale * 25) / 2;
	elementsGUI_grid["button_down"].y = y + elementsGUI_grid["slider_frame"].height + (50 - elementsGUI_grid["button_down"].scale * 15) / 2;

	var settings_cons = 10;
	elementsGUI_grid.settings_cons = settings_cons;
	elementsGUI_grid["redstone_button"] = {
		type: "button",
		x: 0,
		y: y,
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
	elementsGUI_grid["redstone_button"].x = x - settings_cons - (20 * elementsGUI_grid["redstone_button"].scale);

	elementsGUI_grid["image_redstone"] = {
		type: "image",
		x: elementsGUI_grid["redstone_button"].x,
		y: elementsGUI_grid["redstone_button"].y,
		z: 100,
		bitmap: "redstone_GUI_0",
		scale: elementsGUI_grid["redstone_button"].scale*20/16,
	}

	elementsGUI_grid["filter_button"] = {
		type: "button",
		x: 0,
		y: elementsGUI_grid["redstone_button"].y + (elementsGUI_grid["redstone_button"].scale * 20) + settings_cons,
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
	elementsGUI_grid["filter_button"].x = x - settings_cons - (20 * elementsGUI_grid["filter_button"].scale);

	elementsGUI_grid["image_filter"] = {
		type: "image",
		x: elementsGUI_grid["filter_button"].x + (elementsGUI_grid["filter_button"].scale * 20 - 24) / 2,
		y: elementsGUI_grid["filter_button"].y + (elementsGUI_grid["filter_button"].scale * 20 - 24) / 2,
		z: 1000,
		bitmap: "RS_filter1",
		scale: 4,
	}

	elementsGUI_grid["reverse_filter_button"] = {
		type: "button",
		x: 0,
		y: elementsGUI_grid["filter_button"].y + (elementsGUI_grid["filter_button"].scale * 20) + settings_cons,
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
	elementsGUI_grid["reverse_filter_button"].x = x - settings_cons - (20 * elementsGUI_grid["reverse_filter_button"].scale);

	elementsGUI_grid["image_reverse_filter"] = {
		type: "image",
		x: 0,
		y: 0,
		z: 1000,
		bitmap: "RS_arrow_down",
		scale: 3.5,
	}
	elementsGUI_grid["image_reverse_filter"].x = elementsGUI_grid["reverse_filter_button"].x + (elementsGUI_grid["reverse_filter_button"].scale * 20 - (elementsGUI_grid["image_reverse_filter"].scale * 8)) / 2
	elementsGUI_grid["image_reverse_filter"].y = elementsGUI_grid["reverse_filter_button"].y + (elementsGUI_grid["reverse_filter_button"].scale * 20 - (elementsGUI_grid["image_reverse_filter"].scale * 10)) / 2

	max_y = (elementsGUI_grid["slider_frame"].y + elementsGUI_grid["slider_frame"].height) - 7 - elementsGUI_grid["slider_button"].scale * 15;
	elementsGUI_grid["max_y"] = max_y;
	gridData.maxY = max_y;
};

function buildPushDeleteEvents(networkData) {
	var pushDeleteEvents = {};
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

function makePageHelpers(elements, config) {
	return {
		getPages: function(_length){
			if(_length == 0) return 1;
			_length = Math.ceil(_length / elements[config.countX]);
			return _length;
		},
		getPageFromCoords: function(_coords, pages){
			pages -= elements[config.countY] - 1;
			var interval = (pages - 1) > 0 ? (elements[config.maxY] - elements[config.slider].start_y) / (pages - 1) : 0;
			function __getY(i) {
				return ((interval * i) + elements[config.slider].start_y);
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
			pages -= elements[config.countY] - 1;
			var interval = (pages - 1) > 0 ? (elements[config.maxY] - elements[config.slider].start_y) / (pages - 1) : 0;
			function __getY(i) {
				return ((interval * i) + elements[config.slider].start_y);
			}
			if (page > pages) page = pages;
			if (page < 1) page = 1;
			return __getY(page - 1);
		}
	};
}
