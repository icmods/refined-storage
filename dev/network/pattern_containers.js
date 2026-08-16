var PatternContainerRegistry = {

	entries: {},
	coordsIndex: {},

	_coordsKey: function(dimension, coordsId) {
		return dimension + ':' + coordsId;
	},

	register: function(tile, container) {
		if (!tile || !container || typeof container.getPatterns !== 'function') return false;
		var dimension = tile.dimension !== undefined ? tile.dimension : null;
		var coordsId = cts(tile);
		var key = this._coordsKey(dimension, coordsId);
		this.entries[key] = {
			containerId: container.containerId || 'unknown',
			coordsId: coordsId,
			coords: { x: tile.x, y: tile.y, z: tile.z },
			dimension: dimension,
			container: container
		};
		this.coordsIndex[this._coordsKey(dimension, cts(tile))] = key;
		return true;
	},

	unregister: function(tile) {
		if (!tile) return false;
		var dimension = tile.dimension !== undefined ? tile.dimension : null;
		var key = this._coordsKey(dimension, cts(tile));
		if (this.entries[key]) {
			delete this.entries[key];
			var cIdx = this._coordsKey(dimension, cts(tile));
			if (this.coordsIndex[cIdx] === key) delete this.coordsIndex[cIdx];
			return true;
		}
		return false;
	},

	get: function(tile) {
		if (!tile) return null;
		var dimension = tile.dimension !== undefined ? tile.dimension : null;
		var entry = this.entries[this._coordsKey(dimension, cts(tile))];
		return entry ? entry.container : null;
	},

	getByCoords: function(coords, dimension) {
		if (!coords) return null;
		var key = this.coordsIndex[this._coordsKey(dimension !== undefined ? dimension : null, cts(coords))];
		var entry = key ? this.entries[key] : null;
		return entry ? entry.container : null;
	},

	forNetwork: function(netId, blockSource, dimension) {
		var out = [];
		var deadKeys = [];
		for (var key in this.entries) {
			var entry = this.entries[key];
			if (!entry) continue;
			if (dimension !== undefined && dimension !== null && entry.dimension !== dimension) continue;
			var tile = World.getTileEntity(entry.coords.x, entry.coords.y, entry.coords.z, blockSource);
			if (!tile || !tile.data) {
				deadKeys.push(key);
				continue;
			}
			if (tile.data.NETWORK_ID !== netId || !tile.data.isActive) continue;
			out.push({ container: entry.container, containerId: entry.containerId, coordsId: entry.coordsId, coords: entry.coords, tile: tile });
		}
		for (var dk = 0; dk < deadKeys.length; dk++) {
			var deadEntry = this.entries[deadKeys[dk]];
			if (deadEntry) {
				var deadCoords = this._coordsKey(deadEntry.dimension, deadEntry.coords.x + ',' + deadEntry.coords.y + ',' + deadEntry.coords.z);
				if (this.coordsIndex[deadCoords] === deadKeys[dk]) delete this.coordsIndex[deadCoords];
			}
			delete this.entries[deadKeys[dk]];
		}
		return out;
	},

	validatePattern: function(pattern) {
		if (!pattern || typeof pattern !== 'object') return null;
		var rawOut = pattern.result;
		if (!Array.isArray(rawOut) && rawOut && typeof rawOut === 'object') {
			var mapped = [];
			for (var mUid in rawOut) mapped.push(rawOut[mUid]);
			rawOut = mapped;
		}
		if (!Array.isArray(rawOut)) return null;
		var result = [];
		for (var ri = 0; ri < rawOut.length; ri++) {
			var r = rawOut[ri];
			if (!r || !r.id || r.id <= 0) continue;
			result.push({ id: r.id, data: r.data || 0, count: r.count || 1 });
		}
		if (result.length === 0) return null;
		var rawIn = pattern.ingridients;
		if (!Array.isArray(rawIn)) rawIn = [];
		var ingridients = [];
		for (var ii = 0; ii < rawIn.length; ii++) {
			var ing = rawIn[ii];
			if (!ing || !ing.id || ing.id <= 0) continue;
			ingridients.push({ id: ing.id, data: ing.data || 0, count: ing.count || 1 });
		}
		return {
			id: pattern.patternId || pattern.id || ('p_' + result[0].id + '_' + result[0].data),
			isProcessed: !!pattern.isProcessed,
			oredictEnabled: !!pattern.oredictEnabled,
			ingridients: ingridients,
			result: result
		};
	}
};
