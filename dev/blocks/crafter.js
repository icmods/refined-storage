IDRegistry.genBlockID("RS_crafter");
Block.createBlockWithRotation("RS_crafter", [
	{
		name: "Crafter",
		texture: [['stone', 0]],
		inCreative: true
	}
])
RS_blocks.push(BlockID.RS_crafter);
EnergyUse[BlockID['RS_crafter']] = Config.energy_uses.crafter || 4;

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
	return [[base[0], [base[1][0], variation], base[2], base[3], base[4], base[5]], [base[0], [base[1][0], variation], base[3], base[2], base[5], base[4]], [base[0], [base[1][0], variation], base[5], base[4], base[2], base[3]], [base[0], [base[1][0], variation], base[4], base[5], base[3], base[2]]][variation];
}

for (var ibc = 0; ibc < 4; ibc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCrafterTexture(ibc, false));
	render.addEntry(model);
	BlockRenderer.enableCoordMapping(BlockID["RS_crafter"], ibc, render);
}
for (var ibc = 4; ibc < 8; ibc++) {
	var render = new ICRender.Model();
	var model = BlockRenderer.createTexturedBlock(getCrafterTexture(ibc - 4, true));
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
			maxStackSize: 1
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

RefinedStorage.createTile(BlockID.RS_crafter, {
	useNetworkItemContainer: true,
	defaultValues:{
		NETWORK_ID: 'f',
		LAST_NETWORK_ID: 'f',
		patternsCount: 0,
		speed: 10,
		crafts: {},
		successfulCrafts: [],
		itemsToPush: [],
		redstone_mode: 0
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
	addCraft: function(slot){
		var item = this.container.getSlot(slot);
		if (!item || !item.extra) return;
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return;
		var info = RSNetworks[netId].info;
		var craft = { id: slot, coordsId: cts(this), isProcessed: item.extra.getBoolean('isProcessed'), oredictEnabled: item.extra.getBoolean('oredictEnabled'), ingridients: [], result: [] };
		for(var i = 0; i < 9; i++){
			var str = item.extra.getString('craft' + i);
			if(!str) break;
			var parts = str.split(',');
			craft.ingridients.push({id: parseInt(parts[0]), count: parseInt(parts[1]), data: parseInt(parts[2])});
		}
		for(var r = 0; r < 9; r++){
			var str = item.extra.getString('result' + r);
			if(!str) break;
			var parts = str.split(',');
			craft.result.push({id: parseInt(parts[0]), count: parseInt(parts[1] || 1), data: parseInt(parts[2] || 0)});
		}
		for(var ri = 0; ri < craft.result.length; ri++){
			var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
			if(!info.crafts[resultUid]) info.crafts[resultUid] = [];
			info.crafts[resultUid].push(craft);
			if(!info.craftsIDS[craft.result[ri].id]) info.craftsIDS[craft.result[ri].id] = [];
			if(info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data) == -1) info.craftsIDS[craft.result[ri].id].push(craft.result[ri].data);
		}
		this.data.crafts[slot] = craft;
		this.data.patternsCount = Object.keys(this.data.crafts).length;
		info.refreshOpenedGrids(true);
	},
	removeCraft: function(slot){
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return;
		var info = RSNetworks[netId].info;
		var craft = this.data.crafts[slot];
		if (!craft) return;
		for(var ri = 0; ri < craft.result.length; ri++){
			var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
			if(info.crafts[resultUid]){
				var idx = info.crafts[resultUid].indexOf(craft);
				if(idx != -1) info.crafts[resultUid].splice(idx, 1);
				if(info.crafts[resultUid].length == 0) delete info.crafts[resultUid];
			}
			if(info.craftsIDS[craft.result[ri].id]){
				var idIdx = info.craftsIDS[craft.result[ri].id].indexOf(craft.result[ri].data);
				if(idIdx != -1) info.craftsIDS[craft.result[ri].id].splice(idIdx, 1);
				if(info.craftsIDS[craft.result[ri].id].length == 0) delete info.craftsIDS[craft.result[ri].id];
			}
		}
		delete this.data.crafts[slot];
		this.data.patternsCount = Object.keys(this.data.crafts).length;
		info.refreshOpenedGrids(true);
	},
	provideCraft: function(craft){
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return;
		var info = RSNetworks[netId].info;
		this.data.successfulCrafts = this.data.successfulCrafts || [];
		if (!craft.isProcessed){
			for(var i = 0; i < craft.completedIngridients.length; i++){
				var ingr = craft.completedIngridients[i];
				info.deleteItem(ingr, ingr.count || 1, true, ['autocraft']);
			}
			for(var ri = 0; ri < craft.result.length; ri++){
				var result = copyItem(craft.result[ri]);
				var pushed = info.pushItem(result, result.count || 1, false, ['fromCrafter']);
				if(pushed > 0) info.deleteItem(result, result.count - pushed, true, ['autocraft']);
			}
		} else {
			this.data.successfulCrafts.push(craft.result2);
		}
		this.setWorkingState(true);
	},
	setWorkingState: function(state){
		var netId = this.data.NETWORK_ID;
		if (netId == 'f' || !RSNetworks[netId]) return;
		var key = cts(this);
		if(RSNetworks[netId][key]) RSNetworks[netId][key].isWorking = state;
	},
	tick: function(){
		if (this.data.NETWORK_ID == 'f' || !RSNetworks[this.data.NETWORK_ID]) return;
		var info = RSNetworks[this.data.NETWORK_ID].info;
		if (this.data.successfulCrafts && this.data.successfulCrafts.length > 0){
			for(var i = this.data.successfulCrafts.length - 1; i >= 0; i--){
				var item = this.data.successfulCrafts[i];
				var pushed = info.pushItem(item, item.count || 1, false, ['fromCrafter']);
				if(pushed == 0) this.data.successfulCrafts.splice(i, 1);
			}
		}
		if (this.data.itemsToPush && this.data.itemsToPush.length > 0){
			for(var i = this.data.itemsToPush.length - 1; i >= 0; i--){
				var item = this.data.itemsToPush[i];
				var pushed = info.pushItem(item, item.count || 1, false);
				if(pushed == 0) this.data.itemsToPush.splice(i, 1);
			}
		}
		if ((!this.data.successfulCrafts || this.data.successfulCrafts.length == 0) && (!this.data.itemsToPush || this.data.itemsToPush.length == 0)){
			this.setWorkingState(false);
			if(info.providingCrafts && info.providingCrafts.length > 0){
				for(var ci = 0; ci < info.providingCrafts.length; ci++){
					info.updateCrafts_(info.providingCrafts[ci]);
				}
			}
		}
	},
	post_update_network: function(net_id, _first){
		if (net_id == 'f') return;
		for(var s in this.data.crafts) this.addCraft(s);
	},
	pre_destroy: function(){
		for(var s in this.data.crafts) this.removeCraft(s);
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
				if (!extra) return 0;
				if (extra.getBoolean('isProcessed') || extra.getBoolean('oredictEnabled') || extra.getString('result0')){
					var slotName = tile.container.getSlotName(slot);
					var craftData = tile.data.crafts && tile.data.crafts[slotName];
					if (craftData) return 0;
					tile.addCraft(slotName);
					return count;
				}
				return 0;
			}
		});
		var _this = this;
		for(var i = 0; i < 9; i++){
			this.container.setSlotGetTransferPolicy('slot_pattern' + i, function(slot, id, count, data, extra, player){
				_this.removeCraft(slot);
				return count;
			});
		}
	},
	containerEvents: {
		updateRedstoneMode: function(eventData, connectedClient) {
			if(this.data.redstone_mode == undefined) this.data.redstone_mode = 0;
			this.data.redstone_mode = this.data.redstone_mode >= 2 ? 0 : this.data.redstone_mode + 1;
			if(!this.refreshRedstoneMode()) this.refreshGui();
		}
	},
	client: {
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
			openGui: function(container, window, content, eventData){}
		}
	}
});
