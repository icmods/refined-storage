var CraftingScheduler = {

	RETRY_THROTTLE: 2,
	FAIL_TIMEOUT: 600,

	getContainerBudget: function(interval) {
		return Math.min(5, 1 + Math.floor((10 - Math.max(1, interval)) / 2));
	},

	processTick: function(info, blockSource, networkTick) {
		if (!info || !info.craftingTasks || info.craftingTasks.length === 0) return;

		var parallel = Config['parallelCrafting (Java like)'] === true;
		var tileCache = {};
		var dirtyTasks = {};

		for (var ti = 0; ti < info.craftingTasks.length; ti++) {
			var task = info.craftingTasks[ti];
			if (!task) continue;
			task.ticks = (task.ticks || 0) + 1;
			if (task.cancelled) {
				if (task.completingFlush && task.flushBuffer && task.flushBuffer(info)) {
					var cpidx = info.providingCrafts.indexOf(task);
					if (cpidx != -1) info.providingCrafts.splice(cpidx, 1);
					var ctidx = info.craftingTasks.indexOf(task);
					if (ctidx != -1) info.craftingTasks.splice(ctidx, 1);
					ti--;
					info.removeScheduledCount(task);
					info.unregisterTaskExpectedOutputs(task);
					info.notifyMonitorListeners(task);
					info.refreshOpenedGrids();
					_RS._emit("taskRemoved", {netId: info.net_id});
				}
				continue;
			}

			if (parallel) {
				for (var ni = 0; ni < (task.nodes || []).length; ni++) {
					if (task.cancelled) break;
					var node = task.nodes[ni];
					if (node.done || node.remaining <= 0) continue;
					if (node._lastTry != null && networkTick - node._lastTry < CraftingScheduler.RETRY_THROTTLE) continue;
					CraftingScheduler._tryExecute(task, node, info, blockSource, networkTick, tileCache, dirtyTasks);
				}
			} else {
				for (var ni2 = 0; ni2 < (task.nodes || []).length; ni2++) {
					if (task.cancelled) break;
					var node2 = task.nodes[ni2];
					if (node2.done || node2.remaining <= 0) continue;
					if (node2._lastTry != null && networkTick - node2._lastTry < CraftingScheduler.RETRY_THROTTLE) continue;
					CraftingScheduler._tryExecute(task, node2, info, blockSource, networkTick, tileCache, dirtyTasks);
					break;
				}
			}

			var allDone = true;
			if (task.nodes) {
				for (var ni3 = 0; ni3 < task.nodes.length; ni3++) {
					if (!task.nodes[ni3].done) { allDone = false; break; }
				}
			}
			if (allDone || !task.nodes || task.nodes.length === 0) {
				if (CraftingScheduler._completeTask(task, info, ti)) ti--;
			}
		}

		var dirtyKeys = Object.keys(dirtyTasks);
		if (dirtyKeys.length > 0) {
			for (var dk = 0; dk < dirtyKeys.length; dk++) info.notifyMonitorListeners(dirtyTasks[dirtyKeys[dk]]);
			info.refreshOpenedGrids();
		}
	},

	_tryExecute: function(task, node, info, blockSource, networkTick, tileCache, dirtyTasks) {
		var tick = networkTick || 0;
		var patternList = info.crafts[node.patternUid];
		var containers = info.getPatternContainers(node.patternUid);
		if ((!patternList || !patternList[0]) || containers.length === 0) {
			node._lastTry = tick;
			node._suspendSince = null;
			if (node.missingSince == null) node.missingSince = tick;
			else if (tick - node.missingSince >= CraftingScheduler.FAIL_TIMEOUT) {
				info.cancelTask(task.id);
			}
			return false;
		}
		node.missingSince = null;

		var anySuccess = false;
		var needsThrottle = false;
		for (var ci = 0; ci < containers.length; ci++) {
			var coordsStr = containers[ci];
			var parsed = info.patternContainersParsed ? info.patternContainersParsed[coordsStr] : null;
			if (!parsed) {
				var parts = coordsStr.split(',');
				if (parts.length < 3) {
					needsThrottle = true;
					continue;
				}
				parsed = { x: parseInt(parts[0]), y: parseInt(parts[1]), z: parseInt(parts[2]) };
				if (info.patternContainersParsed) info.patternContainersParsed[coordsStr] = parsed;
			}
			var cacheKey = coordsStr;
			var crafter = tileCache[cacheKey];
			if (crafter === undefined) {
				if (blockSource && !isChunkLoadedAtSafe(blockSource, parsed.x, parsed.y, parsed.z)) {
					tileCache[cacheKey] = null;
					info.incomplete = true;
					node.missingSince = null;
					node._suspendSince = node._suspendSince == null ? tick : node._suspendSince;
					if (tick - node._suspendSince >= CraftingScheduler.FAIL_TIMEOUT * 5) {
						info.cancelTask(task.id);
						return false;
					}
					continue;
				}
				crafter = tileCache[cacheKey] = World.getTileEntity(parsed.x, parsed.y, parsed.z, blockSource);
			}
			if (!crafter || !crafter.data || !crafter.data.isActive) continue;
			node._suspendSince = null;

			var container = PatternContainerRegistry.get(crafter);
			var interval = crafter.data.speed || 10;
			if (container) {
				if (typeof container.getUpdateInterval === 'function') {
					try {
						var customInterval = container.getUpdateInterval(crafter);
						if (customInterval && customInterval > 0) interval = customInterval;
					} catch(err) {
						if(Config.dev)Logger.Log('[PatternContainer] getUpdateInterval error: ' + err, 'RefinedStorageError');
					}
				} else if (typeof container.getSpeed === 'function') {
					try {
						var customSpeed = container.getSpeed(crafter);
						if (customSpeed && customSpeed > 0) interval = customSpeed;
					} catch(err) {
						if(Config.dev)Logger.Log('[PatternContainer] getSpeed error: ' + err, 'RefinedStorageError');
					}
				}
			}
			interval = Math.max(1, interval);
			if (task.ticks % interval !== 0) continue;

			var budget = 1;
			if (container && typeof container.getMaximumSuccessfulCraftingUpdates === 'function') {
				try {
					var customBudget = container.getMaximumSuccessfulCraftingUpdates(crafter);
					if (customBudget && customBudget > 0) budget = customBudget;
				} catch(err) {
					if(Config.dev)Logger.Log('[PatternContainer] getMaximumSuccessfulCraftingUpdates error: ' + err, 'RefinedStorageError');
				}
			} else {
				budget = CraftingScheduler.getContainerBudget(interval);
			}

			for (var bi = 0; bi < budget; bi++) {
				if (task.cancelled || task.completing || node.done || node.remaining <= 0) break;
				var success = CraftingScheduler._executeOne(task, node, crafter, info, container);
				if (success) {
					anySuccess = true;
					task.currentStep = (task.currentStep || 0) + 1;
					dirtyTasks[task.id] = task;
					if (task.currentStep % 5 === 0) _RS._emit("taskProgress", {netId: info.net_id, taskId: task.id, currentStep: task.currentStep, totalSteps: task.totalSteps || 0});
				} else {
					needsThrottle = true;
					break;
				}
			}
		}
		if (!anySuccess && needsThrottle) node._lastTry = tick;
		return anySuccess;
	},

	_executeOne: function(task, node, crafter, info, container) {
		if (task.cancelled || task.completing) return false;
		var pattern = info.crafts[node.patternUid];
		if (!pattern || !pattern[0]) return false;
		pattern = pattern[0];

		var front = null;
		var machineSide = -1;
		if (pattern.isProcessed) {
			if (!node.expectedByUid) task.cacheExpectedOutputs(node, pattern);
			var frontSide = getCrafterFrontSide(crafter);
			if (container && typeof container.getFrontSide === 'function') {
				try {
					var customSide = container.getFrontSide(crafter);
					if (customSide != null && customSide >= 0 && customSide <= 5) frontSide = customSide;
				} catch(err) {
					if(Config.dev)Logger.Log('[PatternContainer] getFrontSide error: ' + err, 'RefinedStorageError');
				}
			}
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
			_nb.storAlloc = _nb.total - _nb.bufAlloc;
			_nb.altUid = null;
			_nb.altData = 0;
			_nb.altBufAlloc = 0;
			_nb.altStor = 0;
			if (_nb.storAlloc > 0 && !info.itemCanBeDeleted({ id: _nb.id, data: _nb.data, count: _nb.storAlloc }, _nb.storAlloc)) {
				if (pattern.isProcessed) return false;
				var candDatas = {};
				var datas = info.just_items_map[_nb.id];
				if (datas) for (var di = 0; di < datas.length; di++) {
					if (_nb.data != -1 && datas[di] == _nb.data) continue;
					candDatas[datas[di]] = true;
				}
				for (var buid in task.buffer) {
					if (!task.buffer[buid] || task.buffer[buid] <= 0) continue;
					var bparts = buid.split('_');
					if (parseInt(bparts[0]) !== _nb.id) continue;
					var bdata = parseInt(bparts[1]);
					if (_nb.data != -1 && bdata == _nb.data) continue;
					candDatas[bdata] = true;
				}
				var found = false;
				for (var cd in candDatas) {
					var altUid = _nb.id + '_' + cd;
					var altData = parseInt(cd);
					var altBuf = Math.min(_nb.storAlloc, task.buffer[altUid] || 0);
					var altStorNeed = _nb.storAlloc - altBuf;
					if (altStorNeed > 0 && !info.itemCanBeDeleted({ id: _nb.id, data: altData, count: altStorNeed }, altStorNeed)) continue;
					_nb.altUid = altUid;
					_nb.altData = altData;
					_nb.altBufAlloc = altBuf;
					_nb.altStor = altStorNeed;
					found = true;
					break;
				}
				if (!found) return false;
			}
		}

		for (var ci0 = 0; ci0 < toCommit.length; ci0++) {
			var _slot = toCommit[ci0];
			var _nb2 = neededByUid[_slot.uid];
			var _need = _slot.needed;
			var _fromBuf = Math.min(_need, _nb2.bufAlloc);
			_nb2.bufAlloc -= _fromBuf;
			_need -= _fromBuf;
			_slot.fromBuffer = _fromBuf;
			var _fromStor = Math.min(_need, _nb2.storAlloc);
			_nb2.storAlloc -= _fromStor;
			_need -= _fromStor;
			_slot.fromStorage = _fromStor;
			_slot.fromAltBuffer = 0;
			_slot.fromAltStorage = 0;
			_slot.altUid = null;
			_slot.altData = 0;
			if (_need > 0 && _nb2.altUid) {
				var _fromAltBuf = Math.min(_need, _nb2.altBufAlloc);
				_nb2.altBufAlloc -= _fromAltBuf;
				_need -= _fromAltBuf;
				_slot.fromAltBuffer = _fromAltBuf;
				var _fromAltStor = Math.min(_need, _nb2.altStor);
				_nb2.altStor -= _fromAltStor;
				_need -= _fromAltStor;
				_slot.fromAltStorage = _fromAltStor;
				_slot.altUid = _nb2.altUid;
				_slot.altData = _nb2.altData;
			}
			if (_need > 0) return false;
		}

		for (var ci = 0; ci < toCommit.length; ci++) {
			var commit = toCommit[ci];
			if (commit.fromBuffer > 0) task.consumeFromBuffer(commit.uid, commit.fromBuffer);
			if (commit.fromAltBuffer > 0) task.consumeFromBuffer(commit.altUid, commit.fromAltBuffer);
			if (commit.fromStorage > 0) {
				info.deleteItem({ id: commit.id, data: commit.data, count: commit.fromStorage }, commit.fromStorage, true, ['autocraft']);
				if (task.toReserve && task.toReserve[commit.uid]) {
					task.toReserve[commit.uid] -= commit.fromStorage;
					if (task.toReserve[commit.uid] <= 0) delete task.toReserve[commit.uid];
				}
			}
			if (commit.fromAltStorage > 0) {
				info.deleteItem({ id: commit.id, data: commit.altData, count: commit.fromAltStorage }, commit.fromAltStorage, true, ['autocraft']);
				if (task.toReserve && task.toReserve[commit.altUid]) {
					task.toReserve[commit.altUid] -= commit.fromAltStorage;
					if (task.toReserve[commit.altUid] <= 0) delete task.toReserve[commit.altUid];
				}
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
					var refundRemainder = info.pushItem({ id: machineItem.id, data: machineItem.data, count: remaining, extra: null }, remaining, false, ['autocraft']);
					if (refundRemainder > 0) task.addToBuffer(machineItem.id + '_' + machineItem.data, refundRemainder);
				}
			}
		} else {
			for (var ri = 0; ri < pattern.result.length; ri++) {
				var result = pattern.result[ri];
				var resultCount = result.count || 1;
				var resultRemainder = info.pushItem({ id: result.id, data: result.data, count: resultCount, extra: null },
					resultCount, false, ['fromCrafter']);
				if (resultRemainder > 0) task.addToBuffer(result.id + '_' + result.data, resultRemainder);
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
		// OPT-10 contract: only called from processTick after its allDone scan passed.
		if (task.flushBuffer && !task.flushBuffer(info)) {
			task.completingFlush = true;
			return false;
		}
		task.completingFlush = false;
		task.completing = true;

		var pidx = info.providingCrafts.indexOf(task);
		if (pidx != -1) info.providingCrafts.splice(pidx, 1);
		var tidx = info.craftingTasks.indexOf(task);
		if (tidx != -1) info.craftingTasks.splice(tidx, 1);

		info.removeScheduledCount(task);
		info.unregisterTaskExpectedOutputs(task);
		info.notifyMonitorListeners(task);
		info.refreshOpenedGrids();
		_RS._emit("taskCompleted", {netId: info.net_id, task: {id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount}});
		return true;
	}
};
