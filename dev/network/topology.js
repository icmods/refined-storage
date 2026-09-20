function isChunkLoadedAtSafe(blockSource, x, y, z) {
	if (blockSource && typeof blockSource.isChunkLoadedAt == 'function') return blockSource.isChunkLoadedAt(x, z);
	if (typeof World.isChunkLoadedAt == 'function') return World.isChunkLoadedAt(x, y != null ? y : 64, z);
	if (blockSource && typeof blockSource.isChunkLoaded == 'function') return blockSource.isChunkLoaded(x >> 4, z >> 4);
	if (typeof World.isChunkLoaded == 'function') return World.isChunkLoaded(x >> 4, z >> 4);
	return true;
}

const searchController = function (_coords, _self, _blockSource, _out, _visited) {
	if(!_blockSource) _blockSource = _coords.blockSource;
	if(!_blockSource) return false;
	if(_out) _out.incomplete = false;
	var s = false;
	if(_self){
		if (!isChunkLoadedAtSafe(_blockSource, _coords.x, _coords.y, _coords.z)) {
			if(_out) _out.incomplete = true;
			return false;
		}
		var bck = _blockSource.getBlock(_coords.x, _coords.y, _coords.z);
		if (bck.id == BlockID.RS_controller) {
			return {x: _coords.x, y: _coords.y, z: _coords.z};
		}
	}
	var hint = _coords.data ? _coords.data.controller_coords : _coords.controller_coords;
	if (hint && hint.x != undefined && !(hint.x == 0 && hint.y == 0 && hint.z == 0)) {
		if (isChunkLoadedAtSafe(_blockSource, hint.x, hint.y, hint.z)) {
			var hintBlock = _blockSource.getBlock(hint.x, hint.y, hint.z);
			if (hintBlock.id == BlockID.RS_controller) return {x: hint.x, y: hint.y, z: hint.z};
		}
	}
	var visited = _visited || {};
	visited[cts(_coords)] = true;
	var stack = [{x: _coords.x, y: _coords.y, z: _coords.z}];
	while (stack.length > 0) {
		var coords = stack.pop();
		for (var ri = 5; ri >= 0; ri--) {
			var coordss = {};
			coordss.x = coords.x + sides[ri][0];
			coordss.y = coords.y + sides[ri][1];
			coordss.z = coords.z + sides[ri][2];
			var key = cts(coordss);
			if (visited[key]) continue;
			visited[key] = true;
			if (!isChunkLoadedAtSafe(_blockSource, coordss.x, coordss.y, coordss.z)) {
				if(_out) _out.incomplete = true;
				continue;
			}
			var bck = _blockSource.getBlock(coordss.x, coordss.y, coordss.z);
			if (bck.id == BlockID.RS_controller) {
				s = {x: coordss.x, y: coordss.y, z: coordss.z};
				break;
			} else if (RS_blocks.indexOf(bck.id) != -1) {
				stack.push({x: coordss.x, y: coordss.y, z: coordss.z});
			}
		}
		if (s) break;
	}
	if(s && _coords.data) _coords.data.controller_coords = {x: s.x, y: s.y, z: s.z};
	return s;
}

const searchController_net = function (net_id) {
	if (net_id == 'f' || !RSNetworks[net_id]) return false;
	var info = RSNetworks[net_id].info;
	if (info && info.controllerCoords) {
		var cachedKey = info.controllerCoords.x + ',' + info.controllerCoords.y + ',' + info.controllerCoords.z;
		var cachedEntry = RSNetworks[net_id][cachedKey];
		if (cachedEntry && cachedEntry.id == BlockID.RS_controller) return info.controllerCoords;
	}
	for (var i in RSNetworks[net_id]) {
		if (i != 'info' && RSNetworks[net_id][i].id == BlockID.RS_controller) return RSNetworks[net_id][i].coords;
	}
}

function set_net_for_blocks(_coords, net_id, _self, _first, _defaultActive, _forced, _func) {
	return _topoAuthSetNet(_coords, net_id, _self, _first, _defaultActive, _forced);
}

function set_is_active_for_blocks_net(net_id, _state, isController, _blockSource) {
	for(var i in RSNetworks[net_id]){
		if(i != 'info' && RSNetworks[net_id][i].id != BlockID.RS_controller){
			var tile = World.getTileEntity(RSNetworks[net_id][i].coords.x, RSNetworks[net_id][i].coords.y, RSNetworks[net_id][i].coords.z, _blockSource);
			if (tile && tile.networkEntity) {
				if(isController) tile.data.controllerOff = !_state;
				tile.setActive(_state);
			}
		}
	}
	if (RSNetworks[net_id] && RSNetworks[net_id].info) RSNetworks[net_id].info.netMapDirty = true;
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
var pistonsMoveKey = function(coords, blockSource){
	return blockSource.getDimension() + ':' + cts(coords);
}
var ignoredParams = ['NETWORK_ID','LAST_NETWORK_ID','controller_coords','createdCalled','timer'];
Callback.addCallback('BlockChanged', function(coords, oldBlock, newBlock, _blockSource){
	if (typeof _blockSource == 'number') _blockSource = BlockSource.getDefaultForDimension(_blockSource);
	if (!_blockSource) return;
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
			pistonsMove__[pistonsMoveKey(to_coords, _blockSource)] = __tile;
		}
	}
	if(oldBlock.id == 250) {
		var oldTileData, newTileData;
		if((oldTileData = pistonsMove__[pistonsMoveKey(coords, _blockSource)]) && (newTileData = World.addTileEntity(coords.x, coords.y, coords.z, _blockSource))){
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
			TileEntity.destroyTileEntity(oldTileData, false, false);
			delete pistonsMove__[pistonsMoveKey(coords, _blockSource)];
		}
	}
	if (RS_blocks.indexOf(oldBlock.id) != -1 || RS_blocks.indexOf(newBlock.id) != -1) {
		_topoAuthNotify(coords, oldBlock, newBlock, _blockSource);
	}
});
