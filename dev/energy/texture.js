function getControllerTexture(energyScaled, isActive) {
	if (energyScaled <= 0 || !isActive) {
		return 'controller_off';
	} else if (energyScaled <= 20) {
		return 'controller_nearly_off';
	}
	return 'controller_on';
}

function getEnergyScaled(scale, energy) {
	if(!energy && energy != 0){
		var energy = scale;
		var scale = 100;
	}
	return Math.floor(energy / Config.controller.energyCapacity * scale);
}
