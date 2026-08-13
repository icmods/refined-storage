const UpgradeRegistry = {
	upgrades: {},
	stringIDUpgrades: {},
	/**
	 * Register new upgrade
	 * @param {string} name name of upgrade, used as item name, used if registerItem is not defined
	 * @param {string} nameID string id of the item
	 * @param {string} texture texture name, used if registerItem is not defined
	 * @param {object} params upgrade params
	 * @param {number=} params.maxStack maximum amount of this upgrades in mechanism, if not defined then amount is infinity
	 * @param {function(TileEntity, {id: number, count: number, data: number, extra: object}, ItemContainer, string, number)} params.addFunc Called on upgrade added to slot
	 * @param {function(TileEntity, {id: number, count: number, data: number, extra: object}, ItemContainer, string, number)} params.deleteFunc Called on upgrade deleted from slot 
	 * @param {string} usage energy usage
	 * @param {string} registerItem if this parameter is defined then item not created, use it if you want to create your item
	 * @returns {number} return item id
	 */
	register: function(name, nameID, texture, params, usage, registerItem){
		var itemIDName = registerItem ? registerItem : nameID;
		if(!registerItem){
			IDRegistry.genItemID(itemIDName);
			Item.createItem(itemIDName, name, {
				name: texture,
			}, {
				//isTech: true,
				stack: 64
			});
		}
		params.nameID = itemIDName;
		params.usage = usage || 0;
		this.upgrades[ItemID[itemIDName]] = params;
		this.stringIDUpgrades[itemIDName] = params;
		return ItemID[itemIDName];
	},
	/**
	 * Get upgrade energy usage
	 * @param {number|string} id item id or string id(nameID) of upgrade
	 * @returns {object|undefined} return upgrade energy usage or undefined if upgrade with this id is not registered
	 */
	getEnergyUsage: function(id){
		var upgrade = this.upgrades[id] || this.stringIDUpgrades[id];
		if(upgrade) return upgrade.usage;
		return 0;
	}
}
