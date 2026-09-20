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
	if(item.data == 3 && tile && tile.data){
		tile.data.isCreative = true;
		tile.data.energy = Config.controller.energyCapacity;
		return;
	}
	if (item.extra && typeof item.extra.getInt == 'function' && item.extra.getInt('energy') && tile && tile.data) {
		var _placeEnergy = item.extra.getInt('energy');
		if (isFinite(_placeEnergy) && _placeEnergy >= 0) tile.data.energy = Math.min(_placeEnergy, Config.controller.energyCapacity);
	}
	Entity.setCarriedItem(player, item.id, item.count - 1, item.data, item.extra);
});
var elementsGUI_controller = {};
var controller_other_data = {
	net_map:{},
	isActive: false,
	max_y: 0,
	lastPage: -1,
	countX: 4,
	countY: 1
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
	var pages = Math.max(1, pages1);
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
		for (var i = num * 4; i < num * 4 + 4; i++) {
			var a = i - (num * 4);
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
var controllerFuncs = UiCore.pagination(controller_other_data, {countX: "countX", countY: "countY", maxY: "max_y", slider: "slider"});
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

RefinedStorage.createTile(BlockID.RS_controller, {
	defaultValues: {
		NETWORK_ID: "f",
		energy: 0,
		usage: 0,
		lastTexture: '',
		net_map: {},
		redstone_mode: 0,
		isCreative: false,
		networkDataUpdate: false,
		containerUpdate: false,
		ticks: 0,
		networkTick: 0,
		updateControllerNetwork: false,
		updateModel: false
	},
	unsaveableSlots: true,
	useNetworkItemContainer: true,
	created: function () {
        if(!this.blockSource)this.blockSource = BlockSource.getDefaultForDimension(this.dimension);
		delete this.data.controller_coords;
		while (searchController(this, false, this.blockSource)) {
			for (var i in sides) {
				var coordss = {};
				coordss.x = this.x + sides[i][0];
				coordss.y = this.y + sides[i][1];
				coordss.z = this.z + sides[i][2];
				if (!isChunkLoadedAtSafe(this.blockSource, coordss.x, coordss.y, coordss.z)) continue;
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
			delete this.data.controller_coords;
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
			if(this.data.NETWORK_ID != "f"){
				var ownNetworkEntry = RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID][this.coords_id()];
				if(ownNetworkEntry) ownNetworkEntry.isActive = state;
			}
			if(this.data.NETWORK_ID != "f")_RS._emit("networkStateChanged", {netId: this.data.NETWORK_ID, isActive: state});
		}
		this.networkData.sendChanges();
		if(!preventRefreshModel) rsSafeServerRefresh(this, 'controllerSetActive');
		if (this.post_setActive) this.post_setActive(state);
		return true;
	},
	init: function () {
		var existingNetId = -1;
		var ownKey = cts(this);
		for (var nid = 0; nid < RSNetworks.length; nid++) {
			var probeNet = RSNetworks[nid];
			if (!probeNet) continue;
			var probeEntry = probeNet[ownKey];
			if (probeEntry && probeEntry.id == BlockID.RS_controller) { existingNetId = nid; break; }
		}
		var netId = existingNetId != -1 ? existingNetId : rsAllocNetId();
		this.data.NETWORK_ID = netId;
		var controllerTile = this;
		this.networkData.putInt('energy', this.data.energy);
		this.networkData.putInt('NETWORK_ID', netId);
		this.networkData.putBoolean('isActive', this.data.isActive || false);
		if(this.unsaveableSlots && InnerCore_pack.packVersionCode >= 120){
			if(Array.isArray(this.unsaveableSlots)){
				for(var i in this.unsaveableSlots)this.container.setSlotSavingEnabled(this.unsaveableSlots[i], false);
			} else {
				this.container.setGlobalSlotSavingEnabled(false);
			}
		}
		if (existingNetId == -1) {
			var _data = {};
			_data[ownKey] = {
				id: BlockID.RS_controller,
				coords: { x: this.x, y: this.y, z: this.z },
				upgrades: {},
				isActive: false
			}
			_data['info'] = NetworkInfo.create(_data, controllerTile, netId);
			RSNetworks[netId] = _data;
			_RS._emit("networkCreated", {netId: netId, tile: this});
			// Restore immediately so early processing outputs can be credited.
			restoreCraftingTasks(this);
			this.data.ticks = 0;
			this.data.timer = 20;
		} else {
			var existingNet = RSNetworks[netId];
			existingNet[ownKey] = {
				id: BlockID.RS_controller,
				coords: { x: this.x, y: this.y, z: this.z },
				upgrades: {},
				isActive: false
			}
			if (existingNet.info && existingNet.info.updateControllerTile) existingNet.info.updateControllerTile(controllerTile);
			if (existingNet.info) {
				existingNet.info.netMapDirty = true;
				existingNet.info.incomplete = true;
			}
			this.data.updateControllerNetwork = true;
			restoreCraftingTasks(this);
		}
		var _info = RSNetworks[netId] && RSNetworks[netId].info;
		if (_info) {
			_info.dimension = this.dimension;
			_info.controllerCoords = { x: this.x, y: this.y, z: this.z };
		}
		var _timerNet = NetworkTimer.networks[netId];
		if(!_timerNet) _timerNet = NetworkTimer.networks[netId] = { heartbeat: 0, tasks: {} };
		if(_info) NetworkTimer.ensureInternalTasks(_timerNet, _info);
		var _ctrlTile = this;
		MpCore.connectivity(_ctrlTile, {
			onOpen: function(container, client, owner){
				var t = owner || _ctrlTile;
				if(t.onWindowOpen) t.onWindowOpen(container, client);
			},
			onClose: function(uid, container, client, owner){
				var t = owner || _ctrlTile;
				if(t.onWindowClose) t.onWindowClose(container, client);
			}
		});
		this.networkData.sendChanges();
	},
	updateItems: function(){
		if(this.data.NETWORK_ID != 'f'){
			RSNetworks[this.data.NETWORK_ID].info.updateItems();
		}
	},
	updateControllerNetwork: function(_first){
		var incomplete = set_net_for_blocks(this, this.data.NETWORK_ID, false, _first, _first ? undefined : this.data.isActive);
		if (this.data.NETWORK_ID != 'f' && RSNetworks[this.data.NETWORK_ID] && RSNetworks[this.data.NETWORK_ID].info) {
			var info = RSNetworks[this.data.NETWORK_ID].info;
			info.netMapDirty = true;
			info.incomplete = !!incomplete;
			info.controllerCoords = {x: this.x, y: this.y, z: this.z};
		}
	},
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if(!client) return true;
		if (this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.container.openFor(client, "main");
		if (this._guiBinder) this._guiBinder.invalidate();
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
		if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) return 0;
		amount = Math.min(amount * EnergyTypeRegistry.getValueRatio(type, 'FE'), Config.controller.controllerMaxReceive);
		var add = Math.max(0, Math.min(amount, this.getCapacity() - this.data.energy));
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
				rsSafeServerRefresh(this, 'controllerTimer');
				restoreCraftingTasks(this);
				this.data.timer = false;
				this.data.ticks = 0;
			}
		}
		// Self-heal a controller moved by a piston (destroy ran without clearing NETWORK_ID).
		if (this.data.NETWORK_ID != 'f') {
			var _orphanNet = RSNetworks[this.data.NETWORK_ID];
			if (!_orphanNet || !_orphanNet.info || !_orphanNet[cts(this)]) {
			if (_orphanNet && _orphanNet.info) {
				for (var _k in _orphanNet) {
					if (_k != 'info' && _orphanNet[_k] && _orphanNet[_k].id == BlockID.RS_controller) {
						if (typeof _savedCraftingTasks !== 'undefined') delete _savedCraftingTasks[_k];
						delete _orphanNet[_k];
					}
				}
				_orphanNet[cts(this)] = {
					id: BlockID.RS_controller,
					coords: {x: this.x, y: this.y, z: this.z},
					upgrades: this.data.upgrades,
					isActive: this.data.isActive || false
				};
				_orphanNet.info.updateControllerTile(this);
				_orphanNet.info.controllerCoords = {x: this.x, y: this.y, z: this.z};
				_orphanNet.info.netMapDirty = true;
				_orphanNet.info.incomplete = true;
				this.data.ticks = 0;
				this.data.timer = 20;
			} else {
					if (_orphanNet && !_orphanNet.info) delete RSNetworks[this.data.NETWORK_ID];
					this.init();
				}
			}
		} else if (this.data.timer === undefined) {
			// Tile created without init (piston-placed fresh tile): initialize.
			this.init();
		}
		if (this.container.getNetworkEntity().getClients().iterator().hasNext()) {
			if (!this._guiBinder) this._guiBinder = UiCore.DeltaBinder.wrap(this.container);
			var _scale = this.data.energy / this.getCapacity();
			var _storageText = this.data.energy + '/' + this.getCapacity() + ' FE';
			this._guiBinder.setScale('scale', _scale);
			this._guiBinder.setText('storage', _storageText);
		}
		if(!this.isWorkAllowed()) {
			if (this._guiBinder) this._guiBinder.flush();
			return;
		}
		if(this.data.updateControllerNetwork){
			this.updateControllerNetwork();
			this.data.updateControllerNetwork = false;
		}
		var _info0 = (this.data.NETWORK_ID != 'f' && RSNetworks[this.data.NETWORK_ID]) ? RSNetworks[this.data.NETWORK_ID].info : null;
		if (_info0) NetworkTimer.heartbeat(_info0, this, this.blockSource);
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
		if (this._guiBinder) this._guiBinder.flush();
		if(this.data.updateModel){
			var texture = getControllerTexture(getEnergyScaled(this.data.energy), this.data.isActive);
			if(this.data.lastTexture != (this.data.lastTexture = texture)) rsSafeServerRefresh(this, 'controllerTexture');
			this.data.updateModel = false;
		}
		if (this.data.NETWORK_ID != 'f' && RSNetworks[this.data.NETWORK_ID]) {
			var info = RSNetworks[this.data.NETWORK_ID].info;
			if (info && info.craftingTasks && info.craftingTasks.length > 0) {
				this.data.networkTick++;
				var _schedCtx = buildSchedulerCtx(info, this.blockSource, this.data.networkTick);
				rsProcessCraftingTasks(info, _schedCtx);
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
					if (!task) continue;
					_RS._emit("taskCancelled", {netId: this.data.NETWORK_ID, taskId: task.id});
					if (task.flushBuffer) task.flushBuffer(info);
				}
			}
			_RS._emit("networkDestroyed", {netId: this.data.NETWORK_ID, tile: this});
			set_net_for_blocks(this, 'f');
			delete RSNetworks[this.data.NETWORK_ID];
			NetworkTimer.destroyNetwork(this.data.NETWORK_ID);
		}
		if(!isDropAllowed && isDropAllowed !== undefined){
			if (typeof _savedCraftingTasks !== 'undefined') delete _savedCraftingTasks[cts(this)];
			return;
		}
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
	onWindowClose: function () {
		rsResetControllerSwipe();
	},
	containerEvents: {
		craftPreview: function(eventData, connectedClient) {
			GridEvents.craftPreview(this, eventData, connectedClient);
		},
		provideConstructedCraft: function(eventData, connectedClient) {
			GridEvents.provideConstructedCraft(this, eventData, connectedClient);
		}
	}
})
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, FE);
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, EU);
EnergyTileRegistry.addEnergyTypeForId(BlockID.RS_controller, RF);
