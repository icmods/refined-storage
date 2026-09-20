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
		for (var ii = 0; ii < pattern.ingridients.length; ii++) {
			var ingr = pattern.ingridients[ii];
			if (!ingr || !ingr.id) continue;
			var uid = getItemUid(ingr);
			var needed = ingr.count || 1;
			var nb = neededByUid[uid];
			if (!nb) neededByUid[uid] = nb = { id: ingr.id, data: ingr.data, extra: ingr.extra || null, total: 0 };
			nb.total += needed;
			if (pattern.isProcessed) {
				var canReceive = front.getReceivingItemCount({ id: ingr.id, data: ingr.data, count: needed, extra: null }, machineSide);
				if (canReceive < needed) return false;
			}
			toCommit.push({ id: ingr.id, data: ingr.data, uid: uid, extra: ingr.extra || null, needed: needed, fromBuffer: 0, fromStorage: 0 });
		}

		for (var cuid in neededByUid) {
			var _nb = neededByUid[cuid];
			_nb.bufAlloc = Math.min(_nb.total, task.buffer[cuid] || 0);
			_nb.storAlloc = _nb.total - _nb.bufAlloc;
			_nb.altUid = null;
			_nb.altData = 0;
			_nb.altBufAlloc = 0;
			_nb.altStor = 0;
			if (_nb.storAlloc > 0 && !info.itemCanBeDeleted({ id: _nb.id, data: _nb.data, count: _nb.storAlloc, extra: _nb.extra }, _nb.storAlloc)) {
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
				info.deleteItem({ id: commit.id, data: commit.data, count: commit.fromStorage, extra: commit.extra }, commit.fromStorage, true, ['autocraft']);
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
