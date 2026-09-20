LIBRARY({
    name: "UiCore",
    version: 1,
    shared: true,
    api: "CoreEngine"
});

var UiCore = {};

/*
 * ============================================================================
 * UiCore — pagination, swipe, search, slot pools, darken, delta-dirty sync
 * ============================================================================
 * Pure descriptors and logic for: pagination, swipe page-flip (layout + anchor
 * variants), slider touch handling, a search-box dialog, virtual slot pools,
 * descriptor darken, and delta-dirty UI sync. It emits DESCRIPTORS or runs pure
 * logic — no window magic and no forced engine version. UI rules: IsDynamic with
 * a capital I, forceRefresh after open, bindings on real widgets only.
 * ============================================================================
 */

/* ---------------------------------------------------------- pagination ---- */

/**
 * Pure pagination helpers.
 * elements: { countX, countY, maxY, slider: { start_y } } — descriptor map.
 * Returns { getPages(length), getPageFromCoords(coords, pages), getCoordsFromPage(page, pages) }.
 */
UiCore.pagination = function (elements, config) {
    return {
        getPages: function (_length) {
            if (_length == 0) return 1;
            return Math.ceil(_length / elements[config.countX]);
        },
        getPageFromCoords: function (_coords, pages) {
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
            }
            return finish_i + 1;
        },
        getCoordsFromPage: function (page, pages) {
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
};

/* -------------------------------------------------------------- swipe ----- */

/**
 * Swipe page-flip touch handler (state machine, default 7px/15px thresholds).
 * opts: {
 *   bounds: { xStart, xEnd, yStart, yEnd },
 *   itemCount(),                       // current number of items
 *   pagination,                        // UiCore.pagination(...) helpers
 *   getLastPage(),
 *   switchPage(page, fromSwipe, dontMoveSlider),   // may return truthy = "switched"
 *   state: { swipeY: false, swipeSum: 0, moving: false }   // host-owned state bag
 *   maxY, sliderStartY, sliderScale, sliderX, sliderElementName, getElement(name),
 *   snapSliderOnRelease: true (default)   // on UP/CLICK the slider snaps to the
 *                                         // page's exact Y; the drag itself never
 *                                         // changes position math
 *   variant: "layout" (default) | "anchor"   // touch discriminator, see below
 *   drag: true (default)               // false = swipe-only handler (anchor frames
 *                                      // have no slider-drag section)
 *   snapAfterSwipe: false (default)    // after a MOVE-flip, snap the slider to the
 *                                      // new page's exact Y — ONLY when switchPage
 *                                      // returns truthy
 *   thresholds: { move: 7, accumulate: 15 }   // swipe sensitivity, BOTH variants.
 *                                      // "move" = per-event |delta| to flip immediately;
 *                                      // "accumulate" = same-direction sum to flip.
 *                                      // Defaults 7/15; controller/precraft/monitor
 *                                      // pass { move: 30, accumulate: 70 }
 * }
 * Returns a touch handler to push into the touchEvents list.
 *
 * variant "layout": DOWN starts the swipe only inside `bounds`; a per-MOVE
 * distance > "move" flips immediately, else the sum accumulates and flips at
 * > "accumulate"; the anchor is the previous event.
 * variant "anchor": ANY DOWN in the frame starts the swipe (no bounds); a
 * per-MOVE signed delta |d| > "move" or a same-direction accumulated |d| >
 * "accumulate" flips; a direction reversal resets the accumulator, so a small
 * oscillation around a point yields ZERO flips. Flip direction is the same in
 * both variants: DOWN → previous page, UP → next page.
 */
UiCore.attachSwipe = function (opts) {
    var anchor = opts.variant === "anchor";
    var dragEnabled = opts.drag !== false;
    var _th = opts.thresholds || {};
    var moveThreshold = _th.move !== undefined ? _th.move : 7;
    var accumulateThreshold = _th.accumulate !== undefined ? _th.accumulate : 15;
    // UP/CLICK end the interaction; CANCEL ends it too ("canceled by system
    // actions" — window close etc.).
    var _release = function (type) { return type == "UP" || type == "CLICK" || type == "CANCEL"; };
    return function (element, event) {
        var s = opts.state;
        if (anchor) {
            if (event.type == "DOWN") {
                s.swipeY = event.y;
                s.swipeSum = 0;
                s.swipeDir = 0;
            } else if (s.swipeY && event.type == "MOVE") {
                var d = event.y - s.swipeY;
                var moved = 0;
                if (d !== 0) {
                    var dir = d > 0 ? 1 : -1;
                    if (dir !== s.swipeDir) {
                        s.swipeDir = dir;
                        s.swipeSum = 0;
                    }
                    s.swipeSum += Math.abs(d);
                    if (Math.abs(d) > moveThreshold || s.swipeSum > accumulateThreshold) {
                        moved = -dir;   // DOWN → previous
                        s.swipeSum = 0;
                    }
                }
                s.swipeY = event.y;
                if (moved !== 0) {
                    var anchorPage = opts.getLastPage() + moved;
                    if (opts.snapAfterSwipe === true) {
                        if (opts.switchPage(anchorPage, false, false)) {
                            var anchorPages = opts.pagination.getPages(opts.itemCount());
                            var anchorEl = opts.getElement(opts.sliderElementName);
                            if (anchorEl && anchorEl.setPosition) {
                                anchorEl.setPosition(opts.sliderX, opts.pagination.getCoordsFromPage(anchorPage, anchorPages));
                            }
                        }
                    } else {
                        opts.switchPage(anchorPage, false, false);
                    }
                }
            } else if (s.swipeY && _release(event.type)) {
                s.swipeY = false;
                s.swipeSum = 0;
            }
        } else {
            if (event.type == "DOWN" && !s.moving &&
                event.x > opts.bounds.xStart && event.x < opts.bounds.xEnd &&
                event.y > opts.bounds.yStart && event.y < opts.bounds.yEnd) {
                s.swipeY = event.y;
                s.swipeSum = 0; // reset the accumulator per gesture (no residual premature flip)
            } else if (s.swipeY && event.type == "MOVE") {
                var distance = Math.abs(event.y - s.swipeY);
                function moveSwitchPage_(_n) {
                    var layoutPage = opts.getLastPage() + (_n ? 1 : -1);
                    if (opts.snapAfterSwipe === true) {
                        if (opts.switchPage(layoutPage, false, false)) {
                            var layoutPages = opts.pagination.getPages(opts.itemCount());
                            var layoutEl = opts.getElement(opts.sliderElementName);
                            if (layoutEl && layoutEl.setPosition) {
                                layoutEl.setPosition(opts.sliderX, opts.pagination.getCoordsFromPage(layoutPage, layoutPages));
                            }
                        }
                    } else {
                        opts.switchPage(layoutPage, false, false);
                    }
                }
                if (distance > moveThreshold) {
                    if (event.y > s.swipeY) moveSwitchPage_(false);
                    if (event.y < s.swipeY) moveSwitchPage_(true);
                    s.swipeSum = 0;
                } else {
                    s.swipeSum += distance;
                    if (s.swipeSum > accumulateThreshold) {
                        if (event.y > s.swipeY) moveSwitchPage_(false);
                        if (event.y < s.swipeY) moveSwitchPage_(true);
                        s.swipeSum = 0;
                    }
                }
                s.swipeY = event.y;
            } else if (s.swipeY && _release(event.type)) {
                s.swipeY = false;
                s.swipeSum = 0; // reset the accumulator per gesture (no residual premature flip)
            }
        }
        if (!dragEnabled) return;
        if (!s.moving) return;
        event.y -= opts.sliderScale * 15 / 2;
        if (!_release(event.type)) {
            var pages = opts.pagination.getPages(opts.itemCount());
            var page = opts.pagination.getPageFromCoords(event, pages);
            var el = opts.getElement(opts.sliderElementName);
            if (el && el.setPosition) {
                el.setPosition(opts.sliderX, Math.max(Math.min(event.y, opts.maxY), opts.sliderStartY));
            }
            opts.switchPage(page, false, true);
        }
        if (_release(event.type)) {
            s.moving = false;
            var pages2 = opts.pagination.getPages(opts.itemCount());
            var page2 = opts.pagination.getPageFromCoords(event, pages2);
            opts.switchPage(page2, false, false);
            if (opts.snapSliderOnRelease !== false) {
                var el2 = opts.getElement(opts.sliderElementName);
                if (el2 && el2.setPosition) {
                    el2.setPosition(opts.sliderX, opts.pagination.getCoordsFromPage(page2, pages2));
                }
            }
        }
    };
};

/**
 * Slider-frame touch handler (DOWN → moving; CLICK → jump/snap).
 * opts: {
 *   itemCount(), pagination, switchPage(page, fromSwipe, dontMoveSlider),
 *   state: { moving },
 *   switchOnClick: true (default)     // CLICK jumps to the clicked page (grid/crafts)
 *   snapOnClick: false (default)      // CLICK snaps the slider to the clicked page's
 *                                     // exact Y WITHOUT switching; needs
 *                                     // sliderX/sliderElementName/getElement
 *   sliderX, sliderElementName, getElement(name)
 * }
 */
UiCore.attachSlider = function (opts) {
    return function (element, event) {
        if (event.type == "DOWN") {
            opts.state.moving = true;
        }
        if (event.type == "UP" || event.type == "CANCEL") {
            opts.state.moving = false;
        }
        if (event.type == "CLICK") {
            var pages = opts.pagination.getPages(opts.itemCount());
            var page = opts.pagination.getPageFromCoords(event, pages);
            if (opts.switchOnClick !== false) {
                opts.switchPage(page, false, false);
            }
            if (opts.snapOnClick === true) {
                var el = opts.getElement(opts.sliderElementName);
                if (el && el.setPosition) {
                    el.setPosition(opts.sliderX, opts.pagination.getCoordsFromPage(page, pages));
                }
            }
        }
    };
};

/* ---------------------------------------------------------- search box ---- */

/**
 * Search box descriptors.
 * opts: { onSearch(keywordOrFalse, handler, container), title, textLabel,
 *         positiveLabel, height, clearable, fontSize }
 * height = frame height (30 default).
 * positiveLabel = AlertDialog positive button label (translated).
 * Returns { frame, text } descriptors ready to merge into elements.
 */
UiCore.searchBox = function (x, y, width, opts) {
    opts = opts || {};
    var ctx = { onSearch: opts.onSearch };
    var frame = {
        type: "frame",
        x: x,
        y: y,
        width: width,
        height: opts.height !== undefined ? opts.height : 30,
        bitmap: opts.bitmap || "search_bar",
        scale: 0.8,
        clicker: {
            onClick: function (itemContainerUiHandler, itemContainer, element) {
                var UI_ = typeof UI != "undefined" ? UI : null;
                var java_ = typeof java != "undefined" ? java : null;
                var android_ = typeof android != "undefined" ? android : null;
                if (!UI_ || !java_ || !android_) return;
                UI_.getContext().runOnUiThread(new java_.lang.Runnable({
                    run: function () {
                        try {
                            var editText = new android_.widget.EditText(UI_.getContext());
                            var applyKeyword = function (keyword) {
                                // the window may have closed while the dialog was
                                // open; applying the search on a dead container throws.
                                if (itemContainerUiHandler && typeof itemContainerUiHandler.getWindow == "function") {
                                    var w = itemContainerUiHandler.getWindow();
                                    if (w && typeof w.isOpened == "function" && !w.isOpened()) return;
                                }
                                ctx.onSearch(keyword, itemContainerUiHandler, itemContainer);
                            };
                            var builder = new android_.app.AlertDialog.Builder(UI_.getContext())
                                .setTitle(opts.title || "Please type the keywords")
                                .setView(editText)
                                .setPositiveButton(opts.positiveLabel || "Search", {
                                    onClick: function () {
                                        var keyword = editText.getText() + "";
                                        applyKeyword(keyword.length ? keyword : false);
                                    }
                                });
                            if (opts.clearable) {
                                builder.setNegativeButton("Clear", {
                                    onClick: function () {
                                        applyKeyword(false);
                                    }
                                });
                            }
                            builder.show();
                        } catch (e) {}
                    }
                }));
            }
        }
    };
    var text = {
        type: "text",
        x: x + 10,
        y: y + 1,
        z: 100,
        text: opts.textLabel || "Search",
        font: {
            color: opts.fontColor !== undefined ? opts.fontColor : (typeof android != "undefined" && android.graphics ? android.graphics.Color.WHITE : 0),
            shadow: 0.5,
            size: opts.fontSize !== undefined ? opts.fontSize : 20
        }
    };
    return { frame: frame, text: text };
};

/* ------------------------------------------------------------- dialogs ---- */

function _uiDialogAvailable() {
    return typeof UI != "undefined" && UI.getContext && typeof java != "undefined" && java.lang && java.lang.Runnable && typeof android != "undefined" && android.app;
}

/**
 * Native confirm dialog. Returns true when scheduled, false when the engine
 * APIs are unavailable. opts: { title, positiveLabel, negativeLabel, onResult(ok) }.
 */
UiCore.confirm = function (message, opts) {
    opts = opts || {};
    if (!_uiDialogAvailable()) return false;
    try {
        var ctx = UI.getContext();
        ctx.runOnUiThread(new java.lang.Runnable({
            run: function () {
                try {
                    var builder = new android.app.AlertDialog.Builder(ctx)
                        .setMessage(String(message == undefined ? "" : message))
                        .setPositiveButton(opts.positiveLabel || "OK", {
                            onClick: function () { if (typeof opts.onResult == "function") opts.onResult(true); }
                        })
                        .setNegativeButton(opts.negativeLabel || "Cancel", {
                            onClick: function () { if (typeof opts.onResult == "function") opts.onResult(false); }
                        });
                    if (opts.title) builder.setTitle(String(opts.title));
                    builder.show();
                } catch (e) {}
            }
        }));
        return true;
    } catch (e) {
        return false;
    }
};

/**
 * Native alert dialog (single button). Returns true when scheduled, false when
 * the engine APIs are unavailable. opts: { title, positiveLabel, onClose }.
 */
UiCore.alert = function (message, opts) {
    opts = opts || {};
    if (!_uiDialogAvailable()) return false;
    try {
        var ctx = UI.getContext();
        ctx.runOnUiThread(new java.lang.Runnable({
            run: function () {
                try {
                    var builder = new android.app.AlertDialog.Builder(ctx)
                        .setMessage(String(message == undefined ? "" : message))
                        .setPositiveButton(opts.positiveLabel || "OK", {
                            onClick: function () { if (typeof opts.onClose == "function") opts.onClose(); }
                        });
                    if (opts.title) builder.setTitle(String(opts.title));
                    builder.show();
                } catch (e) {}
            }
        }));
        return true;
    } catch (e) {
        return false;
    }
};

/* --------------------------------------------------------- slot pools ---- */

/**
 * Virtual slot pool: descriptors are created
 * lazily and parked at (-1000,-1000); inactive slots are never visible.
 * opts: { base: { type, size, ... }, maxCount }
 */
UiCore.createSlotPool = function (opts) {
    opts = opts || {};
    var pool = {};
    var count = 0;
    return {
        /** Lazy descriptor (parked off-screen). */
        get: function (name) {
            if (!pool[name]) {
                var desc = {};
                for (var k in opts.base) desc[k] = opts.base[k];
                desc.x = -1000;
                desc.y = -1000;
                pool[name] = desc;
                count++;
            }
            return pool[name];
        },
        has: function (name) { return !!pool[name]; },
        count: function () { return count; },
        maxCount: function () { return opts.maxCount || 0; },
        /** Move an active descriptor to its screen position. */
        setPosition: function (name, x, y) {
            var desc = pool[name];
            if (desc) { desc.x = x; desc.y = y; }
            return desc;
        },
        /** Park a slot off-screen (inactive). */
        park: function (name) {
            var desc = pool[name];
            if (desc) { desc.x = -1000; desc.y = -1000; }
        },
        /** Park ALL slots. */
        parkAll: function () {
            for (var name in pool) this.park(name);
        },
        pool: pool
    };
};

/* ------------------------------------------------------------- darken ---- */

/**
 * Apply descriptor darken per predicate.
 * Returns the number of changed slots. Call window.forceRefresh() after.
 */
UiCore.applyDarken = function (elements, names, predicate) {
    var changed = 0;
    for (var i = 0; i < names.length; i++) {
        var name = names[i];
        var el = elements[name];
        if (!el) continue;
        var dark = !!predicate(name);
        if (!!el.darken !== dark) {
            el.darken = dark;
            changed++;
        }
    }
    return changed;
};

/* --------------------------------------------------------- DeltaBinder --- */

function _UiDeltaBinder(container, opts) {
    this.container = container;
    this._cache = {};
    this._changed = false;
    this._dirtyKeys = {};
}

/**
 * Delta-dirty UI sync: setScale/setText/setBinding only touch the container when
 * the value actually changed; flush() calls sendChanges() only when something
 * changed. Cache invalidated when the GUI opens.
 */
UiCore.DeltaBinder = {
    wrap: function (container) {
        return new _UiDeltaBinder(container);
    }
};

_UiDeltaBinder.prototype._set = function (kind, name, value) {
    if (this._cache[name] === value) return;
    // Cache only after a successful container call: a throwing call stays
    // uncached and is retried on the next tick (never "remembered delivered").
    try {
        if (kind == "scale") this.container.setScale(name, value);
        else if (kind == "text") this.container.setText(name, value);
        else this.container.setBinding(name, kind, value);
    } catch (e) {
        return;
    }
    this._cache[name] = value;
    this._changed = true;
};

_UiDeltaBinder.prototype.setScale = function (name, value) {
    this._set("scale", name, value);
};

_UiDeltaBinder.prototype.setText = function (name, value) {
    this._set("text", name, value);
};

_UiDeltaBinder.prototype.setBinding = function (name, key, value) {
    var cacheKey = name + "#" + key;
    if (this._cache[cacheKey] === value) return;
    try { this.container.setBinding(name, key, value); } catch (e) { return; }
    this._cache[cacheKey] = value;
    this._changed = true;
};

/** container.sendChanges() — only when something changed; kept pending on failure. */
_UiDeltaBinder.prototype.flush = function () {
    if (!this._changed) return false;
    try { this.container.sendChanges(); } catch (e) { return false; }
    this._changed = false;
    return true;
};

/** GUI opened: forget caches so the next flush resends everything. */
_UiDeltaBinder.prototype.invalidate = function () {
    this._cache = {};
    this._changed = true;
};

/* ---------------------------------------------------------------- text ---- */

/** Clean item display name: strip §-codes, truncate. */
UiCore.cutItemName = function (name, maxLen) {
    if (!name) return "";
    var str = String(name).replace(/§./g, "");
    maxLen = maxLen || 40;
    return str.length > maxLen ? str.substr(0, maxLen) + "..." : str;
};

/* ---------------------------------------------------------------- layout -- */

var _uiTextWidthCache = Object.create(null);
var _uiTextWidthKeys = [];
var _UI_TEXTWIDTH_MAX = 256;

/** Text width for a font size (cached; engine Font when available, 0.5*size fallback). */
UiCore.textWidth = function (text, size) {
    text = String(text == undefined ? "" : text);
    size = size || 20;
    var key = size + "|" + text;
    var cached = _uiTextWidthCache[key];
    if (cached !== undefined) return cached;
    var width = Math.ceil(text.length * size * 0.5);
    try {
        if (typeof com != "undefined") {
            var Font = com.zhekasmirnov.innercore.api.mod.ui.types.Font;
            if (Font) width = new Font({ size: size }).getTextWidth(text, 1);
        }
    } catch (e) {}
    _uiTextWidthCache[key] = width;
    _uiTextWidthKeys.push(key);
    if (_uiTextWidthKeys.length > _UI_TEXTWIDTH_MAX) delete _uiTextWidthCache[_uiTextWidthKeys.shift()];
    return width;
};

function _uiElementBox(e) {
    var w, h;
    if (e.type == "text") {
        var fs = (e.font && e.font.size) || 20;
        w = UiCore.textWidth(e.text, fs);
        h = fs;
    } else if (e.type == "frame") {
        w = e.width != null ? e.width : 0;
        h = e.height != null ? e.height : 0;
    } else {
        var s = e.size != null ? e.size : (e.type == "slot" ? 60 : 20);
        w = e.width != null ? e.width : s;
        h = e.height != null ? e.height : s;
    }
    var sx = e.scale != null ? e.scale : 1;
    return { x: e.x || 0, y: e.y || 0, w: w * sx, h: h * sx };
}

var _uiMeasureCache = Object.create(null);
var _uiMeasureKeys = [];
var _UI_MEASURE_MAX = 32;

function _uiContentSignature(content) {
    var parts = [];
    for (var n in content.elements) {
        var e = content.elements[n];
        parts.push("e", e.type, e.x, e.y, e.size, e.width, e.height, e.scale, e.bitmap, e.text, (e.font && e.font.size) || 0);
    }
    for (var d in content.drawing) {
        var o = content.drawing[d];
        parts.push("d", o.type, o.x, o.y, o.size, o.width, o.height, o.scale, o.bitmap);
    }
    return parts.join("\u0001");
}

/**
 * Bounds of content.elements + content.drawing:
 * { scrollX, scrollY, minX, minY, width, height }.
 * Uses the engine ElementFactory when available, descriptor estimates otherwise.
 * Results are cached by a structural descriptor signature (bounded, 32 entries).
 */
UiCore.measureContent = function (content) {
    content = content || {};
    var signature = _uiContentSignature(content);
    var cached = _uiMeasureCache[signature];
    if (cached !== undefined) return cached;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function accept(x, y, w, h) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
    }
    var done = {};
    try {
        if (typeof com != "undefined" && content.elements) {
            var ElementFactory = com.zhekasmirnov.innercore.api.mod.ui.elements.ElementFactory;
            var Window = typeof UI != "undefined" ? UI.Window : null;
            if (ElementFactory && Window) {
                var u = new Window();
                for (var name in content.elements) {
                    var e = content.elements[name];
                    var element = ElementFactory.construct(u, e);
                    element.onSetup();
                    var rect = element.elementRect;
                    accept(e.x || 0, e.y || 0, rect.right - rect.left, rect.bottom - rect.top);
                    done[name] = true;
                }
            }
        }
    } catch (e) {}
    for (var name2 in content.elements) {
        if (done[name2]) continue;
        var b = _uiElementBox(content.elements[name2]);
        accept(b.x, b.y, b.w, b.h);
    }
    for (var dname in content.drawing) {
        var d = content.drawing[dname];
        var dw = d.width, dh = d.height;
        if (d.type == "bitmap" && (dw == null || dh == null)) {
            try {
                if (typeof com != "undefined") {
                    var tex = com.zhekasmirnov.innercore.api.mod.ui.TextureSource.instance;
                    var bmp = tex && tex.get(d.bitmap);
                    if (bmp) {
                        if (dw == null) dw = bmp.getWidth();
                        if (dh == null) dh = bmp.getHeight();
                    }
                }
            } catch (e) {}
        }
        var ds = d.scale != null ? d.scale : 1;
        accept(d.x || 0, d.y || 0, (dw || 0) * ds, (dh || 0) * ds);
    }
    var result;
    if (minX === Infinity) result = { scrollX: 0, scrollY: 0, minX: 0, minY: 0, width: 0, height: 0 };
    else result = { scrollX: maxX, scrollY: maxY, minX: minX, minY: minY, width: maxX - minX, height: maxY - minY };
    _uiMeasureCache[signature] = result;
    _uiMeasureKeys.push(signature);
    if (_uiMeasureKeys.length > _UI_MEASURE_MAX) delete _uiMeasureCache[_uiMeasureKeys.shift()];
    return result;
};

/** Scale element/drawing descriptors in place (text font, frames, sizes, x/y). */
UiCore.scaleContent = function (content, scale) {
    if (!content || !scale || scale == 1) return content;
    function scaleOne(obj) {
        if (obj.type == "text") {
            obj.font = obj.font || {};
            obj.font.size = (obj.font.size || 20) * scale;
        } else if (obj.type == "frame") {
            if (obj.width) obj.width *= scale;
            if (obj.height) obj.height *= scale;
        } else {
            obj.size = (obj.size || (obj.type == "slot" ? 60 : 20)) * scale;
            if (obj.width) obj.width *= scale;
            if (obj.height) obj.height *= scale;
            if (obj.scale) obj.scale *= scale;
        }
        if (obj.x) obj.x *= scale;
        if (obj.y) obj.y *= scale;
    }
    for (var e in content.elements) scaleOne(content.elements[e]);
    for (var d in content.drawing) scaleOne(content.drawing[d]);
    return content;
};

/** Offset element/drawing descriptors in place. */
UiCore.offsetContent = function (content, x, y) {
    if (!content) return content;
    function move(obj) {
        if (obj.x != null) obj.x += x;
        if (obj.y != null) obj.y += y;
    }
    for (var e in content.elements) move(content.elements[e]);
    for (var d in content.drawing) move(content.drawing[d]);
    return content;
};

/**
 * Fit descriptors into maxWidth/maxHeight (minus padding): measure, shrink by
 * at most maxScale (default 1), then offset so the bounding box is centered on
 * opts.center {x,y}. Returns { scale, size }.
 */
UiCore.fitContent = function (content, opts) {
    opts = opts || {};
    var padding = opts.padding || 0;
    var maxWidth = opts.maxWidth != null ? opts.maxWidth - padding * 2 : 0;
    var maxHeight = opts.maxHeight != null ? opts.maxHeight - padding * 2 : 0;
    var size = UiCore.measureContent(content);
    var scale = opts.maxScale != null ? opts.maxScale : 1;
    if (maxWidth > 0 && size.width > 0) scale = Math.min(scale, maxWidth / size.width);
    if (maxHeight > 0 && size.height > 0) scale = Math.min(scale, maxHeight / size.height);
    if (opts.minScale != null && scale < opts.minScale) scale = opts.minScale;
    if (scale !== 1) {
        UiCore.scaleContent(content, scale);
        size = UiCore.measureContent(content);
    }
    if (opts.center && typeof opts.center == "object") {
        UiCore.offsetContent(content, opts.center.x - (size.minX + size.width / 2), opts.center.y - (size.minY + size.height / 2));
        size = UiCore.measureContent(content);
    }
    return { scale: scale, size: size };
};

/**
 * Vertical tab strip descriptors.
 * opts: { tabs: [{ id, bitmap?, iconBitmap?, icon?, onClick? }], x, y, size,
 *         gap, prefix, bitmap, iconBitmap, maxVisible, offset }
 * maxVisible/offset clip long strips (overflow is host-scrolled).
 * Returns { elements, count, visible, offset, hasOverflow }.
 */
UiCore.tabs = function (opts) {
    opts = opts || {};
    var tabs = opts.tabs || [];
    var size = opts.size || 20;
    var gap = opts.gap != null ? opts.gap : 0;
    var x = opts.x || 0;
    var y = opts.y || 0;
    var prefix = opts.prefix || "";
    var maxVisible = opts.maxVisible != null ? opts.maxVisible : tabs.length;
    var offset = opts.offset || 0;
    if (offset < 0) offset = 0;
    if (offset > tabs.length) offset = tabs.length;
    var end = Math.min(tabs.length, offset + maxVisible);
    var elements = {};
    for (var i = offset; i < end; i++) {
        var tab = tabs[i] || {};
        var id = tab.id != null ? tab.id : i;
        var ty = y + (size + gap) * (i - offset);
        var frameBitmap = tab.bitmap || opts.bitmap;
        if (frameBitmap) {
            elements[prefix + id] = { type: "frame", x: x, y: ty, width: size, height: size, bitmap: frameBitmap };
        }
        var iconBitmap = tab.iconBitmap || opts.iconBitmap;
        if (tab.icon || iconBitmap || typeof tab.onClick == "function") {
            var desc = {
                type: "slot", x: x, y: ty, size: size, z: 1, visual: true,
                bitmap: iconBitmap || frameBitmap || "_default_slot_empty",
                source: tab.icon || {}
            };
            if (typeof tab.onClick == "function") desc.clicker = { onClick: tab.onClick };
            elements[prefix + id + "_icon"] = desc;
        }
    }
    return {
        elements: elements,
        count: tabs.length,
        visible: Math.max(0, end - offset),
        offset: offset,
        hasOverflow: tabs.length > maxVisible
    };
};

/**
 * Tap outside a rectangular area → onClose(). Returns a touch handler:
 * DOWN/CLICK inside `bounds` returns false; outside calls onClose() and
 * returns true (consumed). Bounds are in window coordinates.
 */
UiCore.outsideClose = function (bounds, onClose) {
    bounds = bounds || {};
    return function (element, event) {
        if (event.type != "DOWN" && event.type != "CLICK") return false;
        var x = event.x, y = event.y;
        var inside = x >= bounds.xStart && x <= bounds.xEnd && y >= bounds.yStart && y <= bounds.yEnd;
        if (!inside && typeof onClose == "function") {
            try { onClose(); } catch (e) {}
        }
        return !inside;
    };
};

/* --------------------------------------------------------------- display -- */

var _uiDisplayCache = null;

/**
 * Current display: {width (max metric), height (min metric), density}.
 * Cached for the session; pass force=true (or call displayRefresh()) after an
 * orientation/resolution change.
 */
UiCore.display = function (force) {
    if (_uiDisplayCache && force !== true) return _uiDisplayCache;
    var result = { width: 0, height: 0, density: 1 };
    try {
        if (typeof UI != "undefined" && UI.getContext) {
            var ctx = UI.getContext();
            if (ctx) {
                var display = ctx.getWindowManager().getDefaultDisplay();
                if (display) {
                    var w = display.getWidth(), h = display.getHeight();
                    result.width = Math.max(w, h);
                    result.height = Math.min(w, h);
                }
                result.density = ctx.getResources().getDisplayMetrics().density || 1;
                _uiDisplayCache = result;
                return result;
            }
        }
    } catch (e) {}
    try {
        if (typeof UI != "undefined") {
            if (UI.getScreenWidth) result.width = UI.getScreenWidth();
            if (UI.getScreenHeight) result.height = UI.getScreenHeight();
        }
    } catch (e) {}
    _uiDisplayCache = result;
    return result;
};

/** Force the display cache to be recomputed (orientation/resolution change). */
UiCore.displayRefresh = function () {
    return UiCore.display(true);
};

UiCore.displayPercentWidth = function (percent) {
    return Math.round(UiCore.display().width / 100 * percent);
};

UiCore.displayPercentHeight = function (percent) {
    return Math.round(UiCore.display().height / 100 * percent);
};

function _uiApplyDimension(unit, value) {
    try {
        if (typeof android != "undefined" && typeof UI != "undefined" && UI.getContext) {
            var metrics = UI.getContext().getResources().getDisplayMetrics();
            return android.util.TypedValue.applyDimension(unit, value, metrics);
        }
    } catch (e) {}
    return value * (UiCore.display().density || 1);
}

/** Android dp → px (density fallback). */
UiCore.dip = function (value) {
    var unit = 0;
    try {
        if (typeof android != "undefined" && android.util && android.util.TypedValue) unit = android.util.TypedValue.COMPLEX_UNIT_DIP;
    } catch (e) {}
    return _uiApplyDimension(unit, value);
};

/** Android sp → px (density fallback). */
UiCore.sp = function (value) {
    var unit = 0;
    try {
        if (typeof android != "undefined" && android.util && android.util.TypedValue) unit = android.util.TypedValue.COMPLEX_UNIT_SP;
    } catch (e) {}
    return _uiApplyDimension(unit, value);
};

/* ---------------------------------------------------------------- skins -- */

function _uiClone(value, seen) {
    if (value === null || typeof value != "object") return value;
    if (typeof value.clone == "function") {
        try { return value.clone(); } catch (e) {}
    }
    seen = seen || [];
    for (var i = 0; i < seen.length; i++) {
        if (seen[i][0] === value) return seen[i][1];
    }
    var out;
    if (Array.isArray(value)) {
        out = [];
        seen.push([value, out]);
        for (var a = 0; a < value.length; a++) out.push(_uiClone(value[a], seen));
    } else {
        out = {};
        seen.push([value, out]);
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = _uiClone(value[k], seen);
        }
    }
    return out;
}

function _uiMerge(target, base) {
    for (var key in base) {
        if (!Object.prototype.hasOwnProperty.call(base, key)) continue;
        var bv = base[key], tv = target[key];
        if (tv === undefined || tv === null) {
            target[key] = _uiClone(bv);
        } else if (typeof tv == "object" && tv !== null && typeof bv == "object" && bv !== null) {
            if (Array.isArray(tv) && Array.isArray(bv)) {
                for (var i = 0; i < bv.length; i++) {
                    if (tv[i] === undefined) tv[i] = _uiClone(bv[i]);
                    else if (typeof tv[i] == "object" && tv[i] && typeof bv[i] == "object" && bv[i]) _uiMerge(tv[i], bv[i]);
                }
            } else {
                _uiMerge(tv, bv);
            }
        }
    }
    return target;
}

/** src wins over target (objects merge recursively, other values replace). */
function _uiOverride(target, src) {
    for (var key in src) {
        if (!Object.prototype.hasOwnProperty.call(src, key)) continue;
        var sv = src[key], tv = target[key];
        if (typeof tv == "object" && tv !== null && typeof sv == "object" && sv !== null && !Array.isArray(sv) && !Array.isArray(tv)) {
            _uiOverride(tv, sv);
        } else {
            target[key] = _uiClone(sv);
        }
    }
    return target;
}

var _uiSkins = Object.create(null);

/**
 * Named UI skins: register(name, skin), resolve with a `base` chain
 * (string or array; `post_base` applied last) and apply(content, name) which
 * remaps descriptor bitmaps via skin.textures { oldName: newName }.
 */
UiCore.skins = {
    register: function (name, skin) {
        if (!name || !skin) return null;
        _uiSkins[name] = skin;
        return skin;
    },
    has: function (name) {
        return !!_uiSkins[name];
    },
    names: function (version) {
        var result = [];
        for (var name in _uiSkins) {
            var skin = _uiSkins[name];
            if (!skin || skin.can_show === false) continue;
            var ver = skin.version;
            if (ver && version != null) {
                if (ver.min != null && version < ver.min) continue;
                if (ver.max != null && version > ver.max) continue;
            }
            result.push(name);
        }
        return result;
    },
    resolve: function (name, seen) {
        var skin = _uiSkins[name];
        if (!skin) return null;
        seen = seen || [];
        if (seen.indexOf(name) != -1) return _uiClone(skin);
        seen.push(name);
        var result = {};
        var bases = skin.base;
        if (bases) {
            if (!Array.isArray(bases)) bases = [bases];
            for (var i = 0; i < bases.length; i++) {
                var parent = UiCore.skins.resolve(bases[i], seen);
                if (parent) _uiOverride(result, parent);
            }
        }
        if (skin.post_base) _uiOverride(result, skin.post_base);
        _uiOverride(result, skin);
        return result;
    },
    unregister: function (name) {
        if (_uiSkins[name]) return delete _uiSkins[name];
        return false;
    },
    apply: function (content, name) {
        var skin = UiCore.skins.resolve(name);
        if (!skin || !skin.textures || !content) return 0;
        var count = 0;
        function remapName(bitmapName) {
            if (bitmapName == null) return null;
            if (skin.textures[bitmapName] !== undefined) return skin.textures[bitmapName];
            var bestKey = null;
            for (var key in skin.textures) {
                if (!Object.prototype.hasOwnProperty.call(skin.textures, key)) continue;
                if (key.length === 0 || bitmapName.indexOf(key) !== 0) continue;
                if (bestKey === null || key.length > bestKey.length) bestKey = key;
            }
            if (bestKey === null) return null;
            return skin.textures[bestKey] + bitmapName.substring(bestKey.length);
        }
        function remap(obj) {
            if (!obj) return;
            var bitmap = remapName(obj.bitmap);
            if (bitmap !== null) {
                if (obj.__uiSkinOrig === undefined) obj.__uiSkinOrig = { bitmap: obj.bitmap, bitmap2: obj.bitmap2 };
                obj.bitmap = bitmap;
                count++;
            }
            var bitmap2 = remapName(obj.bitmap2);
            if (bitmap2 !== null) {
                if (obj.__uiSkinOrig === undefined) obj.__uiSkinOrig = { bitmap: obj.bitmap, bitmap2: obj.bitmap2 };
                obj.bitmap2 = bitmap2;
                count++;
            }
        }
        for (var e in content.elements) remap(content.elements[e]);
        for (var d in content.drawing) remap(content.drawing[d]);
        return count;
    },
    /** Restore the bitmaps saved by apply(); returns the restored count. */
    unapply: function (content) {
        if (!content) return 0;
        var count = 0;
        function restore(obj) {
            if (!obj || !obj.__uiSkinOrig) return;
            obj.bitmap = obj.__uiSkinOrig.bitmap;
            obj.bitmap2 = obj.__uiSkinOrig.bitmap2;
            delete obj.__uiSkinOrig;
            count++;
        }
        for (var e in content.elements) restore(content.elements[e]);
        for (var d in content.drawing) restore(content.drawing[d]);
        return count;
    }
};

/* ------------------------------------------------------------ textures ---- */

/** Decode a Base64 image string into an Android bitmap (null on failure). */
UiCore.stringToBitmap = function (encodedString) {
    if (!encodedString || typeof android == "undefined" || !android.util || !android.graphics) return null;
    try {
        var bytes = android.util.Base64.decode(String(encodedString), 0);
        return android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
    } catch (e) {
        return null;
    }
};

/**
 * Decode a Base64 image string and register it in the engine TextureSource
 * under `name` (for descriptor `bitmap:` fields). Returns the bitmap or null.
 */
UiCore.registerTexture = function (name, encodedString) {
    if (!name || typeof WRAP_JAVA == "undefined") return null;
    var source;
    try {
        source = WRAP_JAVA("com.zhekasmirnov.innercore.api.mod.ui.TextureSource").instance;
    } catch (e) {
        return null;
    }
    if (!source) return null;
    var bitmap = UiCore.stringToBitmap(encodedString);
    if (!bitmap) return null;
    try {
        source.put(String(name), bitmap);
    } catch (e) {
        return null;
    }
    return bitmap;
};

var _UI_BUILTIN_TEX = {
    "UIC_slider4": "iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAIAAACQKrqGAAAAK0lEQVR4AWM0NzdnIAKEhIQwApUCKYKKS0pKRpUO1xDo7u4Gxi/BNABUAAB9YiiJGt2rPAAAAABJRU5ErkJggg==",
    "UIC_options_button": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAEz0lEQVR42gHEBDv7AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAArKysAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADV1dUBAAAAKysrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1dXVAQAAACsrKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAANXV1QEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADQ3jYVKn+fzgAAAABJRU5ErkJggg==",
    "UIC_option_selected": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAI5JREFUOE+tkgEKhSAQBTu9h/NS+/Nh4uqo8NeBQZxqC+wxs6tijIgxIsaIFC3nXBa61vvhuttUxWGooHvcplMshorVC6fQKYYHxe7rMXZO7IYVMQ42UkploXuaGAcbNwZOnIZirAo6lN1QjK9icQBiNXQKr+JwmoKGuk31+GtUP1x3mxtijIgxIsb/tecHeebbV18CgD4AAAAASUVORK5CYII=",
    "UIC_pattern_button_craft_pressed": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABoElEQVR4AZVSy0rDQBRNJtM0v9Cf8fEbbl25cFVEKq1VCopL124Ei1RQtKgIlTz60C+oYNM2TUED9QdM6iTxhBmmLlzoXQx3Zu553DujFgoF5T+hAlC/CiSEEOWLZTuNyDORtDvOyfFaBji9CLo9mxBVlmgaieNkPo8pJfLcdd32w55QsB2bsUTXNZSqqlIpLgFcPXIMg4Yh48jJxLPuKgJgWiaoUBRFLJ+ntdIqB2CFCLiSJPW8sX2/mwEazcC0HNwhcAEP+9sryKGAlQfEh0OvdVPKAOfXANhggoEoin9aQjWagU+wjEZj87YsLGECgkpRcFfdWsa2VDN508B8huxj9vYLANVwxS1VDm20BCS6StN0OvUXgG6vLeuklEzQDFz1+y+9Vk1YenruQB0T5NyyFAlvHXS+P1koyB5kAxwDV9wkvM1m74/NnUzh7DLodB1wICCNhL9D+cDCFsoA4+0Gg1dhaaPYcN0RTvE8jDFd15HHMearggJ5FIZ5w8AvEJbWN+u+7+OC5nKU0nkUZQ+bplgxfyT8E6BAAJD9Pb4BxQIC0FzQanUAAAAASUVORK5CYII=",
    "UIC_pattern_button_craft_off": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABQ0lEQVR4AZWSS46CQBCGh5d38BJsPAAEr2IMN2Rl4oYYYcUVBAzDI2FljKLO5xRpeshkkmHRqe6q7/+rujGWy+XHfz4DIAxDHXk8Hmwty9IPiQ+HQ5ZlI8BmlmZrGAbrYrG4XC6o1HXddd0EcKRU1+s1pbvdTqkIAPMGttvt8XhEbxgGYQTY7/cAtm1fr9f7/d40Tdu2kwOAaZq32w1Gd0Cbc7IA5/P5DWw2mzRNlTuBDrxeL6pZP7+/yUFmQJ6053lgMoNyqKoKZALEAeD5fAZBIIBoE+NwOp36vh+BJElQkk6E1NcoirjcHw7MgDYTi7ZeHccxV8RJWZa/t+T7vgJkDBpzHCfPc0zeLck70CV15Fj1W+KEfngiqsdrXa1WRVFQxxh8pJXDLBhbcl2XiByPysckXBRb3ksPMBn/pZnM39svnenuwXc9NX8AAAAASUVORK5CYII=",
    "UIC_pattern_button_craft_default": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAABX0lEQVR4AZWRS5KCMBRFG1BZg/ti5B74uA9UdBmsAgUKcBEMsCxxpFNQoI/1Umh19aA7g1Tycs99N4k2n8+//jM0gO12+4l0XcfWMIzPIus0TcMwfAGr1SrPc03TRoWu633fP59PsLF+Op2yLFMdkiRBwTFShu/7wMvlcjqdtm1LT4qXywWZAg6HA6VhGHBFJCE9z8MeF4rYAZDqBex2O1DJAwO52WzYAkgRbDKZnM/nKIrekdCZpkkAFhJJALypMADiOFYAvcSMGT/pYNs2OrYwTdPc7/dfABSkEsBxHNJjQR7m6/X6BngvbIIgGPt8LsiGUVmWx+NRRSqKgtLj8RDvH2q2tK3r+t1hvAPYer0eAdd15Q5ku91u+/3+1QFXiYRO7iD/wKX5BC5AWoCqqlSkxWLBt6OWg9lsxprfxZskrHkiXhxYRbIsixfgADMGXwGJlFkaMnPKUIBs/jh/AwabA9B4vE1uAAAAAElFTkSuQmCC",
    "UIC_native_button_lite_pressed": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAASklEQVR4AWP8//8/A7mAEaiZpYSRVO0OujJ74h9DNQM5JOn/YsZ0QvPhqGaiA200wEZTGMHEQqVE4rJQFmgSQdvQFEDzM5oo8VwAvRGC2fPYqfsAAAAASUVORK5CYII=",
    "UIC_native_button_lite_off": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAM0lEQVQ4T2OgFESSDtav3YDQ3E0iuH///qhmUsCoZhLBqGYSAUIzMGcDOaQCqGYyAQMDAHZQHd+mv+WtAAAAAElFTkSuQmCC",
    "UIC_native_button_lite": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAADNJREFUOE9joBT8Jx2Ym5sjNB8jEWhra49qJgWMaiYRjGomESA0A3M2kEMqgGomEzAwAAA8zcanIcM2LgAAAABJRU5ErkJggg==",
    "UIC_craft_arrow": "iVBORw0KGgoAAAANSUhEUgAAABYAAAAPCAYAAADgbT9oAAAFQklEQVR42gE3Bcj6Af///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjIyM/3R0dAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMjIz/AAAAAHR0dAEAAAAAAAAAAAAAAAAAAAAAAAAAAAH///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyMjP8AAAAAAAAAAHR0dAEAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjIyM/wAAAAAAAAAAAAAAAHR0dAEAAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMjIz/AAAAAAAAAAAAAAAAAAAAAHR0dAEAAAAAAAAAAAH///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyMjP8AAAAAAAAAAAAAAAAAAAAAAAAAAHR0dAEAAAAAAYuLi/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHR0dAEBi4uL/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGLi4v/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB0dHQBAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjIyM/wAAAAAAAAAAAAAAAAAAAAAAAAAAdHR0AQAAAAAB////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMjIz/AAAAAAAAAAAAAAAAAAAAAHR0dAEAAAAAAAAAAAH///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyMjP8AAAAAAAAAAAAAAAB0dHQBAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAjIyM/wAAAAAAAAAAdHR0AQAAAAAAAAAAAAAAAAAAAAAB////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACMjIz/AAAAAHR0dAEAAAAAAAAAAAAAAAAAAAAAAAAAAAH///8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyMjP90dHQBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0LxehsBnDbwAAAAASUVORK5CYII=",
    "UIC_tab_up_close_button": "iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAAABGdBTUEAALGPC/xhBQAAAAd0SU1FB+IDDgsyEiK71xIAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAE5JREFUSEvtzTEOABAQRNE9l0TjLir3r5fFitIkq5tJvoTCk2sa2ZgdM589hm7/eRC7aKstPIe+IimXCRF5iggUESgiUESgiEARgVqIaAftJFqItGuxsAAAAABJRU5ErkJggg==",
    "UIC_slider3": "iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAACpSkzOAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAbElEQVRIS+2NMQrAMAwD86s80o92q+JCh1sMVYYQwS1nLI3MXAJKBygdoHSA0gFKByjFnDO7RMT9yn0oxfvYoYJ9KMUZEhXsQynOkKhgH0pxhkQF+1CK/YY+j91gH0oHKB2gdPCEDn+z21COC410nbOxOAc1AAAAAElFTkSuQmCC",
    "UIC_slider2": "iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAACpSkzOAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAh0lEQVRIS+2WwQ3AIAzEshWTMBV7sVbbIyBB4BFEkKqWk/wpYH9L1a4NdLt2DF7W8/Jn+8UYm1j+zMOhFd77BBpNaHR5hXeFnHPThBAahzqEhzNIxwmpkY4TUiMdJ6RGOn4aKg9nVztUIQu+FSqROoR1h5bAz5X0Z0TDS6vAC3kaQiW2gWdEN2V2CXspnWJvAAAAAElFTkSuQmCC",
    "UIC_slider_button_on": "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAPCAIAAABfg7keAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAALElEQVQoU2P4Twh0d3eDFB3DC0JDQ6GKgMqxAhRFeMCoSQNhElA5kMIHQkMBQo5vZrEgWYgAAAAASUVORK5CYII=",
    "UIC_slider_button_off": "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAPCAIAAABfg7keAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAS0lEQVQoU4XLwQ3AMAxC0S7JVB66SWgkhITou9iHz/P+mZkT7VMAuNH+IosKRZwFFhWKOAssKhRxFlhUKOIssKhQxFlgUXGi7zTAAtr6GFRKkflvAAAAAElFTkSuQmCC",
    "UIC_slider": "iVBORw0KGgoAAAANSUhEUgAAABoAAAAaCAYAAACpSkzOAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAh0lEQVRIS+2WwQ3AIAzEshWTMBV7sVbbIyBB4BFEkKqWk/wpYH9L1a4NdLt2DF7W8/Jn+8UYm1j+zMOhFd77BBpNaHR5hXeFnHPThBAahzqEhzNIxwmpkY4TUiMdJ6RGOn4aKg9nVztUIQu+FSqROoR1h5bAz5X0Z0TDS6vAC3kaQiW2gWdEN2V2CXspnWJvAAAAAElFTkSuQmCC",
    "UIC_search_bar": "iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAIGNIUk0AAHolAACAgwAA+f8AAIDoAABSCAABFVgAADqXAAAXb9daH5AAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAphJREFUWEftklFuFDEQRHOybFC+EBdggUVCIaeDBaRFWo7H21SpNRrN2O52PlNqlard6/hl7Ls35fXh8f3h/kApTDr1cHjA393ffCTHdgNJh8fb7DZ4CZPeGHXdQNKn0+fjlyP1fHr6eDqqLWeK8PzV7WDG+SMGklj9/u2JUph0BY6JxZEsN5Ckf5RSmPTGqOsGkughXYGXvTHquoEkPiarVPZBbObClnADSfSQbuIXXIFjYnEkyw0k6V6pvStPeWPUdQNJ9JCuwMveGHXdQJLulco+iM1c2BJuIIke0k38gitwTCyOZLmBJN0rtXflKW+Mum4giR7SFXjZs99pmQ0kMWCVyj6IzVzYEm4giR7SQJ50BY6JxZEsN5Cke6X2rjzljVHXDSTRQ7oCL3v2Oy2zgSQGrFLZB7GZC1vCDSTRQxrIk67AMbE4kuUGknSv1N6Vp7wx6rqBJHpIV+Blz36nZTaQxIBVKvsgNnNhS7iBJHpIA3nSFTgmFkey3ECS7pXau/KUN0ZdN5BED+kKvOzZ77TMBpIYsEplH8RmLmwJN5BED2kgT7oCx8TiSJYbSNK9UntXnvLGqOsGkughXYGXPfudltlAEgNWqeyD2MyFLeEGkughDeRJV+CYWBzJcgNJWlr9ouwKr4Cl50btvcSUN0ZdN5BED+kKvOzZ77TMBpIYsEpl3+lmLmwJN5BED2kgT7oCx8TiSJYbSNK9UntXnvLGqOsGkughXYGXPfudltlAEgNWqeyD2MyFLeEGkughDeRJV+CYWBzJcgNJWlr9ouwKr4Cl50btvcSUN0ZdN5BED+kKvOyNUdcNJP27XM+/zxThx+XmM/nW/jlf/15/Xn4N5vgjBpI0i1q2hVzYEm6gNw3r7u4/zXlVAuOQAOEAAAAASUVORK5CYII=",
    "UIC_empty_button_pressed": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAACxJREFUOE9jsCAXdHd3gzQDKTLA////RzWTAkY1kwhGNZMIBlYzhCIH/P8PAMVJmf4EqoFxAAAAAElFTkSuQmCC",
    "UIC_empty_button": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAIAAAAC64paAAAEz0lEQVR42gHEBDv7Af///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyMjAH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQH///+MjIwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACtra0B////jIyMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAra2tAf///4yMjAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK2trQGLi4utra0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAe6IAusTg+3gAAAABJRU5ErkJggg==",
    "UIC_close_button_icon": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAGX0lEQVR42gFUBqv5Af///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAA7Ozv/AAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAADFxcUBAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAAAAAAAAxcXFAQAAAAAAAAAAAAAAADs7O/8AAAAAAAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAADs7O/8AAAAAAAAAAMXFxQEAAAAAOzs7/wAAAAAAAAAAxcXFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAAAAAAAAAAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAAAAAAAAAAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAAAAAAAAAAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAAAAAAAAAAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAADs7O/8AAAAAAAAAAMXFxQEAAAAAOzs7/wAAAAAAAAAAxcXFAQAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAAAAAAAAxcXFAQAAAAAAAAAAAAAAADs7O/8AAAAAAAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAAAAAAAAAAA7Ozv/AAAAAAAAAADFxcUBAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAA7Ozv/AAAAAMXFxQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOzs7/wAAAADFxcUBAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAqkaL2ZwjB5QAAAAASUVORK5CYII=",
    "UIC_arrow_up": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAKCAYAAACJxx+AAAAAPklEQVR4AdWNwQ0AIAjEvLVgfubCQFIlbiAfwrXhlJmLcfc+IkJkQgACkFp44ZRkZrcDMvapqIxPvK/sC2ED2DFAnR3wdqEAAAAASUVORK5CYII=",
    "UIC_arrow_down": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAKCAYAAACJxx+AAAAAQUlEQVR4AdWQ0Q0AMAQFay3mN5eG5JBuUD94nsSRiDiEmVXj7oImXxhUdTA4feWiAG/pVSZuY74mftGGXMHEMLUL5j9AnRs0vWkAAAAASUVORK5CYII=",
    "UIC_arrow": "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAsCAYAAABygggEAAAAyElEQVR4Ae2XQQrEIBAE1z/7C/2zeyoP2TQ6iSILncuA0empxg4ktdY+kafWensg55wifZKFR3bZahzy5cIJVR0n5Uxfd5ywwnHCCVUdJ+VMX3ecsMJxwglVHSflTF93nLDif+JUSrn9F4JkV03HhPlpU7d1NTF3oX9AjglDtmsASNHpxCwcE149wJWU/j/EvFhFHhZ+O4ASpK8kZsNT8tfC0QFGgvQbErNxlny58GiAWUH6TBNzQJFvF74OEBXkfJiYg5A/Ff4CS5Mq/qPAdgcAAAAASUVORK5CYII=",
    "UIC_redstone_gui_2": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAdklEQVR4AaXBsQkCQRRF0TtPmGAxEWExF8XEwEIsYLve3ArsYILhfzt4Bv+clplUiCJRJIqEsUm5SYkh/tgzcYTxeD85XVccYZxvK4djxxGGJHrvOMJYloWIwBHGGIM5J44w9s+X1hqOMF73CxGB0zKTClEkin6RPRv6tRgHwQAAAABJRU5ErkJggg==",
    "UIC_redstone_gui_1": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAi0lEQVR4AaXBsW0CURRE0TsTbLAVEBCb0HIPLoBSkKgDkZk+qITQkitwBxus3lDBf8k/R0mYYSaZSaZRUkoKDTNQUvwLvkNJYcB0Tg+4hI6SMFJSnsA5EQOm8XP95vZ5pGMatlmWhY5prOtKVdExjW3b2Pedjmm8/v6RRMc0vj4OVBUdJWGGmWQmvQGaIiraZXtUcAAAAABJRU5ErkJggg==",
    "UIC_redstone_gui_0": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAwklEQVR4AaXBMUoDYRSF0e+9GVTEaVzFbCCWNhYiuKC7hLshQeztbFyLmirMM8UEhpD8RnJOVBXnSM7UsyCpOIHtYNYzk1Rs2Q7+IKlsB1vJgu2QVMxW41ircSwakj22Q1Ix+9lsaEkOsB2SargduLi6pCU5wnbc3T8QXdCSNHx+vPP49ExL0tB1HW+vL0gqjkgapmmiqrAdkooDkoav7zU7tkNSsSdpGG6uWbIdkoqFqCp2JBUnsB3MehZsB/+UnOkXhkNJD30S7XkAAAAASUVORK5CYII=",
    "UIC_native_button_pressed": "iVBORw0KGgoAAAANSUhEUgAAAG8AAABvCAIAAABtpwk3AAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAABNUlEQVR4Xu3QwQnCUAAFwYBtiG1YgCXZkFXZzveQjwpCiGSP89jjO80yrBvNcjTLfTRP90V/dXuc16YgzSPRLNul+T5pu+vzsjYFaR6JZhnNMpplNMtoltEso1lGs4xmGc0ymmU0y2iW0SyjWUazjGYZzTKaZTTLaJbRLKNZRrOMZhnNMpplNMtoltEso1lGs4xmGc0ymmU0y2iW0SyjWUazjGYZzTKaZTTLaJbRLKNZRrOMZhnNMpplNMtoltEso1lGs4xmGc0ymmU0y2iW0SyjWUazjGYZzTKaZTTLaJbRLKNZRrOMZhnNMpplNMtoltEso1lGs4xmGc0ymmU0y2iW0SyjWUazjGYZzTKaZTTLaJbRLKNZRrOMZtmW5u9JO5uCNJOmIM2kKfitacdHsxzNbmO8AD7gLwhATJIjAAAAAElFTkSuQmCC",
    "UIC_native_button": "iVBORw0KGgoAAAANSUhEUgAAAG8AAABvCAIAAABtpwk3AAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAABrklEQVR4Xu3QoQ3EMADAwOzyQ3R/8mv1iSMFvKpEMquNjW5U1au667BrhuAaS22HZZpKWD5rfmuvzwzBNSzT3A7LNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWwTFMJyzSVsExTCcs0lbBMUwnLNJWw/Kt5zVhqOwTXsEzzPATXsEzzPASr6g2N8QOmruffMG5YOQAAAABJRU5ErkJggg==",
    "UIC_item_info_frame": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4ggJDBQVkEneuAAAAJVJREFUOMutkzsOwkAMRJ8/EQgqInGIcIkci46CjmNwKbgKRRRTLCibjjhMY7mY0ZtdWSKCVvdBQu5bkYPs4hSXjJ+HXPHv8tTbInM3ngFQACtjkfTjUQCZQH6WYHWArQuwBIHNCTzxBl4TNAmCZgrQRIDUBH+o4OsqZAiYf6MlKhSPFwKlH++pg5Jj0zIMr9Q5b+jkDWKHEhFfK81NAAAAAElFTkSuQmCC",
    "UIC_gray_frame": "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAABQUlEQVR42gE2Acn+ARMTEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAETExMjIyMAAAAAAAAAAAAAAAAAAAAAAAAAAADd3d0BExMTIyMj+/r7AAAAAAAAAAAAAAAAAAAABQYF3d3dARMTEyMjI/v6+wAAAAAAAAAAAAAAAAAAAAUGBd3d3QETExMjIyP7+vsAAAAAAAAAAAAAAAAAAAAFBgXd3d0BExMTIyMj+/r7AAAAAAAAAAAAAAAAAAAABQYF3d3dARMTEyMjI/v6+wAAAAAAAAAAAAAAAAAAAAUGBd3d3QETExMjIyP7+vsAAAAAAAAAAAAAAAAAAAAFBgXd3d0BExMTIyMjAAAAAAAAAAAAAAAAAAAAAAAAAAAA3d3dARMTEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHmSLEWfQHAyAAAAAElFTkSuQmCC",
    "UIC_empty": "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAPElEQVQ4T63IMQEAIAAEIfuXfgsweQ4snG1fMQtmwSyYBbNgFsyCWTALZsEsmAWzYBbMglkwC2bBfLdzAUTjq40wL6bZAAAAAElFTkSuQmCC",
    "UIC_crafts_slider_on": "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAIAAABSnclZAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAADBJREFUKFNj+I8XgKSzitdhonkr3yGkgRw0dOAkkm40OSAalSYgDeFgIqg0TvD/PwAyZWjwqCq+ZQAAAABJRU5ErkJggg==",
    "UIC_crafts_slider": "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAPCAIAAABSnclZAAAAO0lEQVR4AWNkwAsYgbL////HVHPs2DFra2uoNJCDpmLChAmrV68elSY3WI4ePQoMQjTdQC40UDEl4CIAGWBvEL2XCkUAAAAASUVORK5CYII=",
    "UIC_classic_tab_up_light_left": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAd0SU1FB+IDDgsyEiK71xIAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAEVJREFUOE9jQAL/ScAY4D8pAKQeog0CoMLEg6NHj6IYAhWGAJAkIRwaGgrGIL0oBmBTjA2PGjBqAAgPHgNAgGwDIOD/fwDGEdmODd3H8wAAAABJRU5ErkJggg==",
    "UIC_classic_tab_up_light": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAd0SU1FB+IDDgsyEiK71xIAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAEtJREFUOE/tjEEKACAIBPukT/ZdxqZBklBGRwf2orvTFiSRDcmAvs4UO9/DzE5iZwXPU4hoBFsniMpRSlAC5K/AtoOoHGUKwLNAEekBAd+IYwxJ1AAAAABJRU5ErkJggg==",
    "UIC_classic_tab_up_dark_left": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAd0SU1FB+IDDgsyC0bQf9IAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAE1JREFUOE9jEODhYODgYACB/yRgBOCA6P5PCgCpB2mCAagw8aC7uxvFEKgwBIAkCeHQ0FAwBulFMQCbYmx41IBRA0CYdgaQAyg04P9/AAyBoqj5f5UHAAAAAElFTkSuQmCC",
    "UIC_classic_tab_up_dark": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAd0SU1FB+IDDgsyC0bQf9IAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAElJREFUOE9jEODhYODgYACB/yRgBOCA6P5PCgCpB2mCAagw8aC7uxvFEKgwBIAkCeHQ0FAwBulFMQCbYmx41IBRA0B4WBnA8B8A+ER5hh6C9p4AAAAASUVORK5CYII=",
    "UIC_classic_darken_slot": "iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAIAAADZrBkAAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAHdElNRQfiAw0RFgAj7s60AAAAGnRFWHRTb2Z0d2FyZQBQaXhCdWlsZGVyIFN0dWRpb8VZdjsAAAAsSURBVDhPY7AgHXR3d4O0uZII/v//P6oNFYxqwwCj2jAASBswzwEp0sD//wDnFEqXs5vAdwAAAABJRU5ErkJggg==",
    "UIC_changelog_frame": "iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAgklEQVRIS+2OYQ6AIAhGvVYew60rey0SMpRG04wf/YDtOR3wPQMAMKXw+IzI5MvZMKleYh6OlXNmiQjHhgVpTwRmu0BlWhC3OASD7nuvBHXoEW3PBQJtzwUCbe8/AhyaKW1vSrCKC4YIQcklSd+woH6cTpZogytc4UJAj/K0oGVCOAB3b9uixl4sXgAAAABJRU5ErkJggg==",
    "UIC_but_up_pressed": "iVBORw0KGgoAAAANSUhEUgAAABkAAAAPCAIAAACeBPOyAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAbklEQVQ4T+2TsQ3AIAwEM1z2SsssWdIxcEQCbKxIlLkGP/BXIHGcm0gpZde9AxGJXVeD7BC70DTYtQhcCHo4m1i5qFpwo8d1USo1pmkesF1cbwWCE19WLoJVHmIlePtKbSpkh9/1jezS/63LBkQebPbESdI4zpoAAAAASUVORK5CYII=",
    "UIC_but_up": "iVBORw0KGgoAAAANSUhEUgAAABkAAAAPCAIAAACeBPOyAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAbklEQVQ4T+2TsQ3AIAwEM5z3SsssWTIxcEQCbKxIlLkGP/BXIHHcm0gpZde1AxGJXWeD7BC70DTYtQhcCHo4m1i5qFpwo8d1USo1pmkesF1cbwWCE19WLoJVHmIlePtKbSpkh9/1jezS/63LBkQesvPESegmDVgAAAAASUVORK5CYII=",
    "UIC_but_down_pressed": "iVBORw0KGgoAAAANSUhEUgAAABkAAAAPCAIAAACeBPOyAAAABGdBTUEAALGPC/xhBQAAABp0RVh0U29mdHdhcmUAUGl4QnVpbGRlciBTdHVkaW/FWXY7AAAAcUlEQVQ4T+XTQQ6AIAwEQB/nv7z2LX6yLrKYQIH20JtzgWK7CSQeZxIRKVl3BlX1s66G9cJ/s4bJWgJr01DtsiBSfpZ3ZPs7wJ3ZD3bvxaEZdvSct+doj98MJwsY0PB0xs8CxmyDIJQVVLLwf2NJoPoAmbzESVeGIH4AAAAASUVORK5CYII=",
    "UIC_but_down": "iVBORw0KGgoAAAANSUhEUgAAABkAAAAPCAIAAACeBPOyAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAAHFJREFUOE/l00EOgCAMBEAf13957Vv8pC6ymECh5dCbc4FiuwkkHncSVS1ZVwYRibPOhvXCf7OGyVoCa9NQeVmwU36Wd2T7O8Cd2Q+89+LQDDt6wdtztMdvRpAFDGh4OhNnAWPcINjK2lSy8H9jSSDyAN+5xEnXFWbxAAAAAElFTkSuQmCC",
    "UIC_damage_on": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAS0lEQVR4AaXBMQ2AQAAEwf3LO8IZDjGAAHTQHwmhoKEgOzPaYgQpSEEKUpCCNHlZ9lE+HCu3c4O2g8fkZV/4bbTFCFKQghSkIAXpArDiDx6Qeb+TAAAAAElFTkSuQmCC",
    "UIC_damage_off": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAsklEQVR4AaXBsU0EMRRF0fst97E9UIQTGnolvA4I6MRFTEIFRBvRAMlnQV7JrAbh0ZwTmckZhZMqE0nJAtvBUBkkJTe2g39IStvBTWFiOyQlBxQe2A5JyaLCDtshKVlQmTy/PCV3F5DIt0vn20fnx+c7tNa4q0yur/xypdNao/fOXyqTbduCfWk7GCQlQ2GB7ZCU7Cgssh2SkgeFA2yHpGRSGWyHpGSB7WCoTGwHBxVO+gJXBEYLZhzTxQAAAABJRU5ErkJggg==",
    "UIC_dd_access_0": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAd0lEQVR4AaXBAQrDMBADwb3Dv9L79S61hYa4JtAEz1QSdjSbmk2DhSS+ApRtJMV2caFZ2OYt3NQsJIUHmomkMLHNP4NfxSlMJIVT2eajea6YDCa2OUjiQrEY3GS7uFBJmEkKULZZSQpQtjkMrkUSd1QSdjSbmk0vU+guHsE1uG0AAAAASUVORK5CYII=",
    "UIC_dd_access_1": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVR4AaXBgQnCQBBE0b9Lulqury3hGpu6RgWFGJIo3HthmxXJomRRcqOqXFXmRrIoWZQsCtvsVZW5ISnYSQ4kBRckBQfJCUnBwRiD7nZ3s5dckBS8jTF4CiAAs7NxUFUGQhKSgqfuNmBObJxzVfExxuBK2OaX7jbfYs7Jy8Yf5pzBhWTRA38SMa/aEZcwAAAAAElFTkSuQmCC",
    "UIC_dd_access_2": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAh0lEQVR4AaXBgQnDMAxE0S+RrY7spRG8mOa6FtpCMHEJ+L2wzY5kU7Ip+UOSJZk/kgVJ5kuSWUhuSDITSeZGMpFkFiSZSdhmRZJ56+5gIdl08FBVmY8YY/CTPFBVBgIIwFwkE0nmq7uju4MPA2ZycEOSuTjPk5WDSXcHk6oyCwcPjDGChWTTC8muMA60P/oZAAAAAElFTkSuQmCC",
    "UIC_filter1": "iVBORw0KGgoAAAANSUhEUgAAAAYAAAAGCAYAAADgzO9IAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAACNJREFUGFdj+P//P4OVlRWQ+o/CBjOwYdw6kDnIbFKN+s8AANZdUVUCZkFaAAAAAElFTkSuQmCC",
    "UIC_filter2": "iVBORw0KGgoAAAANSUhEUgAAAAkAAAAGCAYAAAARx7TFAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAADZJREFUGFdj+P//P4OVldV/EAaxkfkwDBZAloSxkcXwKoLxwQxkjK4AhLGahCwGwjgVIbDVfwBSHH8/zjhwxAAAAABJRU5ErkJggg==",
    "UIC_filter3": "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAYAAAD+Bd/7AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAadEVYdFNvZnR3YXJlAFBpeEJ1aWxkZXIgU3R1ZGlvxVl2OwAAACNJREFUGFdjsLKy+g/DDECAzgcDZA5WNo0VgAgYhgki+AwMAHObKDmca+APAAAAAElFTkSuQmCC",
    "UIC_nbt_on": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAbUlEQVR4AaXBwQ3EMAwDQUpIV1s/6+L54YcRBAkOmqkkmmgNtYZaQ62h1gZEGxAtQIBoAwIEiLbWB9sFRIvt0mK7tLUOQHQDRC9aB9sFRAfbZbuA6EHrxnbpD5c+ANFiu/SgkmiiNdQaag21hn6A5i6L8STY7gAAAABJRU5ErkJggg==",
    "UIC_nbt_off": "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAvUlEQVR4AaXBwY2EMBAEwB6LFMiBHFrOq0PovNDENeeHHxZibxdRFVWFNxpe2rCQVPiB7cC0YZJUGGwHvpBUtgNDw8J2SCo80HBhOyQVBpJFsjCRLJKFRcON8zwhqTBkZpAsDJkZuGhYkCxMtqP3DpKFfzQsMjNIFqbzPNF7R2YGycKNhovMDCxsh6TCBxu+IFkYeu+4s+FGZgaGzAwsJNVxHFg1PGA79n3HasNkOyQVfmA7MG1Y2A481PDSH2tMUtkhmv7pAAAAAElFTkSuQmCC",
};
for (var _uiTexName in _UI_BUILTIN_TEX) {
    UiCore.registerTexture(_uiTexName, _UI_BUILTIN_TEX[_uiTexName]);
}
UiCore.embedded = _UI_BUILTIN_TEX;

/* --------------------------------------------------------------- ui thread -- */

/**
 * Run `fn` on the UI thread (main). Uses UI.getContext().runOnUiThread when
 * available; otherwise falls back to a direct call. Exceptions are isolated
 * and logged. Returns true when the callback was posted to the UI thread,
 * false when it ran directly (no UI context / invalid input).
 */
UiCore.safeRun = function (fn, logTag) {
    if (typeof fn != "function") return false;
    var run = function () {
        try { fn(); }
        catch (e) {
            if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log("safeRun failed: " + e, logTag || "UiCore");
        }
    };
    try {
        var ctx = UI.getContext();
        if (ctx && typeof ctx.runOnUiThread == "function") {
            ctx.runOnUiThread(new java.lang.Runnable({ run: run }));
            return true;
        }
    } catch (e) {}
    run();
    return false;
};

EXPORT("UiCore", UiCore);
