function RSChunkCoordsInChunk(x, z, chunkX, chunkZ) {
	return (x >> 4) == chunkX && (z >> 4) == chunkZ;
}

function RSNetworksIntersectChunk(chunkX, chunkZ, dim) {
	var nets = [];
	for (var i = 0; i < RSNetworks.length; i++) {
		var net = RSNetworks[i];
		if (!net) continue;
		if (dim != null && net.info && net.info.dimension != null && net.info.dimension != dim) continue;
		for (var key in net) {
			if (key == 'info') continue;
			var entry = net[key];
			if (entry && entry.coords && RSChunkCoordsInChunk(entry.coords.x, entry.coords.z, chunkX, chunkZ)) {
				nets.push(i);
				break;
			}
		}
	}
	return nets;
}

// TopologyCore chunk wiring: TC owns incomplete tracking + rebuild scheduling
// (ChunkDiscarded/Loaded -> markChunkUnloaded/Loaded -> TC scheduler ->
// onRebuildNeeded -> controller re-derives membership). The host only maps
// the result to its own network state (see topology_authoritative.js).
function _rsTopoMarkChunk(unloaded, dim, chunkX, chunkZ) {
	if (typeof _topoAuth === 'undefined' || !_topoAuth) return;
	try {
		if (unloaded) _topoAuth.markChunkUnloaded(chunkX, chunkZ, dim);
		else _topoAuth.markChunkLoaded(chunkX, chunkZ, dim);
	} catch (e) {}
}

Callback.addCallback("ChunkDiscarded", function (dimensionId, chunkX, chunkZ) {
	for (var cid in RSpendingReconnect) {
		var entry = RSpendingReconnect[cid];
		if (entry && RSChunkCoordsInChunk(entry.x, entry.z, chunkX, chunkZ)) delete RSpendingReconnect[cid];
	}
	_rsTopoMarkChunk(true, dimensionId, chunkX, chunkZ);
});

Callback.addCallback("ChunkLoaded", function (dimensionId, chunkX, chunkZ) {
	// Storage policy: refresh the item cache of intersecting networks.
	var nets = RSNetworksIntersectChunk(chunkX, chunkZ, dimensionId);
	for (var i = 0; i < nets.length; i++) {
		var info = RSNetworks[nets[i]] && RSNetworks[nets[i]].info;
		if (info) requestNetworkUpdateItems(info);
	}
	_rsTopoMarkChunk(false, dimensionId, chunkX, chunkZ);
});
