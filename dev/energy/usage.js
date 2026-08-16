function computeNetMap(netId, blockSource, ignoreIsActive) {
	var usage = 0;
	var net_map = {};
	for (var i in RSNetworks[netId]) {
		if (!RSNetworks[netId][i] || i == "info" || RSNetworks[netId][i].id == BlockID.RS_controller || (!RSNetworks[netId][i].isActive && !ignoreIsActive)) continue;
		var networkTile = RSNetworks[netId][i];
		var id_ = networkTile.id;
		if (id_ == BlockID.diskDrive) {
			var tile = World.getTileEntity(networkTile.coords.x, networkTile.coords.y, networkTile.coords.z, blockSource);
			if (!tile) continue;
			var __usage = EnergyUse['disk'] * tile.data.disks;
			usage += __usage;
			if(!net_map[String(id_)])
				net_map[String(id_)] = {id: id_, energy_use: 0, count: 1};
			else
				net_map[String(id_)].count++;
			net_map[String(id_)].energy_use += __usage;
		} else {
			if(!net_map[String(id_)])
				net_map[String(id_)] = {id: id_, energy_use: 0, count: 1};
			else
				net_map[String(id_)].count++;
			var __usage = EnergyUse[id_] || 0;
			var patternTile = World.getTileEntity(networkTile.coords.x, networkTile.coords.y, networkTile.coords.z, blockSource);
			var container = PatternContainerRegistry.getByCoords(networkTile.coords, blockSource.getDimension());
			if (container && typeof container.getUsage === 'function' && patternTile && patternTile.data) {
				try {
					var customUsage = container.getUsage(patternTile);
					if (customUsage && customUsage > 0) __usage += customUsage;
				} catch(err) {
					if(Config.dev)Logger.Log('[PatternContainer] getUsage error: ' + err, 'RefinedStorageError');
				}
			}
			if (patternTile && patternTile.data && patternTile.data.upgrades) {
				for(var j in patternTile.data.upgrades) __usage += UpgradeRegistry.getEnergyUsage(j) * patternTile.data.upgrades[j];
			}
			usage += __usage;
			net_map[String(id_)].energy_use += __usage;
		}
	}
	return {net_map: net_map, usage: usage};
}
