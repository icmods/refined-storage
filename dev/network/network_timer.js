// ============================================================
// Network Timer — per-network tick scheduler.
//
// Tick-based (heartbeat counter advanced once per controller tile tick while
// the network is allowed to work), runtime-only (nothing persisted), driven by
// the controller heartbeat so a network is "alive" only while its controller
// chunk is ticking. Tasks use a nextRun deadline (no modulo drift, no catch-up
// storms); an optional isDirty() runs the task immediately and resets its
// cadence (dirty run => nextRun = now + interval).
//
// Cleanup: NetworkTimer.destroyNetwork(netId) on network destroyed and
// NetworkTimer.reset() on LevelLeft.
//
// Internal RefinedStorage tasks (netMap, patternCheck, incompleteRetry, flush)
// are reserved names, registered eagerly in controller.init and re-registered
// lazily on the first heartbeat of each network (self-healing safety net).
// ============================================================

var NetworkTimer = {
	networks: {},

	RESERVED: { netMap: 1, patternCheck: 1, incompleteRetry: 1, flush: 1 },

	register: function(netId, name, interval, offset, fn, internal) {
		if (typeof netId !== 'number' || !(netId >= 0) || typeof RSNetworks === 'undefined' || !RSNetworks[netId] || !RSNetworks[netId].info) return false;
		if (typeof name !== 'string' || !name) return false;
		if (this.RESERVED[name] && !internal) return false;
		interval = Math.floor(Number(interval));
		if (!isFinite(interval) || interval < 1) return false;
		offset = Math.floor(Number(offset));
		if (!isFinite(offset) || offset < 0) offset = 0;
		offset = offset % interval;
		if (typeof fn !== 'function') return false;
		var net = this.networks[netId];
		if (!net) net = this.networks[netId] = { heartbeat: 0, tasks: {} };
		net.tasks[name] = {
			interval: interval,
			offset: offset,
			nextRun: net.heartbeat + interval - offset,
			lastRun: 0,
			runs: 0,
			failures: 0,
			internal: !!internal,
			isDirty: null,
			fn: fn
		};
		return {
			cancel: function() {
				return NetworkTimer.unregister(netId, name);
			}
		};
	},

	unregister: function(netId, name) {
		var net = this.networks[netId];
		if (net && net.tasks[name]) {
			delete net.tasks[name];
			return true;
		}
		return false;
	},

	get: function(netId, name) {
		var net = this.networks[netId];
		var t = net && net.tasks[name];
		if (!t) return null;
		return {
			interval: t.interval,
			offset: t.offset,
			nextRun: t.nextRun,
			lastRun: t.lastRun,
			runs: t.runs,
			failures: t.failures,
			internal: t.internal
		};
	},

	list: function(netId) {
		var net = this.networks[netId];
		if (!net) return null;
		var out = {};
		for (var name in net.tasks) out[name] = this.get(netId, name);
		return out;
	},

	listAll: function() {
		var out = {};
		for (var netId in this.networks) out[netId] = this.list(Number(netId));
		return out;
	},

	destroyNetwork: function(netId) {
		if (this.networks[netId]) delete this.networks[netId];
		if (typeof _pendingUpdateItems !== 'undefined' && _pendingUpdateItems[netId]) delete _pendingUpdateItems[netId];
	},

	reset: function() {
		this.networks = {};
	},

	// Called once per controller tile tick while the network is allowed to
	// work. Advances the network heartbeat and runs due/dirty tasks in
	// registration-name order. Each task is guarded by network identity and
	// wrapped in try/catch (a failing callback never stops the heartbeat).
	heartbeat: function(info, controllerTile, blockSource) {
		if (!info || info.net_id == null) return;
		if (typeof RSNetworks === 'undefined' || !RSNetworks[info.net_id] || RSNetworks[info.net_id].info !== info) return;
		var net = this.networks[info.net_id];
		if (!net) net = this.networks[info.net_id] = { heartbeat: 0, tasks: {} };
		NetworkTimer.ensureInternalTasks(net, info);
		net.heartbeat++;
		var names = Object.keys(net.tasks);
		for (var i = 0; i < names.length; i++) {
			var t = net.tasks[names[i]];
			if (!t) continue;
			if (typeof RSNetworks === 'undefined' || !RSNetworks[info.net_id] || RSNetworks[info.net_id].info !== info) continue;
			var dirty = typeof t.isDirty === 'function' && t.isDirty();
			if (!dirty && net.heartbeat < t.nextRun) continue;
			if (dirty) {
				t.nextRun = net.heartbeat + t.interval;
			} else {
				t.nextRun = Math.max(t.nextRun + t.interval, net.heartbeat + t.interval);
			}
			t.lastRun = net.heartbeat;
			t.runs++;
			try {
				t.fn(info.net_id, info, controllerTile, blockSource);
			} catch (e) {
				t.failures++;
				Logger.Log('[Timer] Task "' + names[i] + '" on network ' + info.net_id + ' failed: ' + e, 'RefinedStorageError');
			}
		}
	},

	// Lazily (re)registers the internal per-network tasks. Called from
	// heartbeat on every network before the first tick pass, so tasks survive
	// network re-init / re-binding without any extra wiring.
	ensureInternalTasks: function(net, info) {
		if (!net.tasks.netMap) {
			NetworkTimer.register(info.net_id, 'netMap', 20, info.net_id % 20, function(netId, _info, tile, blockSource) {
				tile.updateNetMap();
				if (_info) _info.netMapDirty = false;
				if (tile.container.getNetworkEntity().getClients().iterator().hasNext() || tile.data.containerUpdate) {
					var _usageText = Translation.translate('Usage') + ": " + tile.data.usage + " FE/t";
					if (tile.data._lastGuiUsageText !== _usageText) {
						tile.data._lastGuiUsageText = _usageText;
						tile.container.setText('usage', _usageText);
						tile.data.containerUpdate = true;
					}
				}
			}, true);
			// Staggered first run (offset = netId % 20); initial data is covered by the
			// boot updateNetMap(true) / post_setActive and by immediate dirty runs.
			net.tasks.netMap.isDirty = function() {
				return info.netMapDirty;
			};
		}
		if (!net.tasks.patternCheck) {
			NetworkTimer.register(info.net_id, 'patternCheck', 6000, info.net_id % 6000, function(netId, _info, tile, blockSource) {
				if (_info) _info.rebuildPatternContainers(tile);
			}, true);
		}
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
