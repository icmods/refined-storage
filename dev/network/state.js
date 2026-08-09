var RSNetworks = [];

var RSbannedItems = [0];

const RS_blocks = [];
Callback.addCallback('PostLoaded', function(){
	for(var i in RS_blocks)World.setBlockChangeCallbackEnabled(RS_blocks[i], true);
})

const EnergyUse = {}

var temp_data = {};

Callback.addCallback("LevelLeft", function () {
	temp_data = {};
	RSNetworks = [];
});
