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
	// A descriptor mutation without forceRefresh is not applied to the live slider element.
	var __sliderEl = windowContent.elements["slider_button"];
	var __pages = Math.max(1, controllerFuncs.getPages(Object.keys(controller_other_data.net_map || {}).length));
	var __sliderY = controllerFuncs.getCoordsFromPage(1, __pages);
	var __sliderAdapter = container && container.getUiAdapter ? container.getUiAdapter() : null;
	var __liveSlider = __sliderAdapter && __sliderAdapter.getElement ? __sliderAdapter.getElement("slider_button") : null;
	if (__liveSlider && __liveSlider.setPosition) __liveSlider.setPosition(__sliderEl.x, __sliderY);
}

function refreshControllerGui(tile, container, window, windowContent, eventData) {
	if(!windowContent || !window || !window.isOpened()) return;
	controller_other_data.net_map = eventData.net_map;
	controller_other_data.isActive = eventData.isActive;
	windowContent.elements["image_redstone"].bitmap = 'redstone_GUI_' + (eventData.redstone_mode || 0);
	controllerSwitchPage(controller_other_data.lastPage + 1, container, controller_other_data, true);
}
