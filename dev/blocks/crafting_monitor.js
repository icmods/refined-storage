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

var monitorStateColors = {
	0: android.graphics.Color.argb(255, 228, 228, 228),
	1: android.graphics.Color.argb(255, 232, 229, 202),
	2: android.graphics.Color.argb(255, 173, 219, 198),
	3: android.graphics.Color.argb(255, 217, 237, 247)
};
var monitorStateTransparent = android.graphics.Color.argb(0, 0, 0, 0);

function createProvidedCraftPostData(taskData){
	var newData = [];
	var elements = taskData.elements || [];
	for (var ei = 0; ei < elements.length; ei++) {
		var el = elements[ei];
		if (!el || !el.item) continue;
		var lines = [];
		var statusColor = null;
		if (el.crafting > 0) {
			lines.push(Translation.translate("Crafting") + ": " + el.crafting);
		}
		if (el.processing > 0) {
			lines.push(Translation.translate("Processing") + ": " + el.processing);
		}
		if (el.scheduled > 0) {
			lines.push(Translation.translate("Scheduled") + ": " + el.scheduled);
		}
		if (el.stored > 0) {
			lines.push(Translation.translate("Stored") + ": " + el.stored);
		}
		if (lines.length == 0) continue;
		if (el.processing > 0) statusColor = 3;
		else if (el.scheduled > 0) statusColor = 1;
		else if (el.crafting > 0) statusColor = 2;
		else if (el.stored > 0) statusColor = 0;
		newData.push([{ id: el.item.id, data: el.item.data }, lines[0] || '', lines[1] || '', statusColor]);
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
		(craftingMonitorData.providingCrafts[page].postData = createProvidedCraftPostData(craftingMonitorData.providingCrafts[page])) 
		: [];
	var elements_ = craftingMonitorGUI.getElements();
	var content_ = craftingMonitorGUI.getContent();
		for (var i = page * 4; i < page * 4 + craftingMonitorData.slots; i++) {
		var a = i - (page * 4);
		var item = _data[i] || [{ id: 0, data: 0}, '', '', null];
		elements_.get("mitemCount" + a).setBinding('text', item[1]);
		elements_.get("aitemCount" + a).setBinding('text', item[2] || '');
		var slot = elements_.get("slot" + a);
		slot.curId = item[0].id;
		slot.curData = item[0].data;
		slot.curCount = item[0].id ? 1 : 0;
		if (content_ && content_.elements) {
			var sd = content_.elements["slot" + a];
			if (sd) {
				sd.source = item[0].id ? { id: item[0].id, data: item[0].data, count: 1 } : null;
			}
			var cf = content_.elements["colorFrame" + a];
			if (cf) {
				cf.bitmap = 'empty1';
				cf.color = (item[3] !== null && item[3] !== undefined && monitorStateColors[item[3]]) ? monitorStateColors[item[3]] : monitorStateTransparent;
			}
		}
	}
	var totalPages = craftingMonitorData.providingCrafts.length || 1;
	if (totalPages > 1) {
		var sliderEl = elements_.get("slider_button");
		var sf = _elementsGUI_craftingMonitor["slider_frame"];
		var range = sf.y + sf.height - sf.scale - sf.y - sf.scale - 15 * (_elementsGUI_craftingMonitor["slider_frame"].width - 2*sf.scale)/12;
		var ratio = totalPages > 1 ? page / (totalPages - 1) : 0;
		sliderEl.y = sf.y + sf.scale + ratio * range;
	} else {
		elements_.get("slider_button").y = _elementsGUI_craftingMonitor["slider_button"].start_y;
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
				color: monitorStateTransparent,
				scale: 1
			}
			asd++;
		}
	}
	craftingMonitorData.slots = asd;

	var sliderFrameHeight = _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapHeight;
	var sliderFrameBorder = 3.8;
	_elementsGUI_craftingMonitor["slider_frame"] = {
		type: "frame",
		x: _elementsGUI_craftingMonitor['craftsFrame'].x + _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapWidth + 10,
		y: _elementsGUI_craftingMonitor['craftsFrame'].y,
		z: -100,
		width: 45,
		height: sliderFrameHeight,
		bitmap: "slider4",
		scale: sliderFrameBorder,
		onTouchEvent: function(element, event) {
			if (event.type == 'DOWN') {
				craftingMonitorData.moving = true;
			}
			if (event.type == 'CLICK') {
				var totalPages = craftingMonitorData.providingCrafts.length || 1;
				var sliderTop = _elementsGUI_craftingMonitor["slider_frame"].y + sliderFrameBorder;
				var sliderBottom = _elementsGUI_craftingMonitor["slider_frame"].y + sliderFrameHeight - sliderFrameBorder;
				var btnH = (_elementsGUI_craftingMonitor["slider_frame"].width - 2*sliderFrameBorder)/12 * 15;
				var range = sliderBottom - sliderTop - btnH;
				var ratio = range > 0 ? (event.y - sliderTop) / range : 0;
				ratio = Math.max(0, Math.min(1, ratio));
				var page = Math.round(ratio * (totalPages - 1)) + 1;
				craftingMonitorSwitchPage(page);
			}
		}
	};
	var sliderBtnScale = (_elementsGUI_craftingMonitor["slider_frame"].width - 2*sliderFrameBorder)/12;
	_elementsGUI_craftingMonitor["slider_button"] = {
		type: "button",
		x: _elementsGUI_craftingMonitor["slider_frame"].x + sliderFrameBorder,
		start_y: _elementsGUI_craftingMonitor["slider_frame"].y + sliderFrameBorder,
		y: _elementsGUI_craftingMonitor["slider_frame"].y + sliderFrameBorder,
		z: 200,
		bitmap: 'slider_buttonOff',
		scale: sliderBtnScale
	}
	_elementsGUI_craftingMonitor["monitor_swipe"] = {
		type: "frame",
		x: _elementsGUI_craftingMonitor['craftsFrame'].x,
		y: _elementsGUI_craftingMonitor['craftsFrame'].y,
		z: -200,
		width: _elementsGUI_craftingMonitor['craftsFrame'].scale*frameBitmapWidth,
		height: sliderFrameHeight,
		bitmap: "empty1",
		onTouchEvent: function(element, event) {
			if (event.type == 'DOWN') {
				craftingMonitorData.swipeY = event.y;
				craftingMonitorData.swipeSum = 0;
			}
			if (craftingMonitorData.swipeY && event.type == 'MOVE') {
				var d = event.y - craftingMonitorData.swipeY;
				craftingMonitorData.swipeSum += Math.abs(d);
				if (Math.abs(d) > 7 || craftingMonitorData.swipeSum > 15) {
					var inc = d > 0 ? -1 : 1;
					craftingMonitorSwitchPage(craftingMonitorData.page + inc + 1);
					craftingMonitorData.swipeY = event.y;
					craftingMonitorData.swipeSum = 0;
				}
			}
			if (event.type == 'UP' || event.type == 'CLICK') {
				craftingMonitorData.swipeY = null;
				craftingMonitorData.swipeSum = 0;
			}
		}
	};
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
				itemContainer.sendEvent("cancelAllTasks", {});
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
				var tasks = craftingMonitorData.providingCrafts;
				if (!tasks || !tasks.length) return;
				var task = tasks[craftingMonitorData.page];
				if (task && task.id) itemContainer.sendEvent("cancelTask", { taskId: task.id });
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
		tile._monitorListener = function(info, task) {
			for(var ti=0; ti<info.craftingTasks.length; ti++){
				var t = info.craftingTasks[ti];
				if(t.nodes) for(var ni=0; ni<t.nodes.length; ni++){
					var n = t.nodes[ni];
				}
			}
			if (task) tile.data._changedTaskId = task.id;
			tile.data.refreshCurPage = true;
		};
	},
	onWindowOpen: function(container, client){
		if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		if (info && info.addMonitorListener) {
			info.addMonitorListener(this._monitorListener);
		}
	},
	onWindowClose: function(){
		if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		if (info && info.removeMonitorListener) {
			info.removeMonitorListener(this._monitorListener);
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
		if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID] || !RSNetworks[this.data.NETWORK_ID].info) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		var rawTasks = info.providingCrafts;
		var changedTask = null;
		if (this.data._changedTaskId) {
			for (var cti = 0; cti < rawTasks.length; cti++) {
				if (rawTasks[cti].id === this.data._changedTaskId) { changedTask = rawTasks[cti]; break; }
			}
			this.data._changedTaskId = null;
		}
		for(var ri=0; ri<rawTasks.length; ri++){
			var rt = rawTasks[ri];
			if(rt.nodes) for(var rni=0; rni<rt.nodes.length; rni++){
				var rn = rt.nodes[rni];
			}
		}
		var tasksToSend = rawTasks;
		if (providingCraft) tasksToSend = [providingCraft];
		else if (changedTask) tasksToSend = [changedTask];
		var mapped = [];
		for (var mti = 0; mti < tasksToSend.length; mti++) {
			var mt = tasksToSend[mti];
			mapped.push({
				id: mt.id,
				results: mt.results || [],
				elements: info.buildMonitorElements(mt),
				totalSteps: mt.totalSteps || 0,
				currentStep: mt.currentStep || 0
			});
		}
		var _data = {
			name: this.networkData.getName() + '',
			isActive: this.data.isActive,
			NETWORK_ID: this.data.NETWORK_ID,
			redstone_mode: this.data.redstone_mode,
			providingCrafts: this.isWorkAllowed() ? mapped : [],
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
	containerEvents: {
		cancelTask: function(container, client, data) {
			var info = RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID].info;
			if (info && data && data.taskId) {
				info.cancelTask(data.taskId);
			}
		},
		cancelAllTasks: function(container, client, data) {
			var info = RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID].info;
			if (info && info.craftingTasks) {
				var tasks = info.craftingTasks.slice();
				for (var i = 0; i < tasks.length; i++) {
					info.cancelTask(tasks[i].id);
				}
			}
		}
	},
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
				if(!content || !window || !window.isOpened()) return;
				craftingMonitorData.container = container;
				var incoming = eventData.providingCrafts;
				if (eventData.refresh && craftingMonitorData.providingCrafts && incoming.length === 1 && incoming[0].id) {
					var found = false;
					for (var i = 0; i < craftingMonitorData.providingCrafts.length; i++) {
						if (craftingMonitorData.providingCrafts[i].id === incoming[0].id) {
							craftingMonitorData.providingCrafts[i] = incoming[0];
							found = true;
							break;
						}
					}
					if (!found) craftingMonitorData.providingCrafts.push(incoming[0]);
				} else {
					craftingMonitorData.providingCrafts = incoming;
				}
				var page = eventData.refresh ? craftingMonitorData.page : 1;
				craftingMonitorSwitchPage(page);
			}
		}
	}
});
