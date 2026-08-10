function computeNetMap(netId, blockSource, ignoreIsActive) {
	var usage = 0;
	var net_map = {};
	for (var i in RSNetworks[netId]) {
		if (!RSNetworks[netId][i] || i == "info" || RSNetworks[netId][i].id == BlockID.RS_controller || (!RSNetworks[netId][i].isActive && !ignoreIsActive)) continue;
		var networkTile = RSNetworks[netId][i];
		var id_ = networkTile.id;
		if(!net_map[String(id_)])
			net_map[String(id_)] = {id: id_, energy_use: 0, count: 1};
		else
			net_map[String(id_)].count++;
		if (id_ == BlockID.diskDrive) {
			var tile = World.getTileEntity(networkTile.coords.x, networkTile.coords.y, networkTile.coords.z, blockSource);
			if (!tile) continue;
			var __usage = EnergyUse['disk'] * tile.data.disks;
			usage += __usage;
			net_map[String(id_)].energy_use += __usage;
		} else {
			var __usage = EnergyUse[id_] || 0;
			for(var j in networkTile.upgrades) __usage += UpgradeRegistry.getEnergyUsage(j) * networkTile.upgrades[j];
			usage += __usage;
			net_map[String(id_)].energy_use += __usage;
		}
	}
	return {net_map: net_map, usage: usage};
}
