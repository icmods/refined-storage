var REQUEST_THROTTLE_TICKS = 60;
var CRAFT_THROTTLE_TICKS = 5;
// While autocrafting runs, opened grids are refreshed at most once per window.
var GRID_REFRESH_THROTTLE_TICKS = 5;
// Monitor notifications are coalesced: at most one burst per network per 5 ticks.
var MONITOR_NOTIFY_THROTTLE_TICKS = 5;

var StorageProviders = {};

// provider.getEntries(tile) returns live DiskData-shaped entries, mutated in place.
function registerStorageProvider(blockId, provider) {
	if (!blockId || !provider || typeof provider.getEntries !== 'function') return false;
	StorageProviders[String(blockId)] = provider;
	return true;
}

function getStorageProvider(blockId) {
	return StorageProviders[String(blockId)] || null;
}

var _pendingUpdateItems = {};

/* Wildcard data (unspecified / -1) or an extra sentinel is rewritten by
 * itemCanBeDeleted/deleteItem, so a caller-provided uid cannot be reused. */
function rsIdentityMayResolve(item){
	if(!item) return true;
	if((!item.data && item.data != 0) || item.data == -1) return true;
	if(item.extra === undefined) return false; // normalized to null; identity unchanged
	return (!item.extra && item.extra != null) || item.extra === -1;
}

function requestNetworkUpdateItems(info) {
	if (info && info.net_id != 'f') _pendingUpdateItems[info.net_id] = info;
}

var NetworkInfo = {
	create: function(_data, controllerTile, netId) {
		var controllerRef = { tile: controllerTile };
		return {
			net_id: netId,
			craftsIDS: {},
			crafts: {},
			patternToContainers: {},
			patternContainersParsed: {},
			craftsByKey: {},
			patternToContainersByKey: {},
			apiPatterns: {},
			disk_map: [],
			just_items_map: {},
			just_items_map_extra: {},
			items_map: [],
			items: [],
			itemsIndex: {},
			openedGrids: [],
			storage: 0,
			stored: 0,
			// Public addon hooks: push(fn) into either array for the network's info;
			// fn(item, count, tags) may return true (unsubscribe) or a number (new count).
			itemAddListeners: [],
			itemRemoveListeners: [],
			providingCrafts: [],
			craftingTasks: [],
			scheduledByUid: {},
			expectedOutputIndex: {},
			netMapDirty: false,
			_gridRefreshPending: false,
			_gridRefreshPendingFull: false,
			_gridRefreshTimerArmed: false,
			_lastGridRefreshTick: 0,
			incomplete: false,
			updateControllerTile: function(tile) {
				controllerRef.tile = tile;
			},
			monitorListeners: [],
			lastFailedRequestTick: {},
			isRequestThrottled: function(sourceKey, now) {
				return MpCore.requestGuard(this, REQUEST_THROTTLE_TICKS).isThrottled(sourceKey);
			},
			markRequestFailed: function(sourceKey, now) {
				MpCore.requestGuard(this, REQUEST_THROTTLE_TICKS).mark(sourceKey);
			},
			addMonitorListener: function(listener) {
				if (this.monitorListeners.indexOf(listener) == -1) this.monitorListeners.push(listener);
			},
			removeMonitorListener: function(listener) {
				var idx = this.monitorListeners.indexOf(listener);
				if (idx != -1) this.monitorListeners.splice(idx, 1);
			},
			notifyMonitorListeners: function(task) {
				if (this.monitorListeners.length === 0) return;
				if (task) this._monitorNotifyTask = task;
				if (this._monitorNotifyPending) return;
				this._monitorNotifyPending = true;
				var self = this;
				TickScheduler.global.ensureDefer('rsMonNotify:' + this.net_id, function() {
					self._monitorNotifyPending = false;
					var pendingTask = self._monitorNotifyTask;
					self._monitorNotifyTask = null;
					for (var i = 0; i < self.monitorListeners.length; i++) {
						if (self.monitorListeners[i]) self.monitorListeners[i](self, pendingTask);
					}
				}, { ticks: MONITOR_NOTIFY_THROTTLE_TICKS, retries: 1 });
			},
			registerExpectedOutputTask: function(uid, task) {
				if (!this.expectedOutputIndex[uid]) this.expectedOutputIndex[uid] = {};
				this.expectedOutputIndex[uid][task.id] = task;
			},
			unregisterExpectedOutputTask: function(uid, task) {
				var set = this.expectedOutputIndex[uid];
				if (!set) return;
				delete set[task.id];
				if (Object.keys(set).length === 0) delete this.expectedOutputIndex[uid];
			},
			unregisterTaskExpectedOutputs: function(task) {
				if (!task || !task.pendingOutputs) return;
				for (var uid in task.pendingOutputs) this.unregisterExpectedOutputTask(uid, task);
				task.pendingOutputs = {};
			},
			trackInsertedItem: function(item, count) {
				if (count <= 0) return;
				var uid = getItemUid(item);
				var remaining = count;
				var set = this.expectedOutputIndex[uid];
				if (!set && item.extra) {
					uid = getItemUid({ id: item.id, data: item.data, extra: null });
					set = this.expectedOutputIndex[uid];
				}
				if (set) {
					for (var taskId in set) {
						if (remaining <= 0) break;
						var task = set[taskId];
						if (!task || task.cancelled || task.completing || !task.onOutputArrived) continue;
						var consumed = task.onOutputArrived(uid, remaining);
						if (consumed > 0) {
							remaining -= consumed;
							this.notifyMonitorListeners(task);
							_RS._emit("taskProgress", {netId: this.net_id, taskId: task.id, currentStep: task.currentStep || 0, totalSteps: task.totalSteps || 0});
						}
					}
				} else {
					for (var ti = 0; ti < this.craftingTasks.length && remaining > 0; ti++) {
						var task2 = this.craftingTasks[ti];
						if (!task2 || task2.cancelled || task2.completing || !task2.onOutputArrived) continue;
						var consumed2 = task2.onOutputArrived(uid, remaining);
						if (consumed2 > 0) {
							remaining -= consumed2;
							this.notifyMonitorListeners(task2);
							_RS._emit("taskProgress", {netId: this.net_id, taskId: task2.id, currentStep: task2.currentStep || 0, totalSteps: task2.totalSteps || 0});
						}
					}
				}
			},
			buildMonitorElements: function(task) {
				var tasks = task ? [task] : this.craftingTasks;
				var elements = {};
				var getEl = function(uid, id, data) {
					if (!elements[uid]) elements[uid] = { item: {id: id, data: data}, stored: 0, scheduled: 0, crafting: 0, processing: 0 };
					return elements[uid];
				};
				var relevantUids = {};
				/* One traversal resolves the pattern per node and caches the nodes that
				 * contribute to crafting/processing; the later phases stay cheap (no
				 * repeated pattern lookups) while element creation keeps the exact
				 * previous insertion order (buffer stored, stored sums, crafting,
				 * processing/scheduled). */
				var craftNodes = [], craftPatterns = [];
				var procNodes = [], procPatterns = [], procInFlight = [];
				for (var ti = 0; ti < tasks.length; ti++) {
					var t = tasks[ti];
					if (!t) continue;
					if (!t.nodes) continue; // no nodes: the previous passes skipped buffer/results too
					for (var ni = 0; ni < t.nodes.length; ni++) {
						var node = t.nodes[ni];
						if (node.done) continue;
						var pattern = rsPickCraft(this, node.patternUid, node.containerCoords);
						if (!pattern) continue;
						for (var ri = 0; ri < pattern.result.length; ri++) {
							relevantUids[pattern.result[ri].id + '_' + pattern.result[ri].data] = { id: pattern.result[ri].id, data: pattern.result[ri].data };
						}
						for (var fi = 0; fi < (pattern.ingridients || []).length; fi++) {
							var ingr = pattern.ingridients[fi];
							if (ingr && ingr.id) relevantUids[ingr.id + '_' + ingr.data] = { id: ingr.id, data: ingr.data };
						}
						for (var qi = 0; qi < node.requirements.length; qi++) {
							var req = node.requirements[qi];
							if (!req.uid) continue;
							var reqParts = CoreKit.Items.parseUid(req.uid);
							relevantUids[reqParts.id + '_' + reqParts.data] = { id: reqParts.id, data: reqParts.data };
						}
						if (node.isProcessing) {
							var dispatched = node.quantity - node.remaining;
							var finishedCrafts = node.expectedByUid ? node.quantity : 0;
							if (node.expectedByUid) {
								for (var eu in node.expectedByUid) {
									var perCraftOut = node.expectedByUid[eu] / Math.max(1, node.quantity);
									var rc = Math.floor((node.receivedByUid[eu] || 0) / Math.max(1, perCraftOut));
									if (rc < finishedCrafts) finishedCrafts = rc;
								}
							}
							procNodes.push(node);
							procPatterns.push(pattern);
							procInFlight.push(Math.max(0, dispatched - finishedCrafts));
						} else {
							craftNodes.push(node);
							craftPatterns.push(pattern);
						}
					}
					for (var buid in t.buffer) {
						if (t.buffer[buid] > 0) {
							var bParts = CoreKit.Items.parseUid(buid);
							relevantUids[bParts.id + '_' + bParts.data] = { id: bParts.id, data: bParts.data };
							getEl(bParts.id + '_' + bParts.data, bParts.id, bParts.data).stored += t.buffer[buid];
						}
					}
					if (t.results) for (var rsi = 0; rsi < t.results.length; rsi++) {
						relevantUids[t.results[rsi].id + '_' + t.results[rsi].data] = { id: t.results[rsi].id, data: t.results[rsi].data };
					}
				}
				var storedSums = this._monitorStoredSums();
				for (var suid in relevantUids) {
					var sum = storedSums[suid];
					if (!sum) continue;
					var rel = relevantUids[suid];
					getEl(suid, rel.id, rel.data).stored += sum;
				}
				for (var ci = 0; ci < craftNodes.length; ci++) {
					var cNode = craftNodes[ci], cPattern = craftPatterns[ci];
					for (var cri = 0; cri < cPattern.result.length; cri++) {
						var cres = cPattern.result[cri];
						getEl(cres.id + '_' + cres.data, cres.id, cres.data).crafting += cNode.remaining * (cres.count || 1);
					}
				}
				for (var pi = 0; pi < procNodes.length; pi++) {
					var pNode = procNodes[pi], pPattern = procPatterns[pi], inFlight = procInFlight[pi];
					for (var pfi = 0; pfi < (pPattern.ingridients || []).length; pfi++) {
						var pingr = pPattern.ingridients[pfi];
						if (!pingr || !pingr.id) continue;
						if (inFlight > 0) getEl(pingr.id + '_' + pingr.data, pingr.id, pingr.data).processing += inFlight * (pingr.count || 1);
					}
					for (var pri = 0; pri < pPattern.result.length; pri++) {
						var pres = pPattern.result[pri];
						getEl(pres.id + '_' + pres.data, pres.id, pres.data).scheduled += pNode.remaining * (pres.count || 1);
					}
				}
				var result = [];
				for (var uid in elements) {
					var el = elements[uid];
					if (el.stored > 0 || el.scheduled > 0 || el.crafting > 0 || el.processing > 0) result.push(el);
				}
				return result;
			},
			/* Sums per base uid (id_data, extras aggregated) for monitor payloads; the cache is
			 * invalidated by any storage mutation. */
			_monitorStoredSums: function(){
				if (this._monitorStoredCache) return this._monitorStoredCache;
				var sums = Object.create(null);
				for (var ii = 0; ii < this.items.length; ii++) {
					var it = this.items[ii];
					if (!it) continue;
					var key = it.id + '_' + it.data;
					sums[key] = (sums[key] || 0) + it.count;
				}
				this._monitorStoredCache = sums;
				return sums;
			},
			addPatternContainerKey: function(key, coordsStr){
				if(!this.patternToContainersByKey[key]) this.patternToContainersByKey[key] = [];
				if(this.patternToContainersByKey[key].indexOf(coordsStr) == -1){
					this.patternToContainersByKey[key].push(coordsStr);
					if(!this.patternContainersParsed[coordsStr]){
						var parts = coordsStr.split(',');
						if(parts.length >= 3){
							this.patternContainersParsed[coordsStr] = { x: parseInt(parts[0]), y: parseInt(parts[1]), z: parseInt(parts[2]) };
						}
					}
				}
			},
			removePatternContainerKey: function(key, coordsStr){
				var list = this.patternToContainersByKey[key];
				if(!list) return;
				var idx = list.indexOf(coordsStr);
				if(idx != -1) list.splice(idx, 1);
				if(list.length == 0){
					delete this.patternToContainersByKey[key];
					delete this.craftsByKey[key];
				}
			},
			getPatternContainersByKey: function(key){
				return this.patternToContainersByKey[key] || [];
			},
			addPatternContainer: function(resultUid, coordsStr){
				if(!this.patternToContainers[resultUid]) this.patternToContainers[resultUid] = [];
				if(this.patternToContainers[resultUid].indexOf(coordsStr) == -1){
					this.patternToContainers[resultUid].push(coordsStr);
					if(!this.patternContainersParsed[coordsStr]){
						var parts = coordsStr.split(',');
						if(parts.length >= 3){
							this.patternContainersParsed[coordsStr] = { x: parseInt(parts[0]), y: parseInt(parts[1]), z: parseInt(parts[2]) };
						}
					}
				}
			},
			removePatternContainer: function(resultUid, coordsStr){
				var list = this.patternToContainers[resultUid];
				if(!list) return;
				var idx = list.indexOf(coordsStr);
				if(idx != -1) list.splice(idx, 1);
				if(list.length == 0) delete this.patternToContainers[resultUid];
			},
			getPatternContainers: function(resultUid){
				return this.patternToContainers[resultUid] || [];
			},
			rebuildPatternContainers: function(controllerTile){
				if (typeof rsWorkbenchResetCache === 'function') rsWorkbenchResetCache();
				var newPatternToContainers = {};
				var newPatternContainersParsed = {};
				var newCrafts = {};
				var newCraftsIDS = {};
				var newCraftsByKey = {};
				var newPatternToContainersByKey = {};
				var dedupeKeys = {};
				function addCraft(craft, coordsId){
					/* Derived workbench metadata (callback recipe + tool ids); not persisted. */
					if (typeof rsWorkbenchDecorateCraft === 'function') rsWorkbenchDecorateCraft(craft);
					for(var ri = 0; ri < craft.result.length; ri++){
						var res = craft.result[ri];
						var resultUid = getItemUid(res);
						var dedupeKey = coordsId + '|' + craft.id + '|' + craft.isProcessed + '|' + resultUid;
						if(!newCrafts[resultUid]) newCrafts[resultUid] = [];
						if(!dedupeKeys[dedupeKey]){
							dedupeKeys[dedupeKey] = true;
							newCrafts[resultUid].push(craft);
						}
						if(!newCraftsIDS[res.id]) newCraftsIDS[res.id] = [];
						if(newCraftsIDS[res.id].indexOf(res.data) == -1) newCraftsIDS[res.id].push(res.data);
						if(!newPatternToContainers[resultUid]) newPatternToContainers[resultUid] = [];
						if(newPatternToContainers[resultUid].indexOf(coordsId) == -1) newPatternToContainers[resultUid].push(coordsId);
						var pkey = rsPatternKey(craft, resultUid);
						if(!newCraftsByKey[pkey]) newCraftsByKey[pkey] = craft;
						if(!newPatternToContainersByKey[pkey]) newPatternToContainersByKey[pkey] = [];
						if(newPatternToContainersByKey[pkey].indexOf(coordsId) == -1) newPatternToContainersByKey[pkey].push(coordsId);
					}
				}
				var containers = PatternContainerRegistry.forNetwork(this.net_id, controllerTile.blockSource, controllerTile.dimension);
				for(var ci = 0; ci < containers.length; ci++){
					var entry = containers[ci];
					newPatternContainersParsed[entry.coordsId] = { x: entry.coords.x, y: entry.coords.y, z: entry.coords.z };
					var patterns;
					try {
						patterns = entry.container.getPatterns();
					} catch(err) {
						if(Config.dev)Logger.Log('[PatternContainer] getPatterns error at ' + entry.coordsId + ': ' + err, 'RefinedStorageError');
						continue;
					}
					if(!Array.isArray(patterns)) continue;
					for(var pi = 0; pi < patterns.length; pi++){
						var normalized = PatternContainerRegistry.validatePattern(patterns[pi]);
						if(!normalized){
							if(Config.dev)Logger.Log('[PatternContainer] invalid pattern at ' + entry.coordsId, 'RefinedStorageError');
							continue;
						}
						addCraft({
							id: normalized.id,
							coordsId: entry.coordsId,
							isProcessed: normalized.isProcessed,
							oredictEnabled: normalized.oredictEnabled,
							ingridients: normalized.ingridients,
							result: normalized.result
						}, entry.coordsId);
					}
				}
				var apiPatterns = this.apiPatterns || {};
				for(var akey in apiPatterns){
					var apiCraft = apiPatterns[akey];
					if(!apiCraft || !apiCraft.coordsId) continue;
					addCraft(apiCraft, apiCraft.coordsId);
				}
				this.patternToContainers = newPatternToContainers;
				this.patternContainersParsed = newPatternContainersParsed;
				this.crafts = newCrafts;
				this.craftsIDS = newCraftsIDS;
				this.craftsByKey = newCraftsByKey;
				this.patternToContainersByKey = newPatternToContainersByKey;
				this.refreshOpenedGrids(true);
			},
			refreshOpenedGrids: function(_full){
				var canDefer = typeof TickScheduler != "undefined" && TickScheduler && TickScheduler.global &&
					typeof TickScheduler.global.defer == "function";
				var now = canDefer ? TickScheduler.global.ticks : 0;
				if (canDefer && this.craftingTasks && this.craftingTasks.length > 0) {
					var elapsed = now - (this._lastGridRefreshTick || 0);
					if (elapsed < GRID_REFRESH_THROTTLE_TICKS) {
						this._gridRefreshPending = true;
						if (_full) this._gridRefreshPendingFull = true;
						if (!this._gridRefreshTimerArmed) {
							this._gridRefreshTimerArmed = true;
							var info = this;
							TickScheduler.global.defer(function () {
								info._gridRefreshTimerArmed = false;
								if (!info._gridRefreshPending) return;
								var full = info._gridRefreshPendingFull === true;
								info._gridRefreshPending = false;
								info._gridRefreshPendingFull = false;
								info._lastGridRefreshTick = TickScheduler.global.ticks;
								info._refreshOpenedGridsNow(full);
							}, { ticks: Math.max(1, GRID_REFRESH_THROTTLE_TICKS - elapsed), retries: 1 });
						}
						return;
					}
				}
				this._lastGridRefreshTick = now;
				this._refreshOpenedGridsNow(_full);
			},
			_refreshOpenedGridsNow: function(_full){
				for(var i in this.openedGrids){
					var __coords = this.openedGrids[i];
					var tile = World.getTileEntity(__coords.x, __coords.y, __coords.z, controllerRef.tile.blockSource);
					if(tile && tile.data){
						tile.data.fullRefreshPage = _full;
						tile.data.refreshCurPage = true;
					}
				}
				_RS._emit("storageUpdated", {netId: this.net_id});
			},
			updateItems: function(){
				this._monitorStoredCache = null;
				var wanted = {};
				wanted[BlockID['diskDrive']] = true;
				for (var pid in StorageProviders) wanted[Number(pid)] = true;
				var byId = {};
				for (var key in RSNetworks[this.net_id]) {
					var entry = RSNetworks[this.net_id][key];
					if (entry && entry.id != null && wanted[entry.id]) {
						if (!byId[entry.id]) byId[entry.id] = [];
						byId[entry.id].push(entry);
					}
				}
				var disk_map = [];
				var items_map = [];
				var items = [];
				var itemsIndexMap = {};
				var storage = 0;
				var stored = 0;
				var just_items_map = {};
				var just_items_map_extra = {};
				var seenDiskData = {};
				var mergeStorageEntry = function(disk_data) {
					storage += disk_data.storage;
					stored += disk_data.items_stored;
					var handle = function(diskItem){
						if(!diskItem) return;
						var itemUid = getItemUid(diskItem);
						var index = itemsIndexMap[itemUid];
						if(index != undefined){
							items[index].count += diskItem.count;
						} else {
							itemsIndexMap[itemUid] = items.length;
							items.push(Object.assign({}, diskItem));
							items_map.push(itemUid);
						}
						if(just_items_map[diskItem.id]){
							if(just_items_map[diskItem.id].indexOf(diskItem.data) == -1)just_items_map[diskItem.id].push(diskItem.data);
						} else if(!just_items_map[diskItem.id]){
							just_items_map[diskItem.id] = [diskItem.data];
						}
						if(diskItem.extra){
							var extraKey = diskItem.id+'_'+diskItem.data;
							if(just_items_map_extra[extraKey] && just_items_map_extra[extraKey].indexOf(diskItem.extra) == -1){
								just_items_map_extra[extraKey].push(diskItem.extra);
							} else if(!just_items_map_extra[extraKey]){
								just_items_map_extra[extraKey] = [diskItem.extra];
							}
						}
					};
					if(disk_data.stacks){
						for(var st = 0; st < disk_data.stacks.length; st++) handle(disk_data.stacks[st]);
					} else {
						for(var s in disk_data.items) handle(disk_data.items[s]);
					}
				};
				var diskDrives = byId[BlockID['diskDrive']] || [];
				for(var i in diskDrives){
					var tile = World.getTileEntity(diskDrives[i].coords.x, diskDrives[i].coords.y, diskDrives[i].coords.z, controllerRef.tile.blockSource);
					if(!tile || !tile.data || !tile.data.isActive || !tile.container) continue;
					/* Idea A: in extra mode only drives in loaded chunks contribute. */
					if (typeof RS_DISK_DATA_IN_EXTRA != 'undefined' && RS_DISK_DATA_IN_EXTRA) {
						var _loaded = true;
						try {
							if (typeof tile.isLoaded == 'function') _loaded = !!tile.isLoaded();
							else if (typeof tile.isLoaded != 'undefined') _loaded = !!tile.isLoaded;
						} catch (e) {}
						if (!_loaded) continue;
						if (typeof isChunkLoadedAtSafe == 'function'
							&& !isChunkLoadedAtSafe(tile.blockSource, tile.x, tile.y, tile.z)) continue;
					}
					var newDiskData = [];
					for (var k = 0; k < 8; k++) {
						var item = tile.container.getSlot('slot' + k);
						if (!item) continue;
						if (!Disk.items[item.id]) continue;
						if (item.data == 0) continue;
						var dedupKey = (typeof DiskRegistry != 'undefined' ? DiskRegistry.uuidOf(item) : '') || ('data:' + item.data);
						if (seenDiskData[dedupKey]) continue;
						seenDiskData[dedupKey] = true;
						var disk_data = Disk.getDiskData(item);
						mergeStorageEntry(disk_data);
						newDiskData.push(disk_data);
					}
					if(newDiskData.length == 0) continue;
					disk_map.push(newDiskData);
				}
				for(var providerBlockId in StorageProviders){
					var provider = StorageProviders[providerBlockId];
					var providerTiles = byId[Number(providerBlockId)] || [];
					for(var pt = 0; pt < providerTiles.length; pt++){
						var providerTile = World.getTileEntity(providerTiles[pt].coords.x, providerTiles[pt].coords.y, providerTiles[pt].coords.z, controllerRef.tile.blockSource);
						if(!providerTile || !providerTile.data || !providerTile.data.isActive) continue;
						var entries;
						try {
							entries = provider.getEntries(providerTile);
						} catch(err) {
							if(Config.dev)Logger.Log('[StorageProvider] getEntries error at ' + providerBlockId + ': ' + err, 'RefinedStorageError');
							continue;
						}
						if(!Array.isArray(entries)) continue;
						for(var ei = 0; ei < entries.length; ei++){
							var entry = entries[ei];
							if(!entry || (!entry.items && !entry.stacks) || !isFinite(entry.storage) || !isFinite(entry.items_stored)) continue;
							mergeStorageEntry(entry);
							disk_map.push([entry]);
						}
					}
				}
				this.disk_map = disk_map;
				this.items_map = items_map;
				this.items = items;
				this.itemsIndex = itemsIndexMap;
				this.storage = storage;
				this.stored = stored;
				this.just_items_map = just_items_map;
				this.just_items_map_extra = just_items_map_extra;
				this.refreshOpenedGrids();
			},
			itemCanBePushed: function(item, count){
				return Math.min(this.storage - this.stored, rsTakeCount(count, item.count));
			},
			pushItem: function(item, count, nonUpdate, tags){
				count = rsTakeCount(count, item.count);
				this._monitorStoredCache = null;
				var _origCount = count;
				if(RSbannedItems.indexOf(item.id) != -1){
					return count;
				}
			if(!this.itemCanBePushed(item, count)) return count;
			var deleteListeners = [];
				for(var i in this.itemAddListeners){
					if(!this.itemAddListeners[i]) continue;
					var __answ = this.itemAddListeners[i](item, count, tags);
					if(typeof(__answ) == "boolean" && __answ) deleteListeners.push(i);
					if(typeof(__answ) == "number") count = __answ;
				}
				for(var i = deleteListeners.length - 1; i >= 0; i--) this.itemAddListeners.splice(deleteListeners[i], 1);
				if(count <= 0) return 0;
				return this._pushItemV3(item, count, _origCount, nonUpdate, tags);
			},
			_flatEntries: function(){
				/* disk_map is replaced wholesale by updateItems; the entries inside are live and
				 * mutated in place, so the flat array stays valid until the map identity changes. */
				if (this._flatCache && this._flatCache.map === this.disk_map) return this._flatCache.entries;
				var entries = [];
				for(var i = 0; i < this.disk_map.length; i++){
					var group = this.disk_map[i];
					for(var k = 0; k < group.length; k++) if(group[k]) entries.push(group[k]);
				}
				this._flatCache = { map: this.disk_map, entries: entries };
				return entries;
			},
			_syncVariantIndex: function(itemId){
				var datas = null;
				var extras = {};
				for(var i = 0; i < this.items.length; i++){
					var it = this.items[i];
					if(it.id !== itemId) continue;
					if(datas){
						if(datas.indexOf(it.data) == -1) datas.push(it.data);
					} else {
						datas = [it.data];
					}
					if(it.extra){
						var extraKey = it.id + '_' + it.data;
						if(extras[extraKey]){
							if(extras[extraKey].indexOf(it.extra) == -1) extras[extraKey].push(it.extra);
						} else {
							extras[extraKey] = [it.extra];
						}
					}
				}
				if(datas) this.just_items_map[itemId] = datas;
				else delete this.just_items_map[itemId];
				for(var ek in this.just_items_map_extra){
					if(ek.indexOf(itemId + '_') === 0) delete this.just_items_map_extra[ek];
				}
				for(var ek2 in extras) this.just_items_map_extra[ek2] = extras[ek2];
			},
			_pushItemV3: function(item, count, origCount, nonUpdate, tags, uid){
				if(item.extra && !CoreKit.ItemContent.fold(item.extra)){
					Logger.Log('[STORAGE] unsupported extra rejected (item ' + item.id + ':' + item.data + ')', 'RefinedStorageError');
					return count;
				}
				var itemUid = uid != null ? uid : getItemUid(item);
				var isNewVariant = this.itemsIndex[itemUid] == undefined;
				var entries = this._flatEntries();
				/* rsDiskCounts feeds rsMarkChangedDisks only, which is inactive outside extra mode. */
				var before = (typeof RS_DISK_DATA_IN_EXTRA != 'undefined' && RS_DISK_DATA_IN_EXTRA && typeof rsDiskCounts == 'function')
					? rsDiskCounts(entries) : null;
				var view = StorageCore.createView(entries);
				var remainder = view.insert(item, count, { uid: itemUid, trustedUid: true });
				var added = count - remainder;
				if(added > 0){
					this.stored += added;
					var index = this.itemsIndex[itemUid];
					if(index == undefined){
						this.items.push({ id: item.id, data: item.data, count: added, extra: item.extra });
						this.items_map.push(itemUid);
						this.itemsIndex[itemUid] = this.items.length - 1;
					} else {
						this.items[index].count += added;
					}
					this.trackInsertedItem(item, added);
					/* Incremental variant index: only a brand-new uid can add a variant. */
					if (isNewVariant) {
						var _datas = this.just_items_map[item.id];
						if (!_datas) this.just_items_map[item.id] = [item.data];
						else if (_datas.indexOf(item.data) == -1) _datas.push(item.data);
						if (item.extra) {
							var _exKey = item.id + '_' + item.data;
							var _exList = this.just_items_map_extra[_exKey];
							if (!_exList) this.just_items_map_extra[_exKey] = [item.extra];
							else if (_exList.indexOf(item.extra) == -1) _exList.push(item.extra);
						}
					}
					_RS._emit("itemInserted", {netId: this.net_id, item: item, count: added, tags: tags});
					if(!nonUpdate)this.refreshOpenedGrids(isNewVariant);
					if (typeof rsMarkChangedDisks == 'function') rsMarkChangedDisks(entries, before);
					this.disksDirty = true;
				}
				return remainder;
			},
			_deleteItemV3: function(item, count, nonUpdate, tags, uid){
				var itemUid = uid != null ? uid : getItemUid(item);
				var entries = this._flatEntries();
				/* rsDiskCounts feeds rsMarkChangedDisks only, which is inactive outside extra mode. */
				var before = (typeof RS_DISK_DATA_IN_EXTRA != 'undefined' && RS_DISK_DATA_IN_EXTRA && typeof rsDiskCounts == 'function')
					? rsDiskCounts(entries) : null;
				var view = StorageCore.createView(entries);
				var remainder = view.extract(itemUid, count);
				var taken = count - remainder;
				if(taken > 0){
					this.stored -= taken;
					var index = this.itemsIndex[itemUid];
					var removedVariant = false;
					if(index != undefined){
						this.items[index].count -= taken;
						if(this.items[index].count <= 0){
							this.items.splice(index, 1);
							this.items_map.splice(index, 1);
							var reindex = {};
							for(var j = 0; j < this.items_map.length; j++) reindex[this.items_map[j]] = j;
							this.itemsIndex = reindex;
							removedVariant = true;
						}
					}
					_RS._emit("itemExtracted", {netId: this.net_id, item: item, count: taken, tags: tags});
					if (removedVariant) this._syncVariantIndex(item.id);
					if(!nonUpdate)this.refreshOpenedGrids(removedVariant);
					if (typeof rsMarkChangedDisks == 'function') rsMarkChangedDisks(entries, before);
					this.disksDirty = true;
				}
				return remainder;
			},
			itemCanBeDeleted: function(item, count, uid){
				count = rsTakeCount(count, item.count);
				if(count > this.stored) return false;
				var resolved = false;
				if((!item.data && item.data != 0) || item.data == -1) {
					if(!this.just_items_map[item.id]) return false;
					item.data = this.just_items_map[item.id][0];
					resolved = true;
				}
				if(item.extra === undefined)item.extra = null;
				if((!item.extra && item.extra != null) || item.extra === -1){
					var _extraMap = this.just_items_map_extra[item.id+'_'+item.data];
					item.extra = (_extraMap && _extraMap[0]) || null;
					resolved = true;
				}
				var itemUid = (!resolved && uid != null) ? uid : getItemUid(item);
				var iItem = this.itemsIndex[itemUid];
				if(iItem != undefined){
					var have = this.items[iItem] ? this.items[iItem].count : 0;
					return have >= count;
				} else {
					return false;
				}
			},
			deleteItem: function(item, count, nonUpdate, tags, uid){
				count = rsTakeCount(count, item.count);
				this._monitorStoredCache = null;
				/* When the identity may be rewritten below (wildcard data / extra sentinel),
				 * a caller-provided uid is stale; derive it after the resolution instead. */
				var mayResolve = rsIdentityMayResolve(item);
				if(!this.itemCanBeDeleted(item, count, uid)) return count;
				if((!item.data && item.data != 0) || item.data == -1) item.data = this.just_items_map[item.id][0];
			if(item.extra === undefined)item.extra = null;
			if((!item.extra && item.extra != null) || item.extra === -1){
				var _extraMap = this.just_items_map_extra[item.id+'_'+item.data];
				item.extra = (_extraMap && _extraMap[0]) || null;
			}
				var itemUid = (uid != null && !mayResolve) ? uid : getItemUid(item);
				var deleteListeners = [];
				for(var i in this.itemRemoveListeners){
					if(!this.itemRemoveListeners[i]) continue;
					var __answ = this.itemRemoveListeners[i](item, count, tags);
					if(typeof(__answ) == "boolean" && __answ) deleteListeners.push(i);
					if(typeof(__answ) == "number") count = __answ;
				}
				for(var i = deleteListeners.length - 1; i >= 0; i--) this.itemRemoveListeners.splice(deleteListeners[i], 1);
				if(count <= 0) return 0;
				return this._deleteItemV3(item, count, nonUpdate, tags, itemUid);
			},
			constructCraft: function(item, count, skipDedupe) {
				if (item.data == -1 && this.craftsIDS[item.id]) item.data = this.craftsIDS[item.id][0];
				if (!skipDedupe) {
					var scheduled = this.getScheduledCountFor(item);
					var remaining = Math.max(0, (count || 1) - scheduled);
					if (remaining <= 0) return { deduped: true, item: item, count: count || 1 };
					count = remaining;
				}
				var _ceWorld = buildCraftWorld(this);
				var _cePlan = CraftTreePlanner.plan(
					{ key: getItemUid({ id: item.id, data: item.data, extra: null }), amount: count },
					buildCraftTreePlannerCtx(_ceWorld, Config.craftingCalculationTimeout || 5000)
				);
				var result = buildCraftTreePlannerResult(_ceWorld, item, count, _cePlan);
				if (!result.craftable && result.errorType === "NO_PATTERN") return false;
				return result;
			},
			getScheduledCountFor: function(item) {
				var uid = getItemUid({ id: item.id, data: item.data, extra: null });
				return this.scheduledByUid[uid] || 0;
			},
			removeScheduledCount: function(task) {
				if (!task || !task.requestedUid) return;
				var uid = task.requestedUid;
				var next = (this.scheduledByUid[uid] || 0) - (task.requestedCount || 0);
				if (next <= 0) delete this.scheduledByUid[uid];
				else this.scheduledByUid[uid] = next;
			},
			scheduleTask: function(_craft_) {
				if (!_craft_ || !_craft_.craftable) return false;
				var requestedItem = _craft_.results && _craft_.results[0]
					? { id: _craft_.results[0].id, data: _craft_.results[0].data, extra: null } : { id: 0, data: 0 };
				var task = CraftingTask.create(_craft_, this, requestedItem, _craft_.requestedCount);
				if (!task || typeof task.reserveItems !== "function") return false;
				task.reserveItems(this);
			this.refreshOpenedGrids();
			this.craftingTasks.push(task);
			this.providingCrafts.push(task);
			this.scheduledByUid[task.requestedUid] = (this.scheduledByUid[task.requestedUid] || 0) + (task.requestedCount || 0);
			this.notifyMonitorListeners();
			_RS._emit("taskAdded", {netId: this.net_id, task: {id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount}});
			return task;
		},
			cancelTask: function(taskId) {
				var task = this.getTask(taskId);
				if (!task) return false;
				task.cancelled = true;
				if (task.flushBuffer && !task.flushBuffer(this)) {
					task.completingFlush = true;
					this.refreshOpenedGrids();
				} else {
					var pidx = this.providingCrafts.indexOf(task);
					if (pidx != -1) this.providingCrafts.splice(pidx, 1);
					var tidx = this.craftingTasks.indexOf(task);
					if (tidx != -1) this.craftingTasks.splice(tidx, 1);
					this.removeScheduledCount(task);
					this.unregisterTaskExpectedOutputs(task);
					this.refreshOpenedGrids();
				}
				this.notifyMonitorListeners(task);
				_RS._emit("taskCancelled", {netId: this.net_id, taskId: taskId});
					return true;
				},
			cancelAllTasks: function() {
			var tasks = this.craftingTasks.slice();
			for (var i = 0; i < tasks.length; i++) {
				this.cancelTask(tasks[i].id);
			}
		},
		getTask: function(taskId) {
				for (var i = 0; i < this.craftingTasks.length; i++) {
					if (this.craftingTasks[i].id === taskId) return this.craftingTasks[i];
				}
				return null;
			},
			provideCraft: function(_craft_) {
				return this.scheduleTask(_craft_);
			}
		};
	}
};

function copyItem(item) {
	return {id: item.id, count: item.count, data: item.data, extra: item.extra || null};
}
