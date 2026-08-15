var CraftingScheduler = {

	RETRY_THROTTLE: 3,

	processTick: function(info, blockSource, networkTick) {
		if (!info || !info.craftingTasks || info.craftingTasks.length === 0) return;

		var parallel = Config['parallelCrafting (Java like)'] === true;

		for (var ti = 0; ti < info.craftingTasks.length; ti++) {
			var task = info.craftingTasks[ti];
			if (!task || task.cancelled) continue;

			if (parallel) {
				for (var ni = 0; ni < (task.nodes || []).length; ni++) {
					var node = task.nodes[ni];
					if (node.done || node.remaining <= 0) continue;
					if (node._lastTry != null && networkTick - node._lastTry < CraftingScheduler.RETRY_THROTTLE) continue;
					CraftingScheduler._tryExecute(task, node, info, blockSource, networkTick);
				}
			} else {
				var readyNode = null;
				for (var ni2 = 0; ni2 < (task.nodes || []).length; ni2++) {
					var node2 = task.nodes[ni2];
					if (node2.done || node2.remaining <= 0) continue;
					readyNode = node2;
					break;
				}
				if (readyNode && (readyNode._lastTry == null || networkTick - readyNode._lastTry >= CraftingScheduler.RETRY_THROTTLE)) {
					CraftingScheduler._tryExecute(task, readyNode, info, blockSource, networkTick);
				}
			}

			var allDone = true;
			if (task.nodes) {
				for (var ni3 = 0; ni3 < task.nodes.length; ni3++) {
					if (!task.nodes[ni3].done) { allDone = false; break; }
				}
			}
			if (allDone || !task.nodes || task.nodes.length === 0) {
				CraftingScheduler._completeTask(task, info, ti);
				ti--;
			}
		}

		info.refreshOpenedGrids();
	},

	_tryExecute: function(task, node, info, blockSource, networkTick) {
		var containers = info.getPatternContainers(node.patternUid);
		if (containers.length === 0) return false;

		for (var ci = 0; ci < containers.length; ci++) {
			var parts = containers[ci].split(',');
			if (parts.length < 3) continue;
			var cx = parseInt(parts[0]), cy = parseInt(parts[1]), cz = parseInt(parts[2]);
			var crafter = World.getTileEntity(cx, cy, cz, blockSource);
			if (!crafter || !crafter.data || !crafter.data.isActive) continue;

			var speed = crafter.data.speed || 10;
			var cooldown = Math.max(1, speed);
			var tick = networkTick || 0;
			if (crafter.data.lastCraftTick != null && tick - crafter.data.lastCraftTick < cooldown) continue;

			node._lastTry = tick;
			var success = CraftingScheduler._executeOne(task, node, crafter, info);
			if (success) {
				crafter.data.lastCraftTick = tick;
				task.currentStep = (task.currentStep || 0) + 1;
				info.notifyMonitorListeners(task);
				if (task.currentStep % 5 === 0) _RS._emit("taskProgress", {netId: info.net_id, taskId: task.id, currentStep: task.currentStep, totalSteps: task.totalSteps || 0});
				return true;
			}
		}
		return false;
	},

	_executeOne: function(task, node, crafter, info) {
		var pattern = info.crafts[node.patternUid];
		if (!pattern || !pattern[0]) return false;
		pattern = pattern[0];

		var front = null;
		var machineSide = -1;
		if (pattern.isProcessed) {
			if (!node.expectedByUid) task.cacheExpectedOutputs(node, pattern);
			var frontSide = getCrafterFrontSide(crafter);
			front = StorageInterface.getNeighbourStorage(crafter.blockSource, crafter, frontSide);
			if (!front) return false;
			machineSide = frontSide ^ 1;
		}

		var toCommit = [];
		var neededByUid = {};
		for (var ii = 0; ii < pattern.ingridients.length; ii++) {
			var ingr = pattern.ingridients[ii];
			if (!ingr || !ingr.id) continue;
			var uid = getItemUid(ingr);
			var needed = ingr.count || 1;
			var nb = neededByUid[uid];
			if (!nb) neededByUid[uid] = nb = { id: ingr.id, data: ingr.data, total: 0 };
			nb.total += needed;
			if (pattern.isProcessed) {
				var canReceive = front.getReceivingItemCount({ id: ingr.id, data: ingr.data, count: needed, extra: null }, machineSide);
				if (canReceive < needed) return false;
			}
			toCommit.push({ id: ingr.id, data: ingr.data, uid: uid, needed: needed, fromBuffer: 0, fromStorage: 0 });
		}

		for (var cuid in neededByUid) {
			var _nb = neededByUid[cuid];
			_nb.bufAlloc = Math.min(_nb.total, task.buffer[cuid] || 0);
			var _stor = _nb.total - _nb.bufAlloc;
			if (_stor > 0) {
				if (!info.itemCanBeDeleted({ id: _nb.id, data: _nb.data, count: _stor }, _stor)) {
					return false;
				}
			}
		}

		for (var ci0 = 0; ci0 < toCommit.length; ci0++) {
			var _slot = toCommit[ci0];
			var _nb2 = neededByUid[_slot.uid];
			var _fromBuf = Math.min(_slot.needed, _nb2.bufAlloc);
			_nb2.bufAlloc -= _fromBuf;
			_slot.fromBuffer = _fromBuf;
			_slot.fromStorage = _slot.needed - _fromBuf;
		}

		for (var ci = 0; ci < toCommit.length; ci++) {
			var commit = toCommit[ci];
			if (commit.fromBuffer > 0) task.consumeFromBuffer(commit.uid, commit.fromBuffer);
			if (commit.fromStorage > 0) {
				info.deleteItem({ id: commit.id, data: commit.data, count: commit.fromStorage }, commit.fromStorage, true, ['autocraft']);
			}
		}

		if (pattern.isProcessed) {
			for (var di = 0; di < toCommit.length; di++) {
				var machineItem = { id: toCommit[di].id, data: toCommit[di].data, count: toCommit[di].needed, extra: null };
				var remaining = toCommit[di].needed;
				var slots = front.getInputSlots(machineSide);
				for (var si = 0; si < slots.length && remaining > 0; si++) {
					remaining -= front.addItemToSlot(slots[si], machineItem, remaining);
				}
				if (remaining > 0) {
					info.pushItem({ id: machineItem.id, data: machineItem.data, count: remaining, extra: null }, remaining, false, ['autocraft']);
				}
			}
		} else {
			for (var ri = 0; ri < pattern.result.length; ri++) {
				var result = pattern.result[ri];
				info.pushItem({ id: result.id, data: result.data, count: result.count || 1, extra: null },
					result.count || 1, false, ['fromCrafter']);
			}
		}

		node.remaining--;

		if (node.remaining <= 0 && (!pattern.isProcessed || task.outputsSatisfied(node))) {
			node.done = true;
			if (pattern.isProcessed && task.unregisterExpectedOutputs) task.unregisterExpectedOutputs(node);
		}

		return true;
	},

	_completeTask: function(task, info, index) {
		for (var ni = 0; ni < (task.nodes || []).length; ni++) {
			if (!task.nodes[ni].done) return;
		}
		task.completing = true;
		if (task.flushBuffer) task.flushBuffer(info);

		var pidx = info.providingCrafts.indexOf(task);
		if (pidx != -1) info.providingCrafts.splice(pidx, 1);
		var tidx = info.craftingTasks.indexOf(task);
		if (tidx != -1) info.craftingTasks.splice(tidx, 1);

		info.notifyMonitorListeners(task);
		_RS._emit("taskCompleted", {netId: info.net_id, task: {id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount}});
	}
};
