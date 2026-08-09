var NetworkInfo = {
	create: function(_data, controllerTile, netId) {
		return {
			net_id: netId,
			disk_map: [],
			just_items_map: {},
			just_items_map_extra: {},
			items_map: [],
			items: [],
			openedGrids: [],
			storage: 0,
			stored: 0,
			refreshOpenedGrids: function(_full){
				for(var i in this.openedGrids){
					var __coords = this.openedGrids[i];
					var tile = World.getTileEntity(__coords.x, __coords.y, __coords.z, controllerTile.blockSource);
					tile.data.fullRefreshPage = _full;
					tile.data.refreshCurPage = true;
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
			pushItem: function(item, count, nonUpdate){
				count = count || item.count;
				if(RSbannedItems.indexOf(item.id) != -1){
					if(Config.dev)Logger.Log('Hey you shouldn t push this item:   id: ' + item.id + ', count: ' + count + ' (' + item.count + '), data: ' + item.data + (item.extra ? ', extra: ' + item.extra.getValue() : '') + ', uid: ' + itemUid + ', storage: ' + this.storage + ', stored: ' + this.stored + ' (' + (this.stored + count) + ')' + ', freespace: ' + (this.storage - this.stored) + ' (' + ((this.storage - this.stored) - count) + ')', 'RefinedStorageDebug');
					return count;
				}
				if(!this.itemCanBePushed(item, count)) return count;
				var itemUid = getItemUid(item);
				if(Config.dev)Logger.Log('Pushing item:  id: ' + item.id + ', count: ' + count + ' (' + item.count + '), data: ' + item.data + (item.extra ? ', extra: ' + item.extra.getValue() + "_" + fullExtraToString(item.extra, true) : '') + ', uid: ' + itemUid + ', storage: ' + this.storage + ', stored: ' + this.stored + ' (' + (this.stored + count) + ')' + ', freespace: ' + (this.storage - this.stored) + ' (' + ((this.storage - this.stored) - count) + ')', 'RefinedStorageDebug');
				for(var i in _data){
					if(_data[i].pushItemFunc)count = ((__answ = _data[i].pushItemFunc(item, count)) != undefined ? __answ : count);
					if(count <= 0) return 0;
				}
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
				if((iItem = this.items_map.indexOf(itemUid)) != -1){
					return true;
				} else {
					return false;
				}
			},
			deleteItem: function(item, count, nonUpdate){
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
						if((justIMap = this.just_items_map[item.id].indexOf(item.data)) != -1)this.just_items_map[item.id].splice(justIMap, 1);
						if(this.just_items_map[item.id].length == 0)delete this.just_items_map[item.id];
						if(item.extra){
							if(this.just_items_map_extra[itemUidExtra] && (justIMap = this.just_items_map_extra[itemUidExtra].indexOf(item.extra) != -1)) this.just_items_map_extra[itemUidExtra].splice(justIMap, 1);
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
			}
		};
	}
};
