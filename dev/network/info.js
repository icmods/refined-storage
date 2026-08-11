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
			notifyMonitorListeners: function() {
				Logger.Log('[INFO] notifyMonitor: listeners=' + this.monitorListeners.length + ' tasks=' + this.craftingTasks.length, 'RS_DEBUG');
				for (var i = 0; i < this.monitorListeners.length; i++) {
					if (this.monitorListeners[i]) this.monitorListeners[i](this);
				}
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
			addItemAddedListener: function(func, priority){
				if(typeof func != 'function') return false;
				priority = priority || 0;
				func.priority = priority;
				for(var i in this.itemAddListeners){
					if(this.itemAddListeners[i].priority < priority){
						this.itemAddListeners.splice(i,0,func);
						return true;
					}
				}
				this.itemAddListeners.push(func);
				return true;
			},
			addItemRemovedListener: function(func, priority){
				if(typeof func != 'function') return false;
				priority = priority || 0;
				func.priority = priority;
				for(var i in this.itemRemoveListeners){
					if(this.itemRemoveListeners[i].priority < priority){
						this.itemRemoveListeners.splice(i,0,func);
						return true;
					}
				}
				this.itemRemoveListeners.push(func);
				return true;
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
				if(Config.dev)Logger.Log('Updating items', 'RefinedStorageDebug');
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
				if(RSbannedItems.indexOf(item.id) != -1){
					if(Config.dev)Logger.Log('Hey you shouldn t push this item:   id: ' + item.id + ', count: ' + count + ' (' + item.count + '), data: ' + item.data + (item.extra ? ', extra: ' + item.extra.getValue() : '') + ', uid: ' + itemUid + ', storage: ' + this.storage + ', stored: ' + this.stored + ' (' + (this.stored + count) + ')' + ', freespace: ' + (this.storage - this.stored) + ' (' + ((this.storage - this.stored) - count) + ')', 'RefinedStorageDebug');
					return count;
				}
				if(!this.itemCanBePushed(item, count)) return count;
				var itemUid = getItemUid(item);
				if(Config.dev)Logger.Log('Pushing item:  id: ' + item.id + ', count: ' + count + ' (' + item.count + '), data: ' + item.data + (item.extra ? ', extra: ' + item.extra.getValue() + "_" + fullExtraToString(item.extra, true) : '') + ', uid: ' + itemUid + ', storage: ' + this.storage + ', stored: ' + this.stored + ' (' + (this.stored + count) + ')' + ', freespace: ' + (this.storage - this.stored) + ' (' + ((this.storage - this.stored) - count) + ')', 'RefinedStorageDebug');
				for(var i in _data){
					var __answ;
				if(_data[i].pushItemFunc)count = ((__answ = _data[i].pushItemFunc(item, count)) != undefined ? __answ : count);
					if(count <= 0) return 0;
				}
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
				if(Config.dev)Logger.Log('Deleting item:  id: ' + item.id + ', count: ' + count + ' (' + item.count + '), data: ' + item.data + (item.extra ? ', extra: ' + item.extra.getValue() + "_" + fullExtraToString(item.extra, true) : '') + ', uid: ' + itemUid + ', storage: ' + this.storage + ', stored: ' + this.stored + ' (' + (this.stored - count) + ')' + ', freespace: ' + (this.storage - this.stored) + ' (' + ((this.storage - this.stored) + count) + ')', 'RefinedStorageDebug');
				for(var i in _data){
					if(_data[i].deleteItemFunc)count = _data[i].deleteItemFunc(item, count) || count;
					if(count <= 0) return 0;
				}
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
					if(Config.dev)Logger.Log('Comparing extra: ' + fullExtraToString(item.extra, true) + " with: " + fullExtraToString(___extra, true), 'RefinedStorageDebug');
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
			getCraft: function(item, _craft_, multiplier_) {
				multiplier_ = multiplier_ || 1;
				if (item.data == -1 && this.craftsIDS[item.id]) item.data = this.craftsIDS[item.id][0];
				var itemUid = item.id + '_' + item.data;
				if (!this.crafts[itemUid]) return false;
				var completedIngridients = [];
				var taked = (_craft_ && _craft_.taked) || {};
				if (!taked.taked) {
					taked.taked = function(item) {
						var uid = getItemUid(item);
						return taked[uid];
					};
					taked.has = function(item) {
						var uid = getItemUid(item);
						return !!taked[uid] && taked[uid].count > 0;
					};
				}
				var craftable = true;
				var needCrafts = [];
				var allIngridients = [];
				var __craft = undefined;
				craftsIterator:
				for (var ci = 0; ci < this.crafts[itemUid].length; ci++) {
					var craft = this.crafts[itemUid][ci];
					var liteIngridientsMap = {};
					var replaceMap = {};
					for (var ii = 0; ii < craft.ingridients.length; ii++) {
						var ingr = craft.ingridients[ii];
						if (!ingr || !ingr.id) continue;
						var uid = getItemUid(ingr);
						if (!liteIngridientsMap[uid]) {
							liteIngridientsMap[uid] = copyItem(ingr);
						} else {
							liteIngridientsMap[uid].count += ingr.count;
						}
					}
					craftable = true;
					iIterator:
					for (var uid in liteIngridientsMap) {
						var iitem = liteIngridientsMap[uid];
						iitem.count *= multiplier_;
						replaceMap[uid] = [];
						var sumCount = 0;
						if (!this.just_items_map[iitem.id]) {
							if (_craft_) {
								var itemKey = iitem.id + '_' + iitem.data;
								if (taked[itemKey]) {
									craftable = false;
									replaceMap[uid].push({id: iitem.id, data: iitem.data, count: 0, need: iitem.count});
									continue iIterator;
								}
								taked[itemKey] = iitem;
								var _craft_2 = {taked: taked, results: [], ingridients: [], crafts: []};
								var constructedCraft = this.constructCraft({id: iitem.id, data: iitem.data, count: iitem.count}, iitem.count, _craft_2);
								if (constructedCraft) {
								assignIngridients(_craft_.ingridients, constructedCraft.ingridients);
								assignIngridients(_craft_.results, constructedCraft.results);
								_craft_.crafts = _craft_.crafts.concat(constructedCraft.crafts);
								if (constructedCraft.craftable) {
									replaceMap[uid].push({id: iitem.id, data: iitem.data, count: iitem.count});
									needCrafts.push(constructedCraft);
								} else {
										craftable = false;
										replaceMap[uid].push({id: iitem.id, data: iitem.data, count: 0, need: iitem.count});
									}
								}
								continue iIterator;
							}
							craftable = false;
							continue craftsIterator;
						}
						var itemUidExtra = iitem.id + '_' + iitem.data;
						if (iitem.extra) itemUidExtra += '_' + (iitem.extra.getValue ? iitem.extra.getValue() : iitem.extra);
						var index = -1;
						if (this.just_items_map_extra[itemUidExtra]) {
							var extraList = this.just_items_map_extra[itemUidExtra];
							for (var ei = 0; ei < extraList.length; ei++) {
								var extraUid = iitem.id + '_' + iitem.data;
								if (extraList[ei] && extraList[ei].getValue) extraUid += '_' + extraList[ei].getValue();
								else extraUid += '_' + extraList[ei];
								index = this.items_map.indexOf(extraUid);
								if (index != -1) break;
							}
						} else {
							index = this.items_map.indexOf(iitem.id + '_' + iitem.data);
						}
						if (index != -1) {
							var storedItem = this.items[index];
							var available = storedItem.count;
							var takenCount = taked[itemUid] ? taked[itemUid].count : 0;
							available -= takenCount;
							if (iitem.count <= available) {
								replaceMap[uid].push({id: iitem.id, data: iitem.data, count: iitem.count});
								sumCount = iitem.count;
							} else if (available > 0) {
								replaceMap[uid].push({id: iitem.id, data: iitem.data, count: available, need: iitem.count - available});
								sumCount = available;
								craftable = false;
							} else {
								replaceMap[uid].push({id: iitem.id, data: iitem.data, count: 0, need: iitem.count});
								craftable = false;
							}
						} else {
							replaceMap[uid].push({id: iitem.id, data: iitem.data, count: 0, need: iitem.count});
							craftable = false;
						}
					}
					for (var uid in replaceMap) {
						for (var ri = 0; ri < replaceMap[uid].length; ri++) {
							completedIngridients.push(replaceMap[uid][ri]);
						}
					}
					if (!craftable) continue craftsIterator;
					__craft = craft;
					break craftsIterator;
				}
				if (!__craft) {
					__craft = this.crafts[itemUid][0];
					craftable = false;
				}
				for (var uid in liteIngridientsMap) {
					var ingr = liteIngridientsMap[uid];
					var itemIngr = copyItem(ingr);
					itemIngr.count *= multiplier_;
					allIngridients.push(itemIngr);
				}
				var result = null;
				for (var ri = 0; ri < __craft.result.length; ri++) {
					var r = __craft.result[ri];
					if (r.id == item.id && (r.data == item.data || r.data == -1)) {
						result = copyItem(r);
						break;
					}
				}
				if (!result) result = copyItem(__craft.result[0]);
				result.count *= multiplier_;
				if (!craftable) result.need = result.count;
				if (_craft_) {
					assignIngridients(_craft_.ingridients, allIngridients);
					assignIngridients(_craft_.results, [result]);
				}
				var withoutMachine = false;
				if (__craft.isProcessed) {
					var coordsId = __craft.coordsId;
					var machineTile = null;
					if (typeof coordsId == 'string') {
						var networkEntry = RSNetworks[this.net_id] && RSNetworks[this.net_id][coordsId];
						if (networkEntry && networkEntry.coords) {
							machineTile = World.getTileEntity(networkEntry.coords.x, networkEntry.coords.y, networkEntry.coords.z, controllerTile.blockSource);
						}
					} else if (coordsId && coordsId.x != null) {
						machineTile = World.getTileEntity(coordsId.x, coordsId.y, coordsId.z, controllerTile.blockSource);
					}
					if (!machineTile) {
						craftable = false;
						withoutMachine = true;
					}
					if (_craft_) _craft_.withoutMachineChecked[__craft.coordsId] = withoutMachine;
				}
				var oneCountIngridients = [];
				for (var ai = 0; ai < allIngridients.length; ai++) {
					var itemIngr = copyItem(allIngridients[ai]);
					itemIngr.count /= multiplier_;
					oneCountIngridients.push(itemIngr);
				}
				var _craft2 = {
					craftable: craftable,
					withoutMachine: withoutMachine,
					result: result,
					result2: copyItem(result),
					count: multiplier_,
					allIngridients: allIngridients,
					oneCountIngridients: oneCountIngridients,
					completedIngridients: completedIngridients,
					craft: __craft,
					_craft_: _craft_,
					needCrafts: needCrafts
				};
				if (_craft_) _craft_.crafts.push(_craft2);
				return _craft2;
			},
			constructCraft: function(item, count, _craft_) {
				if (item.data == -1 && this.craftsIDS[item.id]) item.data = this.craftsIDS[item.id][0];
				if (_craft_) {
					var itemUid = item.id + '_' + item.data;
					if (!this.crafts[itemUid]) return false;
					var fullCrafts = _craft_;
					var craftPatterns = this.crafts[itemUid];
					var baseCount = craftPatterns[0] && craftPatterns[0].result && craftPatterns[0].result[0] ? craftPatterns[0].result[0].count : 1;
					var multiplier = count > baseCount ? Math.ceil(count / baseCount) : undefined;
					var craft = this.getCraft(item, fullCrafts, multiplier);
					if (!craft || !craft.craftable) {
						fullCrafts.craftable = false;
					}
					return fullCrafts;
				}
				var result = CraftingCalculator.calculate(item, count, this);
				Logger.Log('[INFO] constructCraft result: craftable=' + result.craftable + ' error=' + (result.errorType || 'none') + ' results=' + (result.results ? result.results.length : 0) + ' crafts=' + (result.crafts ? result.crafts.length : 0), 'RS_DEBUG');
				if (!result.craftable && result.errorType === "NO_PATTERN") return false;
				return result;
			},
		scheduleCraft: function(_craft_) {
				_craft_.internalStorage = [];
				_craft_.flatSteps = buildFlatSteps(_craft_);
				_craft_.totalSteps = _craft_.flatSteps.length;
				_craft_.currentStep = 0;
				this.craftingTasks.push(_craft_);
				this.providingCrafts.push(_craft_);
				this.startCrafting(_craft_);
			},
			scheduleTask: function(_craft_) {
				Logger.Log('[INFO] scheduleTask: results=' + (_craft_.results ? _craft_.results.length : 0) + ' hasPlan=' + !!_craft_.plan + ' crafts=' + (_craft_.crafts ? _craft_.crafts.length : 0), 'RS_DEBUG');
				var requestedItem = _craft_.results && _craft_.results[0]
					? { id: _craft_.results[0].id, data: _craft_.results[0].data, extra: null } : { id: 0, data: 0 };
				var task = CraftingTask.create(_craft_, this, requestedItem, _craft_.requestedCount);
				_craft_.flatSteps = buildFlatSteps(_craft_);
				_craft_.totalSteps = task.totalSteps || _craft_.flatSteps.length;
				_craft_.currentStep = 0;
				task.reserveItems(this);
				Logger.Log('[INFO] Task ' + task.id + ': nodes=' + task.nodes.length + ' buffer=' + JSON.stringify(task.buffer) + ' toReserve=' + JSON.stringify(task.toReserve) + ' totalSteps=' + task.totalSteps, 'RS_DEBUG');
				this.craftingTasks.push(task);
				this.providingCrafts.push(task);
				if(Config.dev)Logger.Log('[CRAFT] Task ' + task.id + ' scheduled: ' + task.requestedCount + 'x ' + task.requestedUid + ' nodes=' + task.nodes.length + ' toReserve=' + JSON.stringify(task.toReserve), 'RefinedStorageDebug');
				this.notifyMonitorListeners();
				this.startCrafting(task);
			},
			cancelTask: function(taskId) {
				Logger.Log('[INFO] cancelTask: ' + taskId, 'RS_DEBUG');
				var task = this.getTask(taskId);
				if (!task) return false;
				task.cancelled = true;
				task.flushBuffer(this);
				for (var i = 0; i < task.internalStorage.length; i++) {
					var item = task.internalStorage[i];
					this.pushItem(item, item.count, false, ['autocraft']);
				}
				task.internalStorage = [];
				var pidx = this.providingCrafts.indexOf(task);
				if (pidx != -1) this.providingCrafts.splice(pidx, 1);
				var tidx = this.craftingTasks.indexOf(task);
				if (tidx != -1) this.craftingTasks.splice(tidx, 1);
				if(Config.dev)Logger.Log('[CRAFT] Task ' + taskId + ' cancelled', 'RefinedStorageDebug');
				Logger.Log('[INFO] cancelTask DONE: ' + taskId + ' flushed', 'RS_DEBUG');
				return true;
			},
			getTask: function(taskId) {
				for (var i = 0; i < this.craftingTasks.length; i++) {
					if (this.craftingTasks[i].id === taskId) return this.craftingTasks[i];
				}
				return null;
			},
		provideCraft: function(_craft_) {
			this.scheduleTask(_craft_);
		},
			startCrafting: function(_craft_) {
				if (!_craft_ || !_craft_.crafts) return;
				for (var ci = 0; ci < _craft_.crafts.length; ci++) {
					var cra = _craft_.crafts[ci];
					if (!cra || !cra.craft) continue;
					if (!cra.craft.isProcessed) {
						var needsItems = false;
						for(var ni = 0; ni < cra.completedIngridients.length; ni++){
							if(cra.completedIngridients[ni].need > 0) needsItems = true;
						}
						if(!needsItems){
							_craft_.providedCrafts.push(cra);
							continue;
						}
						var listener = function(item, count, tags) {
							var match = getIngridientItem(cra.completedIngridients, item);
							if (!match || !match.need) return;
							var consumed = Math.min(count, match.need);
							match.need -= consumed;
							if(Config.dev)Logger.Log('Craft ingredient consumed: ' + Item.getName(item.id, item.data) + ' x' + consumed + ' (need: ' + match.need + ') for [' + cra.craft.result[0].id + ']', 'RefinedStorageDebug');
							if (match.need <= 0) {
								_craft_.providedCrafts.push(cra);
								var idx = _craft_.currentCrafts.indexOf(cra);
								if (idx != -1) _craft_.currentCrafts.splice(idx, 1);
								if(Config.dev)Logger.Log('Craft fully provided: [' + cra.craft.result[0].id + '] coords=' + cra.craft.coordsId, 'RefinedStorageDebug');
								return true;
							}
							return count - consumed;
						};
						this.addItemAddedListener(listener, 0);
						_craft_.currentCrafts.push(cra);
					} else {
						_craft_.currentCrafts.push(cra);
					}
				}
			},
			updateCrafts_: function(_craft_, coordsFilter) {
				if (!_craft_ || !_craft_.crafts) return;
				_craft_.internalStorage = _craft_.internalStorage || [];
				var snap = _craft_.providedCrafts.slice();
				for (var ci = 0; ci < _craft_.crafts.length; ci++) {
					var cra = _craft_.crafts[ci];
					if (!cra) continue;
					if (coordsFilter && cra.craft && cra.craft.coordsId != coordsFilter) continue;
					var inCurrent = _craft_.currentCrafts.indexOf(cra) != -1;
					if (inCurrent) {
						if (cra.craft && cra.craft.isProcessed) {
							var coords = cra.craft.coordsId;
							if (coords && RSNetworks[this.net_id] && RSNetworks[this.net_id][coords]) {
								if (RSNetworks[this.net_id][coords].isWorking === false) {
									for (var ii = 0; ii < cra.completedIngridients.length; ii++) {
										this.pushItem(copyItem(cra.completedIngridients[ii]), 1, false, ['autocraft', false]);
									}
									_craft_.currentCrafts.splice(ci, 1);
								}
							}
						}
					} else if (snap.indexOf(cra) != -1) {
						cra._remaining = cra._remaining != null ? cra._remaining : (cra.count || 1);
						if (cra._remaining <= 0) {
							_craft_.completedCrafts.push(cra);
							var idx = _craft_.providedCrafts.indexOf(cra);
							if (idx != -1) _craft_.providedCrafts.splice(idx, 1);
						} else {
							for (var si = 0; si < cra.oneCountIngridients.length; si++) {
								consumeIngridients(_craft_.ingridients, [cra.oneCountIngridients[si]]);
							}
							if (!cra.craft.isProcessed) {
								if(Config.dev)Logger.Log('[CRAFT] Executing: ' + Item.getName(cra.result.id, cra.result.data) + ' x1 (remaining: ' + (cra._remaining-1) + ')', 'RefinedStorageDebug');
								for (var si = 0; si < cra.oneCountIngridients.length; si++) {
									var ingr = cra.oneCountIngridients[si];
									this.deleteItem(ingr, ingr.count || 1, true, ['autocraft']);
								}
								this.pushItem({id: cra.result.id, data: cra.result.data, count: 1, extra: null}, 1, false, ['fromCrafter']);
							}
							cra._remaining--;
						}
					}
				}
				for (var ni = 0; ni < _craft_.crafts.length; ni++) {
					var need = _craft_.crafts[ni].needCrafts;
					if (need) for (var nj = 0; nj < need.length; nj++) this.updateCrafts_(need[nj]);
				}
				if(_craft_.currentCrafts.length === 0 && _craft_.providedCrafts.length === 0){
					for (var bi = 0; bi < _craft_.internalStorage.length; bi++) {
						var item = _craft_.internalStorage[bi];
						this.pushItem(item, item.count, false, ['fromCrafter']);
						if(Config.dev)Logger.Log('[CRAFT] Flushed: ' + Item.getName(item.id, item.data) + ' x' + item.count, 'RefinedStorageDebug');
					}
					_craft_.internalStorage = [];
					var pidx = this.providingCrafts.indexOf(_craft_);
					if(pidx != -1) this.providingCrafts.splice(pidx, 1);
					var tidx = this.craftingTasks.indexOf(_craft_);
					if(tidx != -1) this.craftingTasks.splice(tidx, 1);
					if(Config.dev)Logger.Log('[CRAFT] Completed: ' + _craft_.crafts.length + ' sub-crafts done, removed from providingCrafts', 'RefinedStorageDebug');
				}
				this.refreshOpenedGrids();
			},
			tickCrafting: function(coordsFilter){
				for (var i = 0; i < this.craftingTasks.length; i++) {
					this.updateCrafts_(this.craftingTasks[i], coordsFilter);
				}
			}
		};
function buildFlatSteps(_craft_) {
	var steps = [];
	function walk(crafts) {
		if (!crafts) return;
		for (var i = 0; i < crafts.length; i++) {
			var c = crafts[i];
			if (!c) continue;
			if (c.needCrafts && c.needCrafts.length > 0) walk(c.needCrafts);
			steps.push(c);
		}
	}
	walk(_craft_.crafts);
	return steps;
}
	return obj;
	}
};

function copyItem(item) {
	return {id: item.id, count: item.count, data: item.data, extra: item.extra || null};
}

function getIngridientItem(ingridients, item) {
	for (var i in ingridients) {
		if (ingridients[i].id == item.id && ingridients[i].data == item.data) return ingridients[i];
	}
	return null;
}

function assignIngridients(ingr1, ingr2) {
	for (var i in ingr2) {
		var item2 = ingr2[i];
		var found = false;
		for (var j in ingr1) {
			if (compareSlots(ingr1[j], item2, false, true)) {
				ingr1[j].count += item2.count;
				if (item2.need != null) ingr1[j].need = (ingr1[j].need || 0) + item2.need;
				found = true;
			}
		}
		if (!found) {
			ingr1.push(copyItem(item2));
			if (item2.need != null) ingr1[ingr1.length - 1].need = item2.need || 0;
		}
	}
	return ingr1;
}

function consumeIngridients(ingr1, ingr2) {
	for (var i = ingr1.length - 1; i >= 0; i--) {
		for (var j = 0; j < ingr2.length; j++) {
			if (compareSlots(ingr1[i], ingr2[j], false, true)) {
				ingr1[i].count -= ingr2[j].count;
				if (ingr2[j].need != null && ingr1[i].need != null) ingr1[i].need -= ingr2[j].need;
				if (ingr1[i].count <= 0 && (!ingr1[i].need || ingr1[i].need <= 0)) ingr1.splice(i, 1);
				break;
			}
		}
	}
}
