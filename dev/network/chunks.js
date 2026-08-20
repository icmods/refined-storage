var RSChunkRebuildPending = false;
var RSChunkRebuildTicks = 0;

function RSChunkCoordsInChunk(x, z, chunkX, chunkZ) {
	return (x >> 4) == chunkX && (z >> 4) == chunkZ;
}

function RSNetworksIntersectChunk(chunkX, chunkZ) {
	var nets = [];
	for (var i = 0; i < RSNetworks.length; i++) {
		var net = RSNetworks[i];
		if (!net) continue;
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

function RSScheduleNetworkRebuild() {
	RSChunkRebuildPending = true;
	RSChunkRebuildTicks = 10;
}

Callback.addCallback("ChunkDiscarded", function (dimensionId, chunkX, chunkZ) {
	var nets = RSNetworksIntersectChunk(chunkX, chunkZ);
	for (var i = 0; i < nets.length; i++) {
		var info = RSNetworks[nets[i]] && RSNetworks[nets[i]].info;
		if (info) info.incomplete = true;
	}
	for (var cid in RSpendingReconnect) {
		var entry = RSpendingReconnect[cid];
		if (entry && RSChunkCoordsInChunk(entry.x, entry.z, chunkX, chunkZ)) delete RSpendingReconnect[cid];
	}
});

Callback.addCallback("ChunkLoaded", function (dimensionId, chunkX, chunkZ) {
	var nets = RSNetworksIntersectChunk(chunkX, chunkZ);
	var needRebuild = false;
	for (var i = 0; i < nets.length; i++) {
		var info = RSNetworks[nets[i]] && RSNetworks[nets[i]].info;
		if (!info) continue;
		if (info.incomplete) needRebuild = true;
		requestNetworkUpdateItems(info);
	}
	if (needRebuild) RSScheduleNetworkRebuild();
});

Callback.addCallback("tick", function () {
	if (!RSChunkRebuildPending) return;
	RSChunkRebuildTicks--;
	if (RSChunkRebuildTicks > 0) return;
	RSChunkRebuildPending = false;
	var anyIncomplete = false;
	for (var i = 0; i < RSNetworks.length; i++) {
		var net = RSNetworks[i];
		if (!net || !net.info || !net.info.incomplete) continue;
		var controllerCoords = searchController_net(i);
		if (!controllerCoords) continue;
		var dim = net.info.dimension;
		var cTile = dim != null
			? World.getTileEntity(controllerCoords.x, controllerCoords.y, controllerCoords.z, BlockSource.getDefaultForDimension(dim))
			: World.getTileEntity(controllerCoords.x, controllerCoords.y, controllerCoords.z);
		if (!cTile || !cTile.data || cTile.data.NETWORK_ID != i) continue;
		if (!cTile.blockSource || !isChunkLoadedAtSafe(cTile.blockSource, cTile.x, cTile.y, cTile.z)) {
			anyIncomplete = true;
			continue;
		}
		cTile.data.updateControllerNetwork = true;
		anyIncomplete = true;
	}
	if (anyIncomplete) RSScheduleNetworkRebuild();
});
