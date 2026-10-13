// RS policy for CraftTreeExecutor.scheduler.

var RS_SCHED_INTERVAL_DEFAULT = 10; // Default crafter interval in ticks.
// taskProgress emit cadence: one per task per tick window; override with Config.craftingProgressTicks.
var CRAFT_PROGRESS_THROTTLE_TICKS = 5;

function rsSchedParseCoords(info, coordsStr) {
	if (!coordsStr) return null;
	var parsed = info.patternContainersParsed ? info.patternContainersParsed[coordsStr] : null;
	if (parsed) return parsed;
	var parts = coordsStr.split(',');
	if (parts.length < 3) return null;
	parsed = { x: parseInt(parts[0]), y: parseInt(parts[1]), z: parseInt(parts[2]) };
	if (info.patternContainersParsed) info.patternContainersParsed[coordsStr] = parsed;
	return parsed;
}

function rsSchedInterval(container) {
	var tile = container && container.__cpTile;
	var interval = (tile && tile.data && tile.data.speed) || RS_SCHED_INTERVAL_DEFAULT;
	if (container) {
		if (typeof container.getUpdateInterval === 'function') {
			try {
				var customInterval = container.getUpdateInterval(tile);
				if (customInterval && customInterval > 0) interval = customInterval;
			} catch (err) { if (Config.dev) Logger.Log('[PatternContainer] getUpdateInterval error: ' + err, 'RefinedStorageError'); }
		} else if (typeof container.getSpeed === 'function') {
			try {
				var customSpeed = container.getSpeed(tile);
				if (customSpeed && customSpeed > 0) interval = customSpeed;
			} catch (err) { if (Config.dev) Logger.Log('[PatternContainer] getSpeed error: ' + err, 'RefinedStorageError'); }
		}
	}
	return Math.max(1, interval);
}

function rsSchedBudget(container) {
	if (container && typeof container.getMaximumSuccessfulCraftingUpdates === 'function') {
		try {
			var customBudget = container.getMaximumSuccessfulCraftingUpdates(container.__cpTile);
			if (customBudget && customBudget > 0) return customBudget;
		} catch (err) { if (Config.dev) Logger.Log('[PatternContainer] getMaximumSuccessfulCraftingUpdates error: ' + err, 'RefinedStorageError'); }
	}
	return CraftTreeExecutor.scheduler.getContainerBudget(rsSchedInterval(container));
}

// Resolve the craft for a plan node. Keyed (pattern content) first — Java-like
// pattern->containers pairing; legacy result-uid tasks fall back to the craft
// whose coordsId matches the executing container, then to the first registered.
function rsResultUid(uid) {
	var bar = uid.lastIndexOf("|");
	return bar === -1 ? uid : uid.substring(bar + 1);
}

function rsPickCraft(info, uid, coordsId) {
	var cached = info.craftsByKey ? info.craftsByKey[uid] : null;
	if (cached) return cached;
	var list = info.crafts ? info.crafts[uid] : null;
	if (!list || !list.length) list = info.crafts ? info.crafts[rsResultUid(uid)] : null;
	if (!list || !list.length) return null;
	if (coordsId) {
		for (var i = 0; i < list.length; i++) {
			if (list[i].coordsId === coordsId) return list[i];
		}
	}
	return list[0];
}

function buildSchedulerCtx(info, blockSource, networkTick) {
	// Caches live for one network tick; the returned values are read-only live references.
	var cacheLists = {}; // patternUid -> entries[]
	var cacheTiles = {}; // coordsStr  -> { tile, container }
	var cacheLoaded = {}; // coordsStr -> raw chunk test result (one native check per coords per tick)
	var cachePatterns = Object.create(null); // patternUid -> craft | null (per tick)

	/* One chunk test per unique coords per tick: resolveTile and the executor's
	 * isChunkLoaded share the result. The value cannot change while this controller
	 * tick runs (single-threaded; chunk events dispatch between ticks). */
	function chunkLoadedRaw(coordsStr) {
		if (Object.prototype.hasOwnProperty.call(cacheLoaded, coordsStr)) return cacheLoaded[coordsStr];
		var parsed = rsSchedParseCoords(info, coordsStr);
		return (cacheLoaded[coordsStr] = parsed
			? isChunkLoadedAtSafe(blockSource, parsed.x, parsed.y, parsed.z)
			: undefined);
	}

	function resolveTile(coordsStr) {
		if (Object.prototype.hasOwnProperty.call(cacheTiles, coordsStr)) return cacheTiles[coordsStr];
		var parsed = rsSchedParseCoords(info, coordsStr);
		var tile = null, container = null;
		if (parsed && chunkLoadedRaw(coordsStr)) {
			tile = World.getTileEntity(parsed.x, parsed.y, parsed.z, blockSource);
			container = tile ? PatternContainerRegistry.get(tile) : null;
			// interval/budget callbacks only receive the container → keep the tile on it.
			if (container && !container.__cpTile) container.__cpTile = tile;
		}
		return (cacheTiles[coordsStr] = { tile: tile, container: container });
	}

	return {
		ticks: networkTick,
		parallel: Config['parallelCrafting (Java like)'] === true,

		getContainers: function (patternUid) {
			if (Object.prototype.hasOwnProperty.call(cacheLists, patternUid)) return cacheLists[patternUid];
			var coords = (info.patternToContainersByKey && info.patternToContainersByKey[patternUid])
				? info.patternToContainersByKey[patternUid]
				: info.getPatternContainers(rsResultUid(patternUid));
			var out = [];
			for (var i = 0; i < coords.length; i++) {
				var r = resolveTile(coords[i]);
				out.push({ coordsId: coords[i], tile: r.tile, container: r.container });
			}
			return (cacheLists[patternUid] = out);
		},
		getContainer: function (coordsId) { return resolveTile(coordsId).container; },
		getInterval: rsSchedInterval,
		getBudget: rsSchedBudget,
		isChunkLoaded: function (coordsId) {
			var parsed = info.patternContainersParsed ? info.patternContainersParsed[coordsId] : null;
			if (!parsed) return true; // unknown → let getContainers decide
			return chunkLoadedRaw(coordsId) !== false;
		},
		getPattern: function (uid) {
			if (uid in cachePatterns) return cachePatterns[uid];
			return (cachePatterns[uid] = rsPickCraft(info, uid, null));
		},

		// Per-node execution (allocation + commit + machine) stays in CraftingScheduler.
		executeNode: function (task, node, entry) {
			var ok = CraftingScheduler._executeOne(task, node, entry.tile, info, entry.container, entry.coordsId);
			return { failed: !ok };
		},

		markIncomplete: function () { info.incomplete = true; },
		removeScheduledCount: function (task) { info.removeScheduledCount(task); },
		unregisterTaskExpectedOutputs: function (task) { info.unregisterTaskExpectedOutputs(task); },
		onMonitorDirty: function (task) { info.notifyMonitorListeners(task); },
		refreshOpenedGrids: function () { info.refreshOpenedGrids(); },
		onProgress: function (task, executed) {
			var now = (typeof TickScheduler != "undefined" && TickScheduler && TickScheduler.global) ? TickScheduler.global.ticks : 0;
			var every = (typeof Config != "undefined" && Config && Config.craftingProgressTicks > 0)
				? Math.floor(Config.craftingProgressTicks) : CRAFT_PROGRESS_THROTTLE_TICKS;
			// reset-safe: a rewound tick counter (admin().resetAll) must not
			// throttle forever (negative diff)
			if (task._lastProgressTick != null && now >= task._lastProgressTick && now - task._lastProgressTick < every) return;
			task._lastProgressTick = now;
			_RS._emit("taskProgress", { netId: info.net_id, taskId: task.id, currentStep: task.currentStep, totalSteps: task.totalSteps || 0 });
		},
		onTaskCancelled: function (task, reason) {
			_RS._emit("taskCancelled", { netId: info.net_id, taskId: task.id });
		},
		onTaskComplete: function (task) {
			var pidx = info.providingCrafts.indexOf(task); if (pidx != -1) info.providingCrafts.splice(pidx, 1);
			var tidx = info.craftingTasks.indexOf(task); if (tidx != -1) info.craftingTasks.splice(tidx, 1);
			_RS._emit("taskCompleted", { netId: info.net_id, task: { id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount } });
		},
		onTaskRemoved: function (task) {
			var pidx = info.providingCrafts.indexOf(task); if (pidx != -1) info.providingCrafts.splice(pidx, 1);
			var tidx = info.craftingTasks.indexOf(task); if (tidx != -1) info.craftingTasks.splice(tidx, 1);
			_RS._emit("taskRemoved", { netId: info.net_id });
		}
	};
}

// FIFO task loop (parity with Java RS): process tasks oldest-first. A task may
// remove itself during processTick (onTaskComplete/onTaskRemoved splice the
// array); adjust the index so the successor is not skipped.
function rsProcessCraftingTasks(info, ctx) {
	var tasks = info.craftingTasks;
	for (var ti = 0; ti < tasks.length; ti++) {
		var task = tasks[ti];
		if (!task) { tasks.splice(ti, 1); ti--; continue; }
		CraftTreeExecutor.scheduler.processTick(task, ctx);
		if (tasks[ti] !== task) ti--;
	}
}
