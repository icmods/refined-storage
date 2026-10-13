LIBRARY({
    name: "CoreKit",
    version: 2,
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
 * options: { ref }. Each method returns null on any failure; when the transport is
 * unavailable (tests) every method returns null.
 */
CoreKit.net.github = function (user, repo, options) {
    options = options || {};
    var base = "https://api.github.com/repos/" + user + "/" + repo + "/contents/";
    function read(path) {
        try {
            if (typeof sendHttp == "undefined") return null;
            var raw = sendHttp(base + path + (options.ref ? "?ref=" + options.ref : ""));
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

/* ---------------------------------------------------------- ItemContent --- */

/*
 * Canonical projection of an extra to a deterministic string: enchants, $mod
 * custom data, $rs.nbt (or a readable compound tag) and the custom name.
 * content() returns "" for a missing extra and null for unsupported content
 * (byte/int array compounds). fold() copies a readable compound tag into
 * $rs.nbt so it survives save/network; fold() does not change keyOf().
 */
CoreKit.ItemContent = (function () {
    var RESERVED_PREFIX = "$rs";
    var RS_NBT_KEY = "$rs.nbt";
    var LEGACY_DISK_KEY = "rsDiskUuid";

    /** $rs* and the legacy disk key are control keys, not content. */
    function isReservedKey(key) {
        key = String(key);
        if (key === LEGACY_DISK_KEY) return true;
        if (key.indexOf(RESERVED_PREFIX) !== 0) return false;
        return key !== RS_NBT_KEY;
    }

    /** Deterministic JSON: keys sorted recursively. */
    function canonJson(value) {
        if (value === null || value === undefined) return "null";
        var type = typeof value;
        if (type === "number") return isFinite(value) ? String(value) : "null";
        if (type === "boolean") return value ? "true" : "false";
        if (type === "string") return JSON.stringify(value);
        if (Object.prototype.toString.call(value) === "[object Array]") {
            var items = [];
            for (var i = 0; i < value.length; i++) items.push(canonJson(value[i]));
            return "[" + items.join(",") + "]";
        }
        if (type === "object") {
            var keys = [];
            for (var key in value) if (Object.prototype.hasOwnProperty.call(value, key)) keys.push(key);
            keys.sort();
            var parts = [];
            for (var ki = 0; ki < keys.length; ki++) {
                parts.push(JSON.stringify(keys[ki]) + ":" + canonJson(value[keys[ki]]));
            }
            return "{" + parts.join(",") + "}";
        }
        return "null";
    }

    /** Drops control keys and $rs.nbt; returns null when nothing is left. */
    function filterMod(mod) {
        if (mod == null || typeof mod !== "object") return null;
        if (Object.prototype.toString.call(mod) === "[object Array]") return null;
        var out = {}, count = 0;
        for (var key in mod) {
            if (!Object.prototype.hasOwnProperty.call(mod, key)) continue;
            if (isReservedKey(key) || key === RS_NBT_KEY) continue;
            out[key] = mod[key];
            count++;
        }
        return count ? out : null;
    }

    function nbtNumber(value) {
        var num = Number(value);
        return isFinite(num) ? num : 0;
    }

    /** Typed NBT value; holder is a compound (string ref) or list (index ref). */
    function nbtTypedEntry(holder, ref, type) {
        switch (type) {
            case 1: return { t: "b", v: nbtNumber(holder.getByte(ref)) };
            case 2: return { t: "s", v: nbtNumber(holder.getShort(ref)) };
            case 3: return { t: "i", v: nbtNumber(holder.getInt(ref)) };
            case 4: return { t: "l", v: String(holder.getInt64(ref)) };
            case 5: return { t: "f", v: String(holder.getFloat(ref)) };
            case 6: return { t: "d", v: String(holder.getDouble(ref)) };
            case 8: return { t: "str", v: String(holder.getString(ref)) };
            case 9: {
                var list = nbtTypedList(holder.getListTag(ref));
                return list ? { t: "list", v: list } : false;
            }
            case 10: {
                var compound = nbtTypedCompound(holder.getCompoundTag(ref), true);
                return compound ? { t: "cmp", v: compound } : false;
            }
            default: return false;
        }
    }

    function nbtTypedList(listTag) {
        if (listTag == null) return null;
        var length;
        try { length = listTag.length(); } catch (e) { return null; }
        var out = [];
        for (var i = 0; i < length; i++) {
            var typed;
            try { typed = nbtTypedEntry(listTag, i, listTag.getValueType(i)); } catch (e) { return null; }
            if (typed === false) return null;
            out.push(typed);
        }
        return out;
    }

    function nbtTypedCompound(tag, allowEmpty) {
        if (tag == null) return null;
        var keys;
        try { keys = tag.getAllKeys(); } catch (e) { return null; }
        if (keys == null || typeof keys.length !== "number") return null;
        if (keys.length === 0) return allowEmpty ? {} : null;
        var out = {};
        for (var i = 0; i < keys.length; i++) {
            var key = String(keys[i]), typed;
            try { typed = nbtTypedEntry(tag, key, tag.getValueType(key)); } catch (e) { return null; }
            if (typed === false) return null;
            out[key] = typed;
        }
        return out;
    }

    function nbtCanonical(tag) {
        var compound = nbtTypedCompound(tag, false);
        return compound == null ? null : canonJson(compound);
    }

    function content(extra) {
        if (!extra) return "";
        var cached;
        try { cached = extra.__rsContent; } catch (e) { cached = undefined; }
        if (cached !== undefined) return cached;
        var name = null;
        try {
            if (typeof extra.getCustomName == "function") {
                var customName = extra.getCustomName();
                if (customName != null && String(customName).length > 0) name = String(customName);
            }
        } catch (e) {}
        var enchants = [];
        try {
            if (typeof extra.getEnchants == "function") {
                var map = extra.getEnchants();
                for (var key in map) {
                    var id = Number(key), level = Number(map[key]);
                    if (isFinite(id) && isFinite(level) && level > 0) enchants.push([id, level]);
                }
            }
        } catch (e) {}
        enchants.sort(function (a, b) { return a[0] - b[0]; });
        var mod = null;
        try {
            if (typeof extra.getAllCustomData == "function") {
                var raw = extra.getAllCustomData();
                if (raw != null && String(raw).length > 0) mod = filterMod(JSON.parse(String(raw)));
            }
        } catch (e) { mod = null; }
        var compound = null;
        try {
            if (typeof extra.getString == "function") {
                var folded = extra.getString(RS_NBT_KEY);
                if (folded != null && String(folded).length > 0) compound = String(folded);
            }
            if (compound == null && typeof extra.getCompoundTag == "function") {
                var tag = extra.getCompoundTag();
                if (tag != null) {
                    compound = nbtCanonical(tag);
                    if (compound == null) { try { extra.__rsContent = null; } catch (e) {} return null; }
                }
            }
        } catch (e) { try { extra.__rsContent = null; } catch (e2) {} return null; }
        var out = "v1|" + canonJson({ e: enchants, m: mod, c: compound, n: name });
        try { extra.__rsContent = out; } catch (e) {}
        return out;
    }

    function keyOf(item) {
        if (!item) return "";
        var value = content(item.extra);
        if (value == null) return item.id + ":" + item.data + ":!unsupported";
        return item.id + ":" + item.data + ":" + value;
    }

    function same(a, b) {
        return keyOf(a) === keyOf(b);
    }

    /** Content equality for two extras; unsupported content never matches. */
    function sameExtra(a, b) {
        var ca = content(a), cb = content(b);
        if (ca == null || cb == null) return false;
        return ca === cb;
    }

    function fold(extra) {
        if (!extra) return true;
        var tag = null;
        try { if (typeof extra.getCompoundTag == "function") tag = extra.getCompoundTag(); } catch (e) { return false; }
        if (tag == null) return true;
        var canonical = nbtCanonical(tag);
        if (canonical == null) return false;
        try {
            var current = (typeof extra.getString == "function") ? extra.getString(RS_NBT_KEY) : null;
            if (current != null && String(current) === canonical) return true;
            if (typeof extra.putString != "function") return false;
            extra.putString(RS_NBT_KEY, canonical);
            /* The wrapper changed: drop the memoized content. */
            try { extra.__rsContent = undefined; } catch (e) {}
            return true;
        } catch (e) { return false; }
    }

    function isSupported(extra) {
        if (!extra) return true;
        try {
            if (typeof extra.getString == "function") {
                var folded = extra.getString(RS_NBT_KEY);
                if (folded != null && String(folded).length > 0) return true;
            }
            if (typeof extra.getCompoundTag == "function") {
                var tag = extra.getCompoundTag();
                if (tag != null && nbtCanonical(tag) == null) return false;
            }
        } catch (e) { return false; }
        return true;
    }

    var DISPLAY = {
        groupKey: function (item) { return keyOf(item); }
    };

    return {
        content: content,
        keyOf: keyOf,
        same: same,
        sameExtra: sameExtra,
        fold: fold,
        nbtCanonical: nbtCanonical,
        isSupported: isSupported,
        isReservedKey: isReservedKey,
        DISPLAY: DISPLAY
    };
})();

/** Parse a uid into { id, data, content }; accepts "id:data:content" and legacy "id_data[_rest]". */
CoreKit.Items.parseUid = function (uid) {
    uid = String(uid || "");
    var colon = uid.indexOf(":");
    if (colon !== -1) {
        var second = uid.indexOf(":", colon + 1);
        var idNum = parseInt(uid.slice(0, colon), 10);
        var dataNum = second === -1 ? parseInt(uid.slice(colon + 1), 10) : parseInt(uid.slice(colon + 1, second), 10);
        return {
            id: isFinite(idNum) ? idNum : 0,
            data: isFinite(dataNum) ? dataNum : 0,
            content: second === -1 ? "" : uid.slice(second + 1)
        };
    }
    var parts = uid.split("_");
    return {
        id: parseInt(parts[0], 10) || 0,
        data: parseInt(parts[1], 10) || 0,
        content: parts.length > 2 ? parts.slice(2).join("_") : ""
    };
};

CoreKit.Items.extraKey = function (extra) {
    var value = CoreKit.ItemContent.content(extra);
    return value == null ? "" : value;
};

CoreKit.Items.uidOf = function (item) {
    return CoreKit.ItemContent.keyOf(item);
};

CoreKit.Items.uidInfo = function (item) {
    if (!item) return { uid: "", extraKey: "", extra: null };
    var value = CoreKit.ItemContent.content(item.extra);
    return {
        uid: CoreKit.ItemContent.keyOf(item),
        extraKey: value == null ? "" : value,
        extra: item.extra || null
    };
};

CoreKit.Items.fullExtraToString = function (extra) {
    var value = CoreKit.ItemContent.content(extra);
    return value == null ? "" : value;
};

CoreKit.Items.isExtraEmpty = function (extra) {
    var value = CoreKit.ItemContent.content(extra);
    return value == null || value === "";
};

CoreKit.Items.match = function (a, b, options) {
    options = options || {};
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (options.wildcardData === false) {
        if (a.data !== b.data) return false;
    } else {
        if (a.data !== b.data && a.data !== -1 && b.data !== -1) return false;
    }
    if (options.matchExtra === false) return true;
    return CoreKit.ItemContent.sameExtra(a.extra, b.extra);
};

CoreKit.Items.mergeable = function (a, b) {
    if (!a || !b || a.id !== b.id || a.data !== b.data) return false;
    return CoreKit.ItemContent.sameExtra(a.extra, b.extra);
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
