ModAPI.registerAPI("RefinedStorageAPI", {
    apiVersion: '1.1',
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
    disks: _RS.disks,
    blocks: _RS.blocks,
    upgrades: _RS.upgrades,
    energy: _RS.energy,
    config: _RS.config,
    ui: _RS.ui,
    getBlocks: function() { return RS_blocks; },
    getNetworks: function() { return RSNetworks; },
    getNetworksInfo: function() { return _RS.getNetworksInfo(); },
    on: function(event, callback) { return _RS.on(event, callback); }
});
Logger.Log("RefinedStorageAPI Loaded", "API");
