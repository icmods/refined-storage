IDRegistry.genBlockID("RS_crafter");

var _crafterOff = [
	["RScrafter_bot", 0], ["RScrafter_top", 0], ["RScrafter_bottom", 0],
	["RScrafter_front", 0], ["RScrafter_side_left", 0], ["RScrafter_side", 0]
];
var _crafterOn = [
	["RScrafter_bot_on", 0], ["RScrafter_top_on", 0], ["RScrafter_bottom_on", 0],
	["RScrafter_front_on", 0], ["RScrafter_side_left_on", 0], ["RScrafter_side_on", 0]
];

function getCrafterTexture(variation, _active){
	var base = _active ? _crafterOn : _crafterOff;
	variation = variation || 0;
	if (variation == 4) {
		return [base[3], base[2], [base[1][0], 4], [base[0][0], 4], [base[4][0], 4], [base[5][0], 4]];
	}
	if (variation == 5) {
		return [base[2], base[3], [base[0][0], 5], [base[1][0], 5], [base[4][0], 5], [base[5][0], 5]];
	}
	return [[base[0], [base[1][0], variation], base[2], base[3], base[4], base[5]], [base[0], [base[1][0], variation], base[3], base[2], base[5], base[4]], [base[0], [base[1][0], variation], base[5], base[4], base[2], base[3]], [base[0], [base[1][0], variation], base[4], base[5], base[3], base[2]]][variation];
}

var crafterVariations = [];
for (var cvi = 0; cvi < 6; cvi++) {
	crafterVariations.push({
		name: "Crafter",
		texture: getCrafterTexture(cvi, false),
		inCreative: cvi == 0
	});
}
Block.createBlock("RS_crafter", crafterVariations);
Block.registerPlaceFunction("RS_crafter", function(coords, item, block, player, blockSource){
	if(!World.canTileBeReplaced(block.id, block.data)){
		var relBlock = blockSource.getBlock(coords.relative.x, coords.relative.y, coords.relative.z);
		if (World.canTileBeReplaced(relBlock.id, relBlock.data)){
			coords = coords.relative;
		} else return;
	}
	var ppos = Entity.getPosition(player);
	var dx = ppos.x - (coords.x + 0.5);
	var dy = ppos.y - (coords.y + 0.5);
	var dz = ppos.z - (coords.z + 0.5);
	var ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
	var meta;
	if (ay >= ax && ay >= az) meta = dy > 0 ? 5 : 4;
	else if (ax >= az) meta = dx > 0 ? 2 : 3;
	else meta = dz > 0 ? 0 : 1;
	blockSource.setBlock(coords.x, coords.y, coords.z, item.id, meta);
	return coords;
});

var crafterFrontSideByMeta = { 0: 3, 1: 2, 2: 5, 3: 4, 4: 0, 5: 1 };
function getCrafterFrontSide(tile){
	var meta = tile && tile.data ? tile.data.block_data : undefined;
	return crafterFrontSideByMeta[meta] != undefined ? crafterFrontSideByMeta[meta] : 0;
}
function craftMatches(craft, coordsId, id, isProcessed){
	return craft && craft.coordsId === coordsId && craft.id === id && craft.isProcessed === isProcessed;
}
RS_blocks.push(BlockID.RS_crafter);
EnergyUse[BlockID['RS_crafter']] = Config.energy_uses.crafter || 4;

for (var ibc = 0; ibc < 6; ibc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCrafterTexture(ibc, false));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_crafter"], ibc, render);
}
for (var ibc = 6; ibc < 12; ibc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCrafterTexture(ibc - 6, true));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_crafter"], ibc, render);
}

var elementsGUI_crafter = {};
(function initCrafterElements(){
	var slotsSize = 60;
	var x = 375;
	var screenHeight = UI.getScreenHeight() - 80;
	for(var i = 0; i < 9; i++){
		elementsGUI_crafter["slot_pattern" + i] = {
			type: "slot",
			num: i,
			name: "slot_pattern" + i,
			x: x + i*slotsSize,
			y: screenHeight/2 - slotsSize/2,
			size: slotsSize,
			maxStackSize: 1,
			onItemChanged: function(container){
				updateCrafterOutputSlots(container);
			}
		};
	}

	for(var i = 0; i < 9; i++){
		elementsGUI_crafter["output_pattern" + i] = {
			type: "slot",
			num: i,
			x: x + i*slotsSize,
			y: screenHeight/2 - slotsSize/2 - 50,
			size: slotsSize,
			visual: true,
			bitmap: "empty"
		};
	}

	elementsGUI_crafter["redstone_button"] = {
		type: "button",
		x: 225 + 20 + 10,
		y: 40,
		bitmap: 'RS_empty_button',
		bitmap2: 'RS_empty_button_pressed',
		scale: 2,
		clicker: {
			onClick: function (itemContainerUiHandler, container, element) {
				container.sendEvent("updateRedstoneMode", {});
			},
			onLongClick: function (itemContainerUiHandler, container, element) {}
		}
	}

	elementsGUI_crafter["image_redstone"] = {
		type: "image",
		x: elementsGUI_crafter["redstone_button"].x,
		y: elementsGUI_crafter["redstone_button"].y,
		z: 1000,
		bitmap: "redstone_GUI_0",
		scale: elementsGUI_crafter["redstone_button"].scale*20/16
	}

	var upgradesFullSize = screenHeight*0.45;
	var upgradesYstart = screenHeight*0.6 - upgradesFullSize/2;
	var upgradesYend = screenHeight*0.6 + upgradesFullSize/2;
	var upgradesSlotsSize = (upgradesYend - upgradesYstart)/4;
	for(var i = 0; i < 4; i++){
		elementsGUI_crafter["slot_upgrades" + i] = {
			type: "slot",
			num: i,
			name: "slot_upgrades" + i,
			x: 225 + 20 + 10,
			y: upgradesYstart + i*upgradesSlotsSize,
			size: upgradesSlotsSize + 1
		}
	}
})();

var carfterGUI = new UI.StandartWindow({
	standart: {
		header: { text: { text: Translation.translate("Crafter") } },
		inventory: { padding: 20, width: 300 / 4 * 3 },
		background: { standart: true }
	},
	drawing: [],
	elements: elementsGUI_crafter
});
GUIs.push(carfterGUI);

function updateCrafterOutputSlots(container, content){
	if(!container) return;
	if(!content){
		var uiAdapter = container.getUiAdapter && container.getUiAdapter();
		var windowGroup = uiAdapter ? uiAdapter.getWindow() : null;
		if(!windowGroup) return;
		var mainWindow = windowGroup.getWindow('main');
		if(!mainWindow || !mainWindow.isOpened()) return;
		content = mainWindow.getContent();
	}
	if(!content || !content.elements) return;
	for(var i = 0; i < 9; i++){
		var outputElement = content.elements["output_pattern" + i];
		if(!outputElement) continue;
		var patternItem = container.slots ? container.slots["slot_pattern" + i] : null;
		if(patternItem && patternItem.id == ItemID.RSpattern && patternItem.extra){
			var resultString = patternItem.extra.getString('result0');
			if(resultString){
				var resultParts = resultString.split(',');
				if(resultParts.length >= 3){
					var resultId = parseInt(resultParts[0]);
					if(resultId > 0){
						outputElement.source = { id: resultId, count: parseInt(resultParts[1] || 1), data: parseInt(resultParts[2] || 0) };
						continue;
					}
				}
			}
		}
		outputElement.source = null;
	}
}

RefinedStorage.createTile(BlockID.RS_crafter, {
	useNetworkItemContainer: true,
	defaultValues:{
		NETWORK_ID: 'f',
		LAST_NETWORK_ID: 'f',
		patternsCount: 0,
		speed: 10,
		crafts: {},
		redstone_mode: 0,
		redstone_power: false
	},
	upgradesSlots: ["slot_upgrades0", "slot_upgrades1", "slot_upgrades2", "slot_upgrades3"],
	blockInfo: { id: BlockID.RS_crafter },
	click: function (id, count, data, coords, player, extra) {
		if(Entity.getSneaking(player)) return false;
		var client = Network.getClientForPlayer(player);
		if (!client || this.container.getNetworkEntity().getClients().contains(client)) return true;
		this.container.openFor(client, "main");
		this.refreshGui(true, client);
		return true;
	},
	getScreenByName: function(screenName) {
		return carfterGUI;
	},
	parsePatternExtra: function(extra){
		if(!extra) return null;
		var isProcessed = extra.getBoolean('isProcessed');
		var inputs = [];
		var outputs = [];
		for(var i = 0; i < 9; i++){
			var str = extra.getString('craft' + i);
			if(!str) continue;
			var parts = str.split(',');
			if(parts.length < 3) continue;
			var ingr = {id: parseInt(parts[0]), count: parseInt(parts[1]), data: parseInt(parts[2])};
			if(ingr.id <= 0) continue;
			inputs.push(ingr);
		}
		var maxOut = isProcessed ? 9 : 1;
		for(var i = 0; i < maxOut; i++){
			var str = extra.getString('result' + i);
			if(!str) continue;
			var parts = str.split(',');
			if(parts.length < 3) continue;
			var res = {id: parseInt(parts[0]), count: parseInt(parts[1] || 1), data: parseInt(parts[2] || 0)};
			if(res.id <= 0) continue;
			outputs.push(res);
		}
		if(outputs.length === 0) return null;
		return {isProcessed: isProcessed, inputs: inputs, outputs: outputs};
	},
	addCraft: function(slot, extra){
		var item = extra ? {extra: extra} : this.container.getSlot(slot);
		if (!item || !item.extra) return false;
		var pattern = this.parsePatternExtra(item.extra);
		if (!pattern) return false;
		var craft = { id: slot, coordsId: cts(this), isProcessed: pattern.isProcessed, oredictEnabled: item.extra.getBoolean('oredictEnabled'), ingridients: pattern.inputs, result: pattern.outputs };
		this.data.crafts[slot] = craft;
		this.data.patternsCount = Object.keys(this.data.crafts).length;
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return false;
		var info = RSNetworks[netId].info;
		for(var ri = 0; ri < craft.result.length; ri++){
			var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
			if(!info.crafts[resultUid]) info.crafts[resultUid] = [];
			var exists = false;
			for(var ci = 0; ci < info.crafts[resultUid].length; ci++){
				if(craftMatches(info.crafts[resultUid][ci], cts(this), craft.id, craft.isProcessed)){
					exists = true;
					break;
				}
			}
			if(!exists) info.crafts[resultUid].push(craft);
			if(!info.craftsIDS[craft.result[ri].id]) info.craftsIDS[craft.result[ri].id] = [];
			if(info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data) == -1) info.craftsIDS[craft.result[ri].id].push(craft.result[ri].data);
			info.addPatternContainer(resultUid, cts(this));
		}
		info.netMapDirty = true;
		if(Config.dev)Logger.Log('Crafter registered craft: [' + craft.result[0].id + ',' + craft.result[0].data + '] at ' + slot + ' (isProcessed=' + craft.isProcessed + ')', 'RefinedStorageDebug');
		info.refreshOpenedGrids(true);
		return true;
	},
	removeCraft: function(slot){
		var craft = this.data.crafts[slot];
		if (!craft) return;
		delete this.data.crafts[slot];
		this.data.patternsCount = Object.keys(this.data.crafts).length;
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return;
		var info = RSNetworks[netId].info;
		for(var ri = 0; ri < craft.result.length; ri++){
			var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
			if(info.crafts[resultUid]){
				for(var ci = info.crafts[resultUid].length - 1; ci >= 0; ci--){
					if(craftMatches(info.crafts[resultUid][ci], cts(this), craft.id, craft.isProcessed)){
						info.crafts[resultUid].splice(ci, 1);
					}
				}
				if(info.crafts[resultUid].length == 0) delete info.crafts[resultUid];
			}
			if(!info.crafts[resultUid] && info.craftsIDS[craft.result[ri].id]){
				var idIdx = info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data);
				if(idIdx != -1) info.craftsIDS[craft.result[ri].id].splice(idIdx, 1);
				if(info.craftsIDS[craft.result[ri].id].length == 0) delete info.craftsIDS[craft.result[ri].id];
			}
			info.removePatternContainer(resultUid, cts(this));
		}
		info.netMapDirty = true;
		if(Config.dev)Logger.Log('Crafter removed craft: [' + craft.result[0].id + ',' + craft.result[0].data + '] from ' + slot, 'RefinedStorageDebug');
		info.refreshOpenedGrids(true);
	},
	post_update_network: function(net_id, _first){
		var tile = this;
		if (net_id == 'f') {
			if(this.data.LAST_NETWORK_ID != 'f' && RSNetworks[this.data.LAST_NETWORK_ID]){
				var oldInfo = RSNetworks[this.data.LAST_NETWORK_ID].info;
				for(var s in this.data.crafts){
					var craft = this.data.crafts[s];
					for(var ri = 0; ri < craft.result.length; ri++){
						var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
						if(oldInfo.crafts[resultUid]){
							for(var ci = oldInfo.crafts[resultUid].length - 1; ci >= 0; ci--){
								if(craftMatches(oldInfo.crafts[resultUid][ci], cts(this), craft.id, craft.isProcessed)){
									oldInfo.crafts[resultUid].splice(ci, 1);
								}
							}
							if(oldInfo.crafts[resultUid].length == 0) delete oldInfo.crafts[resultUid];
						}
						if(!oldInfo.crafts[resultUid] && oldInfo.craftsIDS[craft.result[ri].id]){
							var idIdx = oldInfo.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data);
							if(idIdx != -1) oldInfo.craftsIDS[craft.result[ri].id].splice(idIdx, 1);
							if(oldInfo.craftsIDS[craft.result[ri].id].length == 0) delete oldInfo.craftsIDS[craft.result[ri].id];
						}
						oldInfo.removePatternContainer(resultUid, cts(this));
					}
				}
			}
			PatternContainerRegistry.unregister(this);
			return;
		}
		var info = RSNetworks[net_id].info;
		for(var s in this.data.crafts){
			var craft = this.data.crafts[s];
			var exists = false;
			for(var ri = 0; ri < craft.result.length; ri++){
				var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
				if(info.crafts[resultUid]){
					for(var ci = 0; ci < info.crafts[resultUid].length; ci++){
						if(craftMatches(info.crafts[resultUid][ci], cts(this), craft.id, craft.isProcessed)){
							exists = true;
							break;
						}
					}
				}
				if(exists) break;
			}
			if(!exists){
				var slotItem = this.container.getSlot(s);
				if(slotItem) this.addCraft(s, slotItem.extra);
			}
		}
		PatternContainerRegistry.register(this, {
			containerId: 'crafter',
			coordsId: cts(this),
			getPatterns: function() {
				var out = [];
				for (var cs in tile.data.crafts) {
					var slotItem = tile.container.getSlot(cs);
					if (slotItem && slotItem.id == ItemID.RSpattern && slotItem.extra) out.push(tile.data.crafts[cs]);
				}
				return out;
			},
			getFrontSide: function(crafterTile) { return getCrafterFrontSide(crafterTile); },
			getSpeed: function(crafterTile) { return crafterTile.data.speed || 10; },
			getUpdateInterval: function(crafterTile) { return Math.max(1, crafterTile.data.speed || 10); },
			getMaximumSuccessfulCraftingUpdates: function(crafterTile) { return Math.min(5, 1 + Math.floor((10 - Math.max(1, crafterTile.data.speed || 10)) / 2)); },
			getUsage: function(crafterTile) { return (Config.energy_uses.crafterPerPattern || 1) * (crafterTile.data.patternsCount || 0); }
		});
	},
	refreshRedstoneMode: function(){
		if(this.data.redstone_mode === 0 || this.data.redstone_mode === 3) return this.setActive(true);
		var params = this.data.last_redstone_event || {power: 0};
		return this.setActive(this.redstoneAllowActive(params));
	},
	refreshGui: function(first, client){
		var _data = { name: this.networkData.getName() + '', isActive: this.data.isActive, NETWORK_ID: this.data.NETWORK_ID, redstone_mode: this.data.redstone_mode };
		if(client) this.container.sendEvent(client, "openGui", _data);
		else this.container.sendEvent("openGui", _data);
	},
	refreshModel: function(){
		if(!this.networkEntity) return;
		this.sendPacket("refreshModel", {block_data: this.data.block_data, isActive: this.data.isActive, coords: {x: this.x, y: this.y, z: this.z}});
	},
	pre_init: function(){
		var tile = this;
		this.container.setGlobalAddTransferPolicy({
			transfer: function(itemContainer, slot, id, count, data, extra, player){
				return 0;
			}
		});
		for(var i = 0; i < 9; i++){
			(function(slotName){
				tile.container.setSlotAddTransferPolicy(slotName, {
					transfer: function(itemContainer, slot, id, count, data, extra, player){
						if(id != ItemID.RSpattern || !extra) return 0;
						if(tile.data.crafts[slotName]) tile.removeCraft(slotName);
						tile.addCraft(slotName, extra);
						return count;
					}
				});
				tile.container.setSlotGetTransferPolicy(slotName, {
					transfer: function(itemContainer, slot, id, count, data, extra, player){
						if(id == ItemID.RSpattern && tile.data.crafts[slotName]) tile.removeCraft(slotName);
						return count;
					}
				});
			})("slot_pattern" + i);
		}
	},
	post_init: function(){
		recountUpgrades(this);
	},
	pre_destroy: function(){
		for(var s in this.data.crafts) this.removeCraft(s);
		PatternContainerRegistry.unregister(this);
	},
	containerEvents: {
		updateRedstoneMode: function(eventData, connectedClient) {
			if(this.data.redstone_mode == undefined) this.data.redstone_mode = 0;
			this.data.redstone_mode = this.data.redstone_mode >= 2 ? 0 : this.data.redstone_mode + 1;
			this.refreshRedstoneMode();
			this.refreshGui();
		}
	},
	client: {
		load: function(){
			this.refreshModel();
		},
		refreshModel: function(){
			var render = new ICRender.Model();
			var model = BlockRenderer.createTexturedBlock(getCrafterTexture(this.networkData.getInt('block_data'), this.networkData.getBoolean('isActive')));
			render.addEntry(model);
			BlockRenderer.mapAtCoords(this.x, this.y, this.z, render);
		},
		events: {
			refreshModel: function(eventData){
				var render = new ICRender.Model();
				var model = BlockRenderer.createTexturedBlock(getCrafterTexture(eventData.block_data, eventData.isActive));
				render.addEntry(model);
				BlockRenderer.mapAtCoords(eventData.coords.x, eventData.coords.y, eventData.coords.z, render);
			}
		},
		containerEvents: {
			openGui: function(container, window, content, eventData){
				if(!content || !window || !window.isOpened()) return;
				if(content.elements["image_redstone"]) content.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
				updateCrafterOutputSlots(container, content);
				window.getWindow('main').forceRefresh();
			}
		}
	}
});
