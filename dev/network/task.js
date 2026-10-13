var CraftingTask = {

	create: function(fullCrafts, info, requestedItem, requestedCount) {
		var task = CraftTreeExecutor.createTask(fullCrafts, buildCraftHost(info), requestedItem, requestedCount);
		if (!task) return null;
		if (task === fullCrafts) return fullCrafts;
		task.id = CraftingTask._generateId();
		task._info = info;
		task.requestedUid = getItemUid(requestedItem);
		task.requestedItem = requestedItem ? {
			id: requestedItem.id,
			data: requestedItem.data,
			count: requestedCount || requestedItem.count || 1,
			extra: requestedItem.extra || null
		} : null;
		task.startTime = World.getThreadTime();
		for (var k in fullCrafts) {
			if (k === "results" || k === "crafts") continue;
			task[k] = fullCrafts[k];
		}
		return task;
	},

	_generateId: function() {
		return 'ct_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
	},

	serialize: function(task) {
		return {
			id: task.id,
			requestedUid: task.requestedUid,
			requestedItem: task.requestedItem || null,
			requestedCount: task.requestedCount,
			totalSteps: task.totalSteps,
			currentStep: task.currentStep || 0,
			ticks: task.ticks || 0,
			startTime: task.startTime,
			cancelled: task.cancelled === true,
			completingFlush: task.completingFlush === true,
			nodes: (task.nodes || []).map(function(n) { return {
				patternUid: n.patternUid,
				isProcessing: n.isProcessing || false,
				containerCoords: n.containerCoords,
				quantity: n.quantity,
				remaining: n.remaining,
				done: n.done,
				received: n.received || 0,
				expectedByUid: n.expectedByUid || null,
				receivedByUid: n.receivedByUid || {},
				requirements: n.requirements || []
			}; }),
			buffer: task.buffer || {},
			toReserve: task.toReserve || {},
			reservedExtras: (task._host && task._host.reservedExtras) ? task._host.reservedExtras : {},
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
		if (!data || !data.id || !Array.isArray(data.nodes) || !Array.isArray(data.results) || !Array.isArray(data.crafts)) {
			throw new Error('invalid persisted task data');
		}
		var task = CraftTreeExecutor.restore(data, buildCraftHost(info, data.reservedExtras));
		task.id = data.id;
		task._info = info;
		task.startTime = data.startTime;
		task.requestedUid = data.requestedUid || task.requestedUid;
		if (data.requestedItem) {
			task.requestedItem = data.requestedItem;
			task.requestedUid = getItemUid(data.requestedItem);
		} else {
			task.requestedItem = null;
			if (data.requestedUid && data.requestedUid.indexOf(":") !== -1) {
				throw new Error('quarantine: requested extras cannot be rebuilt from uid');
			}
		}
		task.flatSteps = data.flatSteps || [];
		return task;
	}
};
