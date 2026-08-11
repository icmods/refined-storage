IDRegistry.genBlockID("RS_controller");
RefinedStorage.createMapBlock("RS_controller", [
	{
		name: "Controller",
		texture: [
			["controller_off", 0]
		],
		inCreative: true
	},
	{
		name: "Controller",
		texture: [
			["controller_nearly_off", 0]
		],
		inCreative: false
	},
	{
		name: "Controller",
		texture: [
			["controller_on", 0]
		],
		inCreative: false
	},
	{
		name: "Creative Controller",
		texture: [
			["controller_on", 0]
		],
		inCreative: false
	}
]);
RS_blocks.push(BlockID.RS_controller);
ICRender.getGroup("ic-wire").add(BlockID.RS_controller, -1);

var Controller_2_extra = new ItemExtraData();
Controller_2_extra.putInt('energy', Config.controller.energyCapacity);
Item.addToCreative(BlockID['RS_controller'], 1, 2, Controller_2_extra);
Item.addToCreative(BlockID['RS_controller'], 1, 3);

Item.registerNameOverrideFunction(BlockID['RS_controller'], function (item, name) {
	if(item.data == 3) return name;
	if (!item.extra) return name + '\n§70 / ' + Config.controller.energyCapacity;
	var energy = item.extra.getInt('energy', 0);
	return name + '\n§7' + energy + ' / ' + Config.controller.energyCapacity;
})

Item.registerIconOverrideFunction(BlockID['RS_controller'], function(item, isModUi){
	if(isModUi){
		if(item.data == 1){
			return {name:'controllerTempOff', data: World.getThreadTime()%12};
		} else if(item.data == 2 || item.data == 3){
			return {name:'controllerTempOn', data: parseInt(World.getThreadTime()%24/2)};
		}
	}
})

Block.registerDropFunction("RS_controller", function (coords, id, data, diggingLevel, toolLevel, player, _blockSource) {
	return [];
});

Block.registerPlaceFunction("RS_controller", function (coords, item, block, player, blockSource) {
    if(!World.canTileBeReplaced(block.id, block.data)){
		var relBlock = blockSource.getBlock(coords.relative.x, coords.relative.y, coords.relative.z);
		if (World.canTileBeReplaced(relBlock.id, relBlock.data)){
			coords = coords.relative;
		} else return;
	}
	blockSource.setBlock(coords.x, coords.y, coords.z, item.id, item.data);
	var tile = World.addTileEntity(coords.x, coords.y, coords.z, blockSource) || World.getTileEntity(coords.x, coords.y, coords.z, blockSource);
	var energy = 0;
	if(item.data == 3 && tile && tile.data){
		tile.data.isCreative = true;
		tile.data.energy = Config.controller.energyCapacity;
		//tile.setActive(true);
		return;
	}
	if (item.extra && item.extra.getInt('energy') && tile && tile.data) {
		energy = item.extra.getInt('energy');
		tile.data.energy = energy;
	}
	Entity.setCarriedItem(player, item.id, item.count - 1, item.data, item.extra);
});
var elementsGUI_controller = {};
var controller_other_data = {
	net_map:{},
	isActive: false,
	max_y: 0,
	lastPage: -1
};
var controllerSwitchPage = function(num, container, data, ignore){
	if(!data.isActive){
		for (var i = 0; i < 4; i++) {
			container.clearSlot("slot" + i);
			container.setText('block_info' + i, '');
			container.setText('block_count' + i, '');
			container.setText('block_energy_use' + i, '');
		}
		return false;
	}
	num = num || 1;
	var aray_net_map = Object.keys(data.net_map);
	var pages1 = controllerFuncs.getPages(aray_net_map.length);
	var pages = Math.max(1, pages1 - 1);
	num = Math.max(1, Math.min(num, pages)) - 1;
	if(num == data.lastPage && !ignore) return false;
	data.lastPage = num;
	if(aray_net_map.length == 0){
		for (var i = 0; i < 4; i++) {
			container.clearSlot("slot" + i);
			container.setText('block_info' + i, '');
			container.setText('block_count' + i, '');
			container.setText('block_energy_use' + i, '');
		}
	} else {
		for (var i = num * 2; i < num * 2 + 4; i++) {
			var a = i - (num * 2);
			var item = aray_net_map[i] ? data.net_map[aray_net_map[i]] : {};
			var _id = item.id ? Network.serverToLocalId(item.id) : 0;
			container.setSlot("slot" + a, _id, 1, item.data || 0, item.extra || null);
			var name = item.id ? Item.getName(_id, item.data || 0, item.extra).split('\n')[0] : '';
			if(name.length > controller_other_data['max_sym']) name = name.substr(0, controller_other_data['max_sym'] - 1) + '...';
			container.setText('block_info' + a, name);
			container.setText('block_count' + a, _id ? item.count + 'x' : '');
			container.setText('block_energy_use' + a, _id ? item.energy_use + ' FE/t' : '');
		}
	}
	return true;
}
buildControllerElements(elementsGUI_controller, controller_other_data, controllerFuncs, controllerSwitchPage);

const CONTROLLER_GUI = new UI.StandartWindow({
	standart: {
		header: {
			text: {
				text: Translation.translate("Controller")
			}
		},
		background: {
			standart: true
		}
	},

	drawing: [],

	elements: elementsGUI_controller
});
GUIs.push(CONTROLLER_GUI);
testButtons(CONTROLLER_GUI.getWindow('header').getContent().elements, function(){
	buildControllerElements(elementsGUI_controller, controller_other_data, controllerFuncs, controllerSwitchPage);
});

var controllerFuncs = {
	getPages: function(_length){
		if(_length == 0) return 1;
		_length = Math.ceil(_length / 2);
		return _length;//Math.max(_length - Math.min(_length, 4) + 1, 0) || 1;
	},
	getPageFromCoords: function(_coords, pages){
		pages -= 1;
		var max_y = controller_other_data.max_y;
		var interval = (pages - 1) > 0 ? (max_y - elementsGUI_controller["slider_button"].start_y) / (pages - 1) : 0;
		function __getY(i) {
			return ((interval * i) + elementsGUI_controller["slider_button"].start_y);
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
		pages -= 1;
		var max_y = controller_other_data.max_y;
		var interval = (pages - 1) > 0 ? (max_y - elementsGUI_controller["slider_button"].start_y) / (pages - 1) : 0;
		function __getY(i) {
			return ((interval * i) + elementsGUI_controller["slider_button"].start_y);
		}
		if (page > pages) page = pages;
		if (page < 1) page = 1;
		return __getY(page - 1);
	}
}

RefinedStorage.createTile(BlockID.RS_controller, {
	defaultValues: {
		NETWORK_ID: "f",
		energy: 0,
		usage: 0,
		lastTexture: '',
		page_switched: false,
		net_map: {},
		page: 1,
		redstone_mode: 0,
		isCreative: false,
		networkDataUpdate: false,
		containerUpdate: false,
		ticks: 0,
		networkTick: 0,
		updateControllerNetwork: false,
		updateModel: false,
		lastTexture: ''
	},
	unsaveableSlots: true,
	useNetworkItemContainer: true,
	created: function () {
        if(!this.blockSource)this.blockSource = BlockSource.getDefaultForDimension(this.dimension);
		while (controller = searchController(this, false, this.blockSource)) {
			for (var i in sides) {
				var coordss = {};
				coordss.x = this.x + sides[i][0];
				coordss.y = this.y + sides[i][1];
				coordss.z = this.z + sides[i][2];
				var bck = this.blockSource.getBlock(coordss.x, coordss.y, coordss.z);
				if (RS_blocks.indexOf(bck.id) != -1) {
					if(bck.id == BlockID.RS_cable){
						for(var j in RSNetworks){
							if(RSNetworks[j][cts(coordss)]){
								delete RSNetworks[j][cts(coordss)];
								if(InnerCore_pack.packVersionCode < 120) this.blockSource.destroyBlock(coordss.x, coordss.y, coordss.z, true);
								else this.blockSource.breakBlock(coordss.x, coordss.y, coordss.z, true);
								if(InnerCore_pack.packVersionCode < 120)Block.onBlockDestroyed(coordss, bck, false, Player.get());
								if(InnerCore_pack.packVersionCode < 120)Callback.invokeCallback('BlockChanged', coordss, {id:bck.id, data:bck.data}, {id:0, data:0}, this.dimension);
							}
						}
					} else {
						var tile = World.getTileEntity(coordss.x, coordss.y, coordss.z, this.blockSource);
						if (tile && tile.data.NETWORK_ID != 'f' && tile.data.NETWORK_ID != this.data.NETWORK_ID) {
							if(InnerCore_pack.packVersionCode < 120) this.blockSource.destroyBlock(coordss.x, coordss.y, coordss.z, true);
							else this.blockSource.breakBlock(coordss.x, coordss.y, coordss.z, true);
							if(InnerCore_pack.packVersionCode < 120)Block.onBlockDestroyed(coordss, bck, false, Player.get());
							if(InnerCore_pack.packVersionCode < 120)Callback.invokeCallback('BlockChanged', coordss, {id:bck.id, data:bck.data}, {id:0, data:0}, this.dimension);
						}
					}
				}
			}
		}
	},
	setActive: function(state, forced, preventRefreshModel){
		state = this.data.NETWORK_ID != "f" ? !!state : false;
		if(this.data.isActive == state && !forced) return false;
		if (this.pre_setActive) if(this.pre_setActive(state)) return false;
		if(state && !this.redstoneAllowActive(this.data.last_redstone_event)) return false;
		if(state && this.data.energy < this.data.usage) return false;
		if(state == false || (forced || this.data.allowSetIsActive != false)){
			this.data.isActive = state;
			this.networkData.putBoolean('isActive', state);
			if(this.data.NETWORK_ID != "f")RSNetworks[this.data.NETWORK_ID][this.coords_id()].isActive = state;
		}
		this.networkData.sendChanges();
		if(!preventRefreshModel)this.refreshModel();
		if (this.post_setActive) this.post_setActive(state);
		return true;
	},
	init: function () {
		//if (this.data.NETWORK_ID == "f" || !RSNetworks[this.data.NETWORK_ID]) {
			this.data.NETWORK_ID = RSNetworks.length;
			var controllerTile = this;
			this.networkData.putInt('energy', this.data.energy);
			this.networkData.putInt('NETWORK_ID', RSNetworks.length);
			this.networkData.putBoolean('isActive', this.data.isActive || false);
			if(this.unsaveableSlots && InnerCore_pack.packVersionCode >= 120){
				if(Array.isArray(this.unsaveableSlots)){
					for(var i in this.unsaveableSlots)this.container.setSlotSavingEnabled(this.unsaveableSlots[i], false);
				} else {
					this.container.setGlobalSlotSavingEnabled(false);
				}
			}
			var _data = {};
			_data[cts(this)] = {
				id: BlockID.RS_controller,
				coords: { x: this.x, y: this.y, z: this.z },
				upgrades: {},
				isActive: false
			}
			_data['info'] = NetworkInfo.create(_data, controllerTile, RSNetworks.length);
			RSNetworks.push(_data);
			this.networkData.sendChanges();
			this.data.ticks = 0;
			this.data.timer = 20;
			_RS._emit("networkCreated", {netId: this.data.NETWORK_ID, tile: this});
		//}
	},
	updateItems: function(){
		if(this.data.NETWORK_ID != 'f'){
			RSNetworks[this.data.NETWORK_ID].info.updateItems();
		}
	},
	updateControllerNetwork: function(_first){
		set_net_for_blocks(this, this.data.NETWORK_ID, false, _first, _first ? undefined : this.data.isActive);
	},
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if(!client) return true;
		if (this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.container.openFor(client, "main");
		var _data = {
			name: this.networkData.getName() + '', 
			isActive: this.data.isActive, 
			capacity: this.getCapacity(), 
			redstone_mode: this.data.redstone_mode, 
			usage: this.data.usage, 
			energy: this.data.energy, 
			isCreative: this.data.isCreative, 
			net_map: this.data.net_map
		};
		this.container.sendEvent(client, "openGui", _data); 
		this.container.setScale('scale', this.data.energy / this.getCapacity());
		this.container.setText('usage', Translation.translate('Usage')+": " + this.data.usage + " FE/t");
		this.container.setText('storage', this.data.energy + '/' + this.getCapacity() + ' FE');
		this.container.sendChanges();
		return true;
	},
	post_setActive: function(state){
		set_is_active_for_blocks_net(this.data.NETWORK_ID, state, true, this.blockSource);
		if(!state){
			this.data.net_map = {};
			this.data.usage = 0;
			this.container.setText('usage', Translation.translate('Usage') + ": 0 FE/t");
			this.container.sendChanges();
		} else {
			this.updateNetMap();
			this.container.setText('usage', Translation.translate('Usage')+": " + this.data.usage + " FE/t");
			this.container.sendChanges();
		}
		this.refreshGui();
	},
	pages: function () {
		if (this.container.getNetworkEntity().getClients().iterator().hasNext() && this.data.NETWORK_ID != "f" && this.data.isActive) {
			var aray_net_map = Object.keys(this.data.net_map);
			return controllerFuncs.getPages(aray_net_map.length);
		} else {
			return 1;
		}
	},
	getCapacity: function () {
		return Config.controller.energyCapacity;
	},
	canReceiveEnergy: function (side, type) {
		return true;
	},
	isEnergySource: function () {
		return true;
	},
	updateNetMap: function(_ignoreIsActive){
		var result = computeNetMap(this.data.NETWORK_ID, this.blockSource, _ignoreIsActive);
		this.data.net_map = result.net_map;
		this.data.usage = result.usage;
	},
	energyReceive: function (type, amount, voltage) {
		amount = Math.min(amount * EnergyTypeRegistry.getValueRatio(type, 'FE'), Config.controller.controllerMaxReceive);
		var add = Math.min(amount, this.getCapacity() - this.data.energy);
		if(!this.data.isActive && this.data.allowSetIsActive != false)this.setActive(true);
		this.data.energy += add;
		this.networkData.putInt('energy', this.data.energy);
		this.data.networkDataUpdate = true;
		this.data.updateModel = true;
		return type == 'Eu' ? add / 4 : add;
	},
	pre_setActive: function(state){
		if(state && this.data.energy <= 0) return true;
	},
	tick: function () {
		if(this.data.timer){
			this.data.ticks++;
			if(this.data.ticks >= this.data.timer) {
				this.updateControllerNetwork(true);
				this.updateItems();
				this.updateNetMap(true);
				this.setActive(this.data.energy > this.data.usage, true, true);
				this.refreshModel();
				Logger.Log('[CTRL] Network built, restoring tasks: netId=' + this.data.NETWORK_ID, 'RS_DEBUG');
				restoreCraftingTasks(this);
				this.data.timer = false;
				this.data.ticks = 0;
			}
		}
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			this.container.setScale('scale', this.data.energy / this.getCapacity());
			this.container.setText('storage', this.data.energy + '/' + this.getCapacity() + ' FE');
			this.data.containerUpdate = true;
		}
		if(!this.isWorkAllowed()) {
			if(this.data.containerUpdate){
				this.container.sendChanges();
				this.data.containerUpdate = false;
			}
			Logger.Log('[CTRL] Scheduler SKIPPED: isWorkAllowed=false active=' + this.data.isActive + ' netId=' + this.data.NETWORK_ID + ' energy=' + this.data.energy, 'RS_DEBUG');
			return;
		}
		if(this.data.updateControllerNetwork){
			this.updateControllerNetwork();
			this.data.updateControllerNetwork = false;
		}
		this.updateNetMap();
		if (this.data.energy >= this.data.usage && this.data.energy != 0){
			this.setActive(true);
			if(Config.controller.usesEnergy && !this.data.isCreative){
				this.data.energy -= this.data.usage;
				this.networkData.putInt('energy', this.data.energy);
				this.data.networkDataUpdate = true;
				this.data.updateModel = true;
			}
		} else {
			this.setActive(false);
		}
		if(this.data.networkDataUpdate){
			this.networkData.sendChanges();
			this.data.networkDataUpdate = false;
		}
		if(this.data.containerUpdate){
			this.container.sendChanges();
			this.data.containerUpdate = false;
		}
		if(this.data.updateModel){
			var texture = getControllerTexture(getEnergyScaled(this.data.energy), this.data.isActive);
			if(this.data.lastTexture != (this.data.lastTexture = texture)) this.refreshModel();
			this.data.updateModel = false;
		}
		if (this.data.NETWORK_ID != 'f' && RSNetworks[this.data.NETWORK_ID]) {
			var info = RSNetworks[this.data.NETWORK_ID].info;
			if (info && info.craftingTasks && info.craftingTasks.length > 0) {
				this.data.networkTick++;
				Logger.Log('[CTRL] Scheduler: tasks=' + info.craftingTasks.length + ' tick=' + this.data.networkTick + ' active=' + this.data.isActive + ' energy=' + this.data.energy, 'RS_DEBUG');
				CraftingScheduler.processTick(info, this.blockSource, this.data.networkTick);
			}
		}
	},
	refreshModel: function(){
		if(!this.networkEntity) return Logger.Log(Item.getName(this.blockInfo.id, this.blockInfo.data) + ' model on: ' + cts(this) + ' cannot be displayed');
		this.sendPacket("refreshModel", {energy: this.data.energy, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z}});
	},
	destroy: function (param1, isDropAllowed) {
		if (this.data.NETWORK_ID != "f" && RSNetworks[this.data.NETWORK_ID]) {
			var info = RSNetworks[this.data.NETWORK_ID].info;
			if (info && info.craftingTasks) {
				for (var ti = 0; ti < info.craftingTasks.length; ti++) {
					var task = info.craftingTasks[ti];
					Logger.Log('[CTRL] Destroy flush: task=' + task.id + ' hasFlush=' + !!task.flushBuffer + ' buffer=' + JSON.stringify(task.buffer || {}) + ' internal=' + (task.internalStorage ? task.internalStorage.length : 0), 'RS_DEBUG');
					if (task.flushBuffer) task.flushBuffer(info);
					if (task.internalStorage) {
						for (var bi = 0; bi < task.internalStorage.length; bi++) {
							info.pushItem(task.internalStorage[bi], task.internalStorage[bi].count, false, ['autocraft']);
						}
					}
				}
			}
			_RS._emit("networkDestroyed", {netId: this.data.NETWORK_ID, tile: this});
			set_net_for_blocks(this, 'f');
			delete RSNetworks[this.data.NETWORK_ID];
		}
		if(!isDropAllowed && isDropAllowed !== undefined) return;
		this.data.LAST_NETWORK_ID = this.data.NETWORK_ID;
		this.data.NETWORK_ID = "f";
		if(this.data.isCreative){
			this.blockSource.spawnDroppedItem(this.x + 0.5, this.y + 0.5, this.z + 0.5, BlockID['RS_controller'], 1, 3, null);
			return;
		}
		var extra = null;
		if (this.data.energy > 0) {
			extra = new ItemExtraData();
			extra.putInt('energy', this.data.energy);
		}
		var block_data = 0;
		var energyScaled = getEnergyScaled(100, this.data.energy);
		if (energyScaled <= 0) {
			block_data = 0;
		} else if (energyScaled <= 20) {
			block_data = 1;
		} else {
			block_data = 2;
		}
		this.blockSource.spawnDroppedItem(this.x + 0.5, this.y + 0.5, this.z + 0.5, BlockID['RS_controller'], 1, block_data, extra);
	},
	getScreenByName: function(screenName) {
		if(screenName == 'main')return CONTROLLER_GUI;
	},
	refreshGui: function(){
		this.container.sendEvent("refreshGui", {isActive: this.data.isActive, capacity: this.getCapacity(), redstone_mode: this.data.redstone_mode, usage: this.data.usage, energy: this.data.energy, isCreative: this.data.isCreative, net_map: this.data.net_map});
	},
	client: {
		load: function(){ loadControllerClient(this); },
		refreshModel: function(eventData, connectedClient){ refreshControllerModel(this); },
		events: {
			refreshModel: function(eventData, connectedClient){ handleControllerModelEvent(this, eventData); }
		},
		containerEvents: {
			openGui: function(container, window, windowContent, eventData){ openControllerGui(this, container, window, windowContent, eventData); },
			refreshGui:function(container, window, windowContent, eventData){ refreshControllerGui(this, container, window, windowContent, eventData); }
		}
	},
	containerEvents: {
		updateRedstoneMode: function(eventData, connectedClient) {
			if(this.data.redstone_mode == undefined) this.data.redstone_mode = 0;
			this.data.redstone_mode = this.data.redstone_mode >= 2 ? 0 : this.data.redstone_mode + 1;
			if(!this.refreshRedstoneMode()) this.refreshGui();
		},
		craftPreview: function(eventData, connectedClient) {
			if (this.data.NETWORK_ID == 'f') return;
			var info = RSNetworks[this.data.NETWORK_ID].info;
			var result = info.constructCraft(eventData.item, eventData.count || 1);
			if(Config.dev)Logger.Log('[CRAFT] Preview requested: ' + Item.getName(eventData.item.id, eventData.item.data) + ' x' + (eventData.count||1) + ' craftable=' + result.craftable + ' results=' + result.results.length + ' ingridients=' + result.ingridients.length + ' crafts=' + (result.crafts?result.crafts.length:0), 'RefinedStorageDebug');
			var craftsData = result.crafts ? result.crafts.map(function(c){ return {completedIngridients: c.completedIngridients, craftable: c.craftable}; }) : [];
			this.container.sendEvent(connectedClient, "openCraftPreview", {
				results: result.results,
				ingridients: result.ingridients,
				craftable: result.craftable,
				crafts: craftsData,
				errorType: result.errorType || null
			});
		},
		provideConstructedCraft: function(eventData, connectedClient) {
			if (this.data.NETWORK_ID == 'f') return;
			var info = RSNetworks[this.data.NETWORK_ID].info;
			if(Config.dev)Logger.Log('[CRAFT] Start requested: ' + Item.getName(eventData.item.id, eventData.item.data) + ' x' + (eventData.count||1), 'RefinedStorageDebug');
			var result = info.constructCraft(eventData.item, eventData.count || 1);
			if(Config.dev)Logger.Log('[CRAFT] Tree built: craftable=' + result.craftable + ' providingCrafts=' + (info.providingCrafts?info.providingCrafts.length+1:1), 'RefinedStorageDebug');
			if (result.craftable) info.provideCraft(result);
		}
	}
})
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, FE);
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, EU);
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, RF);