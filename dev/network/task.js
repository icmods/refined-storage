var CraftingTask = {

	create: function(fullCrafts, info, requestedItem, requestedCount) {
		var plan = fullCrafts.plan;
		if (!plan) return fullCrafts;

		var totalSteps = 0;
		var nodes = [];
		for (var ni = 0; ni < plan.nodes.length; ni++) {
			var pn = plan.nodes[ni];
			totalSteps += pn.quantity;
			nodes.push({
				patternUid: pn.patternUid,
				isProcessing: pn.isProcessing || false,
				containerCoords: pn.containerCoords,
				quantity: pn.quantity,
				remaining: pn.quantity,
				done: false,
				requirements: (pn.requirements || []).map(function(r) {
					return { uid: r.uid, count: r.count, provided: 0, altUids: r.altUids || [] };
				})
			});
		}

		var task = Object.assign({}, fullCrafts, {
			id: CraftingTask._generateId(),
			requestedUid: getItemUid(requestedItem),
			requestedCount: requestedCount || fullCrafts.results[0].count,
			totalSteps: totalSteps,
			currentStep: 0,
			startTime: World.getThreadTime(),
			cancelled: false,
			nodes: nodes,
			buffer: {},
			toReserve: Object.assign({}, plan.toReserve || {}),
			internalStorage: [],

			reserveItems: function(info) {
				for (var uid in this.toReserve) {
					var count = this.toReserve[uid];
					if (count <= 0) continue;
					var parts = uid.split('_');
					var item = { id: parseInt(parts[0]), data: parseInt(parts[1]), count: count, extra: null };
					var deleted = info.deleteItem(item, count, true);
					var reserved = count - deleted;
					if (reserved > 0) {
						this.buffer[uid] = (this.buffer[uid] || 0) + reserved;
					}
					Logger.Log('[TASK] reserveItems: uid=' + uid + ' requested=' + count + ' deleted=' + deleted + ' reserved=' + reserved + ' bufferNow=' + (this.buffer[uid] || 0) + ' toReserveLeft=' + Object.keys(this.toReserve).length, 'RS_DEBUG');
					if (deleted === 0) {
						delete this.toReserve[uid];
					} else {
						this.toReserve[uid] = deleted;
					}
				}
				return Object.keys(this.toReserve).length === 0;
			},

			flushBuffer: function(info) {
				for (var uid in this.buffer) {
					var count = this.buffer[uid];
					if (count <= 0) continue;
					var parts = uid.split('_');
					info.pushItem({ id: parseInt(parts[0]), data: parseInt(parts[1]), count: count, extra: null }, count, false, ['autocraft']);
				}
				this.buffer = {};
			},

			getProgress: function() {
				if (this.totalSteps === 0) return 0;
				return Math.floor(this.currentStep * 100 / this.totalSteps);
			},

			consumeFromBuffer: function(uid, count) {
				var available = this.buffer[uid] || 0;
				var take = Math.min(count, available);
				if (take > 0) {
					this.buffer[uid] -= take;
					if (this.buffer[uid] <= 0) delete this.buffer[uid];
				}
				Logger.Log('[TASK] consumeFromBuffer: uid=' + uid + ' needed=' + count + ' available=' + available + ' take=' + take + ' left=' + (this.buffer[uid] || 0), 'RS_DEBUG');
				return take;
			},

			addToBuffer: function(uid, count) {
				this.buffer[uid] = (this.buffer[uid] || 0) + count;
			}
		});
		Logger.Log('[TASK] Created: id=' + task.id + ' uid=' + task.requestedUid + ' count=' + task.requestedCount + ' nodes=' + nodes.length + ' totalSteps=' + totalSteps, 'RS_DEBUG');

		return task;
	},

	_generateId: function() {
		return 'ct_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
	},

	serialize: function(task) {
		return {
			id: task.id,
			requestedUid: task.requestedUid,
			requestedCount: task.requestedCount,
			totalSteps: task.totalSteps,
			currentStep: task.currentStep || 0,
			startTime: task.startTime,
			cancelled: false,
			nodes: (task.nodes || []).map(function(n) { return {
				patternUid: n.patternUid,
				isProcessing: n.isProcessing || false,
				containerCoords: n.containerCoords,
				quantity: n.quantity,
				remaining: n.remaining,
				done: n.done,
				requirements: n.requirements || []
			}; }),
			buffer: task.buffer || {},
			toReserve: task.toReserve || {},
			internalStorage: task.internalStorage || [],
			results: task.results || [],
			crafts: (task.crafts || []).map(function(c) { return {
				craftable: c.craftable,
				result: c.result,
				count: c.count,
				allIngridients: c.allIngridients || [],
				oneCountIngridients: c.oneCountIngridients || [],
				completedIngridients: c.completedIngridients || [],
				needCrafts: [],
				isRoot: c.isRoot || false,
				craft: c.craft ? { coordsId: c.craft.coordsId, isProcessed: c.craft.isProcessed, result: c.craft.result, ingridients: c.craft.ingridients } : null
			}; }),
			flatSteps: task.flatSteps || []
		};
	},

	restore: function(data, info) {
		var requestedItem = data.results && data.results[0]
			? { id: data.results[0].id, data: data.results[0].data, extra: null } : { id: 0, data: 0 };
		var fakeFullCrafts = {
			results: data.results,
			crafts: data.crafts,
			flatSteps: data.flatSteps,
			plan: { nodes: data.nodes, toReserve: data.toReserve, toCraft: {}, toTake: {}, missing: {} }
		};
		var task = CraftingTask.create(fakeFullCrafts, info, requestedItem, data.requestedCount);
		task.id = data.id;
		task.startTime = data.startTime;
		task.totalSteps = data.totalSteps;
		task.currentStep = data.currentStep || 0;
		task.buffer = data.buffer || {};
		task.toReserve = data.toReserve || {};
		task.internalStorage = data.internalStorage || [];
		for (var ni = 0; ni < task.nodes.length; ni++) {
			if (data.nodes[ni]) {
				task.nodes[ni].remaining = data.nodes[ni].remaining;
				task.nodes[ni].done = data.nodes[ni].done;
			}
		}
		return task;
	}
};
