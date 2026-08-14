const WorkbenchRecipes = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipeRegistry');
const WorkbenchFieldAPI = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchFieldAPI');
const ScriptableObjectHelper = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.ScriptableObjectHelper');
const JavaFONT = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.ui.types.Font');
var RSJava = WRAP_JAVA('org.innercore.icmods.refined_storage.RefinedStorage');

IMPORT("EnergyNet");
IMPORT("StorageInterface");

var Config = {
	reload: function () {
		var reload = Config.reload;
		Config = FileTools.ReadJSON(__dir__ + 'config.json');
		Config.reload = reload;
	}
}
Config.reload();

const FE = EnergyTypeRegistry.assureEnergyType("FE", 0.25);
const EU = EnergyTypeRegistry.assureEnergyType("Eu", 1);
const RF = EnergyTypeRegistry.assureEnergyType("RF", 0.25);

const RSgroup = ICRender.getGroup("RefinedStoragePECable");

const GUIs = [];


var itemsNamesMap = {};

const getItemName = function(id, data, extra){
	var item = {id: id, data: data, extra: extra};
	var itemUid = getItemUid(item);
	if(!itemsNamesMap[itemUid]) itemsNamesMap[itemUid] = Item.getName(id, data, extra);
	return itemsNamesMap[itemUid];
}


const RefinedStorage = {
	paramsMap: {},
	createTile: function (id, params) {
		RSgroup.add(id, -1);
		if(!params.defaultValues) params.defaultValues = {};
		params.defaultValues.NETWORK_ID = 'f';
		params.defaultValues.last_redstone_event = {power: 0};
		params.blockInfo = {
			id: id
		}
		if(!params.client) params.client = {};
		if(!params.client.load) params.client.load = function(){
			if(this.pre_load)this.pre_load();
			if(this.refreshModel)this.refreshModel();
			if(this.post_load)this.post_load();
		}
		if(!params.client.unload) params.client.unload = function(){
			if(this.pre_unload)this.pre_unload();
			BlockRenderer.unmapAtCoords(this.x, this.y, this.z);
			if(this.post_unload)this.post_unload();
		}
		if(!params.defaultValues.upgrades)params.defaultValues.upgrades = {};
		if(!params.upgradesSlots)params.upgradesSlots = [];
		if(!params.init){
			params.init = function () {
				if(this.pre_init)this.pre_init();
				if(this.data.energy || this.data.energy === 0)this.networkData.putInt('energy', this.data.energy);
				if(!this.data.createdCalled) {
					if(this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID] || !RSNetworks[this.data.NETWORK_ID][this.coords_id()]) {
						this.data.NETWORK_ID = 'f';
						this.setActive(false);
						var controller = searchController(this, false);
						if (controller) {
							var cTile = World.getTileEntity(controller.x, controller.y, controller.z, this.blockSource);
							if (cTile) {
								cTile.data.updateControllerNetwork = true;
							}
						}
						if (this.data.NETWORK_ID == 'f') rsAddReconnectPending(this);
					}
				} else {
					var controller = searchController(this, false);
					if (controller) {
						var tile = World.getTileEntity(controller.x, controller.y, controller.z, this.data.blockSource);
						if (tile) {
							tile.data.updateControllerNetwork = true;
						}
					}
				}
				this.networkData.putInt('NETWORK_ID', this.data.NETWORK_ID >= 0 ? this.data.NETWORK_ID : -1);
				this.data.block_data = this.blockSource.getBlockData(this.x, this.y, this.z);
				this.blockInfo.data = this.data.block_data;
				this.networkData.putInt('block_data', this.data.block_data);
				this.networkData.putBoolean('isActive', this.data.isActive || false);
				var tile = this;
				this.container.addServerOpenListener({
					onOpen: function(container, client){
						if(tile.onWindowOpen){
							tile.onWindowOpen(container, client);
						}
					}
				});
				this.container.addServerCloseListener({
					onClose: function(container, client){
						if(tile.onWindowClose){
							tile.onWindowClose(container, client);
						}
					}
				});
				if(this.unsaveableSlots && InnerCore_pack.packVersionCode >= 120){
					if(Array.isArray(this.unsaveableSlots)){
						for(var i in this.unsaveableSlots)this.container.setSlotSavingEnabled(this.unsaveableSlots[i], false);
					} else {
						this.container.setGlobalSlotSavingEnabled(false);
					}
				}
				if(this.upgradesSlots)for(var i in this.upgradesSlots){
					this.container.setSlotAddTransferPolicy(this.upgradesSlots[i], {
						transfer: function(itemContainer, slot, id, count, data, extra, player){
							count = 1;
							var upgrade;
							if(!(upgrade = UpgradeRegistry.get(id)) || itemContainer.getSlot(slot).id != 0) return 0
							if(tile.data.upgrades[upgrade.nameID]){
								if(upgrade.maxStack && tile.data.upgrades[upgrade.nameID] >= upgrade.maxStack) return 0;
								tile.data.upgrades[upgrade.nameID]++;
							} else {
								tile.data.upgrades[upgrade.nameID] = 1;
							}
							if(upgrade.addFunc)upgrade.addFunc(tile, {id: id, count: count, data: data, extra: extra}, itemContainer, slot, player);
							return count;
						}
					})
					this.container.setSlotGetTransferPolicy(this.upgradesSlots[i], {
						transfer: function(itemContainer, slot, id, count, data, extra, player){
							if(!(upgrade = UpgradeRegistry.get(id))) return 0
							if(tile.data.upgrades[upgrade.nameID])tile.data.upgrades[upgrade.nameID]--
							if(upgrade.deleteFunc)upgrade.deleteFunc(tile, {id: id, count: count, data: data, extra: extra}, itemContainer, slot, player);
							return count;
						}
					})
				}
				if(this.post_init)this.post_init();
				this.data.createdCalled = false;
				this.networkData.sendChanges();
			}
		}
		if (!params.update_network) {
			params.update_network = function (net_id, _first) {
				if (this.pre_update_network) if(this.pre_update_network(net_id)) return true;
				var netElement;
				if(net_id == 'f' && RSNetworks[this.data.NETWORK_ID] && (netElement = RSNetworks[this.data.NETWORK_ID][cts(this)]) && netElement.id == this.blockInfo.id) delete RSNetworks[this.data.NETWORK_ID][cts(this)];
				this.data.LAST_NETWORK_ID = this.data.NETWORK_ID;
				this.data.NETWORK_ID = net_id;
				this.networkData.putInt('NETWORK_ID', net_id != 'f' ? net_id : -1);
				if (net_id != "f" && RSNetworks[net_id]) {
					var coords_this = {
						x: this.x,
						y: this.y,
						z: this.z
					}
					RSNetworks[net_id][cts(this)] = {
						id: this.blockInfo.id,
						coords: coords_this,
						upgrades: this.data.upgrades,
						isActive: this.data.isActive || false
					}
				}
				if(!_first)this.setActive(net_id != "f");
				this.networkData.sendChanges();
				if (this.post_update_network) this.post_update_network(net_id);
			}
		}
		if (!params.created) {
			params.created = function () {
				if(!this.blockSource)this.blockSource = BlockSource.getDefaultForDimension(this.dimension);
				this.data.upgrades = {};
				this.data.createdCalled = true;
				if (this.pre_created) this.pre_created();
			}
		}
		if (!params.setActive) {
			params.setActive = function (state, forced, preventRefreshModel) {
				state = this.data.NETWORK_ID != "f" ? !!state : false;
				if(this.data.isActive == state) return false;
				if (this.pre_setActive) if(this.pre_setActive(state)) return false;
				if(state && !this.redstoneAllowActive(this.data.last_redstone_event)) return false;
				if(state == false || (forced || (!this.data.controllerOff && this.data.allowSetIsActive != false))){
					this.data.isActive = state;
					this.networkData.putBoolean('isActive', state);
					if(this.data.NETWORK_ID != "f")RSNetworks[this.data.NETWORK_ID][this.coords_id()].isActive = state
					this.networkData.sendChanges();
					if(this.refreshModel && !preventRefreshModel)this.refreshModel();
					if (this.post_setActive) this.post_setActive(state);
					if(this.refreshGui && !this.setActiveNotUpdateGui)this.refreshGui();
					return true;
				}
			}
		}
		if(!params.redstone){
			params.redstone = function (params) {
				this.data.last_redstone_event = params;
				if(!this.data.redstone_mode) return;
				var _activeState = this.redstoneAllowActive(params);
				if(_activeState){
					this.setActive(true);
				} else {
					this.setActive(false);
				}
				if (this.post_redstone) this.post_redstone(_activeState);
			}
		}
		if(!params.redstoneAllowActive){
			params.redstoneAllowActive = function (params) {
				if(!this.data.redstone_mode) return true;
				if (params.power > 0){
					if(this.data.redstone_mode == 1){
						return true;
					} else if(this.data.redstone_mode == 2){
						return false;
					}
				} else {
					if(this.data.redstone_mode == 1){
						return false;
					} else if(this.data.redstone_mode == 2){
						return true;
					}
				}
			}
		}
		if(!params.refreshRedstoneMode){
			params.refreshRedstoneMode = function () {
				if(this.data.redstone_mode == 0){
					return this.setActive(true);
				} else if(this.redstoneAllowActive(this.data.last_redstone_event)){
					return this.setActive(true);
				} else {
					return this.setActive(false);
				}
			}
		}
		if(!params.coords_id){
			params.coords_id = function () {
				return this.x + ',' + this.y + ',' + this.z;
			}
		}
		if(!params.destroy){
			params.destroy = function(param1){
				if(this.pre_destroy) this.pre_destroy(param1);
				if(this.data.NETWORK_ID != 'f' && RSNetworks[this.data.NETWORK_ID]) delete RSNetworks[this.data.NETWORK_ID][cts(this)];
				this.data.LAST_NETWORK_ID = this.data.NETWORK_ID;
				this.data.NETWORK_ID = 'f';
				if(this.post_destroy) this.post_destroy(param1);
			}
		}
		if(!params.isWorkAllowed){
			params.isWorkAllowed = function(){
				if(this.data.NETWORK_ID == "f" || !RSNetworks[this.data.NETWORK_ID] || !this.data.isActive) return false;
				return true;
			}
		}
		if(!params.containerEvents) params.containerEvents = {};
		if(!params.containerEvents.updateRedstoneMode)params.containerEvents.updateRedstoneMode = function(eventData, connectedClient) {
			if(this.data.redstone_mode == undefined) this.data.redstone_mode = 0;
			this.data.redstone_mode = this.data.redstone_mode >= 2 ? 0 : this.data.redstone_mode + 1;
			if(!this.refreshRedstoneMode() && this.refreshGui) this.refreshGui();
		}
		if(!params.getNetworkTile){
			params.getNetworkTile = function () {
				var answ;
				if(this.data.NETWORK_ID != "f" && RSNetworks[this.data.NETWORK_ID] && (answ = RSNetworks[this.data.NETWORK_ID][this.coords_id()])) return answ;
			}
		}
		this.paramsMap[id] = params;
		TileEntity.registerPrototype(id, params);
	},
	copy: function(id1, id2, params){
		RSgroup.add(id2, -1);
		if(!this.paramsMap[id1]) throw '[RefinedStorageError - RefinedStorage.copy] TileEntity with this id is not registered';
		var params1 = Object.assign({}, this.paramsMap[id1]);
		delete params1.tick;
		for(var key in params){
			if(key === 'defaultValues' && params1.defaultValues){
				Object.assign(params1.defaultValues, params.defaultValues);
			} else {
				params1[key] = params[key];
			}
		}
		this.paramsMap[id2] = params1;
		TileEntity.registerPrototype(id2, params1);
	},
	mapTexture: function (coords, texture, meta) {
		meta = meta || 0;
		if (typeof (texture) == 'string') {
			var _texture = [];
			for (var i = 0; i < 6; i++) _texture.push([texture, meta]);
			texture = _texture;
		}
		var render = new ICRender.Model();
		var model = BlockRenderer.createTexturedBlock(texture);
		render.addEntry(model);
		BlockRenderer.mapAtCoords(coords.x, coords.y, coords.z, render);
	},
	createMapBlock: function (name, params, types) {
		Block.createBlock(name, params, types);
		for (var i in params) {
			var texture = params[i].texture;
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(texture);
			render.addEntry(model);
			ItemModel.getFor(BlockID[name], i).setModel(render);
			BlockRenderer.enableCoordMapping(BlockID[name], i, render);
		}
	},
	sortItems: function (type, reverse, textSearch, container, keys) {
		if (RSJava && !RSJava.isCompatRequired)
			return ScriptableObjectHelper.createArray(RSJava.sortItems(type, reverse, textSearch || null, container, keys));

		var slots = container.slots;
		var result = textSearch ? keys.filter(function(key) {
			var slot = slots[key];
			return slot && slot.id !== 0 && getItemName(slot.id, slot.data, slot.extra).toLowerCase().indexOf(textSearch.toLowerCase()) !== -1;
		}) : keys.slice();

		var comparator;
		if (reverse) {
			if (type == 2) {
				comparator = function(a, b) { return slots[b].id - slots[a].id; };
			} else if (type == 0) {
				comparator = function(a, b) {
					var slot1 = slots[a], slot2 = slots[b];
					return slot1.count == 0 || slot2.count == 0 ? slot2.count - slot1.count : slot1.count - slot2.count;
				};
			} else if (type == 1) {
				comparator = function(a, b) {
					var slot1 = slots[a], slot2 = slots[b];
					if (slot1.id == 0 || slot2.id == 0) return slot2.id - slot1.id;
					var name1 = getItemName(slot1.id, slot1.data, slot1.extra), name2 = getItemName(slot2.id, slot2.data, slot2.extra);
					return name1 > name2 ? 1 : name1 < name2 ? -1 : 0;
				};
			}
		} else {
			if (type == 2) {
				comparator = function(a, b) {
					var slot1 = slots[a], slot2 = slots[b];
					return slot1.id == 0 || slot2.id == 0 ? slot2.id - slot1.id : slot1.id - slot2.id;
				};
			} else if (type == 0) {
				comparator = function(a, b) { return slots[b].count - slots[a].count; };
			} else if (type == 1) {
				comparator = function(a, b) {
					var slot1 = slots[a], slot2 = slots[b];
					if (slot1.id == 0 || slot2.id == 0) return slot2.id - slot1.id;
					var name1 = getItemName(slot1.id, slot1.data, slot1.extra), name2 = getItemName(slot2.id, slot2.data, slot2.extra);
					return name2 > name1 ? 1 : name2 < name1 ? -1 : 0;
				};
			}
		}
		if (comparator) result.sort(comparator);
		return result;
	},
	sortCrafts: function (items, textSearch, onlyItemsMap, slots, inventoryItems, isDarkenMap) {
		if (RSJava && !RSJava.isCompatRequired)
			return ScriptableObjectHelper.createArray(RSJava.sortCrafts(items, textSearch || null, onlyItemsMap, slots, inventoryItems, isDarkenMap));

		var recipes = new java.util.HashSet();
		if (!RSJava || !RSJava.isRecipeCompatRequired) {
			for (var i = 0; i < items.length; i++) {
				var slot = slots[items[i]];
				if (slot && slot.id) WorkbenchRecipes.addRecipesThatContainItem(slot.id, slot.data, recipes);
			}
			for (var k = 0; k < inventoryItems.length; k++) {
				if (inventoryItems[k].id) WorkbenchRecipes.addRecipesThatContainItem(inventoryItems[k].id, inventoryItems[k].data, recipes);
			}
		} else {
			for (var i = 0; i < items.length; i++) {
				var slot = slots[items[i]];
				if (slot && slot.id) {
					var it = Recipes.getWorkbenchRecipesByIngredient(slot.id, slot.data).iterator();
					while (it.hasNext()) recipes.add(it.next());
				}
			}
			for (var k = 0; k < inventoryItems.length; k++) {
				if (inventoryItems[k].id) {
					var it = Recipes.getWorkbenchRecipesByIngredient(inventoryItems[k].id, inventoryItems[k].data).iterator();
					while (it.hasNext()) recipes.add(it.next());
				}
			}
		}

		var darkenRecipes = [], sortedRecipes = [];
		var it = recipes.iterator();
		while (it.hasNext()) {
			var recipe = it.next();
			if (textSearch) {
				var result = recipe.getResult();
				if (getItemName(result.id, result.data != -1 ? result.data : 0, null).toLowerCase().indexOf(textSearch.toLowerCase()) == -1) continue;
			}
			var isDarken = false;
			var entries = recipe.getEntryCollection().iterator();
			while (entries.hasNext()) {
				var entry = entries.next();
				if (!entry || entry.id == 0) continue;
				var dataList = onlyItemsMap[entry.id];
				if (!dataList || (entry.data != -1 && dataList.indexOf(entry.data) == -1)) {
					isDarken = true;
					break;
				}
			}
			isDarkenMap['e' + recipe.getRecipeUid()] = isDarken;
			if (isDarken) darkenRecipes.push(recipe); else sortedRecipes.push(recipe);
		}
		return sortedRecipes.concat(darkenRecipes);
	}
}

function testButtons(elementsS_, initFunc_){
	if(!Config.dev) return;
	var UIHeight = Number(UI.getScreenHeight());
	var y = 20;//562-80-50;
	var start_x = 630;//400 + 200;
	elementsS_['fps'] = {
		type: "fps", 
		x: 10,
		y: 10,
		z: 5
	}
	elementsS_["testButton0"] = {
		type: "button",
		x: start_x,
		y: y,
		z: 100,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale:2,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UIHeight -= 100;
				itemContainerUiHandler.setBinding('testText2', 'text', UIHeight + '');
				UI.getScreenHeight = function(){
					return UIHeight;
				}
				initFunc_();
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
	elementsS_["testButton1"] = {
		type: "button",
		x: start_x + 50,
		y: y,
		z: 100,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale:2,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UIHeight -= 10;
				itemContainerUiHandler.setBinding('testText2', 'text', UIHeight + '');
				UI.getScreenHeight = function(){
					return UIHeight;
				}
				initFunc_();
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
	elementsS_['testText2'] = {
		type: "text",
		x: start_x + 100,
		y: y + 5,
		z: 100,
		text: UI.getScreenHeight() + ''
	}
	elementsS_["testButton3"] = {
		type: "button",
		x: start_x + 180,
		y: y,
		z: 100,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale:2,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UIHeight += 10;
				itemContainerUiHandler.setBinding('testText2', 'text', UIHeight + '');
				UI.getScreenHeight = function(){
					return UIHeight;
				}
				initFunc_();
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
	elementsS_["testButton4"] = {
		type: "button",
		x: start_x + 230,
		y: y,
		z: 100,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale:2,
		clicker: {
			onClick: function (itemContainerUiHandler, itemContainer, element) {
				UIHeight += 100;
				itemContainerUiHandler.setBinding('testText2', 'text', UIHeight + '');
				UI.getScreenHeight = function(){
					return UIHeight;
				}
				initFunc_();
			},
			onLongClick: function (itemContainerUiHandler, itemContainer, element) {
			}
		}
	}
};

function getRotatableTexture(base, variation, _active){
	variation = variation || 0;
	var i = _active ? 1 : 0;
	return [[base[0], [base[1][0], 0], base[2], [base[3][0], i], base[4], base[5]], [base[0], [base[1][0], 1], [base[3][0], i], base[2], base[5], base[4]], [base[0], [base[1][0], 2], base[5], base[4], base[2], [base[3][0], i]], [base[0], [base[1][0], 3], base[4], base[5], [base[3][0], i], base[2]]][variation];
}

function getNetworkInfo(tile) {
	if (!tile || tile.data.NETWORK_ID == 'f' || !RSNetworks[tile.data.NETWORK_ID]) return null;
	return RSNetworks[tile.data.NETWORK_ID].info || null;
}

function recountUpgrades(tile) {
	if (!tile.upgradesSlots) return;
	tile.data.upgrades = {};
	for (var i = 0; i < tile.upgradesSlots.length; i++) {
		var slot = tile.container.getSlot(tile.upgradesSlots[i]);
		var upgrade;
		if (slot.id != 0 && (upgrade = UpgradeRegistry.get(slot.id))) {
			if (tile.data.upgrades[upgrade.nameID]) tile.data.upgrades[upgrade.nameID]++;
			else tile.data.upgrades[upgrade.nameID] = 1;
		}
	}
}
