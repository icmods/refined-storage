const Timer = java.util.Timer;
const TimerTask = java.util.TimerTask;

var InnerCore_pack = FileTools.ReadJSON(__packdir__ + 'manifest.json');

var levelloaded = false;

const searchItem = function (id, data, extra, list, reverse, playerUid) {
	var player = playerUid ? new PlayerActor(playerUid) : Player;
	if(typeof(data) != "number")data = -1;
	if(typeof(id) != "number")id = -1;
	if(typeof(extra) == "boolean"){
		playerUid = reverse; reverse = list; list = extra;
		extra = -1;
	}
	if(reverse){
		if(list){
			var itemsList = [];
			for (var i = 35; i >= 0; i--) {
				var item = player.getInventorySlot(i);
				if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra == -1 || item.extra == extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
					itemsList.push({
						id: item.id,
						data: item.data,
						extra: item.extra,
						count: item.count,
						slot: i
					})
				}
			}
			return itemsList;
		} else for (var i = 35; i >= 0; i--) {
			var item = player.getInventorySlot(i);
			if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra == -1 || item.extra == extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
				return {
					id: item.id,
					data: item.data,
					extra: item.extra,
					count: item.count,
					slot: i
				}
			}
		}
	} else {
		if(list){
			var itemsList = [];
			for (var i = 0; i <= 35; i++) {
				var item = player.getInventorySlot(i);
				if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra == -1 || item.extra == extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
					itemsList.push({
						id: item.id,
						data: item.data,
						extra: item.extra,
						count: item.count,
						slot: i
					})
				}
			}
			return itemsList;
		} else for (var i = 0; i <= 35; i++) {
			var item = player.getInventorySlot(i);
			if ((item.id == id || (id == -1 && item.id != 0)) && (item.data == data || data == -1) && (extra == -1 || item.extra == extra || (item.extra && extra && fullExtraToString(item.extra) == fullExtraToString(extra)))) {
				return {
					id: item.id,
					data: item.data,
					extra: item.extra,
					count: item.count,
					slot: i
				}
			}
		}
	}
}

const log = function (text) {
	if (levelloaded) {
		Game.message(text);
	};
	Logger.Log(text, __name__ + " Log");
}

Callback.addCallback("LevelLoaded", function () {
	levelloaded = true
})

Callback.addCallback("LevelLeft", function () {
	levelloaded = false
});

var _LevelDisplayed = false;
Callback.addCallback("LevelDisplayed", function () {
	_LevelDisplayed = true;
});
Callback.addCallback("LevelLeft", function () {
	_LevelDisplayed = false;
});

const jSetInterval = function (__fun, __mil) {
	var timer = new Timer();
	var task = new TimerTask({
		run: function () {
			if (__fun()) timer.cancel();
		}
	})
	timer.scheduleAtFixedRate(task, 0, __mil);
	return timer;
}

const sides = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 0, 1],
	[0, 0, -1],
	[0, 1, 0],
	[0, -1, 0]
];

const onCallbacks = {};

function onCallback(name, func) {
	if (!onCallbacks[name]) {
		onCallbacks[name] = [];
		Callback.addCallback(name, function (a, b, c, d, e, f, g, h) {
			for (var i in onCallbacks[name]) {
				var res = onCallbacks[name][i](a, b, c, d, e, f, g, h);
				if (res == "delete") onCallbacks[name].splice(i, 1);
			}
		});
	}
	onCallbacks[name].push(func);
	return onCallbacks[name].length - 1;
}

const setInterval = function (func, _ticks, _first) {
	if (_first && func()) return;
	var ticks__ = 0;
	return {
		id: onCallback('tick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				ticks__ = 0;
				if (func()) return 'delete';
			}
		}),
		name: 'tick'
	}
}

const setIntervalLocal = function (func, _ticks, _first) {
	if (_first && func()) return;
	var ticks__ = 0;
	return {
		id: onCallback('LocalTick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				if (func()) return 'delete';
			}
		}),
		name: 'LocalTick'
	}
}

const cts = function (coords) {
	return coords.x + (coords.y != undefined ? "," + coords.y : "") + "," + coords.z;
}

if (!Object.assign) {
	Object.defineProperty(Object, 'assign', {
		enumerable: false,
		configurable: true,
		writable: true,
		value: function (target, firstSource) {
			'use strict';
			if (target === undefined || target === null) {
				throw new TypeError('Cannot convert first argument to object');
			}

			var to = Object(target);
			for (var i = 1; i < arguments.length; i++) {
				var nextSource = arguments[i];
				if (nextSource === undefined || nextSource === null) {
					continue;
				}

				var keysArray = Object.keys(Object(nextSource));
				for (var nextIndex = 0, len = keysArray.length; nextIndex < len; nextIndex++) {
					var nextKey = keysArray[nextIndex];
					var desc = Object.getOwnPropertyDescriptor(nextSource, nextKey);
					if (desc !== undefined && desc.enumerable) {
						to[nextKey] = nextSource[nextKey];
					}
				}
			}
			return to;
		}
	});
}

const numberWithCommas = function(_num) {
    return _num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getItemUid(item){
	var extra = item.extra ? item.extra.getValue() : 0;
	return item.id + '_' + item.data + (extra ? '_' + extra : '');
}

function compareCoords(_coords1, _coords2){
	if(_coords1.x == _coords2.x && _coords1.y == _coords2.y && _coords1.z == _coords2.z) return true;
	return false;
}

function cutNumber(num, forGrid){
	return num > 999 ? (num > 999999 ? (num > 999999999 ? ((num3 = (num/1000000000))%1 && (!forGrid || num3 <= 9.95) ? num3.toFixed(1) : Math.round(num3)) + 'B' : ((num2 = (num/1000000))%1 && (!forGrid || num2 <= 9.95) ? num2.toFixed(1) : Math.round(num2)) + 'M') : ((num2 = (num/1000))%1 && (!forGrid || num2 <= 9.95) ? num2.toFixed(1) : Math.round(num2)) + 'K') : num;
}

function fullExtraToString(extra, usenbt){
	if(!extra) return "";
	var str = "";
	if(jsonExtra = extra.asJson()){
		if((_value = jsonExtra.opt('data')) && _value.length() == 0) jsonExtra.remove('data');
		if((_value = jsonExtra.opt('name')) && _value.length() == 0) jsonExtra.remove('name');
		str += jsonExtra.toString();
	}
	return str;
}