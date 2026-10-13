/* Effective amount taken by a storage operation that returns the unfulfilled remainder. */
function _rsTakenCount(planned, remainder) {
	if (typeof remainder != 'number' || !isFinite(remainder)) return 0;
	var taken = planned - remainder;
	return taken > 0 ? taken : 0;
}

/* Concrete variant for a workbench tool entry (the pattern stores one damage, the
 * network may hold another / several). Prefers the per-task pin while it still
 * exists, then the encoded damage, then a variant from the task buffer, then the
 * first variant in storage. Deterministic for a given inventory state. */
function _rsResolveToolData(task, info, itemId, wantedData) {
	var wanted = (wantedData != null && wantedData > -1) ? wantedData : -1;
	if (info && info.itemsIndex && task) {
		if (!task._rsToolPin) task._rsToolPin = {};
		var pinned = task._rsToolPin[itemId];
		if (pinned != null && info.itemsIndex[getItemUid({ id: itemId, data: pinned, extra: null })] != null) return pinned;
		if (wanted > -1 && info.itemsIndex[getItemUid({ id: itemId, data: wanted, extra: null })] != null) {
			task._rsToolPin[itemId] = wanted;
			return wanted;
		}
		if (task.buffer && typeof CoreKit != 'undefined' && CoreKit.Items && CoreKit.Items.parseUid) {
			for (var buid in task.buffer) {
				if (!task.buffer[buid] || task.buffer[buid] <= 0) continue;
				var parts = CoreKit.Items.parseUid(buid);
				if (parts.id !== itemId) continue;
				task._rsToolPin[itemId] = parts.data;
				return parts.data;
			}
		}
		var datas = info.just_items_map ? info.just_items_map[itemId] : null;
		if (datas && datas.length) {
			task._rsToolPin[itemId] = datas[0];
			return datas[0];
		}
	}
	return wanted > -1 ? wanted : 0;
}

/* Put back everything a node attempt already committed (buffer and storage parts).
 * Behavior-identical to the shortfall refund; shared by shortfall and the
 * workbench-callback failure path. */
function _rsRefundCommits(task, toCommit) {
	for (var i = 0; i < toCommit.length; i++) {
		var r = toCommit[i];
		if (r.gotBuffer > 0) task.addToBuffer(r.uid, r.gotBuffer);
		if (r.gotAltBuffer > 0) task.addToBuffer(r.altUid, r.gotAltBuffer);
		if (r.gotStorage > 0) task.addToBuffer(r.uid, r.gotStorage);
		if (r.gotAltStorage > 0) task.addToBuffer(r.altUid, r.gotAltStorage);
	}
}

/*
 * Workbench callback execution for a non-processed node: the committed items are
 * placed into a scratch workbench field, the engine recipe callback runs (tool
 * wear / consume), and the captured result + field leftovers are returned to the
 * network (remainder to the task buffer). On failure the caller refunds the
 * committed items; the field is dropped (the originals come back via refund).
 */
function _rsWorkbenchExecute(task, node, pattern, info, toCommit) {
	var meta = (typeof rsWorkbenchRecipeForCraft === 'function') ? rsWorkbenchRecipeForCraft(pattern) : null;
	var recipe = meta && meta.recipe;
	if (!recipe || typeof RecipeIndex === 'undefined' || !RecipeIndex || typeof RecipeIndex.executeWorkbenchRecipe !== 'function') {
		task._rsWbFail = 'no-recipe';
		return false;
	}

	var fieldItems = [];
	for (var i = 0; i < toCommit.length && i < 9; i++) {
		var c = toCommit[i];
		var taken = c.gotBuffer + c.gotStorage + c.gotAltBuffer + c.gotAltStorage;
		if (taken <= 0) { fieldItems.push(null); continue; }
		var data = (c.gotAltBuffer > 0 || c.gotAltStorage > 0) ? c.altData : c.data;
		fieldItems.push({ id: c.id, count: taken, data: data, extra: c.extra || null });
	}

	/* Prefer the engine constructors visible in the mod scope (the manual crafting
	 * grid uses the same globals); the library falls back to its own lookup. */
	var wbOptions = null;
	if (typeof ItemContainer != "undefined" || typeof WorkbenchFieldAPI != "undefined") {
		wbOptions = {};
		if (typeof ItemContainer != "undefined") wbOptions.ItemContainer = ItemContainer;
		if (typeof WorkbenchFieldAPI != "undefined") wbOptions.WorkbenchFieldAPI = WorkbenchFieldAPI;
	}
	var res = RecipeIndex.executeWorkbenchRecipe(recipe, fieldItems, wbOptions);
	if (!res || !res.ok) {
		task._rsWbFail = (res && res.prevented) ? 'prevented' : 'callback-failed';
		return false;
	}
	task._rsWbFail = null;

	var result = res.result || null;
	if (result && result.id) {
		var rCount = result.count || 1;
		var rRem = info.pushItem({ id: result.id, data: result.data || 0, count: rCount, extra: result.extra || null }, rCount, true, ['fromCrafter']);
		if (rRem > 0) task.addToBuffer(getItemUid({ id: result.id, data: result.data || 0, extra: result.extra || null }), rRem);
	}
	for (var k = 0; k < res.slots.length; k++) {
		var slot = res.slots[k];
		if (!slot || !slot.id || slot.count <= 0) continue;
		var leftUid = getItemUid({ id: slot.id, data: slot.data, extra: slot.extra || null });
		var sRem = info.pushItem({ id: slot.id, data: slot.data, count: slot.count, extra: slot.extra || null }, slot.count, true, ['autocraft']);
		if (sRem > 0) task.addToBuffer(leftUid, sRem);
	}

	/* Next variant for each tool: damaged tool -> its new damage; consumed -> clear. */
	if (task._rsToolPin && pattern.toolIds) {
		for (var tid in pattern.toolIds) {
			var found = null;
			for (var si = 0; si < res.slots.length; si++) {
				var ss = res.slots[si];
				if (ss && ss.id == tid && ss.count > 0) { found = ss.data; break; }
			}
			if (found != null) task._rsToolPin[tid] = found;
			else delete task._rsToolPin[tid];
		}
	}
	return true;
}

var CraftingScheduler = {

	_executeOne: function(task, node, crafter, info, container, coordsId) {
		if (task.cancelled || task.completing) return false;
		if (!crafter || !crafter.data || !crafter.data.isActive) return false;
		var pattern = rsPickCraft(info, node.patternUid, coordsId);
		if (!pattern) return false;

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
		/* Workbench tool entries (derived at pattern registration) match any damage. */
		var toolIds = (pattern.toolIds && !pattern.isProcessed) ? pattern.toolIds : null;
		for (var ii = 0; ii < pattern.ingridients.length; ii++) {
			var ingr = pattern.ingridients[ii];
			if (!ingr || !ingr.id) continue;
			var entryData = ingr.data;
			var uid;
			if (toolIds && toolIds[ingr.id]) {
				entryData = _rsResolveToolData(task, info, ingr.id, ingr.data);
				uid = getItemUid({ id: ingr.id, data: entryData, extra: ingr.extra || null });
			} else {
				uid = getItemUid(ingr);
			}
			var needed = ingr.count || 1;
			var nb = neededByUid[uid];
			if (!nb) neededByUid[uid] = nb = { id: ingr.id, data: entryData, extra: ingr.extra || null, total: 0 };
			nb.total += needed;
			if (pattern.isProcessed) {
				var canReceive = front.getReceivingItemCount({ id: ingr.id, data: ingr.data, count: needed, extra: null }, machineSide);
				if (canReceive < needed) return false;
			}
			toCommit.push({ id: ingr.id, data: entryData, uid: uid, extra: ingr.extra || null, needed: needed, fromBuffer: 0, fromStorage: 0 });
		}

		for (var cuid in neededByUid) {
			var _nb = neededByUid[cuid];
			_nb.bufAlloc = Math.min(_nb.total, task.buffer[cuid] || 0);
			_nb.storAlloc = _nb.total - _nb.bufAlloc;
			_nb.altUid = null;
			_nb.altData = 0;
			_nb.altBufAlloc = 0;
			_nb.altStor = 0;
			if (_nb.storAlloc > 0 && !info.itemCanBeDeleted({ id: _nb.id, data: _nb.data, count: _nb.storAlloc, extra: _nb.extra }, _nb.storAlloc, cuid)) {
				if (toolIds && toolIds[_nb.id] && Config.dev && !task._rsToolWarned) {
					task._rsToolWarned = true;
					Logger.Log('[workbench] tool not available in network: item ' + _nb.id, 'RefinedStorageError');
				}
				if (pattern.isProcessed) return false;
				/* Exact patterns (oredict disabled) only ever consume the configured variant. */
				if (!pattern.oredictEnabled) return false;
				var candDatas = {};
				var datas = info.just_items_map[_nb.id];
				if (datas) for (var di = 0; di < datas.length; di++) {
					if (_nb.data != -1 && datas[di] == _nb.data) continue;
					candDatas[datas[di]] = true;
				}
				for (var buid in task.buffer) {
					if (!task.buffer[buid] || task.buffer[buid] <= 0) continue;
					var bparts = CoreKit.Items.parseUid(buid);
					if (bparts.id !== _nb.id) continue;
					var bdata = bparts.data;
					if (_nb.data != -1 && bdata == _nb.data) continue;
					candDatas[bdata] = true;
				}
				var found = false;
				for (var cd in candDatas) {
					var altData = parseInt(cd);
					var altUid = getItemUid({ id: _nb.id, data: altData, extra: null });
					var altBuf = Math.min(_nb.storAlloc, task.buffer[altUid] || 0);
					var altStorNeed = _nb.storAlloc - altBuf;
					if (altStorNeed > 0 && !info.itemCanBeDeleted({ id: _nb.id, data: altData, count: altStorNeed }, altStorNeed, altUid)) continue;
					_nb.altUid = altUid;
					_nb.altData = altData;
					_nb.altBufAlloc = altBuf;
					_nb.altStor = altStorNeed;
					/* The primary storage cannot satisfy the request: move the whole storage
					 * allocation to the alternative so the commit loop consumes the alt. */
					_nb.storAlloc = 0;
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

		var shortfall = false;
		for (var ci = 0; ci < toCommit.length; ci++) {
			var commit = toCommit[ci];
			commit.gotBuffer = 0;
			commit.gotAltBuffer = 0;
			commit.gotStorage = 0;
			commit.gotAltStorage = 0;
			if (commit.fromBuffer > 0) { task.consumeFromBuffer(commit.uid, commit.fromBuffer); commit.gotBuffer = commit.fromBuffer; }
			if (commit.fromAltBuffer > 0) { task.consumeFromBuffer(commit.altUid, commit.fromAltBuffer); commit.gotAltBuffer = commit.fromAltBuffer; }
			if (commit.fromStorage > 0) {
				var _remStore = info.deleteItem({ id: commit.id, data: commit.data, count: commit.fromStorage, extra: commit.extra }, commit.fromStorage, true, ['autocraft'], commit.uid);
				commit.gotStorage = _rsTakenCount(commit.fromStorage, _remStore);
				if (commit.gotStorage < commit.fromStorage) shortfall = true;
				if (task.toReserve && task.toReserve[commit.uid]) {
					task.toReserve[commit.uid] -= commit.fromStorage;
					if (task.toReserve[commit.uid] <= 0) delete task.toReserve[commit.uid];
				}
			}
			if (commit.fromAltStorage > 0) {
				var _remAlt = info.deleteItem({ id: commit.id, data: commit.altData, count: commit.fromAltStorage }, commit.fromAltStorage, true, ['autocraft'], commit.altUid);
				commit.gotAltStorage = _rsTakenCount(commit.fromAltStorage, _remAlt);
				if (commit.gotAltStorage < commit.fromAltStorage) shortfall = true;
				if (task.toReserve && task.toReserve[commit.altUid]) {
					task.toReserve[commit.altUid] -= commit.fromAltStorage;
					if (task.toReserve[commit.altUid] <= 0) delete task.toReserve[commit.altUid];
				}
			}
		}
		if (shortfall) {
			/* The storage under-delivered (listeners or a race): put everything back into the
			 * task buffer and abort the node attempt instead of producing a free output. */
			_rsRefundCommits(task, toCommit);
			return false;
		}

		if (pattern.isProcessed) {
			for (var di = 0; di < toCommit.length; di++) {
				var machineItem = { id: toCommit[di].id, data: toCommit[di].data, count: toCommit[di].needed, extra: toCommit[di].extra };
				var remaining = toCommit[di].needed;
				var slots = front.getInputSlots(machineSide);
				for (var si = 0; si < slots.length && remaining > 0; si++) {
					remaining -= front.addItemToSlot(slots[si], machineItem, remaining);
				}
				if (remaining > 0) {
					var refundRemainder = info.pushItem({ id: machineItem.id, data: machineItem.data, count: remaining, extra: machineItem.extra || null }, remaining, true, ['autocraft']);
					if (refundRemainder > 0) task.addToBuffer(getItemUid(machineItem), refundRemainder);
				}
			}
		} else if (pattern.hasWorkbenchCallback && toolIds) {
			/* Tool recipe: run the engine recipe callback and capture the field. */
			if (!_rsWorkbenchExecute(task, node, pattern, info, toCommit)) {
				if (Config.dev && !task._rsWbWarned) {
					task._rsWbWarned = true;
					Logger.Log('[workbench] execution failed (' + (task._rsWbFail || 'unknown') + ') for ' + node.patternUid, 'RefinedStorageError');
				}
				_rsRefundCommits(task, toCommit);
				return false;
			}
		} else {
			for (var ri = 0; ri < pattern.result.length; ri++) {
				var result = pattern.result[ri];
				var resultCount = result.count || 1;
				var resultRemainder = info.pushItem({ id: result.id, data: result.data, count: resultCount, extra: result.extra || null },
					resultCount, true, ['fromCrafter']);
				if (resultRemainder > 0) task.addToBuffer(getItemUid(result), resultRemainder);
			}
		}

		node.remaining--;
		task.currentStep = (task.currentStep || 0) + 1;

		if (node.remaining <= 0 && (!pattern.isProcessed || task.outputsSatisfied(node))) {
			node.done = true;
			if (pattern.isProcessed && task.unregisterExpectedOutputs) task.unregisterExpectedOutputs(node);
		}

		return true;
	},
};
