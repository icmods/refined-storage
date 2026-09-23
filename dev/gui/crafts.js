var __rsCraftsTouch = null;

function rsResetCraftsTouch() {
	if (__rsCraftsTouch) {
		__rsCraftsTouch.swipeY = false;
		__rsCraftsTouch.swipeSum = 0;
		__rsCraftsTouch.moving = false;
	}
}

function buildCraftsSection(ctx) {
	var craftsSlotsCons = (ctx.xEnd - ctx.xStart) / ctx.columns;

	var _searchFrameName = ctx.searchFrameName || "search_frame_crafts";
	var _searchTextName = ctx.searchTextName || "search_text_crafts";
	var craftsSearchBox = UiCore.searchBox(ctx.xStart, ctx.yStart - 25, ctx.xEnd - ctx.xStart, {
		title: Translation.translate("Please type the keywords"),
		textLabel: Translation.translate('Search'),
		positiveLabel: Translation.translate("Search"),
		height: 20,
		fontSize: 12,
		onSearch: function (keyword, uiHandler, container) {
			ctx.onSearch(keyword, container, uiHandler);
		}
	});
	ctx.elements[_searchFrameName] = craftsSearchBox.frame;
	ctx.elements[_searchTextName] = craftsSearchBox.text;


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
						} catch (eer) {  }
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

	var __craftsTouch = { swipeY: false, swipeSum: 0, moving: false };
	__rsCraftsTouch = __craftsTouch;
	var __craftsItemContainerUiHandler = null;
	var __craftsItemContainer = null;

	var sliderName = ctx.sliderName || "crafts_slider";
	var sliderFrameName = ctx.sliderFrameName || "crafts_slider_frame";

	var __craftsAdapter = {
		bounds: { xStart: ctx.elements[dataPrefix + "x_start"], xEnd: ctx.elements[dataPrefix + "x_end"], yStart: ctx.elements[dataPrefix + "y_start"], yEnd: ctx.elements[dataPrefix + "y_end"] },
		itemCount: function () { return ctx.gridData.crafts.length; },
		pagination: ctx,
		getLastPage: function () { return ctx.gridData.lastCraftsPage; },
		switchPage: function (page, fromSwipe, dontMoveSlider) { ctx.switchPage(page, __craftsItemContainer, fromSwipe, dontMoveSlider); },
		state: __craftsTouch,
		maxY: 0,
		sliderStartY: 0,
		sliderScale: 0,
		sliderX: 0,
		sliderElementName: sliderName,
		getElement: function (name) { return __craftsItemContainerUiHandler.getElement(name); }
	};
	var __craftsSwipeHandler = UiCore.attachSwipe(__craftsAdapter);
	ctx.elements.clickFrameTouchEvents.push(function (element, event) {
		__craftsItemContainerUiHandler = element.window.getContainer();
		__craftsItemContainer = __craftsItemContainerUiHandler.getParent();
		__craftsAdapter.maxY = max_y;
		var __cslider = ctx.elements[sliderName];
		if (__cslider) {
			__craftsAdapter.sliderStartY = __cslider.start_y;
			__craftsAdapter.sliderScale = __cslider.scale;
			__craftsAdapter.sliderX = __cslider.x;
		}
		__craftsSwipeHandler(element, event);
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

	var __craftsSliderHandler = UiCore.attachSlider({
		itemCount: function () { return ctx.gridData.crafts.length; },
		pagination: ctx,
		switchPage: function (page) { ctx.switchPage(page, __craftsItemContainer); },
		state: __craftsTouch
	});
	ctx.elements[sliderFrameName] = {
		type: "frame",
		x: ctx.xEnd,
		y: ctx.yStart - 10,
		width: 30,
		height: yEnd - 1 - ctx.yStart + 20,
		z: -1,
		bitmap: 'empty1',
		onTouchEvent: function (element, event) {
			__craftsItemContainerUiHandler = element.window.getContainer();
			__craftsItemContainer = __craftsItemContainerUiHandler.getParent();
			__craftsSliderHandler(element, event);
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
