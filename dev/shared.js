ModAPI.registerAPI("RefinedStorageAPI", {
    apiVersion: '1.3',
    requireGlobal: function (command) {
        return eval(command);
    },
    RefinedStorage: RefinedStorage,
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
    getBlocks: function() { return _RS.getBlocks(); },
    getNetworks: function() { return _RS.getNetworks(); },
    getNetworksInfo: function() { return _RS.getNetworksInfo(); },
    on: function(event, callback) { return _RS.on(event, callback); }
});
Logger.Log("RefinedStorageAPI Loaded", "API");
