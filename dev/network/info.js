var REQUEST_THROTTLE_TICKS = 60;

var StorageProviders = {};

// Contract: provider.getEntries(tile) must return an array of LIVE references to the addon's persisted
// storage entries, shaped like DiskData entries: { storage: number, items_stored: number,
// items: { [getItemUid(item)]: { id, data, count, extra } } }. Counts must be finite numbers.
// Entries are mutated in place by pushItem/deleteItem and must survive updateItems rebuilds.
function registerStorageProvider(blockId, provider) {
	if (!blockId || !provider || typeof provider.getEntries !== 'function') return false;
	StorageProviders[String(blockId)] = provider;
	return true;
}

function getStorageProvider(blockId) {
	return StorageProviders[String(blockId)] || null;
}

var _pendingUpdateItems = {};

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
			disk_map: [],
			just_items_map: {},
			just_items_map_extra: {},
			items_map: [],
			items: [],
			itemsIndex: {},
			openedGrids: [],
			storage: 0,
			stored: 0,
			itemAddListeners: [],
			itemRemoveListeners: [],
			providingCrafts: [],
			craftingTasks: [],
			scheduledByUid: {},
			expectedOutputIndex: {},
			netMapDirty: false,
			incomplete: false,
			updateControllerTile: function(tile) {
				controllerRef.tile = tile;
			},
			monitorListeners: [],
			lastFailedRequestTick: {},
			isRequestThrottled: function(sourceKey, now) {
				var last = this.lastFailedRequestTick[sourceKey];
				return last != null && now - last < REQUEST_THROTTLE_TICKS;
			},
			markRequestFailed: function(sourceKey, now) {
				this.lastFailedRequestTick[sourceKey] = now;
				if (!this._throttlePruneAt || now - this._throttlePruneAt >= REQUEST_THROTTLE_TICKS) {
					this._throttlePruneAt = now;
					for (var tk in this.lastFailedRequestTick) {
						if (now - this.lastFailedRequestTick[tk] >= REQUEST_THROTTLE_TICKS) delete this.lastFailedRequestTick[tk];
					}
				}
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
				for (var i = 0; i < this.monitorListeners.length; i++) {
					if (this.monitorListeners[i]) this.monitorListeners[i](this, task || null);
				}
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
				for (var ti = 0; ti < tasks.length; ti++) {
					var t = tasks[ti];
					if (!t || !t.nodes) continue;
					for (var ni = 0; ni < t.nodes.length; ni++) {
						var node = t.nodes[ni];
						if (node.done) continue;
						var pattern = this.crafts[node.patternUid] && this.crafts[node.patternUid][0];
						if (!pattern) continue;
						for (var ri = 0; ri < pattern.result.length; ri++) {
							relevantUids[pattern.result[ri].id + '_' + pattern.result[ri].data] = true;
						}
						for (var fi = 0; fi < (pattern.ingridients || []).length; fi++) {
							var ingr = pattern.ingridients[fi];
							if (ingr && ingr.id) relevantUids[ingr.id + '_' + ingr.data] = true;
						}
						for (var qi = 0; qi < node.requirements.length; qi++) {
							var req = node.requirements[qi];
							if (!req.uid) continue;
							var reqParts = req.uid.split('_');
							relevantUids[reqParts[0] + '_' + reqParts[1]] = true;
						}
					}
					for (var buid in t.buffer) {
						if (t.buffer[buid] > 0) {
							var bParts = buid.split('_');
							relevantUids[bParts[0] + '_' + bParts[1]] = true;
						}
					}
					if (t.results) for (var rsi = 0; rsi < t.results.length; rsi++) {
						relevantUids[t.results[rsi].id + '_' + t.results[rsi].data] = true;
					}
				}
				for (var ti = 0; ti < tasks.length; ti++) {
					var t = tasks[ti];
					if (!t || !t.buffer) continue;
					for (var buid in t.buffer) {
						if (t.buffer[buid] <= 0) continue;
						var parts = buid.split('_');
						var baseUid = parts[0] + '_' + parts[1];
						if (!relevantUids[baseUid]) continue;
						getEl(baseUid, Number(parts[0]), Number(parts[1])).stored += t.buffer[buid];
					}
				}
				for (var ii = 0; ii < this.items.length; ii++) {
					var item = this.items[ii];
					var uid = item.id + '_' + item.data;
					if (!relevantUids[uid]) continue;
					getEl(uid, item.id, item.data).stored += item.count;
				}
				for (var ti = 0; ti < tasks.length; ti++) {
					var t = tasks[ti];
					if (!t || !t.nodes) continue;
					for (var ni = 0; ni < t.nodes.length; ni++) {
						var node = t.nodes[ni];
						if (node.done || node.isProcessing) continue;
						var pattern = this.crafts[node.patternUid] && this.crafts[node.patternUid][0];
						if (!pattern) continue;
						for (var ri = 0; ri < pattern.result.length; ri++) {
							var res = pattern.result[ri];
							getEl(res.id + '_' + res.data, res.id, res.data).crafting += node.remaining * (res.count || 1);
						}
					}
				}
				for (var ti = 0; ti < tasks.length; ti++) {
					var t = tasks[ti];
					if (!t || !t.nodes) continue;
					for (var ni = 0; ni < t.nodes.length; ni++) {
						var node = t.nodes[ni];
						if (node.done || !node.isProcessing) continue;
						var pattern = this.crafts[node.patternUid] && this.crafts[node.patternUid][0];
						if (!pattern) continue;
						var dispatched = node.quantity - node.remaining;
						var finishedCrafts = node.expectedByUid ? node.quantity : 0;
						if (node.expectedByUid) {
							for (var eu in node.expectedByUid) {
								var perCraftOut = node.expectedByUid[eu] / Math.max(1, node.quantity);
								var rc = Math.floor((node.receivedByUid[eu] || 0) / Math.max(1, perCraftOut));
								if (rc < finishedCrafts) finishedCrafts = rc;
							}
						}
						var inFlight = Math.max(0, dispatched - finishedCrafts);
						for (var fi = 0; fi < (pattern.ingridients || []).length; fi++) {
							var ingr = pattern.ingridients[fi];
							if (!ingr || !ingr.id) continue;
							if (inFlight > 0) getEl(ingr.id + '_' + ingr.data, ingr.id, ingr.data).processing += inFlight * (ingr.count || 1);
						}
						for (var ri = 0; ri < pattern.result.length; ri++) {
							var res = pattern.result[ri];
							getEl(res.id + '_' + res.data, res.id, res.data).scheduled += node.remaining * (res.count || 1);
						}
					}
				}
				var result = [];
				for (var uid in elements) {
					var el = elements[uid];
					if (el.stored > 0 || el.scheduled > 0 || el.crafting > 0 || el.processing > 0) result.push(el);
				}
				return result;
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
				var newPatternToContainers = {};
				var newPatternContainersParsed = {};
				var newCrafts = {};
				var newCraftsIDS = {};
				var dedupeKeys = {};
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
						var craft = {
							id: normalized.id,
							coordsId: entry.coordsId,
							isProcessed: normalized.isProcessed,
							oredictEnabled: normalized.oredictEnabled,
							ingridients: normalized.ingridients,
							result: normalized.result
						};
						for(var ri = 0; ri < craft.result.length; ri++){
							var res = craft.result[ri];
							var resultUid = res.id + '_' + res.data;
							var dedupeKey = entry.coordsId + '|' + normalized.id + '|' + normalized.isProcessed + '|' + resultUid;
							if(!newCrafts[resultUid]) newCrafts[resultUid] = [];
							if(!dedupeKeys[dedupeKey]){
								dedupeKeys[dedupeKey] = true;
								newCrafts[resultUid].push(craft);
							}
							if(!newCraftsIDS[res.id]) newCraftsIDS[res.id] = [];
							if(newCraftsIDS[res.id].indexOf(res.data) == -1) newCraftsIDS[res.id].push(res.data);
							if(!newPatternToContainers[resultUid]) newPatternToContainers[resultUid] = [];
							if(newPatternToContainers[resultUid].indexOf(entry.coordsId) == -1) newPatternToContainers[resultUid].push(entry.coordsId);
						}
					}
				}
				this.patternToContainers = newPatternToContainers;
				this.patternContainersParsed = newPatternContainersParsed;
				this.crafts = newCrafts;
				this.craftsIDS = newCraftsIDS;
				this.refreshOpenedGrids(true);
			},
			refreshOpenedGrids: function(_full){
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
					for(var s in disk_data.items){
					var diskItem = disk_data.items[s];
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
							if(just_items_map_extra[diskItem.id+'_'+diskItem.data] && just_items_map_extra[diskItem.id+'_'+diskItem.data].indexOf(diskItem.extra) == -1){
								just_items_map_extra[diskItem.id+'_'+diskItem.data].push(diskItem.extra);
							} else if(!just_items_map_extra[diskItem.id+'_'+diskItem.data]){
								just_items_map_extra[diskItem.id+'_'+diskItem.data] = [diskItem.extra];
							}
						}
					}
				};
				var diskDrives = byId[BlockID['diskDrive']] || [];
				for(var i in diskDrives){
					var tile = World.getTileEntity(diskDrives[i].coords.x, diskDrives[i].coords.y, diskDrives[i].coords.z, controllerRef.tile.blockSource);
					if(!tile || !tile.data.isActive) continue;
					var newDiskData = [];
					for (var k = 0; k < 8; k++) {
						var item = tile.container.getSlot('slot' + k);
						if (!Disk.items[item.id]) continue;
						if (item.data == 0) continue;
						if (seenDiskData[item.data]) continue;
						seenDiskData[item.data] = true;
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
							if(!entry || !entry.items || !isFinite(entry.storage) || !isFinite(entry.items_stored)) continue;
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
				return Math.min(this.storage - this.stored, count || item.count);
			},
			pushItem: function(item, count, nonUpdate, tags){
				count = count || item.count;
				var _origCount = count;
				if(RSbannedItems.indexOf(item.id) != -1){
					if(Config.dev)Logger.Log('Banned item pushed: id=' + item.id, 'RefinedStorageDebug');
					return count;
				}
			if(!this.itemCanBePushed(item, count)) return count;
			var itemUid = getItemUid(item);
			var deleteListeners = [];
				for(var i in this.itemAddListeners){
					if(!this.itemAddListeners[i]) continue;
					var __answ = this.itemAddListeners[i](item, count, tags);
					if(typeof(__answ) == "boolean" && __answ) deleteListeners.push(i);
					if(typeof(__answ) == "number") count = __answ;
				}
				for(var i = deleteListeners.length - 1; i >= 0; i--) this.itemAddListeners.splice(deleteListeners[i], 1);
				if(count <= 0) return 0;
				var index = this.itemsIndex[itemUid];
				if(index == undefined) index = -1;
				var itemUidExtra = item.id+'_'+item.data;
				if(item.extra && index == -1 && this.just_items_map_extra[itemUidExtra])for(var iasd in this.just_items_map_extra[itemUidExtra]){
					var ___extra = this.just_items_map_extra[itemUidExtra][iasd];
					if(fullExtraToString(item.extra, true) == fullExtraToString(___extra, true)){
						item.extra = ___extra;
						itemUid = getItemUid(item);
						index = this.itemsIndex[itemUid];
						if(index == undefined) index = -1;
						break;
					}
				}
				if(index != -1){
					for(var i in this.disk_map){
						for(var k in this.disk_map[i]){
							if(count == 0 || this.storage - this.stored == 0){
								if (_origCount - count > 0) {
									this.trackInsertedItem(item, _origCount - count);
									_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount - count, tags: tags});
								}
								if(!nonUpdate)this.refreshOpenedGrids();
								return count;
							};
							var disk_item;
				if(disk_item = this.disk_map[i][k].items[itemUid]){
								var freeSpace = this.disk_map[i][k].storage - this.disk_map[i][k].items_stored;
								if(freeSpace == 0) continue;
								if(count >= freeSpace){
									count -= freeSpace;
									this.items[index].count += freeSpace;
									this.stored += freeSpace;
									this.disk_map[i][k].items_stored += freeSpace;
									disk_item.count += freeSpace;
							} else {
								this.items[index].count += count;
								this.stored += count;
								this.disk_map[i][k].items_stored += count;
								disk_item.count += count;
								this.trackInsertedItem(item, _origCount);
								_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount, tags: tags});
								if(!nonUpdate)this.refreshOpenedGrids();
								return 0;
							}
							};
						}
					}
				} else {
					this.items.push({
						id: item.id,
						data: item.data,
						count: Math.min(count, this.storage - this.stored),
						extra: item.extra
					});
					this.items_map.push(itemUid);
					this.itemsIndex[itemUid] = this.items.length - 1;
				if(this.just_items_map[item.id]){
					if(this.just_items_map[item.id].indexOf(item.data) == -1)this.just_items_map[item.id].push(item.data);
				} else if(!this.just_items_map[item.id]){
					this.just_items_map[item.id] = [item.data];
				}
					if(item.extra){
						if(this.just_items_map_extra[itemUidExtra]){
							this.just_items_map_extra[itemUidExtra].push(item.extra);
						} else if(!this.just_items_map_extra[itemUidExtra]){
							this.just_items_map_extra[itemUidExtra] = [item.extra];
						}
					}
				}
				for(var i in this.disk_map){
					for(var k in this.disk_map[i]){
						if(count == 0 || this.storage - this.stored == 0) {
							if (_origCount - count > 0) {
								this.trackInsertedItem(item, _origCount - count);
								_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount - count, tags: tags});
							}
							if(!nonUpdate)this.refreshOpenedGrids(true);
							return count;
						}
						if(!this.disk_map[i][k]) continue;
						var freeSpace = this.disk_map[i][k].storage - this.disk_map[i][k].items_stored;
						if(freeSpace == 0) continue;
						if(count >= freeSpace){
							count -= freeSpace;
							this.stored += freeSpace;
							if(index != -1) this.items[index].count += freeSpace;
							this.disk_map[i][k].items[itemUid] = {
								id: item.id,
								data: item.data,
								count: freeSpace,
								extra: item.extra
							}
							this.disk_map[i][k].items_stored += freeSpace;
						} else {
							this.stored += count;
							if(index != -1) this.items[index].count += count;
							this.disk_map[i][k].items[itemUid] = {
								id: item.id,
								data: item.data,
								count: count,
								extra: item.extra
							}
							this.disk_map[i][k].items_stored += count;
							this.trackInsertedItem(item, _origCount);
							_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount, tags: tags});
							if(!nonUpdate)this.refreshOpenedGrids(true);
							return 0;
						}
					}
				};
				if(_origCount - count > 0){
					this.trackInsertedItem(item, _origCount - count);
					_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount - count, tags: tags});
				}
				if(!nonUpdate)this.refreshOpenedGrids(true);
				return count;
			},
			itemCanBeDeleted: function(item, count){
				count = count || item.count;
				if(count > this.stored) return false;
				if((!item.data && item.data != 0) || item.data == -1) {
					if(!this.just_items_map[item.id]) return false;
					item.data = this.just_items_map[item.id][0];
				}
				var itemUid = getItemUid(item);
				var iItem = this.itemsIndex[itemUid];
				if(iItem != undefined){
					var have = this.items[iItem] ? this.items[iItem].count : 0;
					return have >= count;
				} else {
					return false;
				}
			},
			deleteItem: function(item, count, nonUpdate, tags){
				count = count || item.count;
				if(!this.itemCanBeDeleted(item, count)) return count;
				if((!item.data && item.data != 0) || item.data == -1) item.data = this.just_items_map[item.id][0];
			if(item.extra === undefined)item.extra = null;
			if((!item.extra && item.extra != null) || item.extra === -1){
				var _extraMap = this.just_items_map_extra[item.id+'_'+item.data];
				item.extra = (_extraMap && _extraMap[0]) || null;
			}
				var itemUid = getItemUid(item);
				var deleteListeners = [];
				for(var i in this.itemRemoveListeners){
					if(!this.itemRemoveListeners[i]) continue;
					var __answ = this.itemRemoveListeners[i](item, count, tags);
					if(typeof(__answ) == "boolean" && __answ) deleteListeners.push(i);
					if(typeof(__answ) == "number") count = __answ;
				}
				for(var i = deleteListeners.length - 1; i >= 0; i--) this.itemRemoveListeners.splice(deleteListeners[i], 1);
				if(count <= 0) return 0;
				var num = this.itemsIndex[itemUid];
				if(num == undefined) num = -1;
				var itemUidExtra = item.id+'_'+item.data;
				if(item.extra && num == -1 && this.just_items_map_extra[itemUidExtra])for(var iasd in this.just_items_map_extra[itemUidExtra]){
					var ___extra = this.just_items_map_extra[itemUidExtra][iasd];
					if(fullExtraToString(item.extra, true) == fullExtraToString(___extra, true)){
						item.extra = ___extra;
						itemUid = getItemUid(item);
						num = this.itemsIndex[itemUid];
						if(num == undefined) num = -1;
						break;
					}
				}
				if(num != -1){
					var count1 = Math.min(count, this.stored, this.items[num].count);
					if(count >= this.items[num].count){
						this.items_map.splice(num, 1);
						this.items.splice(num, 1);
						var newItemsIndex = {};
						for(var _mi = 0; _mi < this.items_map.length; _mi++) newItemsIndex[this.items_map[_mi]] = _mi;
						this.itemsIndex = newItemsIndex;
					var justIMap;
					if(item.extra){
						if(this.just_items_map_extra[itemUidExtra] && (justIMap = this.just_items_map_extra[itemUidExtra].indexOf(item.extra)) != -1) this.just_items_map_extra[itemUidExtra].splice(justIMap, 1);
						if(this.just_items_map_extra[itemUidExtra] && this.just_items_map_extra[itemUidExtra].length == 0) delete this.just_items_map_extra[itemUidExtra];
					}
					var _jm = this.just_items_map[item.id];
					if(_jm){
						var stillHasVariant = !!this.just_items_map_extra[itemUidExtra];
						if(!stillHasVariant && (justIMap = _jm.indexOf(item.data)) != -1) _jm.splice(justIMap, 1);
						if(_jm.length == 0) delete this.just_items_map[item.id];
					}
						var removed = 0;
						for(var i in this.disk_map){
							for(var k in this.disk_map[i]){
								if(!this.disk_map[i][k] || !this.disk_map[i][k].items) continue;
								if(disk_item = this.disk_map[i][k].items[itemUid]) {
									var take = Math.min(count1 - removed, disk_item.count);
									this.stored -= take;
									this.disk_map[i][k].items_stored -= take;
									disk_item.count -= take;
									removed += take;
									if (disk_item.count <= 0) delete this.disk_map[i][k].items[itemUid];
									if (removed >= count1) break;
								}
							}
							if (removed >= count1) break;
						}
						_RS._emit("itemExtracted", {netId: this.net_id, item: item, count: removed, tags: tags});
						if(!nonUpdate)this.refreshOpenedGrids(true);
						return count - removed;
					} else {
						this.items[num].count -= count1;
						var emitted = false;
						for(var i in this.disk_map){
							for(var k in this.disk_map[i]){
								if(count == 0 || this.stored == 0) {
									if(!emitted && count1 > 0) _RS._emit("itemExtracted", {netId: this.net_id, item: item, count: count1, tags: tags});
									if(!nonUpdate)this.refreshOpenedGrids();
									return count;
								};
								if(!this.disk_map[i][k] || !this.disk_map[i][k].items) continue;
								var disk_item;
				if(disk_item = this.disk_map[i][k].items[itemUid]){
									if(count >= disk_item.count){
										count -= disk_item.count;
										this.stored -= disk_item.count;
										this.disk_map[i][k].items_stored -= disk_item.count;
										delete this.disk_map[i][k].items[itemUid];
									} else {
										this.stored -= count;
										this.disk_map[i][k].items_stored -= count;
										disk_item.count -= count;
										_RS._emit("itemExtracted", {netId: this.net_id, item: item, count: count1, tags: tags});
										emitted = true;
										if(!nonUpdate)this.refreshOpenedGrids();
										return 0;
									}
								};
							}
						}
						if(!emitted && count1 > 0) _RS._emit("itemExtracted", {netId: this.net_id, item: item, count: count1, tags: tags});
						if(!nonUpdate)this.refreshOpenedGrids();
						return count;
					}
				} else {
					return count;
				}
				if(!nonUpdate)this.refreshOpenedGrids();
			},
			constructCraft: function(item, count, skipDedupe) {
				if (item.data == -1 && this.craftsIDS[item.id]) item.data = this.craftsIDS[item.id][0];
				if (!skipDedupe) {
					var scheduled = this.getScheduledCountFor(item);
					var remaining = Math.max(0, (count || 1) - scheduled);
					if (remaining <= 0) return { deduped: true, item: item, count: count || 1 };
					count = remaining;
				}
				var result = CraftingCalculator.calculate(item, count, this);
				if (!result.craftable && result.errorType === "NO_PATTERN") return false;
				return result;
			},
			getScheduledCountFor: function(item) {
				var uid = item.id + '_' + item.data;
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
				var requestedItem = _craft_.results && _craft_.results[0]
					? { id: _craft_.results[0].id, data: _craft_.results[0].data, extra: null } : { id: 0, data: 0 };
				var task = CraftingTask.create(_craft_, this, requestedItem, _craft_.requestedCount);
				task.reserveItems(this);
			this.refreshOpenedGrids();
			this.craftingTasks.push(task);
			this.providingCrafts.push(task);
			this.scheduledByUid[task.requestedUid] = (this.scheduledByUid[task.requestedUid] || 0) + (task.requestedCount || 0);
			this.notifyMonitorListeners();
			if(Config.dev)Logger.Log('[CRAFT] Task ' + task.id + ' scheduled: ' + task.requestedCount + 'x ' + task.requestedUid, 'RefinedStorageDebug');
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
					if(Config.dev)Logger.Log('[CRAFT] Task ' + taskId + ' cancelled', 'RefinedStorageDebug');
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
