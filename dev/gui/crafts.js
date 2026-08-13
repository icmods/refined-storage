function buildCraftsSection(ctx) {
	var craftsSlotsCons = (ctx.xEnd - ctx.xStart) / ctx.columns;

	ctx.elements[ctx.searchFrameName || "search_frame_crafts"] = {
		type: "frame",
		x: ctx.xStart,
		y: ctx.yStart - 25,
		width: ctx.xEnd - ctx.xStart,
		height: 20,
		bitmap: "search_bar",
		scale: 0.8,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UI.getContext().runOnUiThread(new java.lang.Runnable({
					run: function () {
						try {
							var editText = new android.widget.EditText(UI.getContext());
							new android.app.AlertDialog.Builder(UI.getContext())
								.setTitle(Translation.translate("Please type the keywords"))
								.setView(editText)
								.setPositiveButton(Translation.translate("Search"), {
									onClick: function () {
										var keyword = editText.getText() + "";
										ctx.onSearch(keyword, itemContainer, itemContainerUiHandler);
									}
								}).show();
						} catch (e) {
							alert(e);
						}
					}
				}));
			}
		}
	}

	var searchTextName = ctx.searchTextName || "search_text_crafts";
	ctx.elements[searchTextName] = {
		type: "text",
		x: ctx.elements[ctx.searchFrameName || "search_frame_crafts"].x + 10,
		y: ctx.elements[ctx.searchFrameName || "search_frame_crafts"].y + 1,
		z: 100,
		text: Translation.translate('Search'),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: ctx.elements[ctx.searchFrameName || "search_frame_crafts"].height - 8
		}
	}

	var slotPrefix = ctx.slotPrefix || "item_craft_slot";
	var asd = 0;
	var yEnd = 0;
	for (var y = ctx.yStart; y < ctx.windowHeight - 20 - craftsSlotsCons; y += craftsSlotsCons) {
		for (var x = ctx.xStart; x < ctx.xEnd; x += craftsSlotsCons) {
			ctx.elements[slotPrefix + asd] = {
				type: "slot",
				num: asd,
				x: x,
				y: y,
				clicker: {
					onClick: function (itemContainerUiHandler, itemContainer, element) {
						try {
							var craft_ident = this.num + ((ctx.gridData.lastCraftsPage || 1) - 1) * ctx.elements[dataPrefix + "x_count"];
							var craft = ctx.gridData.crafts[craft_ident];
							ctx.onSelectCraft(craft, itemContainer);
						} catch (eer) { if(Config.dev) Logger.Log('Craft slot onClick error: ' + JSON.stringify(eer), 'RefinedStorageDebug'); }
					},
					onLongClick: function (itemContainerUiHandler, itemContainer, element) {
					}
				},
				size: craftsSlotsCons
			}
			asd++;
		}
		yEnd = y + craftsSlotsCons;
	}
	var dataPrefix = ctx.dataPrefix || "crafts_";
	ctx.gridData[dataPrefix + "slots_count"] = ctx.elements[dataPrefix + "slots_count"] = asd;
	ctx.gridData[dataPrefix + "x_count"] = ctx.elements[dataPrefix + "x_count"] = Math.ceil((ctx.xEnd - ctx.xStart) / craftsSlotsCons);
	ctx.gridData[dataPrefix + "y_count"] = ctx.elements[dataPrefix + "y_count"] = Math.ceil((ctx.windowHeight - 20 - craftsSlotsCons - ctx.yStart) / craftsSlotsCons);

	ctx.gridData[dataPrefix + "x_start"] = ctx.elements[dataPrefix + "x_start"] = ctx.xStart;
	ctx.gridData[dataPrefix + "y_start"] = ctx.elements[dataPrefix + "y_start"] = ctx.yStart;
	ctx.gridData[dataPrefix + "x_end"] = ctx.elements[dataPrefix + "x_end"] = ctx.xEnd;
	ctx.gridData[dataPrefix + "y_end"] = ctx.elements[dataPrefix + "y_end"] = yEnd - 1;

	if (ctx.drawing) ctx.drawing.push({
		type: "line",
		x1: ctx.xEnd + 30 / 2,
		y1: ctx.yStart,
		x2: ctx.xEnd + 30 / 2,
		y2: yEnd - 1,
		width: 3,
		color: android.graphics.Color.BLACK
	});

	var moving = false;
	var max_y = 0;
	var swipe_y;
	var swipe_sum = 0;

	var sliderName = ctx.sliderName || "crafts_slider";
	var sliderFrameName = ctx.sliderFrameName || "crafts_slider_frame";

	ctx.elements.clickFrameTouchEvents.push(function (element, event) {
		var content = { elements: ctx.elements };
		var itemContainerUiHandler = element.window.getContainer();
		var itemContainer = itemContainerUiHandler.getParent();
		if (event.type == "DOWN" && !swipe_y && event.x > ctx.elements[dataPrefix + "x_start"] && event.x < ctx.elements[dataPrefix + "x_end"] && event.y > ctx.elements[dataPrefix + "y_start"] && event.y < ctx.elements[dataPrefix + "y_end"]) {
			swipe_y = event.y;
		} else if (swipe_y && event.type == "MOVE") {
			var distance = Math.abs(event.y - swipe_y);
			function moveSwitchPage_(_n) {
				_n = (_n ? 1 : -1);
				ctx.switchPage(ctx.gridData.lastCraftsPage + _n, itemContainer);
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
		event.y -= content.elements[sliderName].scale * 15 / 2;
		if (event.type != 'UP' && event.type != "CLICK") {
			var page = ctx.getPageFromCoords(event, ctx.getPages(ctx.gridData.crafts.length));
			itemContainerUiHandler.getElement(sliderName).setPosition(content.elements[sliderName].x, Math.max(Math.min(event.y, max_y), content.elements[sliderName].start_y));
			ctx.switchPage(page, itemContainer, false, true);
		}
		if (event.type == "UP" || event.type == "CLICK") {
			moving = false;
			var pages = ctx.getPages(ctx.gridData.crafts.length);
			var page = ctx.getPageFromCoords(event, pages);
			ctx.switchPage(page, itemContainer);
			var ___y = ctx.getCoordsFromPage(page, pages);
			itemContainerUiHandler.getElement(sliderName).setPosition(ctx.elements[sliderName].x, ___y);
		}
	});

	ctx.elements[sliderName] = {
		type: "button",
		start_y: ctx.yStart,
		x: ctx.xEnd + 30 / 2,
		y: ctx.yStart,
		z: 1,
		scale: 2,
		bitmap: 'craftsSlider',
		bitmap2: 'craftsSliderOn'
	}

	ctx.elements[sliderFrameName] = {
		type: "frame",
		x: ctx.xEnd,
		y: ctx.yStart - 10,
		width: 30,
		height: yEnd - 1 - ctx.yStart + 20,
		z: -1,
		bitmap: 'empty1',
		onTouchEvent: function (element, event) {
			if (event.type == 'DOWN') {
				moving = true;
			}
			if (event.type == 'CLICK') {
				var itemContainerUiHandler = element.window.getContainer();
				var itemContainer = itemContainerUiHandler.getParent();
				var pages = ctx.getPages(ctx.gridData.crafts.length);
				var page = ctx.getPageFromCoords(event, pages);
				ctx.switchPage(page, itemContainer);
			}
		}
	}

	ctx.elements[sliderName].x -= ctx.elements[sliderName].scale * 10 / 2;
	max_y = yEnd - 1 - ctx.elements[sliderName].scale * 15;
	ctx.elements[dataPrefix + "max_y"] = max_y;

	return {
		countX: dataPrefix + "x_count",
		countY: dataPrefix + "y_count",
		maxY: dataPrefix + "max_y",
		slider: sliderName
	};
}
