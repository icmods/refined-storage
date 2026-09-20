LIBRARY({
    name: "CoreKit",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var CoreKit = {};

/*
 * ============================================================================
 * CoreKit — base utilities + item identity + engine feature detection
 * ============================================================================
 * Unifies number formatting, coordinate helpers, item identity (uid/extra key),
 * extra matching across incompatible mod conventions, block facing/boxes, and
 * engine feature detection (chunk-load safety).
 * ============================================================================
 */

/* ----------------------------------------------------------------- util --- */

CoreKit.util = {};

CoreKit.util.clamp = function (value, min, max) {
    if (typeof value != "number" || isNaN(value)) return min;
    return value < min ? min : (value > max ? max : value);
};

CoreKit.util.cutNumber = function (num, forGrid) {
    return num > 999 ? (num > 999999 ? (num > 999999999 ?
        ((num / 1000000000) % 1 && (!forGrid || num / 1000000000 <= 9.95) ?
            (num / 1000000000).toFixed(1) : Math.round(num / 1000000000)) + "B" :
        ((num / 1000000) % 1 && (!forGrid || num / 1000000 <= 9.95) ?
            (num / 1000000).toFixed(1) : Math.round(num / 1000000)) + "M") :
        ((num / 1000) % 1 && (!forGrid || num / 1000 <= 9.95) ?
            (num / 1000).toFixed(1) : Math.round(num / 1000)) + "K") : num;
};

CoreKit.util.numberWithCommas = function (num) {
    return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

var _ckUidCounter = 0;

CoreKit.util.uid = function (prefix) {
    _ckUidCounter++;
    return (prefix || "uid") + "_" + Date.now() + "_" + _ckUidCounter + "_" +
        Math.floor(Math.random() * 1000000);
};

CoreKit.util.deepClone = function (value, seen) {
    if (value === null || typeof value != "object") return value;
    if (typeof value.clone == "function") {
        try { return value.clone(); } catch (e) {}
    }
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
        if (seen[i][0] === value) return seen[i][1];
    }
    var result;
    if (Array.isArray(value)) {
        result = [];
        seen.push([value, result]);
        for (var a = 0; a < value.length; a++) {
            result.push(CoreKit.util.deepClone(value[a], seen));
        }
    } else {
        result = {};
        seen.push([value, result]);
        var keys = Object.keys(value);
        for (var k = 0; k < keys.length; k++) {
            result[keys[k]] = CoreKit.util.deepClone(value[keys[k]], seen);
        }
    }
    return result;
};

/** Shallow-fill missing keys of `obj` from `src`. Returns obj. */
CoreKit.util.fillDefaults = function (obj, src) {
    if (!obj || !src) return obj;
    for (var key in src) {
        if (obj[key] === undefined) obj[key] = src[key];
    }
    return obj;
};

/** MD5 hex digest of a byte array/string (engine only); null without Java. */
CoreKit.util.md5 = function (bytes) {
    if (typeof java == "undefined" || !java.security || !java.security.MessageDigest) return null;
    try {
        var digest = java.security.MessageDigest.getInstance("md5");
        digest.update(bytes);
        var byted = digest.digest();
        var sb = new java.lang.StringBuilder();
        for (var i = 0; i < byted.length; i++) {
            var h = java.lang.Integer.toHexString(0xFF & byted[i]);
            if (h.length < 2) h = "0" + h;
            sb.append(h);
        }
        return String(sb.toString());
    } catch (e) {
        return null;
    }
};

/* --------------------------------------------------------------- locale --- */

CoreKit.locale = {};

/**
 * Translation.translate + printf-style formatting (%s/%d). When the Java APIs
 * are unavailable (tests) falls back to a plain placeholder replacement.
 */
CoreKit.locale.translate = function (str, args) {
    var text = String(str == undefined ? "" : str);
    try {
        if (typeof Translation != "undefined" && Translation.translate) text = String(Translation.translate(text));
    } catch (e) {}
    if (args === undefined) return text;
    if (!Array.isArray(args)) args = [args];
    try {
        if (typeof java != "undefined" && java.lang && java.lang.String) {
            return String(java.lang.String.format(text, args.map(function (v) { return "" + v; })));
        }
    } catch (e) {}
    var i = 0;
    return text.replace(/%[sd]/g, function () {
        return i < args.length ? "" + args[i++] : "";
    });
};

/** European numeral-verb form (count % 10 = 1, except 11). */
CoreKit.locale.isNumeralVerb = function (count) {
    count = Math.abs(Number(count) || 0);
    return count % 10 == 1 && count % 100 != 11;
};

/** European numeral-many form (count % 10 = 0 or >= 5, except the teens). */
CoreKit.locale.isNumeralMany = function (count) {
    count = Math.abs(Number(count) || 0);
    return count % 10 == 0 || count % 10 >= 5 || count % 100 - count % 10 == 10;
};

/**
 * Pick the form by count (zero / verb / many / little) and translate it,
 * formatting with `args` (default `[count]`).
 */
CoreKit.locale.translateCounter = function (count, whenZero, whenVerb, whenLittle, whenMany, args) {
    count = Number(count) || 0;
    var key = count == 0 ? whenZero
        : CoreKit.locale.isNumeralVerb(count) ? whenVerb
        : CoreKit.locale.isNumeralMany(count) ? whenMany
        : whenLittle;
    return CoreKit.locale.translate(key, args === undefined ? [count] : args);
};

/**
 * Case-insensitive search normalization — the single JS implementation for
 * search call-sites. No trim(), to stay behaviour-identical with the Java
 * search in the mod's native path.
 */
CoreKit.locale.normalizeSearch = function (value) {
    if (value === null || value === undefined) return "";
    return String(value).toLowerCase();
};

/* ------------------------------------------------------------------ net --- */

CoreKit.net = {};

/** Decode a Base64 string to a Java string (engine only); null without Java. */
CoreKit.net.base64Decode = function (encoded) {
    try {
        if (typeof android != "undefined" && android.util && android.util.Base64) {
            return String(android.util.Base64.decode(String(encoded).replace(/\\n/g, "").replace(/\n/g, ""), 0));
        }
    } catch (e) {}
    return null;
};

/**
 * GitHub contents API client over the (blocking) `sendHttp`.
 * opts: { ref }. Each method returns null on any failure; when the transport is
 * unavailable (tests) every method returns null.
 */
CoreKit.net.github = function (user, repo, opts) {
    opts = opts || {};
    var base = "https://api.github.com/repos/" + user + "/" + repo + "/contents/";
    function read(path) {
        try {
            if (typeof sendHttp == "undefined") return null;
            var raw = sendHttp(base + path + (opts.ref ? "?ref=" + opts.ref : ""));
            if (!raw) return null;
            var data = JSON.parse(raw);
            return data && data.content && data.encoding == "base64" ? data : null;
        } catch (e) {
            return null;
        }
    }
    function contentOf(path) {
        var data = read(path);
        return data ? String(data.content).replace(/\\n/g, "").replace(/\n/g, "") : null;
    }
    return {
        getJson: function (path) {
            var text = CoreKit.net.base64Decode(contentOf(path));
            if (text == null) return null;
            try { return JSON.parse(text); } catch (e) { return null; }
        },
        getFile: function (path) {
            return CoreKit.net.base64Decode(contentOf(path));
        },
        /** Raw Base64 for image registration (e.g. UiCore.registerTexture). */
        getImageBase64: function (path) {
            return contentOf(path);
        }
    };
};

/* --------------------------------------------------------------- coords --- */

CoreKit.coords = {};

CoreKit.coords.sides = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 0, 1],
    [0, 0, -1],
    [0, 1, 0],
    [0, -1, 0]
];

CoreKit.coords.cts = function (coords) {
    return coords.x + (coords.y != null ? "," + coords.y : "") + "," + coords.z;
};

CoreKit.coords.parseCts = function (str) {
    var parts = String(str).split(",");
    if (parts.length == 2) {
        var x2 = parseInt(parts[0]), z2 = parseInt(parts[1]);
        if (isNaN(x2) || isNaN(z2)) return null;
        return { x: x2, z: z2 };
    }
    if (parts.length == 3) {
        var x3 = parseInt(parts[0]), y3 = parseInt(parts[1]), z3 = parseInt(parts[2]);
        if (isNaN(x3) || isNaN(y3) || isNaN(z3)) return null;
        return { x: x3, y: y3, z: z3 };
    }
    return null;
};

/**
 * Dimension-safe coordinate key: "<dim>:<x[,y],z>".
 * Accepts `key(dim, {x,y,z})`, `key(dim, x, y, z)` or `key(dim, "x,y,z")`.
 * null/undefined dimension normalizes to 0 (the engine default dimension).
 * The dimension is NOT part of cts() — this is the additive key for maps that
 * must not collide across dimensions.
 */
CoreKit.coords.key = function (dim, coordsOrX, y, z) {
    var coordsPart;
    if (typeof coordsOrX == "string") coordsPart = coordsOrX;
    else if (coordsOrX && typeof coordsOrX == "object") coordsPart = CoreKit.coords.cts(coordsOrX);
    else coordsPart = CoreKit.coords.cts({ x: coordsOrX, y: y, z: z });
    return (dim === undefined || dim === null ? 0 : dim) + ":" + coordsPart;
};

CoreKit.coords.compare = function (coords1, coords2) {
    if (!coords1 || !coords2) return false;
    return coords1.x == coords2.x && coords1.y == coords2.y && coords1.z == coords2.z;
};

/* ---------------------------------------------------------------- Items --- */

CoreKit.Items = {};

function _ckGetExtraJsonText(extra) {
    var json = extra.json;
    if (typeof json == "string") return json;
    if (!json) return "";
    var str = String(json);
    if (str && str != "[object Object]" && str != "[object JavaObject]") return str;
    var parsed;
    try { parsed = JSON.stringify(json); } catch (e) { return ""; }
    return parsed === undefined ? "" : parsed;
}

/**
 * Canonical key of an extra (a stable string; "" for an empty extra).
 * Order: getValue() FIRST and AUTHORITATIVE when present (falsy → "").
 * When getValue is absent, asJson() is TERMINAL: a truthy JSON string is the
 * key; an empty/falsy (or throwing) asJson yields "". Without asJson:
 * isEmpty() → getAllCustomData() → json → String() → JSON.stringify().
 * getValue() stays authoritative when present.
 */
CoreKit.Items.extraKey = function (extra) {
    if (!extra) return "";
    if (typeof extra.getValue == "function") {
        try {
            var value = extra.getValue();
            return value ? String(value) : "";
        } catch (e) {}
    }
    if (typeof extra.asJson == "function") {
        try {
            var jsonExtra = extra.asJson();
            if (jsonExtra) return String(jsonExtra);
        } catch (e) {}
        return "";
    }
    if (typeof extra.isEmpty == "function") {
        var isEmpty = false;
        try { isEmpty = extra.isEmpty(); } catch (e) { isEmpty = false; }
        if (isEmpty) return "";
    }
    if (typeof extra.getAllCustomData == "function") {
        try {
            var all = extra.getAllCustomData();
            var str2 = String(all);
            return str2 == "undefined" || str2 == "null" ? "" : str2;
        } catch (e) {}
    }
    if (extra.json) return _ckGetExtraJsonText(extra);
    var str3 = "";
    try { str3 = String(extra); } catch (e) {}
    if (str3 && str3 != "[object Object]" && str3 != "[object JavaObject]") return str3;
    var json;
    try { json = JSON.stringify(extra); } catch (e) { return ""; }
    return json === undefined ? "" : json;
};

/** Canonical item UID: "id_data[_extraKey]". */
CoreKit.Items.uidOf = function (item) {
    if (!item) return "";
    var extra = item.extra ? CoreKit.Items.extraKey(item.extra) : "";
    return item.id + "_" + item.data + (extra ? "_" + extra : "");
};

/**
 * Structured identity for one item: computed once, no string re-splitting.
 * extra is returned BY REFERENCE (read-only for the caller; ownership stays
 * with the host). Use uidOf() when only the string key is needed.
 */
CoreKit.Items.uidInfo = function (item) {
    if (!item) return { uid: "", extraKey: "", extra: null };
    var extraKey = item.extra ? CoreKit.Items.extraKey(item.extra) : "";
    return {
        uid: item.id + "_" + item.data + (extraKey ? "_" + extraKey : ""),
        extraKey: extraKey,
        extra: item.extra || null
    };
};

/**
 * Like extraKey for asJson extras, but STRIPS empty data/name fields before
 * stringifying — used for extra MATCHING when merging. Same side effect as
 * extraKey: empty data/name fields are removed from the extra's JSON object.
 * Returns "" for falsy extras.
 */
CoreKit.Items.fullExtraToString = function (extra) {
    if (!extra) return "";
    if (typeof extra.asJson != "function") {
        if (extra.json) return _ckGetExtraJsonText(extra);
        var strA = "";
        try { strA = String(extra); } catch (e) {}
        if (strA && strA != "[object Object]" && strA != "[object JavaObject]") return strA;
        var jsonA;
        try { jsonA = JSON.stringify(extra); } catch (e) { return ""; }
        return jsonA === undefined ? "" : jsonA;
    }
    var str = "";
    try {
        var jsonExtra = extra.asJson();
        if (jsonExtra) {
            var dataValue = jsonExtra.opt("data");
            if (dataValue && dataValue.length() == 0) jsonExtra.remove("data");
            var nameValue = jsonExtra.opt("name");
            if (nameValue && nameValue.length() == 0) jsonExtra.remove("name");
            str += jsonExtra.toString();
        }
    } catch (e) {}
    return str;
};

CoreKit.Items.isExtraEmpty = function (extra) {
    if (!extra) return true;
    // Delegates to extraKey (getValue-first): a tag extra with getValue()!=0 is
    // NOT empty even when isEmpty()==true.
    return CoreKit.Items.extraKey(extra) === "";
};

/**
 * Unified item match.
 * opts: { wildcardData: true (data -1 accepts any), matchExtra: true,
 *         stripEmptyExtra: false (true = strip empty data/name fields so they
 *         don't prevent a match; mutates the extras' JSON) }
 */
CoreKit.Items.match = function (a, b, opts) {
    opts = opts || {};
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (opts.wildcardData === false) {
        if (a.data !== b.data) return false;
    } else {
        if (a.data !== b.data && a.data !== -1 && b.data !== -1) return false;
    }
    if (opts.matchExtra === false) return true;
    if (CoreKit.Items.isExtraEmpty(a.extra) && CoreKit.Items.isExtraEmpty(b.extra)) return true;
    if (CoreKit.Items.isExtraEmpty(a.extra) || CoreKit.Items.isExtraEmpty(b.extra)) return false;
    if (opts.stripEmptyExtra) {
        return CoreKit.Items.fullExtraToString(a.extra) === CoreKit.Items.fullExtraToString(b.extra);
    }
    return CoreKit.Items.extraKey(a.extra) === CoreKit.Items.extraKey(b.extra);
};

/** Two items can be stacked together (identical id+data+extra, no wildcard). */
CoreKit.Items.mergeable = function (a, b) {
    return CoreKit.Items.match(a, b, { wildcardData: false, matchExtra: true });
};

/* ------------------------------------------------------------- Inventory - */

/**
 * Player inventory scan, generalized via Items.match. Supported signatures:
 *   scan(player, id, data, extra, list, reverse)
 *   scan(player, id, data, list, reverse)
 *   scan(player, matcher, list, reverse)
 */
CoreKit.Inventory = {
    scan: function (player, id, data, extra, list, reverse) {
        if (typeof id == "function") {
            var matcher = id;
            list = data;
            reverse = extra;
            var result = [];
            var direction = reverse ? -1 : 1;
            for (var i = reverse ? 35 : 0; reverse ? i >= 0 : i <= 35; i += direction) {
                var slot = player.getInventorySlot(i);
                if (slot.id != 0 && matcher(slot, i)) {
                    if (list) result.push({ id: slot.id, data: slot.data, extra: slot.extra, count: slot.count, slot: i });
                    else return { id: slot.id, data: slot.data, extra: slot.extra, count: slot.count, slot: i };
                }
            }
            return list ? result : null;
        }
        if (typeof data != "number") data = -1;
        if (typeof id != "number") id = -1;
        if (typeof extra == "boolean") {
            reverse = list;
            list = extra;
            extra = -1;
        }
        if (extra === undefined) extra = -1;
        var matcher2 = function (item) {
            return (item.id == id || (id == -1 && item.id != 0)) &&
                (item.data == data || data == -1) &&
                (extra === -1 || CoreKit.Items.match(item, { id: item.id, data: item.data, extra: extra }, { wildcardData: false, matchExtra: true }));
        };
        return CoreKit.Inventory.scan(player, matcher2, list, reverse);
    }
};

/* ---------------------------------------------------------------- Engine -- */

CoreKit.Engine = {};

var _ckPackVersion = null;
var _ckPackVersionRead = false;

/** Pack version (packVersionCode), read lazily from the manifest. 0 when undetermined. */
CoreKit.Engine.packVersion = function () {
    if (_ckPackVersionRead) return _ckPackVersion;
    _ckPackVersionRead = true;
    try {
        var pack = FileTools.ReadJSON(__packdir__ + "manifest.json");
        _ckPackVersion = pack && typeof pack.packVersionCode == "number" ? pack.packVersionCode : 0;
    } catch (e) {
        _ckPackVersion = 0;
    }
    return _ckPackVersion;
};

var _ckFeatures = Object.create(null);

/**
 * Feature detection with cache (a test runs only once).
 * Engine.hasFeature("isChunkLoadedAt", function(){ ...test... })
 */
CoreKit.Engine.hasFeature = function (name, testFn) {
    name = String(name);
    if (Object.prototype.hasOwnProperty.call(_ckFeatures, name)) return _ckFeatures[name];
    var value = false;
    try { value = !!testFn(); } catch (e) { value = false; }
    _ckFeatures[name] = value;
    return value;
};

/**
 * Safe chunk-loaded check on any BlockSource wrapper (some lack the method).
 */
CoreKit.Engine.safeIsChunkLoadedAt = function (blockSource, x, y, z) {
    if (blockSource && typeof blockSource.isChunkLoadedAt == "function") {
        return blockSource.isChunkLoadedAt(x, z);
    }
    if (typeof World != "undefined" && World && typeof World.isChunkLoadedAt == "function") {
        return World.isChunkLoadedAt(x, y !== null && y !== undefined ? y : 64, z);
    }
    if (blockSource && typeof blockSource.isChunkLoaded == "function") {
        return blockSource.isChunkLoaded(x >> 4, z >> 4);
    }
    if (typeof World != "undefined" && World && typeof World.isChunkLoaded == "function") {
        return World.isChunkLoaded(x >> 4, z >> 4);
    }
    return true;
};

/* ------------------------------------------------------------- blocks --- */

CoreKit.Blocks = {};

/**
 * 6-way facing meta from the delta between the placed block and the player
 * (Bedrock face convention — meta 0=SOUTH, 1=NORTH, 2=EAST, 3=WEST, 4=down,
 * 5=up). Returns 0..5.
 */
CoreKit.Blocks.facingMetaFromDelta = function (dx, dy, dz) {
    var ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    if (ay >= ax && ay >= az) return dy > 0 ? 5 : 4;
    if (ax >= az) return dx > 0 ? 2 : 3;
    return dz > 0 ? 0 : 1;
};

/**
 * Convenience: delta from coords + player position, then the facing meta.
 * playerPos: {x, y, z} (Entity.getPosition).
 */
CoreKit.Blocks.facingMetaFromPlayer = function (coords, playerPos) {
    return CoreKit.Blocks.facingMetaFromDelta(
        playerPos.x - (coords.x + 0.5),
        playerPos.y - (coords.y + 0.5),
        playerPos.z - (coords.z + 0.5)
    );
};

/**
 * Wire/cable boxes: 6 directional quarter-width boxes + the center box, all in
 * block units (0..1). width default 0.25.
 * Returns { wires: [{ side, box }], center: [x1,y1,z1,x2,y2,z2] }.
 */
CoreKit.Blocks.wireBoxes = function (width) {
    width = width || 0.25;
    var w2 = width / 2;
    var wires = [
        { side: [1, 0, 0], box: [0.5 + w2, 0.5 - w2, 0.5 - w2, 1, 0.5 + w2, 0.5 + w2] },
        { side: [-1, 0, 0], box: [0, 0.5 - w2, 0.5 - w2, 0.5 - w2, 0.5 + w2, 0.5 + w2] },
        { side: [0, 1, 0], box: [0.5 - w2, 0.5 + w2, 0.5 - w2, 0.5 + w2, 1, 0.5 + w2] },
        { side: [0, -1, 0], box: [0.5 - w2, 0, 0.5 - w2, 0.5 + w2, 0.5 - w2, 0.5 + w2] },
        { side: [0, 0, 1], box: [0.5 - w2, 0.5 - w2, 0.5 + w2, 0.5 + w2, 0.5 + w2, 1] },
        { side: [0, 0, -1], box: [0.5 - w2, 0.5 - w2, 0, 0.5 + w2, 0.5 + w2, 0.5 - w2] }
    ];
    return {
        wires: wires,
        center: [0.5 - w2, 0.5 - w2, 0.5 - w2, 0.5 + w2, 0.5 + w2, 0.5 + w2]
    };
};

EXPORT("CoreKit", CoreKit);
