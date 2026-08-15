function loadControllerClient(tile) {
	if(tile.refreshModel)tile.refreshModel();
}

function refreshControllerModel(tile) {
	var newTexture = getControllerTexture(getEnergyScaled(100, tile.networkData.getInt('energy')), tile.networkData.getBoolean('isActive'));
	RefinedStorage.mapTexture(tile, newTexture);
}

function handleControllerModelEvent(tile, eventData) {
	var newTexture = getControllerTexture(getEnergyScaled(100, eventData.energy), eventData.isActive);
	RefinedStorage.mapTexture(eventData.coords, newTexture);
}

function openControllerGui(tile, container, window, windowContent, eventData) {
	if(!windowContent || !window || !window.isOpened()) return;
	var networkData = SyncedNetworkData.getClientSyncedData(eventData.name);
	controller_other_data.networkData = networkData;
	controller_other_data.net_map = eventData.net_map;
	controller_other_data.isActive = eventData.isActive;
	var headerWindow = window.getWindow('header')
	headerWindow.getContent().drawing[2].text = eventData.isCreative ? Translation.translate("Creative Controller") : Translation.translate("Controller");
	headerWindow.forceRefresh();
	windowContent.elements["slider_button"].y = windowContent.elements["slider_button"].start_y;
	windowContent.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
	controllerSwitchPage(1, container, controller_other_data, true);
}

function refreshControllerGui(tile, container, window, windowContent, eventData) {
	if(!windowContent || !window || !window.isOpened()) return;
	controller_other_data.net_map = eventData.net_map;
	controller_other_data.isActive = eventData.isActive;
	windowContent.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
	controllerSwitchPage(controller_other_data.lastPage, container, controller_other_data, true);
}
