function buildControllerElements(elements, otherData, controllerFuncs, switchPageFn) {
	var moving = false;
	var swipe_y;
	var swipe_sum = 0;
	var max_y = 0;

	elements["click_frame"] = {
		type: "frame",
		x: 0,
		y: 0,
		z: -50,
		width: 1000,
		height: UI.getScreenHeight(),
		bitmap: "empty",
		scale: 1,
		onTouchEvent: function (element, event) {
			var content = {elements: elements};
			var itemContainerUiHandler = element.window.getContainer();
			if (!itemContainerUiHandler) return;
			var itemContainer = itemContainerUiHandler.getParent();
			if (event.type == "DOWN" && !swipe_y && event.x > content.elements["mesh"].x && event.x < (content.elements["mesh"].x + content.elements["mesh"].width) && event.y > content.elements["mesh"].y && event.y < (content.elements["mesh"].y + content.elements["mesh"].height)) {
				swipe_y = event.y;
			} else if (swipe_y && event.type == "MOVE") {
				var distance = Math.abs(event.y - swipe_y);
				function moveSwitchPage_(_n){
					_n = (_n ? 1 : -1);
					var pages = controllerFuncs.getPages(Object.keys(otherData.net_map).length);
					if(!switchPageFn(otherData.lastPage + _n, itemContainer, otherData)) return;
					var ___y = controllerFuncs.getCoordsFromPage(otherData.lastPage + _n, pages);
					itemContainerUiHandler.getElement("slider_button").setPosition(elements['slider_button'].x, ___y);
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
				var page = controllerFuncs.getPageFromCoords(event, controllerFuncs.getPages(Object.keys(otherData.net_map).length));
				itemContainerUiHandler.getElement("slider_button").setPosition(content.elements['slider_button'].x, Math.max(Math.min(event.y, max_y), content.elements["slider_button"].start_y));
				switchPageFn(page, itemContainer, otherData);
			}
			if (event.type == "UP" || event.type == "CLICK") {
				moving = false;
				var pages = controllerFuncs.getPages(Object.keys(otherData.net_map).length);
				var page = controllerFuncs.getPageFromCoords(event, pages);
				switchPageFn(page, itemContainer, otherData);
				var ___y = controllerFuncs.getCoordsFromPage(page, pages);
				itemContainerUiHandler.getElement("slider_button").setPosition(elements['slider_button'].x, ___y);
			}
		}
	}

	var y = 110;
	var percents = 0.5;

	elements["scale"] = {
		type: "scale",
		x: 50,
		y: y,
		direction: 1,
		bitmap: "storage_scale_full",
		overlay: "storage_scale_empty",
		value: 0,
		scale: Math.min(UI.getScreenHeight()*percents/72, 4.5),
		overlayScale: 0
	};
	elements["scale"].overlayScale = elements["scale"].scale;
	elements['usage'] = {
		type: "text",
		x: 50,
		y: elements["scale"].y - 40,
		text: Translation.translate('Usage')+": 0 FE/t",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 20
		}
	}
	elements['storage'] = {
		type: "text",
		x: 50,
		y: elements["scale"].y + elements["scale"].scale*72 + 20,
		text: "0/0 FE",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 18
		}
	}
	elements['mesh'] = {
		type: "image", 
		x: 0, 
		y: y,
		scale: elements["scale"].scale*72/61,
		bitmap: "controllerMesh"
	}
	elements['mesh'].x = 900 - elements['mesh'].scale*123;
	
	elements['mesh'].height = elements['mesh'].scale*61;
	elements['mesh'].width = elements['mesh'].scale*123;

	var mesh_width = Math.floor(elements['mesh'].width);
	var mesh_height = Math.floor(elements['mesh'].height);
	var slot_padding = mesh_height/2*0.1;
	var slot_size = (mesh_height/2-slot_padding*2)*0.6;
	var asd = 0;
	for(var h = elements['mesh'].y; h < elements['mesh'].y + mesh_height; h += mesh_height/2){
		for(var w = elements['mesh'].x; w < elements['mesh'].x + mesh_width; w += mesh_width/2){
			elements['block_info' + asd] = {
				type: "text",
				num: asd,
				x: w + slot_padding,
				y: h + slot_padding/2 + ((mesh_height/2-slot_padding*2)*0.4)/2,
				z: 10,
				text: "This is block " + mesh_width + ' : ' + mesh_height,
				font: {
					color: android.graphics.Color.DKGRAY,
					shadow: 0.15,
					size: Math.ceil((mesh_height/2-slot_padding*2)*0.2)
				}
			}
			elements['block_info' + asd].y -= elements['block_info' + asd].font.size/2
			elements['block_count' + asd] = {
				type: "text",
				num: asd,
				x: w + slot_padding*2 + slot_size,
				y: h + (mesh_height/2 - slot_padding - slot_size/2),
				z: 10,
				text: "1x",
				font: {
					color: android.graphics.Color.DKGRAY,
					shadow: 0.15,
					size: Math.ceil(slot_size*0.25)
				}
			}
			elements['block_count' + asd].y -= elements['block_count' + asd].font.size/2
			elements['block_energy_use' + asd] = {
				type: "text",
				num: asd,
				x: w + slot_padding*2 + slot_size*2,
				y: h + (mesh_height/2 - slot_padding - slot_size/2),
				z: 10,
				text: "0 FE/t",
				font: {
					color: android.graphics.Color.DKGRAY,
					shadow: 0.15,
					size: Math.ceil(slot_size*0.3)
				}
			}
			elements['block_energy_use' + asd].y -= elements['block_energy_use' + asd].font.size/2
			elements['slot' + asd] = {
				type: "slot",
				num: asd,
				x: w + slot_padding,
				y: h + (mesh_height/2 - slot_padding - slot_size),
				z: 10,
				bitmap: "empty",
				isTransparentBackground: true,
				needClean: true,
				clicker: {
					onClick: function (position, container, tileEntity, window, canvas, scale) {
					},
					onLongClick: function (position, container, tileEntity, window, canvas, scale) {
						
					}
				},
				size: Math.ceil(slot_size)
			}
			asd++;
		}
	}
	otherData['max_sym'] = Math.round((mesh_width/2 - slot_padding*2)/(elements['block_info0'].font.size*(5/7)));

	var slider_frame_cons = 25;
	var slider_frame_border = 7;
	elements["slider_frame"] = {
		type: "frame",
		x: 900 + slider_frame_cons,
		y: y,
		width: (1000 - (900 + slider_frame_cons) - slider_frame_cons),
		height: elements["scale"].scale*72,
		bitmap: "slider",
		scale: 1,
		onTouchEvent: function (element, event) {
			var content = {elements: elements};
			var itemContainerUiHandler = element.window.getContainer();
			if (!itemContainerUiHandler) return;
			var itemContainer = itemContainerUiHandler.getParent();
			if (event.type == 'DOWN') {
				moving = true;
				return;
			}
			if (event.type == 'CLICK') {
				var pages = controllerFuncs.getPages(Object.keys(otherData.net_map).length);
				var page = controllerFuncs.getPageFromCoords(event, pages);
				var ___y = controllerFuncs.getCoordsFromPage(page, pages);
				itemContainerUiHandler.getElement("slider_button").setPosition(elements['slider_button'].x, ___y);
				return;
			}
			if (!moving) return;
			event.y -= content.elements["slider_button"].scale * 15 / 2;
			if (event.type != 'UP') {
				var page = controllerFuncs.getPageFromCoords(event, controllerFuncs.getPages(Object.keys(otherData.net_map).length));
				itemContainerUiHandler.getElement("slider_button").setPosition(content.elements['slider_button'].x, Math.max(Math.min(event.y, max_y), content.elements["slider_button"].start_y));
				switchPageFn(page, itemContainer, otherData);
			}
			if (event.type == "UP") {
				moving = false;
				var pages = controllerFuncs.getPages(Object.keys(otherData.net_map).length);
				var page = controllerFuncs.getPageFromCoords(event, pages);
				switchPageFn(page, itemContainer, otherData);
				var ___y = controllerFuncs.getCoordsFromPage(page, pages);
				itemContainerUiHandler.getElement("slider_button").setPosition(elements['slider_button'].x, ___y);
			}
		}
	}

	elements["slider_button"] = {
		type: "button",
		x: elements["slider_frame"].x + slider_frame_border,
		start_y: elements["slider_frame"].y + slider_frame_border,
		y: elements["slider_frame"].y + slider_frame_border,
		z: 10,
		bitmap: 'slider_buttonOff',
		scale: (elements["slider_frame"].width - slider_frame_border * 2) / 12
	}
	max_y = (elements["slider_frame"].y + elements["slider_frame"].height) - 7 - elements["slider_button"].scale * 15;
	var settings_cons = 10;
	elements["redstone_button"] = {
		type: "button",
		x: 0,
		y: elements['mesh'].y,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: mesh_height*0.17/20,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateRedstoneMode", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {
			}
		}
	}
	elements["redstone_button"].x = elements['mesh'].x - settings_cons - (20 * elements["redstone_button"].scale);

	elements["image_redstone"] = {
		type: "image",
		x: elements["redstone_button"].x,
		y: elements["redstone_button"].y,
		z: 1000,
		bitmap: "redstone_GUI_0",
		scale: elements["redstone_button"].scale*20/16,
	}
	otherData.max_y = max_y;
}
