var RSNetworks = [];

var RSbannedItems = [0];

const RS_blocks = [];
Callback.addCallback('PostLoaded', function(){
	for(var i in RS_blocks)World.setBlockChangeCallbackEnabled(RS_blocks[i], true);
})

const EnergyUse = {}

var _savedCraftingTasks = {};

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
				if (task && task.id && !task.cancelled) {
					tasks[key].push(CraftingTask.serialize(task));
				}
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
});
