var CraftingScheduler = {

	processTick: function(info, blockSource, networkTick) {
		if (!info || !info.craftingTasks || info.craftingTasks.length === 0) return;

		Logger.Log('[SCHED] TICK: tasks=' + info.craftingTasks.length + ' netTick=' + (networkTick || 0), 'RS_DEBUG');

		for (var ti = 0; ti < info.craftingTasks.length; ti++) {
			var task = info.craftingTasks[ti];
			if (!task || task.cancelled) continue;

			if (task.reserveItems) {
				task.reserveItems(info);
			}

			var readyNode = null;
			for (var ni = 0; ni < (task.nodes || []).length; ni++) {
				var node = task.nodes[ni];
				if (node.done || node.remaining <= 0) continue;
				readyNode = node;
				break;
			}

			if (!readyNode) {
				var allDone = true;
				if (task.nodes) {
					for (var ni = 0; ni < task.nodes.length; ni++) {
						if (!task.nodes[ni].done) { allDone = false; break; }
					}
				}
				if (allDone || !task.nodes || task.nodes.length === 0) {
					CraftingScheduler._completeTask(task, info, ti);
					ti--;
				}
				continue;
			}

			var containers = info.getPatternContainers(readyNode.patternUid);
			Logger.Log('[SCHED] ReadyNode: pattern=' + readyNode.patternUid + ' remaining=' + readyNode.remaining + ' done=' + readyNode.done + ' containers=' + containers.length, 'RS_DEBUG');
			if (containers.length === 0) continue;

			var executed = false;
			for (var ci = 0; ci < containers.length; ci++) {
				var parts = containers[ci].split(',');
				if (parts.length < 3) continue;
				var cx = parseInt(parts[0]), cy = parseInt(parts[1]), cz = parseInt(parts[2]);
				var crafter = World.getTileEntity(cx, cy, cz, blockSource);
				Logger.Log('[SCHED] Crafter ' + containers[ci] + ': exists=' + !!crafter + ' active=' + (crafter && crafter.data ? crafter.data.isActive : 'N/A') + ' speed=' + (crafter && crafter.data ? crafter.data.speed : 'N/A') + ' lastCraftTick=' + (crafter && crafter.data ? crafter.data.lastCraftTick : 'N/A'), 'RS_DEBUG');
				if (!crafter || !crafter.data || !crafter.data.isActive) continue;

				var speed = crafter.data.speed || 10;
				var cooldown = Math.max(1, speed);
				var tick = networkTick || 0;
				if (crafter.data.lastCraftTick != null && tick - crafter.data.lastCraftTick < cooldown) { Logger.Log('[SCHED] Crafter ' + containers[ci] + ' SKIP cooldown: elapsed=' + (tick - crafter.data.lastCraftTick) + ' < ' + cooldown, 'RS_DEBUG'); continue; }

				var success = CraftingScheduler._executeOne(task, readyNode, crafter, info);
				Logger.Log('[SCHED] Executed via ' + containers[ci] + ': success=' + success + ' remaining=' + readyNode.remaining + ' progress=' + (task.getProgress ? task.getProgress() : 0) + '%', 'RS_DEBUG');
				if (success) {
					crafter.data.lastCraftTick = tick;
					task.currentStep = (task.currentStep || 0) + 1;
					if (readyNode.remaining <= 0) {
						readyNode.done = true;
					}
					if (Config.dev) Logger.Log('[SCHEDULER] ' + readyNode.patternUid +
						' via ' + containers[ci] + ' remaining=' + readyNode.remaining +
						' progress=' + task.getProgress() + '%', 'RefinedStorageDebug');
					info.notifyMonitorListeners();
					executed = true;
					break;
				}
			}

			if (!executed && readyNode.remaining > 0 && containers.length > 0) {
				var anyOnCooldown = false;
				for (var ci = 0; ci < containers.length; ci++) {
					var parts2 = containers[ci].split(',');
					var crafter2 = World.getTileEntity(parseInt(parts2[0]), parseInt(parts2[1]), parseInt(parts2[2]), blockSource);
					if (crafter2 && crafter2.data && crafter2.data.isActive) {
						var spd = crafter2.data.speed || 10;
						var cd = Math.max(1, spd);
						var tick2 = networkTick || 0;
						if (crafter2.data.lastCraftTick != null && tick2 - crafter2.data.lastCraftTick < cd) {
							anyOnCooldown = true;
							break;
						}
					}
				}
			}
		}

		info.refreshOpenedGrids();
	},

	_executeOne: function(task, node, crafter, info) {
		var pattern = info.crafts[node.patternUid];
		if (!pattern || !pattern[0]) return false;
		pattern = pattern[0];

		var ingredientsOk = true;
		var toExtract = [];

		for (var ii = 0; ii < pattern.ingridients.length; ii++) {
			var ingr = pattern.ingridients[ii];
			if (!ingr || !ingr.id) continue;
			var uid = getItemUid(ingr);
			var needed = ingr.count || 1;

			if (task.consumeFromBuffer) {
				var fromBuffer = task.consumeFromBuffer(uid, needed);
				needed -= fromBuffer;
			}

			if (needed > 0) {
				if (!info.itemCanBeDeleted({ id: ingr.id, data: ingr.data, count: needed }, needed)) {
					ingredientsOk = false;
					break;
				}
				toExtract.push({ id: ingr.id, data: ingr.data, count: needed, uid: uid, refund: needed - (ingr.count || 1) });
			}
		}

		if (!ingredientsOk) return false;

		for (var ei = 0; ei < toExtract.length; ei++) {
			info.deleteItem(toExtract[ei], toExtract[ei].count, true, ['autocraft']);
		}

		if (!pattern.isProcessed) {
			for (var ri = 0; ri < pattern.result.length; ri++) {
				var result = pattern.result[ri];
				info.pushItem({ id: result.id, data: result.data, count: result.count || 1, extra: null },
					result.count || 1, false, ['fromCrafter']);
			}
		} else {
			crafter.data.successfulCrafts = crafter.data.successfulCrafts || [];
			for (var ri = 0; ri < pattern.result.length; ri++) {
				var result2 = pattern.result[ri];
				crafter.data.successfulCrafts.push({ id: result2.id, data: result2.data, count: result2.count || 1 });
			}
			crafter.setWorkingState(true);
		}

		node.remaining--;

		if (node.remaining <= 0) {
			node.done = true;
		}

		return true;
	},

	_completeTask: function(task, info, index) {
		Logger.Log('[SCHED] COMPLETE: task=' + task.id + ' buffer=' + JSON.stringify(task.buffer || {}) + ' internal=' + (task.internalStorage ? task.internalStorage.length : 0), 'RS_DEBUG');
		if (task.flushBuffer) task.flushBuffer(info);
		for (var bi = 0; bi < (task.internalStorage || []).length; bi++) {
			var item = task.internalStorage[bi];
			if (item && item.id) info.pushItem(item, item.count, false, ['autocraft']);
		}
		task.internalStorage = [];

		var pidx = info.providingCrafts.indexOf(task);
		if (pidx != -1) info.providingCrafts.splice(pidx, 1);
		var tidx = info.craftingTasks.indexOf(task);
		if (tidx != -1) info.craftingTasks.splice(tidx, 1);

		if (Config.dev) Logger.Log('[SCHEDULER] Task ' + task.id + ' completed: ' +
			task.requestedCount + 'x ' + task.requestedUid, 'RefinedStorageDebug');
		info.notifyMonitorListeners();
	}
};
