if (typeof getTextElementWidth == 'undefined') {
	getTextElementWidth = function(element, drawScale) {
		var font = new JavaFONT(element.font);
		return font.getBounds(element.text, element.x * drawScale, element.y * drawScale, parseFloat(1.0)).width();
	};
}

var preCraftdata = {
	container: null,
	craftable: true,
	craftCount: 1,
	selectedItem: null
}

function preCraftSwitchPage(page, _data, container){
	page -= 1;
	var elements_ = preCraftGUI.getElements();
	var content_ = preCraftGUI.getContent();
	for (var i = page * 3; i < page * 3 + 12; i++) {
		var a = i - (page * 3);
		var item = _data[i] || [{ id: 0, data: 0, need: 0}, '', ''];
		elements_.get("mitemCount" + a).setBinding('text', item[1]);
		elements_.get("aitemCount" + a).setBinding('text', item[2]);
		var slot = elements_.get("slot" + a);
		slot.curId = item[0].id;
		slot.curData = item[0].data;
		slot.curCount = item[0].id ? 1 : 0;
		content_.elements["colorFrame" + a].bitmap = item[0].need ? 'craftPreviewErrorBG' : 'empty1';
	}
	preCraftGUI.forceRefresh();
}

function preSetCraftCount(count){
	var elements_ = preCraftCountGUI.getElements();
	if(!Number(count) && Number(count) != 0)count = Number(count.toString().replace(/[^0-9]+/g, ''));
	preCraftdata.craftCount = Math.max(Math.min(parseInt(Number(count)), 999999999), 1);
	elements_.get('countText').setBinding('text', preCraftdata.craftCount + '');
}

function preSelectCraftItem(item){
	var elements_ = preCraftCountGUI.getElements();
	preCraftdata.selectedItem = copyItem(item);
	var slot = elements_.get('resultSlot');
	slot.curId = preCraftdata.selectedItem.id;
	slot.curData = preCraftdata.selectedItem.data;
	slot.curCount = 1;
}

var preCraftGUI_elements = {};
var yoffSet = 30;
var preCraftGUI_location = { 
	x: 0, 
	y: yoffSet, 
	z: 100,
	width: 0, 
	height: UI.getScreenHeight() - yoffSet*2
}
preCraftGUI_location.width = 1000/600*preCraftGUI_location.height;
preCraftGUI_location.x = (1000-preCraftGUI_location.width)/2

var preCraftCountGUI_elements = {};
var preCraftGUI = new UI.Window({
	location: preCraftGUI_location,
	drawing: [],
	elements: preCraftGUI_elements
});

(function(){
	var windowHeight = 600;
	var drawScale = preCraftGUI.location.getDrawingScale();
	preCraftGUI_elements['frame'] = {
		type: "frame",
		x: 0,
		y: 0,
		z: -100,
		width: 1000,
		height: windowHeight,
		bitmap: "classic_frame_bg_light",
		scale: 3
	}
	var xoffSet = 38;
	var yoffSet = 35;
	preCraftGUI_elements['craftsMesh'] = {
		type: "image",
		x: xoffSet,
		y: yoffSet,
		z: -50,
		bitmap: "craftPreview_items2",
		scale: 3.8
	}
	var craftsMeshWidth = 223*preCraftGUI_elements['craftsMesh'].scale;
	var craftsMeshHeight = 121*preCraftGUI_elements['craftsMesh'].scale;
	var slider_frame_border = 1;
	preCraftGUI_elements["slider_frame"] = {
		type: "frame",
		x: 0,
		y: preCraftGUI_elements['craftsMesh'].y,
		z: 100,
		width: 0,
		height: craftsMeshHeight,
		bitmap: "slider4",
		scale: 3.8
	}
	slider_frame_border *= preCraftGUI_elements["slider_frame"].scale;
	preCraftGUI_elements["slider_frame"].width = preCraftGUI_elements["slider_frame"].scale*14
	preCraftGUI_elements["slider_frame"].x = preCraftGUI_elements['craftsMesh'].x + craftsMeshWidth + ((1000 - (preCraftGUI_elements['craftsMesh'].x + craftsMeshWidth)) - preCraftGUI_elements["slider_frame"].width) / 2;
	preCraftGUI_elements["slider_button"] = {
		type: "button",
		x: preCraftGUI_elements["slider_frame"].x + slider_frame_border,
		start_y: preCraftGUI_elements["slider_frame"].y + slider_frame_border,
		y: preCraftGUI_elements["slider_frame"].y + slider_frame_border,
		z: 200,
		bitmap: 'slider_buttonOff',
		scale: preCraftGUI_elements["slider_frame"].scale
	}
	var craftsMeshPartWidth = craftsMeshWidth/3;
	var craftsMeshPartHeight = craftsMeshHeight/4;
	var craftsMeshPartTrueWidth = (craftsMeshWidth - 4*preCraftGUI_elements['craftsMesh'].scale)/3;
	var craftsMeshPartTrueHeight = (craftsMeshHeight - 5*preCraftGUI_elements['craftsMesh'].scale)/4;
	var slotSize = 80;
	var textOffset = 10;
	var asd = 0;
	for(var y = 0; y < 4; y++){
		for(var x = 0; x < 3; x++){
			var slotOffset = craftsMeshPartHeight/2 - slotSize/2;
			preCraftGUI_elements['slot' + asd] = {
				type: "slot",
				num: asd,
				x: preCraftGUI_elements['craftsMesh'].x + craftsMeshPartWidth*x + slotOffset,
				y: preCraftGUI_elements['craftsMesh'].y + craftsMeshPartHeight*y + slotOffset,
				z: 100,
				bitmap: "empty",
				visual: true,
				size: slotSize
			}
			preCraftGUI_elements['mitemCount' + asd] = {
				type: "text",
				x: preCraftGUI_elements['slot' + asd].x + slotSize + textOffset,
				y: preCraftGUI_elements['slot' + asd].y + 15,
				z: 100,
				text: "Missing: 20",
				font: {
					color: android.graphics.Color.DKGRAY,
					size: 15
				}
			}
			preCraftGUI_elements['aitemCount' + asd] = {
				type: "text",
				x: preCraftGUI_elements['slot' + asd].x + slotSize + textOffset,
				y: preCraftGUI_elements['slot' + asd].y + 40,
				z: 100,
				text: "Available: 20",
				font: {
					color: android.graphics.Color.DKGRAY,
					size: 15
				}
			}
			preCraftGUI_elements["colorFrame" + asd] = {
				type: "frame",
				x: preCraftGUI_elements['craftsMesh'].x + craftsMeshPartTrueWidth*x + (x+1)*preCraftGUI_elements['craftsMesh'].scale,
				y: preCraftGUI_elements['craftsMesh'].y + craftsMeshPartTrueHeight*y + (y+1)*preCraftGUI_elements['craftsMesh'].scale,
				z: 80,
				width: craftsMeshPartTrueWidth,
				height: craftsMeshPartTrueHeight,
				bitmap: "empty1",
				scale: 1
			}
			asd++;
		}
	}
	var buttonsScale = 3;
	preCraftGUI_elements['buttonStart'] = {
		type: "button",
		x: preCraftGUI_elements["slider_frame"].x + preCraftGUI_elements["slider_frame"].width,
		y: 0,
		z: 1,
		width: 170,
		height: 75,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				if(!preCraftdata.container || !preCraftdata.craftable) return;
				preCraftdata.container.sendEvent("provideConstructedCraft", {item: preCraftdata.selectedItem, count: preCraftdata.craftCount});
				preCraftGUI.close();
				backgroundGUI.close();
			}
		}
	}
	preCraftGUI_elements['buttonStart'].y = windowHeight - (windowHeight - (preCraftGUI_elements['craftsMesh'].y + craftsMeshHeight))/2 - preCraftGUI_elements['buttonStart'].height/2;
	preCraftGUI_elements['textStart'] = {
		type: "text",
		x: 0,
		y: 0,
		z: 100,
		text: Translation.translate("Start"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 30
		}
	}
	var textStart = getTextElementWidth(preCraftGUI_elements['textStart'], drawScale);
	preCraftGUI_elements['buttonStart'].width = Math.max(170, textStart + 16);
	preCraftGUI_elements['buttonStart'].x -= preCraftGUI_elements['buttonStart'].width;
	preCraftGUI_elements['textStart'].x = preCraftGUI_elements['buttonStart'].x + preCraftGUI_elements['buttonStart'].width/2 - textStart/2;
	preCraftGUI_elements['textStart'].y = preCraftGUI_elements['buttonStart'].y + preCraftGUI_elements['buttonStart'].height/2 - (preCraftGUI_elements['textStart'].font.size + (preCraftGUI_elements['textStart'].font.shadow || 0))*1.1/2 - 1;
	
	preCraftGUI_elements['buttonCancel'] = {
		type: "button",
		x: xoffSet,
		y: 0,
		z: 1,
		width: 170,
		height: 75,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preCraftGUI.close();
				backgroundGUI.close();
			}
		}
	}
	preCraftGUI_elements['buttonCancel'].y = windowHeight - (windowHeight - (preCraftGUI_elements['craftsMesh'].y + craftsMeshHeight))/2 - preCraftGUI_elements['buttonCancel'].height/2;
	preCraftGUI_elements['textCancel'] = {
		type: "text",
		x: 0,
		y: 0,
		z: 100,
		text: Translation.translate("Cancel"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 30
		}
	}
	var textCancel = getTextElementWidth(preCraftGUI_elements['textCancel'], drawScale);
	preCraftGUI_elements['buttonCancel'].width = Math.max(170, textCancel + 16);
	preCraftGUI_elements['textCancel'].x = preCraftGUI_elements['buttonCancel'].x + preCraftGUI_elements['buttonCancel'].width/2 - textCancel/2;
	preCraftGUI_elements['textCancel'].y = preCraftGUI_elements['buttonCancel'].y + preCraftGUI_elements['buttonCancel'].height/2 - (preCraftGUI_elements['textCancel'].font.size + (preCraftGUI_elements['textCancel'].font.shadow || 0))*1.1/2 - 1;
})();

var backgroundGUI = new UI.Window({
	location: { 
		x: 0, 
		y: 0, 
		z: 99,
		width: 1000, 
		height: UI.getScreenHeight()
	},
	drawing: [{type: 'color', color: android.graphics.Color.argb(110,0,0,0)}],
	elements: {
		frame: {
			type: "frame",
			x: 0,
			y: 0,
			z: 100,
			width: 1000,
			height: UI.getScreenHeight(),
			bitmap: "empty1",
			scale: 1,
			onTouchEvent: function (element, event) {
				if (event.type == 'CLICK') {
					backgroundGUI.close();
					preCraftGUI.close();
					preCraftCountGUI.close();
				}
			}
		}
	}
});

var yoffSet2 = 120;
var preCraftCountGUI_location = { 
	x: 0, 
	y: yoffSet2, 
	z: 100,
	width: 0, 
	height: UI.getScreenHeight() - yoffSet2*2
}
preCraftCountGUI_location.width = 1000/570*preCraftCountGUI_location.height;
preCraftCountGUI_location.x = (1000-preCraftCountGUI_location.width)/2

var preCraftCountGUI = new UI.Window({
	location: preCraftCountGUI_location,
	drawing: [{type: 'color', color: android.graphics.Color.argb(0,0,0,0)}],
	elements: preCraftCountGUI_elements
});

preCraftCountGUI.setEventListener({
	onClose: function(){},
	onOpen: function(){
		var elements_ = preCraftCountGUI.getElements();
		preCraftdata.craftCount = 1;
		elements_.get('countText').setBinding('text', preCraftdata.craftCount + '');
	}
});

(function(){
	var drawScale = preCraftCountGUI.location.getDrawingScale();
	var windowHeight = 570;
	preCraftCountGUI_elements['frame'] = {
		type: "frame",
		x: 0,
		y: 0,
		z: -100,
		width: 1000,
		height: windowHeight,
		bitmap: "classic_frame_bg_light",
		scale: 3
	}
	var offSet = 35;
	preCraftCountGUI_elements['headerName'] = {
		type: "text",
		x: offSet,
		y: offSet,
		z: 100,
		text: Translation.translate("Crafting"),
		font: {
			color: android.graphics.Color.DKGRAY,
			shadow: 0,
			size: 50
		}
	}
	var _yoffSet = (preCraftCountGUI_elements['headerName'].font.size*1.1)/2;
	preCraftCountGUI_elements['countTextFrame'] = {
		type: "frame",
		x: offSet,
		y: 0,
		z: 1,
		width: 400,
		height: 70,
		bitmap: "slider4",
		scale: 5,
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
										if (!preCraftCountGUI.isOpened()) return;
										var keyword = editText.getText() + "";
										preSetCraftCount(keyword);
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
	preCraftCountGUI_elements['countTextFrame'].y = _yoffSet + windowHeight/2-preCraftCountGUI_elements['countTextFrame'].height/2;
	preCraftCountGUI_elements['countText'] = {
		type: "text",
		x: preCraftCountGUI_elements['countTextFrame'].x + 10,
		y: preCraftCountGUI_elements['countTextFrame'].y + 1,
		z: 100,
		text: "1",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.4,
			size: preCraftCountGUI_elements['countTextFrame'].height - 15
		}
	}
	preCraftCountGUI_elements['resultSlot'] = {
		type: "slot",
		x: preCraftCountGUI_elements['countTextFrame'].x + preCraftCountGUI_elements['countTextFrame'].width + offSet,
		y: 0,
		z: 100,
		visual: true,
		size: 130
	}
	preCraftCountGUI_elements['resultSlot'].y = _yoffSet + windowHeight/2-preCraftCountGUI_elements['resultSlot'].size/2 - 1;
	var buttonsOffset = 15;
	var buttonsHeight = 110;
	var buttonsScale = 4
	var buttonsWidth = buttonsHeight*1.65;
	preCraftCountGUI_elements['button-1'] = {
		type: "button",
		x: offSet,
		y: preCraftCountGUI_elements['resultSlot'].y + preCraftCountGUI_elements['resultSlot'].size + buttonsOffset,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount - 1);
			}
		}
	}
	preCraftCountGUI_elements['text-1'] = {
		type: "text",
		x: preCraftCountGUI_elements['button-1'].x,
		y: preCraftCountGUI_elements['button-1'].y,
		z: 100,
		text: "-1",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text_1Width = getTextElementWidth(preCraftCountGUI_elements['text-1'], drawScale);
	preCraftCountGUI_elements['text-1'].x += preCraftCountGUI_elements['button-1'].width/2 - text_1Width/2;
	preCraftCountGUI_elements['text-1'].y += preCraftCountGUI_elements['button-1'].height/2 - (preCraftCountGUI_elements['text-1'].font.size + (preCraftCountGUI_elements['text-1'].font.shadow || 0))*1.1/2 - 1;

	preCraftCountGUI_elements['button-10'] = {
		type: "button",
		x: preCraftCountGUI_elements['button-1'].x + preCraftCountGUI_elements['button-1'].width + buttonsOffset,
		y: preCraftCountGUI_elements['button-1'].y,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount - 10);
			}
		}
	}
	preCraftCountGUI_elements['text-10'] = {
		type: "text",
		x: preCraftCountGUI_elements['button-10'].x,
		y: preCraftCountGUI_elements['button-10'].y,
		z: 100,
		text: "-10",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text_10Width = getTextElementWidth(preCraftCountGUI_elements['text-10'], drawScale);
	preCraftCountGUI_elements['text-10'].x += preCraftCountGUI_elements['button-10'].width/2 - text_10Width/2;
	preCraftCountGUI_elements['text-10'].y += preCraftCountGUI_elements['button-10'].height/2 - (preCraftCountGUI_elements['text-10'].font.size + (preCraftCountGUI_elements['text-10'].font.shadow || 0))*1.1/2 - 1;
	
	preCraftCountGUI_elements['button-64'] = {
		type: "button",
		x: preCraftCountGUI_elements['button-10'].x + preCraftCountGUI_elements['button-10'].width + buttonsOffset,
		y: preCraftCountGUI_elements['button-10'].y,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount - 64);
			}
		}
	}
	preCraftCountGUI_elements['text-64'] = {
		type: "text",
		x: preCraftCountGUI_elements['button-64'].x,
		y: preCraftCountGUI_elements['button-64'].y,
		z: 100,
		text: "-64",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text_64Width = getTextElementWidth(preCraftCountGUI_elements['text-64'], drawScale);
	preCraftCountGUI_elements['text-64'].x += preCraftCountGUI_elements['button-64'].width/2 - text_64Width/2;
	preCraftCountGUI_elements['text-64'].y += preCraftCountGUI_elements['button-64'].height/2 - (preCraftCountGUI_elements['text-64'].font.size + (preCraftCountGUI_elements['text-64'].font.shadow || 0))*1.1/2 - 1;
	
	preCraftCountGUI_elements['button1'] = {
		type: "button",
		x: offSet,
		y: preCraftCountGUI_elements['resultSlot'].y - buttonsOffset - buttonsHeight,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount + 1);
			}
		}
	}
	preCraftCountGUI_elements['text1'] = {
		type: "text",
		x: preCraftCountGUI_elements['button1'].x,
		y: preCraftCountGUI_elements['button1'].y,
		z: 100,
		text: "+1",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text1Width = getTextElementWidth(preCraftCountGUI_elements['text1'], drawScale);
	preCraftCountGUI_elements['text1'].x += preCraftCountGUI_elements['button1'].width/2 - text1Width/2;
	preCraftCountGUI_elements['text1'].y += preCraftCountGUI_elements['button1'].height/2 - (preCraftCountGUI_elements['text1'].font.size + (preCraftCountGUI_elements['text1'].font.shadow || 0))*1.1/2 - 1;

	preCraftCountGUI_elements['button10'] = {
		type: "button",
		x: preCraftCountGUI_elements['button1'].x + preCraftCountGUI_elements['button1'].width + buttonsOffset,
		y: preCraftCountGUI_elements['button1'].y,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount == 1 ? 10 : (preCraftdata.craftCount + 10));
			}
		}
	}
	preCraftCountGUI_elements['text10'] = {
		type: "text",
		x: preCraftCountGUI_elements['button10'].x,
		y: preCraftCountGUI_elements['button10'].y,
		z: 100,
		text: "+10",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text10Width = getTextElementWidth(preCraftCountGUI_elements['text10'], drawScale);
	preCraftCountGUI_elements['text10'].x += preCraftCountGUI_elements['button10'].width/2 - text10Width/2;
	preCraftCountGUI_elements['text10'].y += preCraftCountGUI_elements['button10'].height/2 - (preCraftCountGUI_elements['text10'].font.size + (preCraftCountGUI_elements['text10'].font.shadow || 0))*1.1/2 - 1;
	
	preCraftCountGUI_elements['button64'] = {
		type: "button",
		x: preCraftCountGUI_elements['button10'].x + preCraftCountGUI_elements['button10'].width + buttonsOffset,
		y: preCraftCountGUI_elements['button10'].y,
		z: 1,
		width: buttonsWidth,
		height: buttonsHeight,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preSetCraftCount(preCraftdata.craftCount == 1 ? 64 : (preCraftdata.craftCount + 64));
			}
		}
	}
	preCraftCountGUI_elements['text64'] = {
		type: "text",
		x: preCraftCountGUI_elements['button64'].x,
		y: preCraftCountGUI_elements['button64'].y,
		z: 100,
		text: "+64",
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: 47
		}
	}
	var text64Width = getTextElementWidth(preCraftCountGUI_elements['text64'], drawScale);
	preCraftCountGUI_elements['text64'].x += preCraftCountGUI_elements['button64'].width/2 - text64Width/2;
	preCraftCountGUI_elements['text64'].y += preCraftCountGUI_elements['button64'].height/2 - (preCraftCountGUI_elements['text64'].font.size + (preCraftCountGUI_elements['text64'].font.shadow || 0))*1.1/2 - 1;
	
	preCraftCountGUI_elements['buttonStart'] = {
		type: "button",
		x: preCraftCountGUI_elements['resultSlot'].x + preCraftCountGUI_elements['resultSlot'].size + (1000 - (preCraftCountGUI_elements['resultSlot'].x + preCraftCountGUI_elements['resultSlot'].size))/2,
		y: windowHeight/2,
		z: 1,
		width: 280,
		height: 130,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				if(!preCraftdata.container || !preCraftdata.selectedItem) return;
				preCraftdata.container.sendEvent("craftPreview", {item: preCraftdata.selectedItem, count: preCraftdata.craftCount});
			}
		}
	}
	preCraftCountGUI_elements['buttonStart'].x -= preCraftCountGUI_elements['buttonStart'].width/2;
	preCraftCountGUI_elements['buttonStart'].y -= buttonsOffset/2 + preCraftCountGUI_elements['buttonStart'].height;
	preCraftCountGUI_elements['textStart'] = {
		type: "text",
		x: preCraftCountGUI_elements['buttonStart'].x,
		y: preCraftCountGUI_elements['buttonStart'].y,
		z: 100,
		text: Translation.translate("Start"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.45,
			size: 57
		}
	}
	var textStart = getTextElementWidth(preCraftCountGUI_elements['textStart'], drawScale);
	var bonusTextSize = Math.min((preCraftCountGUI_elements['buttonStart'].width - 16)/textStart, 1);
	preCraftCountGUI_elements['textStart'].font.size *= bonusTextSize;
	textStart = getTextElementWidth(preCraftCountGUI_elements['textStart'], drawScale);
	preCraftCountGUI_elements['textStart'].x += preCraftCountGUI_elements['buttonStart'].width/2 - textStart/2;
	preCraftCountGUI_elements['textStart'].y += preCraftCountGUI_elements['buttonStart'].height/2 - (preCraftCountGUI_elements['textStart'].font.size + (preCraftCountGUI_elements['textStart'].font.shadow || 0))*1.1/2;
	
	preCraftCountGUI_elements['buttonCancel'] = {
		type: "button",
		x: preCraftCountGUI_elements['resultSlot'].x + preCraftCountGUI_elements['resultSlot'].size + (1000 - (preCraftCountGUI_elements['resultSlot'].x + preCraftCountGUI_elements['resultSlot'].size))/2,
		y: windowHeight/2,
		z: 1,
		width: 280,
		height: 130,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: buttonsScale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				preCraftCountGUI.close();
				backgroundGUI.close();
			}
		}
	}
	preCraftCountGUI_elements['buttonCancel'].x -= preCraftCountGUI_elements['buttonCancel'].width/2;
	preCraftCountGUI_elements['buttonCancel'].y += buttonsOffset/2;
	preCraftCountGUI_elements['textCancel'] = {
		type: "text",
		x: preCraftCountGUI_elements['buttonCancel'].x,
		y: preCraftCountGUI_elements['buttonCancel'].y,
		z: 100,
		text: Translation.translate("Cancel"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.45,
			size: 57
		}
	}
	var textCancel = getTextElementWidth(preCraftCountGUI_elements['textCancel'], drawScale);
	var bonusTextSize = Math.min((preCraftCountGUI_elements['buttonCancel'].width - 16)/textCancel, 1);
	preCraftCountGUI_elements['textCancel'].font.size *= bonusTextSize;
	textCancel = getTextElementWidth(preCraftCountGUI_elements['textCancel'], drawScale);
	preCraftCountGUI_elements['textCancel'].x += preCraftCountGUI_elements['buttonCancel'].width/2 - textCancel/2;
	preCraftCountGUI_elements['textCancel'].y += preCraftCountGUI_elements['buttonCancel'].height/2 - (preCraftCountGUI_elements['textCancel'].font.size + (preCraftCountGUI_elements['textCancel'].font.shadow || 0))*1.1/2;
})();
preCraftCountGUI.forceRefresh();
preCraftGUI.forceRefresh();

function createCraftPreviewPostData(_data){
	var subCraftOutputs = {};
	if(_data.crafts)for(var ci = 0; ci < _data.crafts.length; ci++){
		var cra = _data.crafts[ci];
		if(cra && cra.result && cra.result.id) subCraftOutputs[cra.result.id + '_' + cra.result.data] = cra.result.count;
	}
	var aggregated = {};
	if(_data.crafts)for(var ci = 0; ci < _data.crafts.length; ci++){
		var cra = _data.crafts[ci];
		if(!cra || !cra.completedIngridients) continue;
		for(var ii = 0; ii < cra.completedIngridients.length; ii++){
			var ing = cra.completedIngridients[ii];
			if(!ing || !ing.id) continue;
			var uid = ing.id + '_' + ing.data;
			if(!aggregated[uid]) aggregated[uid] = {id: ing.id, data: ing.data, count: 0, need: 0, craft: 0};
			aggregated[uid].count += (ing.count || 0);
			aggregated[uid].need += (ing.need || 0);
			aggregated[uid].craft += (ing.craft || 0);
		}
	}
	var toCraftRows = [];
	var missingRows = [];
	var availableRows = [];
	for(var uid in aggregated){
		var ing = aggregated[uid];
		var isSubOutput = !!subCraftOutputs[uid];
		var craftCount = ing.craft > 0 ? ing.craft : (isSubOutput && ing.need <= 0 ? ing.count : 0);
		if(craftCount > 0 && ing.need <= 0){
			var l1 = Translation.translate("To craft") + ": " + craftCount;
			var l2 = ing.count > 0 ? Translation.translate("Available") + ": " + ing.count : "";
			toCraftRows.push([{id: ing.id, data: ing.data}, l1, l2]);
		} else if(ing.need > 0){
			if(ing.count > 0){
				missingRows.push([{id: ing.id, data: ing.data, need: ing.need}, Translation.translate("Available") + ": " + ing.count, Translation.translate("Missing") + ": " + ing.need]);
			} else {
				missingRows.push([{id: ing.id, data: ing.data, need: ing.need}, Translation.translate("Missing") + ": " + ing.need, ""]);
			}
		} else if(ing.count > 0){
			availableRows.push([{id: ing.id, data: ing.data}, Translation.translate("Available") + ": " + ing.count, ""]);
		}
	}
	var newData = toCraftRows.slice();
	if(_data.results)for(var ri = 0; ri < _data.results.length; ri++){
		var result = _data.results[ri];
		newData.push([{id: result.id, data: result.data}, Translation.translate("To craft") + ": " + (result.count || 1), ""]);
	}
	newData = newData.concat(missingRows, availableRows);
	return newData;
}

function openCraftPreview(container, _data){
	preCraftdata.container = container;
	preCraftdata.craftable = _data.craftable;
	if (_data.errorType && _data.errorType !== "MISSING") {
		var errorMsg = Translation.translate("Request failed");
		if (_data.errorType === "RECURSIVE") errorMsg += "\n" + Translation.translate("One of the crafting ingredients ended up needing") + "\n" + Translation.translate("itself.");
		if (_data.errorType === "TOO_COMPLEX") errorMsg += "\n" + Translation.translate("The crafting task calculation was too complex") + "\n" + Translation.translate("and was stopped to avoid server strain.");
		alert(errorMsg);
	}
	var postData = createCraftPreviewPostData(_data);
	if (_data.results && _data.results[0]) preSelectCraftItem(_data.results[0]);
	preCraftSwitchPage(1, postData);
	preCraftCountGUI.close();
	preCraftGUI.open();
}
