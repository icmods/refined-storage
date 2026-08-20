var RSNetworks = [];

var RSbannedItems = [0];

const RS_blocks = [];
Callback.addCallback('PostLoaded', function(){
	for(var i in RS_blocks)World.setBlockChangeCallbackEnabled(RS_blocks[i], true);
})

const EnergyUse = {}

var _savedCraftingTasks = {};

var RSpendingReconnect = {};
var RSreconnectTicks = 0;
const RSPENDING_RECONNECT_EXPIRY = 30;

function rsAddReconnectPending(tile) {
	RSpendingReconnect[tile.dimension + ':' + tile.coords_id()] = { x: tile.x, y: tile.y, z: tile.z, dimension: tile.dimension, blockSource: tile.blockSource, pendingPasses: 0 };
}

Callback.addCallback("tick", function () {
	RSreconnectTicks++;
	if (RSreconnectTicks < 20) return;
	RSreconnectTicks = 0;
	var byDimension = {};
	for (var cid in RSpendingReconnect) {
		var entry = RSpendingReconnect[cid];
		var dKey = entry.dimension != undefined ? entry.dimension : -1;
		if (!byDimension[dKey]) byDimension[dKey] = [];
		byDimension[dKey].push({ key: cid, entry: entry });
	}
	for (var dKey in byDimension) {
		var visited = {};
		var doneControllers = {};
		var group = byDimension[dKey];
		for (var pi = 0; pi < group.length; pi++) {
			var key = group[pi].key;
			var entry = group[pi].entry;
			var tile = World.getTileEntity(entry.x, entry.y, entry.z, entry.blockSource);
			if (!tile) { delete RSpendingReconnect[key]; continue; }
			if (tile.data.NETWORK_ID != 'f' && RSNetworks[tile.data.NETWORK_ID] && RSNetworks[tile.data.NETWORK_ID][tile.coords_id()]) {
				delete RSpendingReconnect[key];
				continue;
			}
			var controller = searchController(tile, false, entry.blockSource, null, visited);
			if (controller) {
				var cKey = controller.x + ',' + controller.y + ',' + controller.z;
				if (!doneControllers[cKey]) {
					doneControllers[cKey] = true;
					var cTile = World.getTileEntity(controller.x, controller.y, controller.z, entry.blockSource);
					if (cTile) cTile.data.updateControllerNetwork = true;
				}
			}
		}
	}
	for (var cid in RSpendingReconnect) {
		var pending = RSpendingReconnect[cid];
		if (!pending) continue;
		pending.pendingPasses = (pending.pendingPasses || 0) + 1;
		if (pending.pendingPasses >= RSPENDING_RECONNECT_EXPIRY) delete RSpendingReconnect[cid];
	}
});

Saver.addSavesScope("RSCraftingTasks",
	function read(scope){
		_savedCraftingTasks = scope && scope.tasks ? scope.tasks : {};
	},
	function save(){
		var tasks = {};
		for (var i in RSNetworks) {
			var info = RSNetworks[i] && RSNetworks[i].info;
			if (!info || !info.craftingTasks || info.craftingTasks.length === 0) continue;
			var controllerCoords = searchController_net(i);
			if (!controllerCoords) continue;
			var key = controllerCoords.x + ',' + controllerCoords.y + ',' + controllerCoords.z;
			tasks[key] = [];
			for (var ti = 0; ti < info.craftingTasks.length; ti++) {
				var task = info.craftingTasks[ti];
				if (!task || !task.id) continue;
				if (task.cancelled && Object.keys(task.buffer || {}).length === 0) continue;
				tasks[key].push(CraftingTask.serialize(task));
			}
		}
		return { tasks: tasks };
	}
);

function restoreCraftingTasks(controllerTile) {
	var key = controllerTile.x + ',' + controllerTile.y + ',' + controllerTile.z;
	var saved = _savedCraftingTasks[key];
	if (!saved || saved.length === 0) return;
	var info = RSNetworks[controllerTile.data.NETWORK_ID].info;
	if (!info) return;
	for (var si = 0; si < saved.length; si++) {
		try {
			var task = CraftingTask.restore(saved[si], info);
			info.craftingTasks.push(task);
			info.providingCrafts.push(task);
			info.scheduledByUid[task.requestedUid] = (info.scheduledByUid[task.requestedUid] || 0) + (task.requestedCount || 0);
			_RS._emit("taskAdded", {netId: info.net_id, task: {id: task.id, requestedUid: task.requestedUid, requestedCount: task.requestedCount}});
			if(Config.dev)Logger.Log('[PERSIST] Restored task ' + task.id + ': ' + task.requestedCount + 'x ' + task.requestedUid, 'RefinedStorageDebug');
		} catch(e) {
			Logger.Log('[PERSIST] Failed to restore task: ' + e, 'RefinedStorageError');
		}
	}
	delete _savedCraftingTasks[key];
}

Callback.addCallback("LevelLeft", function () {
	RSNetworks = [];
	_savedCraftingTasks = {};
	RSpendingReconnect = {};
	RSreconnectTicks = 0;
	if (typeof PatternContainerRegistry !== 'undefined') PatternContainerRegistry.reset();
	if (typeof NetworkTimer !== 'undefined') NetworkTimer.reset();
	if (typeof StorageProviders !== 'undefined') StorageProviders = {};
	if (typeof _pendingUpdateItems !== 'undefined') _pendingUpdateItems = {};
	RSChunkRebuildPending = false;
	RSChunkRebuildTicks = 0;
});
