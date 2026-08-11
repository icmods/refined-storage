IDRegistry.genBlockID("RS_craftingMonitor");
Block.createBlockWithRotation("RS_craftingMonitor", [
	{
		name: "Crafting Monitor",
		texture: [['crafting_monitor_front', 0]],
		inCreative: true
	}
])
RS_blocks.push(BlockID['RS_craftingMonitor']);
EnergyUse[BlockID['RS_craftingMonitor']] = Config.energy_uses.craftingMonitor || 8;

var _monitorTexture = [
	["disk_drive_bottom", 0],
	["grid_top", 0],
	["grid_back", 0],
	["crafting_monitor_front", 0],
	["grid_left", 0],
	["grid_right", 0]
];

function getCraftingMonitorTexture(variation, _active){
	variation = variation || 0;
	var i = _active ? 1 : 0;
	return [[_monitorTexture[0], [_monitorTexture[1][0], 0], _monitorTexture[2], [_monitorTexture[3][0], i], _monitorTexture[4], _monitorTexture[5]], [_monitorTexture[0], [_monitorTexture[1][0], 1], [_monitorTexture[3][0], i], _monitorTexture[2], _monitorTexture[5], _monitorTexture[4]], [_monitorTexture[0], [_monitorTexture[1][0], 2], _monitorTexture[5], _monitorTexture[4], _monitorTexture[2], [_monitorTexture[3][0], i]], [_monitorTexture[0], [_monitorTexture[1][0], 3], _monitorTexture[4], _monitorTexture[5], [_monitorTexture[3][0], i], _monitorTexture[2]]][variation];
}

for (var izxc = 0; izxc < 4; izxc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCraftingMonitorTexture(izxc));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_craftingMonitor"], izxc, render);
}

function createProvidedCraftPostData(_data){
	var newData = [];
	for(var i in _data.results){
		var result = _data.results[i];
		var craftingTxt = Translation.translate("Crafting") + ": " + (result.count || 1);
		newData.push([{id: result.id, data: result.data}, craftingTxt, "", true]);
	}
	if(_data.crafts)for(var ci = 0; ci < _data.crafts.length; ci++){
		var cra = _data.crafts[ci];
		if(!cra || !cra.completedIngridients) continue;
		for(var ii = 0; ii < cra.completedIngridients.length; ii++){
			var ing = cra.completedIngridients[ii];
			if(!ing || !ing.id) continue;
			var label = "";
			if(ing.need > 0){
				label = Translation.translate("Stored") + ": " + (ing.count || 0) + " / " + Translation.translate("Missing") + ": " + ing.need;
				newData.unshift([{id: ing.id, data: ing.data, need: ing.need}, label, ""]);
			} else {
				label = Translation.translate("Stored") + ": " + (ing.count || 0);
				newData.push([{id: ing.id, data: ing.data}, label, ""]);
			}
		}
	}
	return newData;
}

var craftingMonitorData = {
	page: 0,
	providingCrafts: [],
	slots: 0
};

function craftingMonitorSwitchPage(page){
	page = Math.max(0, Math.min(page - 1, craftingMonitorData.providingCrafts.length - 1));
	craftingMonitorData.page = page;
	var _data = page != -1 && craftingMonitorData.providingCrafts[page] ? 
		(craftingMonitorData.providingCrafts[page].postData || (craftingMonitorData.providingCrafts[page].postData = createProvidedCraftPostData(craftingMonitorData.providingCrafts[page]))) 
		: [];
	var elements_ = craftingMonitorGUI.getElements();
	var content_ = craftingMonitorGUI.getContent();
	for (var i = page * 4; i < page * 4 + craftingMonitorData.slots; i++) {
		var a = i - (page * 4);
		var item = _data[i] || [{ id: 0, data: 0}, '', ''];
		elements_.get("mitemCount" + a).setBinding('text', item[1]);
		elements_.get("aitemCount" + a).setBinding('text', item[2] || '');
		var slot = elements_.get("slot" + a);
		slot.curId = item[0].id;
		slot.curData = item[0].data;
		slot.curCount = item[0].id ? 1 : 0;
		if (content_ && content_.elements) {
			content_.elements["colorFrame" + a].bitmap = item[3] ? 'craftPreviewErrorBG' : 'empty1';
		}
	}
}

var _elementsGUI_craftingMonitor = {};
var craftingMonitorGUI = new UI.StandartWindow({
	standart: {
		header: {
			text: {
				text: Translation.translate("Crafting Monitor")
			}
		},
		background: {
			standart: true
		}
	},
	drawing: [],
	elements: _elementsGUI_craftingMonitor
});
GUIs.push(craftingMonitorGUI);

if (!getTextElementWidth) {
	var getTextElementWidth = function(element, drawScale) {
		var font = new JavaFONT(element.font);
		return font.getBounds(element.text, element.x * drawScale, element.y * drawScale, parseFloat(1.0)).width();
	};
}

(function initCraftingMonitorElements() {
	var drawScale = craftingMonitorGUI.getWindow('main').location.getDrawingScale();
	var frameBitmapHeight = 91;
	var frameBitmapWidth = 297;
	var xoffSet = 40;
	var yoffSet = 80;
	_elementsGUI_craftingMonitor['craftsFrame'] = {
		type: "image",
		x: 500,
		y: yoffSet,
		z: -100,
		bitmap: "craftPreview_items4",
		scale: Math.min((UI.getScreenHeight() - 60)*0.675/frameBitmapHeight, (1000 - (45 + 20 + 9 + xoffSet*2))/frameBitmapWidth)
	};
	_elementsGUI_craftingMonitor['craftsFrame'].x -= (_elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapWidth + 10 + 45 + 10)/2;

	var craftsMeshWidth = frameBitmapWidth*_elementsGUI_craftingMonitor['craftsFrame'].scale;
	var craftsMeshHeight = frameBitmapHeight*_elementsGUI_craftingMonitor['craftsFrame'].scale;
	var craftsMeshPartWidth = craftsMeshWidth/4;
	var craftsMeshPartHeight = craftsMeshHeight/3;
	var craftsMeshPartTrueWidth = (craftsMeshWidth - 4*_elementsGUI_craftingMonitor['craftsFrame'].scale)/4;
	var craftsMeshPartTrueHeight = (craftsMeshHeight - 5*_elementsGUI_craftingMonitor['craftsFrame'].scale)/3;
	var slotSize = 0.726*craftsMeshPartTrueHeight;
	var textOffset = 10;
	var asd = 0;
	for(var y = 0; y < 3; y++){
		for(var x = 0; x < 4; x++){
			var slotOffset = craftsMeshPartHeight/2 - slotSize/2;
			_elementsGUI_craftingMonitor['slot' + asd] = {
				type: "slot",
				num: asd,
				x: _elementsGUI_craftingMonitor['craftsFrame'].x + craftsMeshPartWidth*x + slotOffset,
				y: _elementsGUI_craftingMonitor['craftsFrame'].y + craftsMeshPartHeight*y + slotOffset,
				z: 100,
				bitmap: "empty",
				visual: true,
				size: slotSize
			}
			_elementsGUI_craftingMonitor['mitemCount' + asd] = {
				type: "text",
				x: _elementsGUI_craftingMonitor['slot' + asd].x + slotSize + textOffset,
				y: _elementsGUI_craftingMonitor['slot' + asd].y + slotSize/3,
				z: 100,
				text: Translation.translate("Crafting") + ": 20",
				font: {
					color: android.graphics.Color.DKGRAY,
					size: 15/80*slotSize
				}
			}
			_elementsGUI_craftingMonitor['mitemCount' + asd].y -= _elementsGUI_craftingMonitor['mitemCount' + asd].font.size*1.1/2;
			_elementsGUI_craftingMonitor['aitemCount' + asd] = {
				type: "text",
				x: _elementsGUI_craftingMonitor['slot' + asd].x + slotSize + textOffset,
				y: _elementsGUI_craftingMonitor['mitemCount' + asd].y + slotSize/3,
				z: 100,
				text: Translation.translate("Stored") + ": 10",
				font: {
					color: android.graphics.Color.DKGRAY,
					size: 15/80*slotSize
				}
			}
			_elementsGUI_craftingMonitor["colorFrame" + asd] = {
				type: "frame",
				x: _elementsGUI_craftingMonitor['craftsFrame'].x + craftsMeshPartTrueWidth*x + (x+1)*_elementsGUI_craftingMonitor['craftsFrame'].scale,
				y: _elementsGUI_craftingMonitor['craftsFrame'].y + craftsMeshPartTrueHeight*y + (y+1)*_elementsGUI_craftingMonitor['craftsFrame'].scale,
				z: 80,
				width: craftsMeshPartTrueWidth,
				height: craftsMeshPartTrueHeight,
				bitmap: "empty1",
				scale: 1
			}
			asd++;
		}
	}
	craftingMonitorData.slots = asd;

	_elementsGUI_craftingMonitor["slider_frame"] = {
		type: "frame",
		x: _elementsGUI_craftingMonitor['craftsFrame'].x + _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapWidth + 10,
		y: _elementsGUI_craftingMonitor['craftsFrame'].y,
		z: -100,
		width: 45,
		height: _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapHeight,
		bitmap: "slider4",
		scale: 3.8
	};
	var slider_frame_border = _elementsGUI_craftingMonitor["slider_frame"].scale;
	_elementsGUI_craftingMonitor["slider_button"] = {
		type: "button",
		x: _elementsGUI_craftingMonitor["slider_frame"].x + slider_frame_border,
		start_y: _elementsGUI_craftingMonitor["slider_frame"].y + slider_frame_border,
		y: _elementsGUI_craftingMonitor["slider_frame"].y + slider_frame_border,
		z: 200,
		bitmap: 'slider_buttonOff',
		scale: (_elementsGUI_craftingMonitor["slider_frame"].width - 2*_elementsGUI_craftingMonitor["slider_frame"].scale)/12
	}
	_elementsGUI_craftingMonitor['buttonCancelAll'] = {
		type: "button",
		x: 0,
		y: _elementsGUI_craftingMonitor['craftsFrame'].y + _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapHeight + 10,
		z: 1,
		width: 0,
		height: Math.min(UI.getScreenHeight() - 60 - _elementsGUI_craftingMonitor['craftsFrame'].y - _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapHeight - 18 - 9, 50),
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: _elementsGUI_craftingMonitor['craftsFrame'].scale/1.5,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				alert('Cancel All — not yet implemented');
			}
		}
	};
	_elementsGUI_craftingMonitor['textCancelAll'] = {
		type: "text",
		x: 0,
		y: _elementsGUI_craftingMonitor['buttonCancelAll'].y,
		z: 100,
		text: Translation.translate("Cancel All"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: _elementsGUI_craftingMonitor['buttonCancelAll'].height*0.4
		}
	}
	var textCancelAllW = getTextElementWidth(_elementsGUI_craftingMonitor['textCancelAll'], drawScale);
	_elementsGUI_craftingMonitor['buttonCancelAll'].width = Math.max(_elementsGUI_craftingMonitor['buttonCancelAll'].height*1.5, textCancelAllW + 16);
	_elementsGUI_craftingMonitor['buttonCancelAll'].x = _elementsGUI_craftingMonitor["slider_frame"].x + _elementsGUI_craftingMonitor["slider_frame"].width - _elementsGUI_craftingMonitor['buttonCancelAll'].width;
	_elementsGUI_craftingMonitor['textCancelAll'].x = _elementsGUI_craftingMonitor['buttonCancelAll'].x + _elementsGUI_craftingMonitor['buttonCancelAll'].width/2 - textCancelAllW/2;
	_elementsGUI_craftingMonitor['textCancelAll'].y += _elementsGUI_craftingMonitor['buttonCancelAll'].height/2 - (_elementsGUI_craftingMonitor['textCancelAll'].font.size + (_elementsGUI_craftingMonitor['textCancelAll'].font.shadow || 0))*1.1/2 - 1;

	_elementsGUI_craftingMonitor['buttonCancel'] = {
		type: "button",
		x: _elementsGUI_craftingMonitor['buttonCancelAll'].x - 10,
		y: _elementsGUI_craftingMonitor['buttonCancelAll'].y,
		z: 1,
		width: 9,
		height: _elementsGUI_craftingMonitor['buttonCancelAll'].height,
		bitmap: "NativeButtonLite",
		bitmap2: "NativeButtonLitePressed",
		scale: _elementsGUI_craftingMonitor['buttonCancelAll'].scale,
		clicker: {
			onClick: function(itemContainerUiHandler, itemContainer, element){
				alert('Cancel — not yet implemented');
			}
		}
	};
	_elementsGUI_craftingMonitor['textCancel'] = {
		type: "text",
		x: 0,
		y: _elementsGUI_craftingMonitor['buttonCancel'].y,
		z: 100,
		text: Translation.translate("Cancel"),
		font: {
			color: android.graphics.Color.WHITE,
			shadow: 0.5,
			size: _elementsGUI_craftingMonitor['buttonCancel'].height*0.45
		}
	}
	var textCancelW = getTextElementWidth(_elementsGUI_craftingMonitor['textCancel'], drawScale);
	_elementsGUI_craftingMonitor['buttonCancel'].width = Math.max(_elementsGUI_craftingMonitor['buttonCancel'].height, textCancelW + 10);
	_elementsGUI_craftingMonitor['buttonCancel'].x -= _elementsGUI_craftingMonitor['buttonCancel'].width;
	_elementsGUI_craftingMonitor['textCancel'].x = _elementsGUI_craftingMonitor['buttonCancel'].x + _elementsGUI_craftingMonitor['buttonCancel'].width/2 - textCancelW/2;
	_elementsGUI_craftingMonitor['textCancel'].y += _elementsGUI_craftingMonitor['buttonCancel'].height/2 - (_elementsGUI_craftingMonitor['textCancel'].font.size + (_elementsGUI_craftingMonitor['textCancel'].font.shadow || 0))*1.1/2 - 1;
})();

function mapProvidingCrafts(value){
	return {
		result: value.result,
		results: value.results,
		ingridients: value.ingridients,
		crafts: value.crafts ? value.crafts.map(function(c){ return {completedIngridients: c.completedIngridients, craftable: c.craftable}; }) : [],
		totalSteps: value.totalSteps || 0,
		currentStep: (value.completedCrafts ? value.completedCrafts.length : 0)
	}
}

RefinedStorage.createTile(BlockID.RS_craftingMonitor, {
	defaultValues:{},
	useNetworkItemContainer: true,
	blockInfo: {
		id: BlockID.RS_craftingMonitor
	},
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.container.openFor(client, "main");
		this.refreshGui(true, client);
		return true;
	},
	getScreenByName: function(screenName) {
		return craftingMonitorGUI;
	},
	pre_init: function(){
		var tile = this;
		tile._monitorListener = function(info) {
			Logger.Log('[MON] Refresh triggered: tasks=' + info.craftingTasks.length + ' providing=' + info.providingCrafts.length, 'RS_DEBUG');
			tile.data.refreshCurPage = true;
		};
	},
	post_init: function () {},
	onWindowOpen: function(container, client){
		if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		if (info && info.addMonitorListener) {
			info.addMonitorListener(this._monitorListener);
			Logger.Log('[MON] Listener ADDED: netId=' + this.data.NETWORK_ID + ' listeners=' + info.monitorListeners.length, 'RS_DEBUG');
		}
	},
	onWindowClose: function(){
		if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		if (info && info.removeMonitorListener) {
			info.removeMonitorListener(this._monitorListener);
			Logger.Log('[MON] Listener REMOVED: listeners=' + info.monitorListeners.length, 'RS_DEBUG');
		}
	},
	post_update_network: function(net_id){
		if (this.data.LAST_NETWORK_ID != 'f' && RSNetworks[this.data.LAST_NETWORK_ID]) {
			var oldInfo = RSNetworks[this.data.LAST_NETWORK_ID].info;
			if (oldInfo && oldInfo.removeMonitorListener) {
				oldInfo.removeMonitorListener(this._monitorListener);
			}
		}
	},
	refreshGui: function(first, client, providingCraft){
		var _data = {
			name: this.networkData.getName() + '',
			isActive: this.data.isActive,
			NETWORK_ID: this.data.NETWORK_ID,
			redstone_mode: this.data.redstone_mode,
			providingCrafts: this.isWorkAllowed() ? (providingCraft ? [providingCraft] : RSNetworks[this.data.NETWORK_ID].info.providingCrafts).map(mapProvidingCrafts) : [],
			refresh: !first,
			first: first
		};
		if(client){
			this.container.sendEvent(client, "openGui", _data);
		} else {
			this.container.sendEvent("openGui", _data);
		}
	},
	refreshModel: function(){
		if(!this.networkEntity) return Logger.Log(Item.getName(this.blockInfo.id, this.blockInfo.data) + ' model on: ' + cts(this) + ' cannot be displayed');
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z}});
	},
	containerEvents: {},
	tick: function(){
		if(this.data.refreshCurPage){
			this.data.refreshCurPage = false;
			this.refreshGui(false);
		}
	},
	client: {
		refreshModel: function(){
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getCraftingMonitorTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		events: {
			refreshModel: function(eventData, packetExtra) {
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getCraftingMonitorTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			openGui: function(container, window, content, eventData){
				craftingMonitorData.providingCrafts = eventData.providingCrafts;
				var page = eventData.refresh ? craftingMonitorData.page : 1;
				craftingMonitorSwitchPage(page);
			}
		}
	}
});
