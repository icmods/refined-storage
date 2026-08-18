ModAPI.registerAPI("RefinedStorageAPI", {
    apiVersion: '1.9',
    requireGlobal: function (command) {
        return eval(command);
    },
    RefinedStorage: RefinedStorage,
    PatternContainerRegistry: PatternContainerRegistry,
    RS_blocks: RS_blocks,
    EnergyUse: EnergyUse,
    Disk: Disk,
    controllerAPI: controllerFuncs,
    gridAPI: gridFuncs,
    craftingGridAPI: craftingGridFuncs,

    networks: _RS.networks,
    pattern: _RS.pattern,
    crafters: _RS.crafters,
    disks: _RS.disks,
    blocks: _RS.blocks,
    upgrades: _RS.upgrades,
    energy: _RS.energy,
    config: _RS.config,
    ui: _RS.ui,
    storage: _RS.storage,
    wireless: _RS.wireless,
    registerStorageProvider: function(blockId, provider) { return registerStorageProvider(blockId, provider); },
    getBlocks: function() { return _RS.getBlocks(); },
    getNetworks: function() { return _RS.getNetworks(); },
    getNetworksInfo: function() { return _RS.getNetworksInfo(); },
    on: function(event, callback) { return _RS.on(event, callback); }
});
Logger.Log("RefinedStorageAPI Loaded", "API");
