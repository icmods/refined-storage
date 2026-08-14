var NetworkInfo = {
	create: function(_data, controllerTile, netId) {
		return {
			net_id: netId,
			craftsIDS: {},
			crafts: {},
			patternToContainers: {},
			disk_map: [],
			just_items_map: {},
			just_items_map_extra: {},
			items_map: [],
			items: [],
			openedGrids: [],
			storage: 0,
			stored: 0,
			itemAddListeners: [],
			itemRemoveListeners: [],
			providingCrafts: [],
			craftingTasks: [],
			monitorListeners: [],
			addMonitorListener: function(listener) {
				if (this.monitorListeners.indexOf(listener) == -1) this.monitorListeners.push(listener);
			},
			removeMonitorListener: function(listener) {
				var idx = this.monitorListeners.indexOf(listener);
				if (idx != -1) this.monitorListeners.splice(idx, 1);
			},
			notifyMonitorListeners: function(task) {
				for (var i = 0; i < this.monitorListeners.length; i++) {
					if (this.monitorListeners[i]) this.monitorListeners[i](this, task || null);
				}
			},
			trackInsertedItem: function(item, count) {
				if (count <= 0) return;
				var uid = getItemUid(item);
				var remaining = count;
				for (var ti = 0; ti < this.craftingTasks.length && remaining > 0; ti++) {
					var task = this.craftingTasks[ti];
					if (!task || task.cancelled || task.completing || !task.onOutputArrived) continue;
					var consumed = task.onOutputArrived(uid, remaining);
				if (consumed > 0) {
					remaining -= consumed;
					this.notifyMonitorListeners(task);
					_RS._emit("taskProgress", {netId: this.net_id, taskId: task.id, currentStep: task.currentStep || 0, totalSteps: task.totalSteps || 0});
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
				if(this.patternToContainers[resultUid].indexOf(coordsStr) == -1) this.patternToContainers[resultUid].push(coordsStr);
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
				this.patternToContainers = {};
				var crafters = searchBlocksInNetwork(this.net_id, BlockID.RS_crafter);
				for(var i in crafters){
					var tile = World.getTileEntity(crafters[i].coords.x, crafters[i].coords.y, crafters[i].coords.z, controllerTile.blockSource);
					if(!tile || !tile.data.isActive) continue;
					for(var s in tile.data.crafts){
						var craft = tile.data.crafts[s];
						for(var ri = 0; ri < craft.result.length; ri++){
							var resultUid = craft.result[ri].id + '_' + craft.result[ri].data;
							this.addPatternContainer(resultUid, cts(tile));
						}
					}
				}
			},
			refreshOpenedGrids: function(_full){
				for(var i in this.openedGrids){
					var __coords = this.openedGrids[i];
					var tile = World.getTileEntity(__coords.x, __coords.y, __coords.z, controllerTile.blockSource);
					if(tile && tile.data){
						tile.data.fullRefreshPage = _full;
						tile.data.refreshCurPage = true;
					}
				}
				_RS._emit("storageUpdated", {netId: this.net_id});
			},
			updateItems: function(){
				var diskDrives = searchBlocksInNetwork(this.net_id, BlockID['diskDrive']);
				var disk_map = [];
				var items_map = [];
				var items = [];
				var storage = 0;
				var stored = 0;
				var just_items_map = {};
				var just_items_map_extra = {};
				for(var i in diskDrives){
					var tile = World.getTileEntity(diskDrives[i].coords.x, diskDrives[i].coords.y, diskDrives[i].coords.z, controllerTile.blockSource);
					if(!tile || !tile.data.isActive) continue;
					var newDiskData = [];
					for (var k = 0; k < 8; k++) {
						var item = tile.container.getSlot('slot' + k);
						if (!Disk.items[item.id]) continue;
						if (item.data == 0) item.data = DiskData.length;
						var disk_data = Disk.getDiskData(item);
						storage += disk_data.storage;
						stored += disk_data.items_stored;
						for(var s in disk_data.items){
							var diskItem = disk_data.items[s];
							var itemUid = getItemUid(diskItem);
							var index;
				if((index = items_map.indexOf(itemUid)) != -1){
								items[index].count += diskItem.count;
							} else {
								items.push(Object.assign({}, diskItem));
								items_map.push(itemUid);
							}
							if(just_items_map[diskItem.id]){
								just_items_map[diskItem.id].push(diskItem.data);
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
						newDiskData.push(disk_data);
					}
					if(newDiskData.length == 0) continue;
					disk_map.push(newDiskData);
				}
				this.disk_map = disk_map;
				this.items_map = items_map;
				this.items = items;
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
				var index = this.items_map.indexOf(itemUid);
				var itemUidExtra = item.id+'_'+item.data;
				if(item.extra && index == -1 && this.just_items_map_extra[itemUidExtra])for(var iasd in this.just_items_map_extra[itemUidExtra]){
					var ___extra = this.just_items_map_extra[itemUidExtra][iasd];
					if(fullExtraToString(item.extra, true) == fullExtraToString(___extra, true)){
						item.extra = ___extra;
						itemUid = getItemUid(item);
						index = this.items_map.indexOf(itemUid);
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
								this.trackInsertedItem(item, _origCount - count);
								_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount - count, tags: tags});
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
					if(this.just_items_map[item.id]){
						this.just_items_map[item.id].push(item.data);
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
							this.disk_map[i][k].items[itemUid] = {
								id: item.id,
								data: item.data,
								count: freeSpace,
								extra: item.extra
							}
							this.disk_map[i][k].items_stored += freeSpace;
						} else {
							this.stored += count;
							this.disk_map[i][k].items[itemUid] = {
								id: item.id,
								data: item.data,
								count: count,
								extra: item.extra
							}
							this.disk_map[i][k].items_stored += count;
							this.trackInsertedItem(item, _origCount - count);
							_RS._emit("itemInserted", {netId: this.net_id, item: item, count: _origCount - count, tags: tags});
							if(!nonUpdate)this.refreshOpenedGrids(true);
							return 0;
						}
					}
				};
				if(!nonUpdate)this.refreshOpenedGrids();
			},
			itemCanBeDeleted: function(item, count){
				count = count || item.count;
				if(count > this.stored) return false;
				var itemUid = getItemUid(item);
				var iItem;
				if((iItem = this.items_map.indexOf(itemUid)) != -1){
					return true;
				} else {
					return false;
				}
			},
			deleteItem: function(item, count, nonUpdate, tags){
				count = count || item.count;
				if(!this.itemCanBeDeleted(item, count)) return count;
				if((!item.data && item.data != 0) || item.data == -1) item.data = this.just_items_map[item.id][0];
				if(item.extra === undefined)item.extra = null;
				if((!item.extra && item.extra != null) || item.extra == -1) item.extra = this.just_items_map_extra[item.id+'_'+item.data][0] || null;
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
				var num = this.items_map.indexOf(itemUid);
				var itemUidExtra = item.id+'_'+item.data;
				if(item.extra && num == -1 && this.just_items_map_extra[itemUidExtra])for(var iasd in this.just_items_map_extra[itemUidExtra]){
					var ___extra = this.just_items_map_extra[itemUidExtra][iasd];
					if(fullExtraToString(item.extra, true) == fullExtraToString(___extra, true)){
						item.extra = ___extra;
						itemUid = getItemUid(item);
						num = this.items_map.indexOf(itemUid);
						break;
					}
				}
				if(num != -1){
					var count1 = Math.min(count, this.stored, this.items[num].count);
					if(count >= this.items[num].count){
						this.items_map.splice(num, 1);
						this.items.splice(num, 1);
						var justIMap;
				if((justIMap = this.just_items_map[item.id].indexOf(item.data)) != -1)this.just_items_map[item.id].splice(justIMap, 1);
						if(this.just_items_map[item.id].length == 0)delete this.just_items_map[item.id];
						if(item.extra){
							if(this.just_items_map_extra[itemUidExtra] && (justIMap = this.just_items_map_extra[itemUidExtra].indexOf(item.extra)) != -1) this.just_items_map_extra[itemUidExtra].splice(justIMap, 1);
							if(this.just_items_map_extra[itemUidExtra] && this.just_items_map_extra[itemUidExtra].length == 0) delete this.just_items_map_extra[itemUidExtra];
						}
						for(var i in this.disk_map){
							for(var k in this.disk_map[i]){
								if(!this.disk_map[i][k] || !this.disk_map[i][k].items) continue;
								if(disk_item = this.disk_map[i][k].items[itemUid]) {
									this.stored -= disk_item.count;
									this.disk_map[i][k].items_stored -= disk_item.count;
									delete this.disk_map[i][k].items[itemUid];
									_RS._emit("itemExtracted", {netId: this.net_id, item: item, count: count1, tags: tags});
									if(!nonUpdate)this.refreshOpenedGrids(true);
									return count - count1;
								}
							}
						}
					} else {
						this.items[num].count -= count1;
						for(var i in this.disk_map){
							for(var k in this.disk_map[i]){
								if(count == 0 || this.stored == 0) {
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
										if(!nonUpdate)this.refreshOpenedGrids();
										return 0;
									}
								};
							}
						}
						if(!nonUpdate)this.refreshOpenedGrids();
						return count;
					}
				} else {
					return count;
				}
				if(!nonUpdate)this.refreshOpenedGrids();
			},
			constructCraft: function(item, count, _craft_) {
				if (item.data == -1 && this.craftsIDS[item.id]) item.data = this.craftsIDS[item.id][0];
				var result = CraftingCalculator.calculate(item, count, this);
				if (!result.craftable && result.errorType === "NO_PATTERN") return false;
				return result;
			},
			scheduleTask: function(_craft_) {
				var requestedItem = _craft_.results && _craft_.results[0]
					? { id: _craft_.results[0].id, data: _craft_.results[0].data, extra: null } : { id: 0, data: 0 };
				var task = CraftingTask.create(_craft_, this, requestedItem, _craft_.requestedCount);
				task.reserveItems(this);
			this.craftingTasks.push(task);
			this.providingCrafts.push(task);
			this.notifyMonitorListeners();
			if(Config.dev)Logger.Log('[CRAFT] Task ' + task.id + ' scheduled: ' + task.requestedCount + 'x ' + task.requestedUid, 'RefinedStorageDebug');
			_RS._emit("taskAdded", {netId: this.net_id, task: {id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount}});
		},
		cancelTask: function(taskId) {
			var task = this.getTask(taskId);
			if (!task) return false;
			task.cancelled = true;
			task.completing = true;
			task.flushBuffer(this);
			var pidx = this.providingCrafts.indexOf(task);
			if (pidx != -1) this.providingCrafts.splice(pidx, 1);
			var tidx = this.craftingTasks.indexOf(task);
			if (tidx != -1) this.craftingTasks.splice(tidx, 1);
			this.notifyMonitorListeners();
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
				this.scheduleTask(_craft_);
			}
		};
	}
};

function copyItem(item) {
	return {id: item.id, count: item.count, data: item.data, extra: item.extra || null};
}
