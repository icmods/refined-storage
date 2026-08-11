const searchController = function (_coords, _self, _blockSource) {
	if(!_blockSource) _blockSource = _coords.blockSource;
	var outCoords = [];
	outCoords.push(cts(_coords));
	var s = false;
	function _search(coords) {
		var coordss = {};
		for (var i in sides) {
			coordss.x = coords.x + sides[i][0];
			coordss.y = coords.y + sides[i][1];
			coordss.z = coords.z + sides[i][2];
			if (outCoords.indexOf(cts(coordss)) != -1) continue;
			outCoords.push(cts(coordss));
			var bck = _blockSource.getBlock(coordss.x, coordss.y, coordss.z);
			if (bck.id == BlockID.RS_controller) {
				s = coordss;
				return;
			} else if (RS_blocks.indexOf(bck.id) != -1) {
				_search(coordss);
			}
		}
	}
	if(_self){
		var bck = _blockSource.getBlock(_coords.x, _coords.y, _coords.z);
		if (bck.id == BlockID.RS_controller) {
			s = _coords;
			return s;
		}
	}
	_search(_coords);
	return s;
}

const searchController_net = function (net_id) {
	if (net_id == 'f') return false;
	for (var i in RSNetworks[net_id]) {
		if (i != 'info' && RSNetworks[net_id][i].id == BlockID.RS_controller) return RSNetworks[net_id][i].coords;
	}
}

function set_net_for_blocks(_coords, net_id, _self, _first, _defaultActive, _forced, _func) {
	if(Config.dev)Logger.Log('Set net for blocks: coords: ' + cts(_coords) + ' ; net_id: ' + net_id + ' ; _self: ' + _self + ' ; _first: ' + _first + ' ; _defaultActive: ' + _defaultActive + ' ; _forced: ' + _forced, 'RefinedStorageDebug');
	var blockSource_ = _coords.blockSource;
	var outCoords = [];
	outCoords.push(cts(_coords));
	var cableDeleting = [];
	function _search(coords) {
		for (var i in sides) {
			var coordss = {};
			coordss.x = coords.x + sides[i][0];
			coordss.y = coords.y + sides[i][1];
			coordss.z = coords.z + sides[i][2];
			if (outCoords.indexOf(cts(coordss)) != -1) continue;
			outCoords.push(cts(coordss));
			var bck = blockSource_.getBlock(coordss.x, coordss.y, coordss.z);
			var isRsBlock = (RS_blocks.indexOf(bck.id) != -1);
			if (bck.id == BlockID.RS_controller) {
				if(net_id == 'f') continue;
				if(InnerCore_pack.packVersionCode < 120) blockSource_.destroyBlock(coordss.x, coordss.y, coordss.z, true);
				else blockSource_.breakBlock(coordss.x, coordss.y, coordss.z, true);
                if(InnerCore_pack.packVersionCode <= 110)Block.onBlockDestroyed(coordss, bck, false, Player.get());
				continue;
			} else if (bck.id == BlockID.RS_cable) {
				if(net_id != 'f' && RSNetworks[net_id]){
					RSNetworks[net_id][cts(coordss)] = {
						id: BlockID.RS_cable,
						coords: coordss,
						isActive: true
					}
				} else {
					cableDeleting.push(cts(coordss));
				}
				_search(coordss);
			} else if (isRsBlock) {
				var tile = World.getTileEntity(coordss.x, coordss.y, coordss.z, blockSource_) || World.addTileEntity(coordss.x, coordss.y, coordss.z, blockSource_);
				if (bck.id == BlockID.RS_crafter) Logger.Log('[TOPO] Crafter connected: ' + cts(coordss) + ' to net=' + net_id, 'RS_DEBUG');
				if (tile) {
					if(!_forced && net_id == 'f' && !compareCoords(_coords, tile.data.controller_coords || {})) continue;
					tile.data.controller_coords = {x: _coords.x, y: _coords.y, z: _coords.z};
					tile.update_network(net_id, _first || (_defaultActive != undefined));
					if(_defaultActive)tile.setActive(_defaultActive);
				}
				_search(coordss);
			}
		}
	}
	if(_self){
		var bck = {id: blockSource_.getBlockId(_coords.x, _coords.y, _coords.z)};
		var isRsBlock = RS_blocks.indexOf(bck.id) != -1;
		if (isRsBlock && bck.id != BlockID.RS_controller) {
			if (bck.id == BlockID.RS_cable) {
				if(net_id != 'f' && RSNetworks[net_id]){
					RSNetworks[net_id][cts(_coords)] = {
						id: BlockID.RS_cable,
						coords: _coords,
						isActive: true
					}
				} else {
					cableDeleting.push(cts(_coords));
				}
			} else {
				var tile = World.getTileEntity(_coords.x, _coords.y, _coords.z, blockSource_) || World.addTileEntity(_coords.x, _coords.y, _coords.z, blockSource_);
				if (tile) {
					tile.data.controller_coords = {x: _coords.x, y: _coords.y, z: _coords.z};
					tile.update_network(net_id, _first || (_defaultActive != undefined));
					if(_defaultActive)tile.setActive(_defaultActive);
				}
			}
		}
	}
	_search(_coords);
	if(cableDeleting.length > 0){
		for(var i in RSNetworks){
			for(var k in cableDeleting){
				if(RSNetworks[i][cableDeleting[k]]) delete RSNetworks[i][cableDeleting[k]];
			}
		}
	}
}

function set_is_active_for_blocks(_coords, _state, isController) {
	var blockSource_ = _coords.blockSource;
	var outCoords = [];
	outCoords.push(cts(_coords));
	function _search(coords) {
		for (var i in sides) {
			var coordss = {};
			coordss.x = coords.x + sides[i][0];
			coordss.y = coords.y + sides[i][1];
			coordss.z = coords.z + sides[i][2];
			if (outCoords.indexOf(cts(coordss)) != -1) continue;
			outCoords.push(cts(coordss));
			var bck = {id: blockSource_.getBlockId(coordss.x, coordss.y, coordss.z)};
			if (bck.id == BlockID.RS_controller) {
				continue;
			} else if (RS_blocks.indexOf(bck.id) != -1) {
				var tile = World.getTileEntity(coordss.x, coordss.y, coordss.z, blockSource_);
				if (tile) {
					if(isController && !_state) 
						tile.data.controllerOff = true;
					else
						tile.data.controllerOff = false;
					tile.setActive(_state);
				}
				_search(coordss);
			}
		}
	}
	_search(_coords);
}

function set_is_active_for_blocks_net(net_id, _state, isController, _blockSource) {
	for(var i in RSNetworks[net_id]){
		if(i != 'info' && RSNetworks[net_id][i].id != BlockID.RS_controller){
			var tile = World.getTileEntity(RSNetworks[net_id][i].coords.x, RSNetworks[net_id][i].coords.y, RSNetworks[net_id][i].coords.z, _blockSource);
			if (tile) {
				if(isController) tile.data.controllerOff = !_state;
				tile.setActive(_state);
			}
		}
	}
}

function checkAndSetNetOnCoords(coords, update){
	if(!(controllerCoords = searchController(coords, true)))set_net_for_blocks(coords, 'f', true, false, undefined, true);
	if(update && controllerCoords && (tile = coords.blockSource.getTileEntity(controllerCoords.x, controllerCoords.y, controllerCoords.z)))tile.updateControllerNetwork();
}

function searchBlocksInNetwork(net_id, id){
	var res = [];
	if(!RSNetworks[net_id]) return res;
	for(var i in RSNetworks[net_id]){
		if(RSNetworks[net_id][i] && RSNetworks[net_id][i].id == id){
			res.push(RSNetworks[net_id][i]);
		}
	}
	return res;
}

World.setBlockChangeCallbackEnabled(535, true);
World.setBlockChangeCallbackEnabled(250, true);
World.setBlockChangeCallbackEnabled(34, true);
var pistonsPoss = [
	[0, -1, 0],
	[0, 1, 0],
	[0, 0, 1],
	[0, 0, -1],
	[1, 0, 0],
	[-1, 0, 0]
]
var pistonsMove__ = {};
var ignoredParams = ['NETWORK_ID','LAST_NETWORK_ID','controller_coords','createdCalled'];
Callback.addCallback('BlockChanged', function(coords, oldBlock, newBlock, _blockSource){
	_blockSource = BlockSource.getDefaultForDimension(_blockSource);
	coords.blockSource = _blockSource;
	if(oldBlock.id == 535 || newBlock.id == 535 || newBlock.id == 34) {
		var pistonBlockData = newBlock.id == 535 || newBlock.id == 34 ? newBlock.data : oldBlock.data;
		var pistonPos = pistonsPoss[pistonBlockData];
		var from_coords = oldBlock.id == 535 ? {
			x: coords.x + pistonPos[0],
			y: coords.y + pistonPos[1],
			z: coords.z + pistonPos[2]
		} : coords;
		var to_coords = newBlock.id == 535 || newBlock.id == 34 ? {
			x: coords.x + pistonPos[0],
			y: coords.y + pistonPos[1],
			z: coords.z + pistonPos[2]
		} : coords;
		var __tile = World.getTileEntity(from_coords.x, from_coords.y, from_coords.z, _blockSource);
		if(__tile){
			pistonsMove__[cts(to_coords)] = __tile;
		}
	}
	if(oldBlock.id == 250) {
		if((oldTileData = pistonsMove__[cts(coords)]) && (newTileData = World.addTileEntity(coords.x, coords.y, coords.z, _blockSource))){
			for(var i in newTileData.data){
				if(ignoredParams.indexOf(i) == -1){
					newTileData.data[i] = oldTileData.data[i];
				}
			}
			var unsaveableSlotsArray = Array.isArray(oldTileData.unsaveableSlots) ? oldTileData.unsaveableSlots : [];
			if(!oldTileData.unsaveableSlots || unsaveableSlotsArray.length > 0)for(var i in oldTileData.container.slots){
				if(unsaveableSlotsArray.length > 0 && unsaveableSlotsArray.indexOf(i) != -1) continue;
				var _slot = oldTileData.container.slots[i];
				newTileData.container.setSlot(i, _slot.id, _slot.count, _slot.data, _slot.extra);
				oldTileData.container.setSlot(i, 0,0,0,null);
			}
			TileEntity.destroyTileEntity(oldTileData);
			delete pistonsMove__[cts(coords)];
		}
	}
	if (oldBlock.id == BlockID.RS_cable) {
		for(var i in RSNetworks){
			if(RSNetworks[i][cts(coords)]) delete RSNetworks[i][cts(coords)];
		}
	}
	var isOldBlock = RS_blocks.indexOf(oldBlock.id) != -1;
	var isNewBlock = RS_blocks.indexOf(newBlock.id) != -1;
	if (oldBlock.id == BlockID.RS_crafter) Logger.Log('[TOPO] Crafter DISCONNECTED: ' + cts(coords), 'RS_DEBUG');
	if(oldBlock.id != BlockID.RS_controller && isOldBlock)for(var i in sides){
		var zCoords = {
			x: coords.x + sides[i][0],
			y: coords.y + sides[i][1],
			z: coords.z + sides[i][2],
			blockSource: _blockSource
		}
		checkAndSetNetOnCoords(zCoords);
	}
	if(newBlock.id == BlockID.RS_cable){
		if((controllerCoords = searchController(coords, true)) && (tile = World.getTileEntity(controllerCoords.x, controllerCoords.y, controllerCoords.z, _blockSource)))tile.updateControllerNetwork();
	}
});
