const BitmapFactory = android.graphics.BitmapFactory;
const Bitmap = android.graphics.Bitmap;

const Timer = java.util.Timer;
const TimerTask = java.util.TimerTask;

const JAVA_ANIMATOR = android.animation.ValueAnimator;
const JAVA_HANDLER = android.os.Handler;
const LOOPER_THREAD = android.os.Looper;
const JAVA_HANDLER_THREAD = new JAVA_HANDLER(LOOPER_THREAD.getMainLooper());

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

const getPointed = ModAPI.requireGlobal("Player.getPointed");

const log = function (text) {
	if (levelloaded) {
		Game.message(text);
	};
	Logger.Log(text, __name__ + " Log");
}

//const devLogs = [];
var __dev = __config__.getBool("dev");
const devLog = function (text) {
	if (!__dev) return;
	if (levelloaded) {
		Game.message(text);
	};
	Logger.Log(text, __name__ + " devLog");
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

const allParams = function (json, fullParams) {
	if (typeof (json) != "object") return json;
	var params = '{\n';
	for (var key in json) {
		if (fullParams) {
			params += key + ' : ' + allParams(json[key], true) + '\n';
		} else {
			params += key + ' : ' + json[key] + '\n';
		}
	}
	params += '}';
	return params;
}

const JSONlength = function (json) {
	var length = 0;
	for (var i in json) {
		length++
	}
	return length;
}

const setCharAt = function (str, index, chr) {
	if (index > str.length - 1) return str;
	return str.substr(0, index) + chr + str.substr(index + chr.length);
}

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

const jSetTimeout = function (__fun, __mil) {
	var timer = new Timer();
	var task = new TimerTask({
		run: function () {
			__fun();
		}
	})
	timer.schedule(task, __mil);
	return timer;
}

const jClearInterval = function (__interval) {
	if (__interval && __interval.cancel) __interval.cancel();
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

const setTimeout = function (func, _ticks) {
	var ticks__ = 0;
	return {
		id: onCallback('tick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				func()
				return 'delete';
			}
		}),
		name: 'tick'
	}
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

const setTimeoutLocal = function (func, _ticks) {
	var ticks__ = 0;
	return {
		id: onCallback('LocalTick', function () {
			ticks__++;
			if (ticks__ >= _ticks) {
				func()
				return 'delete';
			}
		}),
		name: 'LocalTick'
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

const clearInterval = function (upd) {
	if (upd && upd.id >= 0) {
		onCallbacks[upd.name].splice(upd.id, 1);
		upd = false;
	}
}

function _randomInt(min, max) {
	return Math.floor(min + Math.random() * (max + 1 - min));
}

function _random(min, max) {
	return Math.random() * (max - min) + min;
}

function _find_block_y(coords) {
	for (var i = coords.y; i >= 0; i--) {
		if (World.getBlock(coords.x, i, coords.z).id != 0) return i;
	}
}

function rotateBitmap(__bitmap, __angle) {
	var matrix = new android.graphics.Matrix();
	matrix.postRotate(__angle);
	if (typeof (__bitmap) == 'string') {
		var options = new BitmapFactory.Options();
		options.inPreferredConfig = Bitmap.Config.ARGB_8888;
		__bitmap = BitmapFactory.decodeFile(__dir__ + __bitmap, options);
	}
	return Bitmap.createBitmap(__bitmap, 0, 0, __bitmap.getWidth(), __bitmap.getHeight());
}

const cts = function (coords) {
	return coords.x + (coords.y != undefined ? "," + coords.y : "") + "," + coords.z;
}

const createBitmap = function(__bitmap){
	if (typeof (__bitmap) == 'string') {
		var options = new BitmapFactory.Options();
		options.inPreferredConfig = Bitmap.Config.ARGB_8888;
		__bitmap = BitmapFactory.decodeFile(__dir__ + __bitmap, options);
		return Bitmap.createBitmap(__bitmap, 0, 0, __bitmap.getWidth(), __bitmap.getHeight());
	}
}

const cutBitmap = function(__bitmap, x, y, width, height){
	if (typeof (__bitmap) == 'string') {
		var options = new BitmapFactory.Options();
		options.inPreferredConfig = Bitmap.Config.ARGB_8888;
		__bitmap = BitmapFactory.decodeFile(__dir__ + __bitmap, options);
	}
	return Bitmap.createBitmap(__bitmap, x, y, width, height);
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

const newSides = [
	[0, -1, 0],
	[0, 1, 0],
	[0, 0, -1],
	[0, 0, 1],
	[-1, 0, 0],
	[1, 0, 0]
]

const reverseSides = [1,0,3,2,5,4];

const newSides_ = [
	'0_-1_0',
	'0_1_0',
	'0_0_-1',
	'0_0_1',
   	'-1_0_0',
	'1_0_0'
]

const createAnim = function(_values, _duration, _updateFunc){
	var animation = JAVA_ANIMATOR.ofInt(_values);
	animation.setDuration(_duration);
	if(_updateFunc)animation.addUpdateListener({
		onAnimationUpdate : function(updatedAnim){
			_updateFunc(updatedAnim.getAnimatedValue(), updatedAnim);
		}
	});
	JAVA_HANDLER_THREAD.post({
		run: function(){
			animation.start();
		}
	})
	return animation;
}

const stopAnim = function(_animation){
	if(_animation && _animation.end && _animation.isStarted())JAVA_HANDLER_THREAD.post({
		run: function(){
			_animation.end();
		}
	})
}

const numberWithCommas = function(_num) {
    return _num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getItemUid(item){
	var extra = item.extra ? item.extra.getValue() : 0;
	return item.id + '_' + item.data + (extra ? '_' + extra : '');
}

function parseItemUid(itemUid){
	var splits = itemUid.split('_');
	return {
		id: splits[0],
		data: splits[1],
		extra: splits[2] || null
	}
}

function eventToScriptable(_event){
	return {y:_event.y, x: _event.x, type: _event.type + "", _x: _event._x, _y:_event._y, localY: _event.localY, localX: _event.localX};
}

function compareSlots(slot1, slot2, extraToString){
	if(slot1.id == slot2.id && slot1.data == slot2.data && slot1.count == slot2.count && (extraToString && slot1.extra && slot2.extra ? fullExtraToString(slot1.extra) == fullExtraToString(slot2.extra) : slot1.extra == slot2.extra)) return true;
	return false;
}

function compareCoords(_coords1, _coords2){
	if(_coords1.x == _coords2.x && _coords1.y == _coords2.y && _coords1.z == _coords2.z) return true;
	return false;
}

function cutNumber(num, forGrid){
	return num > 999 ? (num > 999999 ? (num > 999999999 ? ((num3 = (num/1000000000))%1 && (!forGrid || num3 <= 9.95) ? num3.toFixed(1) : Math.round(num3)) + 'B' : ((num2 = (num/1000000))%1 && (!forGrid || num2 <= 9.95) ? num2.toFixed(1) : Math.round(num2)) + 'M') : ((num2 = (num/1000))%1 && (!forGrid || num2 <= 9.95) ? num2.toFixed(1) : Math.round(num2)) + 'K') : num;
}

var mineColorsMap = {
	'0': android.graphics.Color.rgb(0, 0, 0),
	'1': android.graphics.Color.rgb(0, 0, 170),
	'2': android.graphics.Color.rgb(0, 170, 0),
	'3': android.graphics.Color.rgb(0, 170, 170),
	'4': android.graphics.Color.rgb(170, 0, 0),
	'5': android.graphics.Color.rgb(170, 0, 170),
	'6': android.graphics.Color.rgb(255, 170, 0),
	'7': android.graphics.Color.rgb(170, 170, 170),
	'8': android.graphics.Color.rgb(85, 85, 85),
	'9': android.graphics.Color.rgb(85, 85, 255),
	'a': android.graphics.Color.rgb(85, 255, 85),
	'b': android.graphics.Color.rgb(85, 255, 255),
	'c': android.graphics.Color.rgb(255, 85, 85),
	'd': android.graphics.Color.rgb(255, 85, 255),
	'e': android.graphics.Color.rgb(255, 255, 85),
	'f': android.graphics.Color.rgb(255, 255, 255),
	'g': android.graphics.Color.rgb(221, 214, 5)
}
function parseMineColor(symbol){
	if(symbol[0] == '§') symbol = symbol[1];
	var answ = mineColorsMap[symbol] || android.graphics.Color.WHITE;
	return answ;
}

function fullExtraToString(extra, usenbt){
	if(!extra) return "";
	var str = "";
	if(jsonExtra = extra.asJson()){
		if((_value = jsonExtra.opt('data')) && _value.length() == 0) jsonExtra.remove('data');
		if((_value = jsonExtra.opt('name')) && _value.length() == 0) jsonExtra.remove('name');
		str += jsonExtra.toString();
	}
	//if(usenbt && (tag__1 = extra.getCompoundTag()))str += JSON.stringify(tag__1.toScriptable());
	return str;
}

function checkBlocksOnSides(_blockSource, _coords, _blocks, _toList, _func){
	if(typeof(_coords) != "object"){
		_func = _toList;
		_toList = _blocks;
		_blocks = _coords;
		_coords = _blockSource;
		_blockSource = _coords._blockSource;
	}
	var list = [];
	for (var i in newSides) {
		var coords = {
			x: _coords.x + newSides[i][0],
			y: _coords.y + newSides[i][1],
			z: _coords.z + newSides[i][2]
		}
		var block = _blockSource.getBlock(coords.x, coords.y, coords.z);
		if((!_func || _func(_blockSource, coords, block, _toList ? list : undefined)) && (Array.isArray(_blocks) ? _blocks.indexOf(block.id) != -1 : _blocks == block.id || (_blocks == -1 && block.id != 0)))
			if(_toList)
				list.push(coords); 
			else 
				return coords;
	}
	return _toList ? list : false;
}