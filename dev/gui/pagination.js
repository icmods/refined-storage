function makePageHelpers(elements, config) {
	return {
		getPages: function(_length){
			if(_length == 0) return 1;
			_length = Math.ceil(_length / elements[config.countX]);
			return _length;
		},
		getPageFromCoords: function(_coords, pages){
			pages -= elements[config.countY] - 1;
			var interval = (pages - 1) > 0 ? (elements[config.maxY] - elements[config.slider].start_y) / (pages - 1) : 0;
			function __getY(i) {
				return ((interval * i) + elements[config.slider].start_y);
			}
			var least_dec = 10001;
			var finish_i = 0;
			for (var i = 0; i < pages; i++) {
				var dec = Math.abs(Math.round(_coords.y - __getY(i)));
				if (dec < least_dec) {
					least_dec = dec;
					finish_i = i;
				}
			};
			var page = finish_i;
			return page + 1;
		},
		getCoordsFromPage: function(page, pages){
			pages -= elements[config.countY] - 1;
			var interval = (pages - 1) > 0 ? (elements[config.maxY] - elements[config.slider].start_y) / (pages - 1) : 0;
			function __getY(i) {
				return ((interval * i) + elements[config.slider].start_y);
			}
			if (page > pages) page = pages;
			if (page < 1) page = 1;
			return __getY(page - 1);
		}
	};
}
