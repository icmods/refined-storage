// TopologyCore-authoritative network membership.

var _topoAuth = TopologyCore.createGraph({
	isNode: function (id, data) { return RS_blocks.indexOf(id) != -1 && id != BlockID.RS_controller; },
	isController: function (id, data) { return id == BlockID.RS_controller; },
	isNodeAt: function (id, data, coords, blockSource) {
		if (RS_blocks.indexOf(id) == -1 || id == BlockID.RS_controller) return false;
		if (id == BlockID.RS_cable) return true;
		try { return !!World.getTileEntity(coords.x, coords.y, coords.z, blockSource); } catch (e) { return false; }
	},
	isTraversable: function (id, data) { return RS_blocks.indexOf(id) != -1 && id != BlockID.RS_controller; },
	reverseDFS: true,
	refloodOnChange: "onChange",
	mergeComponents: true,
	detectSplits: true,
	onBoundaryController: function (cKey, coords, dim) {
		var bs = _topoAuthSource(dim);
		if (!bs) return;
		try {
			if (typeof InnerCore_pack != "undefined" && InnerCore_pack.packVersionCode < 120) bs.destroyBlock(coords.x, coords.y, coords.z, true);
			else bs.breakBlock(coords.x, coords.y, coords.z, true);
		} catch (e) {}
	},
	onEvent: function (event, data) { _topoAuthHandleEvent(event, data); },
	onAfterChange: function (change) { _topoAuthAfterChange(change); },
	onRebuildNeeded: function (component, cKey) { _topoAuthRebuildNeeded(component, cKey); }
});

// Map a TopologyCore "component is incomplete" signal to the RS network that owns it
// and flag it for a rebuild (the host keeps its own policy/state).
function _topoAuthMarkNetIncomplete(data) {
	if (!data || !data.componentKey) return;
	var c = _topoAuthParseKey(data.componentKey);
	var bs = _topoAuthSource(c.dim);
	var tile = bs ? World.getTileEntity(c.x, c.y, c.z, bs) : null;
	if (tile && tile.data && tile.data.NETWORK_ID && tile.data.NETWORK_ID != 'f') {
		var net = RSNetworks[tile.data.NETWORK_ID];
		if (net && net.info) net.info.incomplete = true;
		return;
	}
	// Controller chunk unloaded: fall back to the networks intersecting the chunk
	// (the component key cannot be resolved without the controller tile).
	if (data.chunkX !== undefined && typeof RSNetworksIntersectChunk === "function") {
		var nets = RSNetworksIntersectChunk(data.chunkX, data.chunkZ, data.dim);
		for (var i = 0; i < nets.length; i++) {
			var info = RSNetworks[nets[i]] && RSNetworks[nets[i]].info;
			if (info) info.incomplete = true;
		}
	}
}

// TC rebuild tick: ask the (loaded) controller to re-derive its network next tick.
function _topoAuthRebuildNeeded(component, cKey) {
	if (!component || !component.coords) return;
	var bs = _topoAuthSource(component.dim);
	if (!bs) return;
	if (typeof isChunkLoadedAtSafe === 'function' && !isChunkLoadedAtSafe(bs, component.coords.x, component.coords.y, component.coords.z)) return;
	var tile = World.getTileEntity(component.coords.x, component.coords.y, component.coords.z, bs);
	if (!tile || !tile.data) return;
	var net = tile.data.NETWORK_ID;
	if (net && net != 'f' && RSNetworks[net] && RSNetworks[net].info) RSNetworks[net].info.incomplete = true;
	tile.data.updateControllerNetwork = true;
}

// After TC stabilizes the graph, finalize RS tiles affected by a change so the host
// client model matches reality. A piston-moved block keeps the NETWORK_ID/isActive it
// copied from its old network and does not refresh itself, so without this it shows a
// stale "connected" texture while being disconnected.
function _topoAuthAfterChange(change) {
	if (!change || !change.coords) return;
	var c = change.coords;
	var bs = c.blockSource;
	if (!bs) return;
	if (typeof isChunkLoadedAtSafe === 'function' && !isChunkLoadedAtSafe(bs, c.x, c.y, c.z)) return;
	var blk = (typeof bs.getBlock == 'function') ? bs.getBlock(c.x, c.y, c.z) : null;
	if (!blk || blk.id == 0 || blk.id == BlockID.RS_cable || blk.id == BlockID.RS_controller || RS_blocks.indexOf(blk.id) == -1) return;
	var tile = World.getTileEntity(c.x, c.y, c.z, bs);
	if (!tile || !tile.data) {
		// The destination tile may not exist yet (created a tick later by the engine).
		// Re-check on the next tick (bounded).
		change.__retry = (change.__retry || 0) + 1;
		if (change.__retry <= 3 && typeof TickScheduler != "undefined" && TickScheduler.global) {
			TickScheduler.global.defer(function () { _topoAuthAfterChange(change); }, { ticks: 1, retries: 1 });
		}
		return;
	}
	var netId = tile.data.NETWORK_ID;
	var key = c.x + ',' + c.y + ',' + c.z;
	var attached = netId && netId != 'f' && RSNetworks[netId] && RSNetworks[netId][key];
	if (!attached) {
		if (typeof tile.update_network == 'function') {
			try { tile.update_network('f'); } catch (e) {
				tile.data.NETWORK_ID = 'f';
				tile.data.isActive = false;
			}
		} else {
			tile.data.NETWORK_ID = 'f';
			tile.data.isActive = false;
		}
		if (typeof tile.refreshModel == 'function') rsSafeServerRefresh(tile, 'topoAfterChange');
	}
}

var _topoAuthCurrentNet = null;
var _topoAuthCurrentActive = false;
var _topoAuthNodes = {}; // componentKey -> { "x,y,z": {x,y,z} }

// LevelLeft: the authoritative graph must be reset (otherwise stale components on the next level).
Callback.addCallback("LevelLeft", function () {
	if (_topoAuth) _topoAuth.reset();
	_topoAuthCurrentNet = null;
	_topoAuthCurrentActive = false;
	_topoAuthNodes = {};
});

function _topoAuthSource(dim) {
	return (dim != null && typeof BlockSource != "undefined") ? BlockSource.getDefaultForDimension(dim) : null;
}

function _topoAuthParseKey(cKey) {
	var ci = cKey.indexOf(':');
	var dim = ci >= 0 ? parseInt(cKey.substring(0, ci)) : 0;
	if (!isFinite(dim)) dim = 0;
	var rest = ci >= 0 ? cKey.substring(ci + 1) : cKey;
	var p = rest.split(',');
	return { dim: dim, x: parseInt(p[0]), y: parseInt(p[1]), z: parseInt(p[2]) };
}

function _topoAuthNetOfComponent(cKey) {
	if (_topoAuthCurrentNet != null) return _topoAuthCurrentNet;
	var c = _topoAuthParseKey(cKey);
	var bs = _topoAuthSource(c.dim);
	var tile = bs ? World.getTileEntity(c.x, c.y, c.z, bs) : null;
	return (tile && tile.data) ? tile.data.NETWORK_ID : 'f';
}

function _topoAuthAddNode(cKey, dim, coords, net) {
	var bs = _topoAuthSource(dim);
	if (!bs || net == 'f' || !RSNetworks[net]) return;
	var cts = coords.x + ',' + coords.y + ',' + coords.z;
	var block = bs.getBlock(coords.x, coords.y, coords.z);
	if (block.id == BlockID.RS_cable) {
		RSNetworks[net][cts] = { id: block.id, coords: { x: coords.x, y: coords.y, z: coords.z }, isActive: true };
		return;
	}
	var tile = World.getTileEntity(coords.x, coords.y, coords.z, bs);
	if (!tile) return;
	var c = _topoAuthParseKey(cKey);
	tile.data.controller_coords = { x: c.x, y: c.y, z: c.z };
	tile.update_network(net, true);
	if (_topoAuthCurrentActive) tile.setActive(true);
}

function _topoAuthRemoveNode(coords, dim) {
	// Detach tiles via update_network('f') so a split is reflected correctly.
	var bs = (dim != null) ? _topoAuthSource(dim) : (coords.blockSource || null);
	// Never read the world for an unloaded chunk (use-after-free risk).
	if (bs && typeof isChunkLoadedAtSafe === 'function' && !isChunkLoadedAtSafe(bs, coords.x, coords.y, coords.z)) {
		var ctsU = coords.x + ',' + coords.y + ',' + coords.z;
		for (var nU in RSNetworks) {
			if (RSNetworks[nU] && RSNetworks[nU][ctsU]) delete RSNetworks[nU][ctsU];
		}
		return;
	}
	var tile = bs ? World.getTileEntity(coords.x, coords.y, coords.z, bs) : null;
	if (tile && typeof tile.update_network == "function") {
		try {
			if (tile.data) delete tile.data.controller_coords;
			tile.update_network('f');
		} catch (e) {}
		return;
	}
	var cts = coords.x + ',' + coords.y + ',' + coords.z;
	for (var n in RSNetworks) {
		if (RSNetworks[n] && RSNetworks[n][cts]) delete RSNetworks[n][cts];
	}
}

function _topoAuthHandleEvent(event, data) {
	if (!data) return;
	if (event == "nodeAdded") {
		var cts = data.coords.x + ',' + data.coords.y + ',' + data.coords.z;
		if (!_topoAuthNodes[data.componentKey]) _topoAuthNodes[data.componentKey] = {};
		_topoAuthNodes[data.componentKey][cts] = { x: data.coords.x, y: data.coords.y, z: data.coords.z };
		_topoAuthAddNode(data.componentKey, data.dim, data.coords, _topoAuthNetOfComponent(data.componentKey));
	} else if (event == "nodeRemoved" || event == "nodeOrphaned") {
		_topoAuthRemoveNode(data.coords, data.dim);
		if (data.componentKey && _topoAuthNodes[data.componentKey]) {
			delete _topoAuthNodes[data.componentKey][data.coords.x + ',' + data.coords.y + ',' + data.coords.z];
		}
	} else if (event == "componentDestroyed") {
		var nodes = _topoAuthNodes[data.componentKey];
		if (nodes) {
			for (var k in nodes) _topoAuthRemoveNode(nodes[k], data.dim);
			delete _topoAuthNodes[data.componentKey];
		}
	} else if (event == "componentMerged") {
		if (data.mergedKey && data.mergedKey !== data.componentKey) delete _topoAuthNodes[data.mergedKey];
		// Absorbed component: deferred re-flood so its nodes get the surviving net.
		_topoAuthScheduleReflood(data.componentKey, data.dim);
	} else if (event == "markedIncomplete") {
		_topoAuthMarkNetIncomplete(data);
	}
}

function _topoAuthScheduleReflood(cKey, dim) {
	var c = _topoAuthParseKey(cKey);
	var bs = _topoAuthSource(dim);
	if (!bs) return;
	TickScheduler.global.defer(function () {
		var cTile = World.getTileEntity(c.x, c.y, c.z, bs);
		if (cTile && cTile.data && cTile.data.NETWORK_ID != 'f') {
			_topoAuthSetNet(cTile, cTile.data.NETWORK_ID, false, false, cTile.data.isActive);
		}
	}, { ticks: 1, retries: 1 });
}

// TC-driven replica of `set_net_for_blocks`: attach (real net_id) / detach (net_id 'f').
function _topoAuthSetNet(coords, net_id, self, first, active, forced, options) {
	var dim = coords.dimension != undefined ? coords.dimension : 0;
	var bs = coords.blockSource || _topoAuthSource(dim);
	if (!bs) return false;
	if (net_id == 'f') {
		// detach: controller → removeComponent; node → reflood (drops it if disconnected)
		var block = bs.getBlock(coords.x, coords.y, coords.z);
		if (block.id == BlockID.RS_controller) {
			_topoAuth.removeComponent({ x: coords.x, y: coords.y, z: coords.z }, dim);
		} else {
			_topoAuth.refloodComponentOf({ x: coords.x, y: coords.y, z: coords.z }, dim, bs);
		}
		return false;
	}
	_topoAuthCurrentNet = net_id;
	_topoAuthCurrentActive = !!active;
	var incomplete = false;
	try {
		_topoAuth.floodAssign({ x: coords.x, y: coords.y, z: coords.z, blockSource: bs }, dim, null,
		{ cause: "assign", destructive: !(options && options.destructive === false) });
		var comp = _topoAuth.component({ x: coords.x, y: coords.y, z: coords.z }, dim);
		incomplete = comp ? comp.incomplete : false;
	} catch (e) {}
	_topoAuthCurrentNet = null;
	_topoAuthCurrentActive = false;
	return incomplete;
}

// Re-flood the component of the controller reachable from `coords` (RS parity:
// updateControllerNetwork / checkAndSetNetOnCoords). Safe no-op without a controller.
// Deduplicated per controller and tick: the neighbours of a removed block usually resolve
// to the same component, and one flood is enough.
var _topoAuthRefloodStamp = -1;
var _topoAuthRefloodDone = {};
function _topoAuthRefloodFrom(coords, bs, destructive) {
	try {
		var ctrl = searchController({ x: coords.x, y: coords.y, z: coords.z, blockSource: bs }, true);
		if (ctrl) {
			var stamp = World.getThreadTime();
			if (_topoAuthRefloodStamp != stamp) {
				_topoAuthRefloodStamp = stamp;
				_topoAuthRefloodDone = {};
			}
			var dim = (bs && typeof bs.getDimension == "function") ? bs.getDimension() : 0;
			var floodKey = (destructive === true ? 'D:' : 'N:') + dim + ':' + cts(ctrl);
			if (_topoAuthRefloodDone[floodKey]) return;
			_topoAuthRefloodDone[floodKey] = true;
			var cTile = World.getTileEntity(ctrl.x, ctrl.y, ctrl.z, bs);
			if (cTile && cTile.data && cTile.data.NETWORK_ID != 'f') {
				_topoAuthSetNet(cTile, cTile.data.NETWORK_ID, false, false, cTile.data.isActive, false,
					{ destructive: destructive === true });
			}
		}
	} catch (e) {}
}

// Re-floods are DEFERRED: running floodAssign/breakBlock synchronously inside
// onBlockChanged re-enters the engine's tile create/destroy and SIGSEGVs on b128.
function _topoAuthDeferReflood(coords, bs, destructive) {
	var c = { x: coords.x, y: coords.y, z: coords.z };
	var d = destructive === true;
	TickScheduler.global.defer(function () { _topoAuthRefloodFrom(c, bs, d); }, { ticks: 1, retries: 1 });
}

// Block change → TopologyCore membership + RS reconnect parity. RS re-flooded the
// affected side via checkAndSetNetOnCoords on the 6 neighbours of a removed RS
// block, and updateControllerNetwork on a cable placement.
var _topoAuthNeighborStamp = -1;
var _topoAuthNeighborDone = {};
function _topoAuthNotify(coords, oldBlock, newBlock, bs) {
	if (!bs) return;
	var dim = (typeof bs.getDimension == "function") ? bs.getDimension() : 0;
	_topoAuth.notifyBlockChanged(
		{ x: coords.x, y: coords.y, z: coords.z, blockSource: bs },
		oldBlock.id, newBlock.id, dim, oldBlock.data, newBlock.data
	);
	var newIsNode = newBlock.id != 0 && RS_blocks.indexOf(newBlock.id) != -1 && newBlock.id != BlockID.RS_controller;
	var oldIsNode = oldBlock.id != 0 && RS_blocks.indexOf(oldBlock.id) != -1;
	// Placed node/cable (air OR a moving block moved by a piston): reconnect.
	if (newIsNode && !oldIsNode) {
		_topoAuthDeferReflood(coords, bs, true);
	}
	// Removed RS node (bridge/grid/crafter/cable): re-flood the neighbours so the
	// disconnected part detaches. Per-tick processed set avoids duplicate work.
	if (oldIsNode && !newIsNode && oldBlock.id != BlockID.RS_controller) {
		var stamp = World.getThreadTime();
		if (_topoAuthNeighborStamp != stamp) {
			_topoAuthNeighborStamp = stamp;
			_topoAuthNeighborDone = {};
		}
		for (var si = 0; si < sides.length; si++) {
			var nx = coords.x + sides[si][0], ny = coords.y + sides[si][1], nz = coords.z + sides[si][2];
			var zKey = dim + ':' + cts({ x: nx, y: ny, z: nz });
			if (_topoAuthNeighborDone[zKey]) continue;
			_topoAuthNeighborDone[zKey] = true;
			if (typeof isChunkLoadedAtSafe === 'function' && !isChunkLoadedAtSafe(bs, nx, ny, nz)) continue;
			_topoAuthDeferReflood({ x: nx, y: ny, z: nz }, bs, false);
		}
	}
}
