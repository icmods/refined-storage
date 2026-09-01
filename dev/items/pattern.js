IDRegistry.genItemID("RSpattern");
Item.createItem("RSpattern", "Pattern", {
	name: 'RSpattern'
}, {
	stack: 64
});

Item.registerNameOverrideFunction(ItemID["RSpattern"], function(item, name){
	if(!item.extra) return name;
	var isProcessed = item.extra.getBoolean('isProcessed');
	var oredictEnabled = item.extra.getBoolean('oredictEnabled');
		for(var i = 0; i < (isProcessed ? 9 : 1); i++){
			var resultStr = item.extra.getString('result' + i);
			if(!resultStr) break;
			var parts = resultStr.split(',');
			if(parts.length >= 2){
				name += '\nВ§7' + (parts.length >= 3 ? parts[1] : 1) + 'x ' + Item.getName(parseInt(parts[0]), parseInt(parts[2] || 0));
			}
		}
	if(isProcessed) name += '\nВ§9' + Translation.translate('Processing');
	if(!isProcessed && oredictEnabled) name += '\nВ§9' + Translation.translate('Ore Dictionary');
	return name;
});

Item.registerUseFunctionForID(ItemID["RSpattern"], function(_, item, _, playerId){
	if (!item.extra) return;
	if (Entity.getSneaking(playerId)){
        Entity.setCarriedItem(playerId, item.id, item.count, item.data);
	}
});