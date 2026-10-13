// Thin wrapper over TickScheduler.global; `networks` is a compatibility shadow map.
var NetworkTimer = {
	networks: {},

	RESERVED: { netMap: 1, patternCheck: 1, incompleteRetry: 1, flush: 1 },

	register: function(netId, name, interval, offset, fn, internal, options) {
		if (typeof netId !== 'number' || !(netId >= 0) || typeof RSNetworks === 'undefined' || !RSNetworks[netId] || !RSNetworks[netId].info) { return false; }
		if (typeof name !== 'string' || !name) { return false; }
		if (this.RESERVED[name] && !internal) { return false; }
		interval = Math.floor(Number(interval));
		if (!isFinite(interval) || interval < 1) { return false; }
		offset = Math.floor(Number(offset));
		if (!isFinite(offset) || offset < 0) offset = 0;
		offset = offset % interval;
		if (typeof fn !== 'function') { return false; }
		options = options || {};
		var taskOpts = { internal: !!internal };
		if (typeof options.isDirty == 'function') taskOpts.isDirty = options.isDirty;
		if (typeof options.onError == 'function') taskOpts.onError = options.onError;
		// Identity guard: skip tasks of a torn-down network.
		var wrapped = function (scopeId, _info, controllerTile, blockSource) {
			if (typeof RSNetworks === 'undefined' || !RSNetworks[scopeId] || RSNetworks[scopeId].info !== _info) return;
			fn(scopeId, _info, controllerTile, blockSource);
		};
		var handle = TickScheduler.global.register(netId, name, interval, offset, wrapped, taskOpts);
		if (handle === false || handle == null) { return false; }
		var net = this.networks[netId];
		if (!net) net = this.networks[netId] = { heartbeat: 0, tasks: {} };
		net.tasks[name] = { internal: !!internal };
		var self = this;
		return {
			cancel: function() {
				return self.unregister(netId, name);
			}
		};
	},

	unregister: function(netId, name) {
		var ok = TickScheduler.global.unregister(netId, name);
		if (this.networks[netId] && this.networks[netId].tasks[name]) delete this.networks[netId].tasks[name];
		return ok;
	},

	get: function(netId, name) {
		var info = TickScheduler.global.get(netId, name);
		if (!info) return null;
		var net = this.networks[netId];
		var t = net && net.tasks[name];
		info.internal = t ? !!t.internal : false;
		return info;
	},

	list: function(netId) {
		var out = TickScheduler.global.list(netId);
		if (!out) return null;
		var net = this.networks[netId];
		for (var name in out) {
			var t = net && net.tasks[name];
			out[name].internal = t ? !!t.internal : false;
		}
		return out;
	},

	listAll: function() {
		var all = TickScheduler.global.listAll();
		delete all["__auto"];
		for (var netId in all) {
			var out = all[netId];
			var net = this.networks[netId];
			for (var name in out) {
				var t = net && net.tasks[name];
				out[name].internal = t ? !!t.internal : false;
			}
		}
		return all;
	},

	destroyNetwork: function(netId) {
		TickScheduler.global.destroyScope(netId);
		if (this.networks[netId]) delete this.networks[netId];
		if (typeof _pendingUpdateItems !== 'undefined' && _pendingUpdateItems[netId]) delete _pendingUpdateItems[netId];
	},

	reset: function() {
		TickScheduler.admin().resetAll();
		this.networks = {};
	},

	// Called once per controller tile tick while the network is allowed to work.
	heartbeat: function(info, controllerTile, blockSource) {
		if (!info || info.net_id == null) return;
		if (typeof RSNetworks === 'undefined' || !RSNetworks[info.net_id] || RSNetworks[info.net_id].info !== info) return;
		var net = this.networks[info.net_id];
		if (!net) net = this.networks[info.net_id] = { heartbeat: 0, tasks: {} };
		NetworkTimer.ensureInternalTasks(net, info);
		TickScheduler.global.heartbeat(info.net_id, info, controllerTile, blockSource);
	},

	// Lazily (re)registers the internal per-network tasks so they survive re-binding.
	ensureInternalTasks: function(net, info) {
		if (!net.tasks.netMap) {
			NetworkTimer.register(info.net_id, 'netMap', 20, info.net_id % 20, function(netId, _info, tile, blockSource) {
				tile.updateNetMap();
				if (_info) _info.netMapDirty = false;
			if (tile.container.getNetworkEntity().getClients().iterator().hasNext()) {
				var _usageText = Translation.translate('Usage') + ": " + tile.data.usage + " FE/t";
				if (tile.data._lastGuiUsageText !== _usageText) {
					tile.data._lastGuiUsageText = _usageText;
					tile.container.setText('usage', _usageText);
				}
			}
			}, true, {
				isDirty: function() {
					return info.netMapDirty;
				}
			});
		}
		/* Periodic full pattern rebuild is intentionally disabled: crafters register/unregister
		 * their patterns incrementally (addCraft/removeCraft) and post_update_network fills the
		 * gaps, so the 6000-tick scan is redundant. Kept here for on-demand use. */
		/* if (!net.tasks.patternCheck) {
			NetworkTimer.register(info.net_id, 'patternCheck', 6000, info.net_id % 6000, function(netId, _info, tile, blockSource) {
				if (_info) _info.rebuildPatternContainers(tile);
			}, true);
		} */
		if (!net.tasks.incompleteRetry) {
			NetworkTimer.register(info.net_id, 'incompleteRetry', 1, 0, function(netId, _info, tile, blockSource) {
				if (_info && _info.incomplete) {
					tile.data.incompleteRetry = (tile.data.incompleteRetry === undefined ? 0 : tile.data.incompleteRetry) + 1;
					if (tile.data.incompleteRetry >= 100) {
						tile.data.incompleteRetry = 0;
						tile.data.updateControllerNetwork = true;
					}
				} else if (tile.data.incompleteRetry) {
					tile.data.incompleteRetry = 0;
				}
			}, true);
		}
		if (!net.tasks.flush) {
			NetworkTimer.register(info.net_id, 'flush', 1, 0, function(netId, _info, tile, blockSource) {
				if (!_info || !_pendingUpdateItems[_info.net_id]) return;
				var pInfo = _pendingUpdateItems[_info.net_id];
				delete _pendingUpdateItems[_info.net_id];
				if (RSNetworks[_info.net_id] && RSNetworks[_info.net_id].info === pInfo) pInfo.updateItems();
			}, true);
		}
	}
};

