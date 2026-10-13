LIBRARY({
    name: "SaveCore",
    version: 2,
    shared: true,
    api: "CoreEngine"
});

var SaveCore = {};

/*
 * ============================================================================
 * SaveCore — versioned persistence with migration and validation
 * ============================================================================
 * Versioned persistence over Saver.addSavesScope: declared migrations, a
 * defensive read with fallback to defaults, and a LevelLeft reset.
 *
 * Save format: { version: n, data: <object> } — the envelope carries the
 * version; migrations run in read order, validation before adoption.
 * ============================================================================
 */

var _SCORE_scopes = Object.create(null);

function _scoreLog(msg) {
    if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log(msg, "SaveCore");
}

function _scoreDefaults(options) {
    if (typeof options.defaults == "function") {
        try { return options.defaults(); } catch (e) { return {}; }
    }
    return {};
}

/**
 * scope(name, options) → store { data, name, version }
 * options: {
 *   version: int (default 1),
 *   migrations: { 1: fn(data)→data, 2: fn, ... },   // runs in ascending order
 *   validate: fn(data)→bool,                        // false → fresh defaults + warning
 *   defaults: fn()→object,
 *   legacy: fn(raw)→data,                           // pre-envelope save: the WHOLE raw object is the data
 *   serialize: fn(data)→data,                       // save hook: derive/convert data before writing
 *   deserialize: fn(data)→data,                     // read hook (inverse of serialize), every accepted read
 *   onLevelLeft: fn(store)                          // called on LevelLeft before data reset
 * }
 * Read is defensive end-to-end (corrupted saves never crash the mod).
 * Duplicate names return the existing store (no double engine scope);
 * newer-version saves are rejected (fresh defaults). The save function passes
 * the data to the engine as-is — store JSON-pure data, avoid JS circular references.
 */
SaveCore.scope = function (name, options) {
    options = options || {};
    if (_SCORE_scopes[name]) {
        _scoreLog('scope "' + name + '" is already registered — reusing the existing store');
        return _SCORE_scopes[name];
    }
    var store = {
        name: name,
        version: options.version || 1,
        data: null
    };
    _SCORE_scopes[name] = store;

    Saver.addSavesScope(name, function (scope) {
        var raw = scope || {};
        var isEnvelope = raw && typeof raw === "object" && ("version" in raw) && ("data" in raw);
        var hadVersion = raw && typeof raw === "object" && ("version" in raw);
        var usedLegacy = false;
        var version;
        var data;
        if (!isEnvelope && typeof options.legacy == "function") {
            // Legacy (pre-envelope) save: the whole raw object IS the data. Without
            // this hook such saves silently loaded as defaults (raw.version/raw.data
            // are undefined). Host adapts the old shape here.
            try { data = options.legacy(raw); } catch (e) {
                _scoreLog('scope "' + name + '" legacy() failed: ' + e);
                data = null;
            }
            version = 0;
            usedLegacy = true;
        } else {
            version = raw.version || 0;
            data = raw.data;
        }

        if (version > store.version) {
            _scoreLog('scope "' + name + '" was saved by a newer version (' + version + ' > ' +
                store.version + ') — loading fresh defaults');
            store._newerRaw = raw;
            store.data = _scoreDefaults(options);
            return;
        }

        if (version < store.version && options.migrations) {
            while (version < store.version) {
                var migrate = options.migrations[version + 1];
                if (typeof migrate != "function") {
                    _scoreLog('scope "' + name + '" has no migration step ' + (version + 1) + ' — loading fresh defaults');
                    data = null;
                    break;
                }
                try {
                    data = migrate(data);
                    version++;
                } catch (e) {
                    _scoreLog('migration ' + (version + 1) + ' of scope "' + name + '" failed: ' + e);
                    data = null;
                    break;
                }
            }
        }

        if (version < store.version && !options.migrations && !usedLegacy && hadVersion) {
            _scoreLog('scope "' + name + '" has saved version ' + version + ' but no migrations — ' +
                'loading older data as-is (it will be saved as version ' + store.version + ')');
        }

        // Optional read-side hook — the inverse of serialize(). Runs on EVERY
        // accepted read (envelope included, unlike legacy), before validate.
        // Required to invert a save-time conversion (e.g. 'Infinity' → Infinity)
        // and to re-normalize keys. A throwing hook falls back to defaults.
        if (typeof options.deserialize == "function") {
            try { data = options.deserialize(data); }
            catch (e) {
                _scoreLog('scope "' + name + '" deserialize() failed: ' + e);
                data = null;
            }
        }

        var valid = true;
        if (options.validate) {
            try { valid = !!options.validate(data); } catch (e) { valid = false; }
        }
        if (!valid) {
            _scoreLog('scope "' + name + '" failed validation — loading fresh defaults');
            data = null;
        }

        store.data = (data === null || data === undefined) ? _scoreDefaults(options) : data;
    }, function () {
        // A newer save was seen: never overwrite it with downgraded defaults.
        if (store._newerRaw !== undefined && store._newerRaw !== null) {
            _scoreLog('scope "' + name + '" keeps the newer saved payload instead of writing defaults');
            return store._newerRaw;
        }
        // Store JSON-pure data; avoid JS circular references.
        var dataToSave = (store.data === null || store.data === undefined) ? _scoreDefaults(options) : store.data;
        // Optional save hook: derive/convert the persisted shape (e.g. 'Infinity'
        // for disk storage, or live task state). A throwing hook falls back to
        // the raw data instead of wiping the scope.
        if (typeof options.serialize == "function") {
            try { dataToSave = options.serialize(dataToSave); }
            catch (e) { _scoreLog('scope "' + name + '" serialize() failed: ' + e); }
        }
        return { version: store.version, data: dataToSave };
    });

    Callback.addCallback("LevelLeft", function () {
        if (typeof options.onLevelLeft == "function") {
            try { options.onLevelLeft(store); } catch (e) {}
        }
        store.data = null;
        store._newerRaw = null;
    });

    return store;
};

SaveCore.getScope = function (name) {
    return _SCORE_scopes[name] || null;
};

/** LevelLeft cleanup of every registered scope. */
SaveCore.resetAll = function () {
    for (var name in _SCORE_scopes) {
        _SCORE_scopes[name].data = null;
        _SCORE_scopes[name]._newerRaw = null;
    }
};

EXPORT("SaveCore", SaveCore);
