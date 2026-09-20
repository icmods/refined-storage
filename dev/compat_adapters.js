// Disabled PoC: exposes neighbouring drawers as network storage via RS_interface.

var _rsDrawerIds = {};
var _rsDrawerEntries = {}; // "dim:x,y,z" -> entry

function _rsDrawerKey(tile) {
	return (tile.dimension || 0) + ':' + tile.x + ',' + tile.y + ',' + tile.z;
}

function _rsNeighbourDrawers(tile) {
	var out = [];
	var bs = tile.blockSource;
	if (!bs) return out;
	var sides = CoreKit.coords.sides;
	for (var s = 0; s < sides.length; s++) {
		var x = tile.x + sides[s][0], y = tile.y + sides[s][1], z = tile.z + sides[s][2];
		if (_rsDrawerIds[bs.getBlockId(x, y, z)]) {
			var dt = World.getTileEntity(x, y, z, bs);
			if (dt) out.push(dt);
		}
	}
	return out;
}

function _rsDrawerEntryFor(tile) {
	var key = _rsDrawerKey(tile);
	var e = _rsDrawerEntries[key];
	if (!e) {
		e = Adapters.drawer(tile.blockID, 64);
		_rsDrawerEntries[key] = e;
	}
	e.syncFrom(tile);
	return e;
}

// Write the mirror back to the drawer after RS mutates items_stored.
function _rsSyncDrawers() {
	for (var k in _rsDrawerEntries) {
		var e = _rsDrawerEntries[k];
		if (!e || e.items_stored === e._rsSynced) continue;
		try { e.syncTo(); } catch (err) {}
		e._rsSynced = e.items_stored;
	}
}

function _rsRegisterDrawerCompat() {
	registerStorageProvider(BlockID.RS_interface, {
		getEntries: function (tile) {
			var drawers = _rsNeighbourDrawers(tile);
			var entries = [];
			for (var i = 0; i < drawers.length; i++) entries.push(_rsDrawerEntryFor(drawers[i]));
			return entries;
		}
	});
	_RS.on("itemInserted", _rsSyncDrawers);
	_RS.on("itemExtracted", _rsSyncDrawers);
}

if (typeof Adapters != "undefined" && typeof CompatCore != "undefined") {
	CompatCore.whenAvailable("DrawerAPI", function (api) {
		var drawers = api && api.DrawerAPI && api.DrawerAPI.drawers;
		if (!drawers || !drawers.length) return;
		for (var d = 0; d < drawers.length; d++) _rsDrawerIds[drawers[d]] = true;
		_rsRegisterDrawerCompat();
	}, { hostId: __name__ });
}
