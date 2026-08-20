UpgradeRegistry.register('Speed Upgrade', 'RSSpeedUpgrade', 'rs_speed_upgrade', {
    addFunc: function(tileEntity, item, container, slot, player){
        tileEntity.data.speed = Math.max(1, tileEntity.data.speed - 2);
    },
    deleteFunc: function(tileEntity, item, container, slot, player){
        tileEntity.data.speed = Math.max(1, tileEntity.data.speed + 2);
    }
}, Config.energy_uses.upgrades['speed']);
UpgradeRegistry.register('Stack Upgrade', 'RSStackUpgrade', 'rs_stack_upgrade', {
    maxStack: 1,
    addFunc: function(tileEntity, item, container, slot, player){
        tileEntity.data.count = 64;
    },
    deleteFunc: function(tileEntity, item, container, slot, player){
        tileEntity.data.count = 1;
    }
}, Config.energy_uses.upgrades['stack']);
UpgradeRegistry.register('Range Upgrade', 'RSRangeUpgrade', 'rs_range_upgrade', {
    maxStack: 4,
    rangeBonus: Config.wirelessTransmitter.rangePerUpgrade,
    addFunc: function(tileEntity, item, container, slot, player){
        if(tileEntity.refreshGui)tileEntity.refreshGui(false, false, false, 'main');
    },
    deleteFunc: function(tileEntity, item, container, slot, player){
        if(tileEntity.refreshGui)tileEntity.refreshGui(false, false, false, 'main');
    }
}, Config.energy_uses.upgrades['range']);