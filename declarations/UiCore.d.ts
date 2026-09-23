/// <reference path="core-engine.d.ts" />

/**
 * UiCore — pagination, swipe, search, slot pools, darken, delta-dirty sync.
 * Load with: IMPORT("UiCore") → global `UiCore`.
 * Everything generates DESCRIPTORS or runs pure logic — no window magic.
 * UI rules: IsDynamic (capital I), forceRefresh after open, bindings on real
 * widgets only.
 */
declare namespace UiCore {
    interface PaginationConfig { countX: string; countY: string; maxY: string; slider: string; }
    interface PaginationHelpers {
        /** Page count for an item count (ceil(length / countX)). */
        getPages(length: number): number;
        /**
         * Nearest-page scan from slider coords. CONTRACT: coords must be inside
         * the slider range [start_y, maxY] (event coords from the slider frame).
         * Effective pages = pages - countY + 1.
         */
        getPageFromCoords(coords: { y: number }, pages: number): number;
        /** Y position of a page, clamped to [1, pages]. */
        getCoordsFromPage(page: number, pages: number): number;
    }
    interface SwipeOpts {
        bounds: { xStart: number; xEnd: number; yStart: number; yEnd: number };
        itemCount(): number;
        pagination: PaginationHelpers;
        getLastPage(): number;
        /** May return truthy = "switched" (snapAfterSwipe is gated on it). */
        switchPage(page: number, fromSwipe: boolean, dontMoveSlider: boolean): any;
        /** Host-owned state bag. */
        state: { swipeY: number | false; swipeSum: number; moving: boolean; swipeDir?: number };
        maxY: number;
        sliderStartY: number;
        sliderScale: number;
        sliderX: number;
        sliderElementName: string;
        getElement(name: string): { setPosition(x: number, y: number): void } | null;
        /**
         * On UP/CLICK the slider snaps to the released page's exact Y.
         * Default true.
         */
        snapSliderOnRelease?: boolean;
        /**
         * Touch discriminator. "layout" (default): DOWN starts the swipe only
         * inside `bounds`. "anchor": ANY DOWN in the frame starts it (no
         * bounds); signed per-MOVE delta |d| > 7 or same-direction accumulated
         * |d| > 15 flips; direction reversal resets the accumulator
         * (oscillation ±4px → 0 flips). Flip direction is the same in both
         * variants (DOWN → previous page).
         */
        variant?: "layout" | "anchor";
        /**
         * Slider-drag section of the handler. Default true; false = swipe-only
         * handler (anchor frames have no drag).
         */
        drag?: boolean;
        /**
         * After a MOVE-flip, snap the slider to the new page's exact Y — only
         * when switchPage returns truthy. Default false.
         */
        snapAfterSwipe?: boolean;
        /**
         * Swipe sensitivity, BOTH variants. `move` = per-event |delta| to flip
         * immediately; `accumulate` = same-direction sum to flip. Default
         * { move: 7, accumulate: 15 }. Some frames use
         * { move: 30, accumulate: 70 }.
         */
        thresholds?: { move: number; accumulate: number };
        /** Optional host hook: when it returns false the whole gesture is ignored. */
        isActive?(): boolean;
        /** Optional host hook: element liveness (stale refs after rebuild/close). */
        isAlive?(element: any): boolean;
    }
    interface SliderOpts {
        itemCount(): number;
        pagination: PaginationHelpers;
        switchPage(page: number, fromSwipe: boolean, dontMoveSlider: boolean): void;
        /** Host-owned state bag. */
        state: { moving: boolean };
        /** CLICK jumps to the clicked page (default true). */
        switchOnClick?: boolean;
        /**
         * CLICK snaps the slider to the clicked page's exact Y WITHOUT switching
         * (default false — CLICK does ONLY snap). Needs
         * sliderX/sliderElementName/getElement.
         */
        snapOnClick?: boolean;
        sliderX?: number;
        sliderElementName?: string;
        getElement?(name: string): { setPosition(x: number, y: number): void } | null;
        /** Optional host hook: when it returns false the whole gesture is ignored. */
        isActive?(): boolean;
        /** Optional host hook: element liveness (stale refs after rebuild/close). */
        isAlive?(element: any): boolean;
    }
    interface SearchOpts {
        /** keyword (string) or false (cleared). */
        onSearch(keyword: string | false, handler: any, container: any): void;
        title?: string;
        clearable?: boolean;
        textLabel?: string;
        bitmap?: string;
        fontColor?: number;
        /** Text font size (default 20; some frames use frame height − 8). */
        fontSize?: number;
        /** Frame height (default 30; a compact search frame uses 20). */
        height?: number;
        /** AlertDialog positive button label (localized; default "Search"). */
        positiveLabel?: string;
    }
    interface SlotPool {
        /** Lazy descriptor (parked off-screen); null for reserved names or when maxCount is reached. */
        get(name: string): any;
        has(name: string): boolean;
        count(): number;
        maxCount(): number;
        setPosition(name: string, x: number, y: number): any;
        park(name: string): void;
        parkAll(): void;
        pool: { [name: string]: any };
    }
    interface DeltaBinder {
        setScale(name: string, value: number): void;
        setText(name: string, value: string): void;
        setBinding(name: string, key: string, value: any): void;
        /** False for client containers (`isServer === false`); unknown containers return true. */
        canSend(): boolean;
        /** container.sendChanges() only when something changed. */
        flush(): boolean;
        /** GUI opened: forget caches so the next flush resends everything. */
        invalidate(): void;
    }

    /** Pure pagination math. */
    function pagination(elements: any, config: PaginationConfig): PaginationHelpers;
    /** Swipe page-flip touch handler (7px/15px thresholds; variant layout|anchor). */
    function attachSwipe(options: SwipeOpts): (element: any, event: any) => void;
    /** Slider-frame touch handler (DOWN → moving; CLICK → jump/snap). */
    function attachSlider(options: SliderOpts): (element: any, event: any) => void;
    /** Search box descriptors { frame, text, close() }, with an optional clear button. */
    function searchBox(x: number, y: number, width: number, options: SearchOpts): { frame: any; text: any; close(): void };
    /** Virtual slot pool, parked at (-1000,-1000); descriptors clone `base`; maxCount caps creation. */
    function createSlotPool(options: { base: any; maxCount?: number }): SlotPool;
    /** Descriptor darken per predicate; `options.window.forceRefresh()` runs when something changed. */
    function applyDarken(elements: any, names: string[], predicate: (name: string) => boolean, options?: { window?: { forceRefresh(): void } }): number;
    const DeltaBinder: {
        /** options.onError(error, id) is called for every failing container write (id = kind:name). */
        wrap(container: any, options?: { onError?(error: any, id: string): void }): DeltaBinder;
    };
    /** Strip §-codes + truncate. */
    function cutItemName(name: string | null, maxLen?: number): string;
    /** Text width for a font size (cached; engine Font; estimate fallback). */
    function textWidth(text: string, size?: number): number;
    /** Bounds of elements + drawing (cached by structural signature; each call returns a fresh copy): scrollX/scrollY/minX/minY/width/height. */
    function measureContent(content: any): { scrollX: number; scrollY: number; minX: number; minY: number; width: number; height: number };
    /** Scale descriptors in place (text font, frames, sizes, x/y). scale must be a finite number > 0. Returns content. */
    function scaleContent(content: any, scale: number): any;
    /** Offset descriptors in place. Returns content. */
    function offsetContent(content: any, x: number, y: number): any;
    /**
     * Fit into maxWidth/maxHeight (minus padding): measure, shrink by at most
     * maxScale (default 1), then center the bbox on options.center {x,y}.
     */
    function fitContent(content: any, options?: {
        maxScale?: number;
        minScale?: number;
        maxWidth?: number;
        maxHeight?: number;
        padding?: number;
        center?: { x: number; y: number };
    }): { scale: number; size: { scrollX: number; scrollY: number; minX: number; minY: number; width: number; height: number } };
    /**
     * Vertical tab strip descriptors: frame + visual slot icon per tab.
     * maxVisible/offset clip long strips (overflow is host-scrolled).
     */
    function tabs(options: {
        tabs: any[];
        x?: number;
        y?: number;
        size?: number;
        gap?: number;
        prefix?: string;
        bitmap?: string;
        iconBitmap?: string;
        maxVisible?: number;
        offset?: number;
    }): { elements: { [name: string]: any }; count: number; visible: number; offset: number; hasOverflow: boolean };
    /**
     * Tap outside `bounds` → onClose() ONCE; returns a touch handler
     * (DOWN/CLICK inside → false; outside → onClose() + true). `options.isOpen()`
     * false skips the close; isActive/isAlive hook as on the gesture handlers.
     */
    function outsideClose(bounds: { xStart: number; xEnd: number; yStart: number; yEnd: number }, onClose: () => void, options?: {
        isOpen?(): boolean;
        isActive?(): boolean;
        isAlive?(element: any): boolean;
    }): (element: any, event: any) => boolean;
    /**
     * Live (anti stale-reference) element lookup — resolve `container`/`name`
     * at call time; never keep the returned element across a refresh.
     * Resolution order: getElements() map → getUiAdapter().getElement(name) →
     * getElement(name). An element with `isReleased() === true` / `released ===
     * true` is treated as missing (best effort; current engines filter it
     * inside getElement and do not expose the flag in JS).
     * Cached for ONE tick (`options.tick` number/provider; default Date.now()/50);
     * `options.cache === false` bypasses it; cleared by `dispose()`.
     */
    function liveElement(container: any, name: string, options?: {
        cache?: boolean;
        tick?: number | (() => number);
    }): any | null;
    /** Current display: width (max metric), height (min metric), density. Cached when valid; invalid (0×0) results are not cached; force=true recomputes. */
    function display(force?: boolean): { width: number; height: number; density: number };
    /** Force the display cache to be recomputed (orientation/resolution change). */
    function displayRefresh(): { width: number; height: number; density: number };
    function displayPercentWidth(percent: number): number;
    function displayPercentHeight(percent: number): number;
    /** Android dp → px (density fallback). */
    function dip(value: number): number;
    /** Android sp → px (density fallback). */
    function sp(value: number): number;
    /**
     * Native confirm dialog; returns true when scheduled, false without engine
     * APIs or when `options.isOpen()` is false.
     * options: { title, positiveLabel, negativeLabel, onResult(ok), isOpen() }.
     */
    function confirm(message: string, options?: { title?: string; positiveLabel?: string; negativeLabel?: string; onResult?(ok: boolean): void; isOpen?(): boolean }): boolean;
    /** Native alert dialog (single button); returns true when scheduled (false when `options.isOpen()` is false). */
    function alert(message: string, options?: { title?: string; positiveLabel?: string; onClose?(): void; isOpen?(): boolean }): boolean;
    interface Skin {
        base?: string | string[];
        post_base?: any;
        textures?: { [oldName: string]: string };
        can_show?: boolean;
        version?: { min?: number; max?: number };
        [key: string]: any;
    }
    /** Named skins: register, resolve (base chain), apply (texture remap), unapply, unregister. */
    const skins: {
        register(name: string, skin: Skin): Skin | null;
        unregister(name: string): boolean;
        has(name: string): boolean;
        names(version?: number): string[];
        resolve(name: string, seen?: string[]): Skin | null;
        /**
         * Remaps `bitmap`/`bitmap2` via skin.textures (stores originals); returns
         * replacements count. Exact names win; otherwise the LONGEST prefix key
         * remaps the suffix too (runtime-built names like 'RS_arrow_' + dir),
         * e.g. { "RS_arrow_": "UIC_arrow_" } remaps "RS_arrow_up" → "UIC_arrow_up".
         */
        apply(content: any, name: string): number;
        /** Restores the bitmaps saved by apply(); returns the restored elements count. */
        unapply(content: any): number;
    };
    /** Decode a Base64 image string into an Android bitmap (null on failure). */
    function stringToBitmap(encodedString: string): any;
    /**
     * Decode a Base64 image string and register it in the engine TextureSource
     * under `name` (descriptor `bitmap:` fields). Returns the bitmap or null.
     */
    function registerTexture(name: string, encodedString: string): any;
    /**
     * 53 built-in textures (RS GUI set) hardcoded as Base64 and auto-registered
     * at load; usable directly as descriptor `bitmap:` names. See README.
     */
    const embedded: { [name: string]: string };
    interface ExclusiveStats {
        runs: number;
        deferred: number;
        pending: number;
        owner: string | null;
        depth: number;
        lastOwner: string | null;
        lastDeferrer: string | null;
    }
    /**
     * Thread-id provider used by `exclusive`. Host example:
     * `UiCore.setThreadIdProvider(function () { return java.lang.Thread.currentThread().getName(); })`.
     * Default provider returns "single" (all calls treated as the same thread).
     */
    function setThreadIdProvider(fn: (() => string | null) | null): void;
    /**
     * Cooperative, NON-blocking mutual exclusion per `key` (no UI-thread
     * marshaling — see safeRun). Same thread as the owner re-enters; another
     * thread while busy is QUEUED (one pending entry per wrapped function,
     * latest args win, the call returns false) and replayed by
     * replayPending(key), typically from the next tick.
     * Optional `tag` names the logical function across re-wraps: re-wrapping
     * drops only pending calls with the same tag (without a tag the legacy
     * behavior clears all pending calls for the key).
     */
    function exclusive<T extends (...args: any[]) => any>(key: string, fn: T, tag?: string): T;
    /**
     * Enqueue a wrapped call for `key` WITHOUT executing it (host "single
     * executor" policy: calls from other threads are queued and replayed on
     * the executor thread). The wrapper must come from `exclusive(key, fn)`
     * (tag check) — foreign wrappers are rejected. Returns true when queued.
     */
    function queueCall(key: string, wrapper: (...args: any[]) => any, self: any, args: any): boolean;
    /** True when at least one queued call waits for `key` (never creates state). */
    function hasPending(key: string): boolean;
    /**
     * Run queued calls for `key` on the CURRENT thread; returns how many ran.
     * options.expectedOwner keeps entries deferred by other threads queued;
     * options.onError(error, entry) is called for a throwing entry (dropped).
     */
    function replayPending(key: string, options?: { expectedOwner?: string; onError?(error: any, entry: any): void }): number;
    /** Forget all queued calls for `key` without replay (window closed); returns how many were dropped. Never creates state. */
    function dropPending(key: string): number;
    /** Remove the lock + counters for `key` (diagnostics); queued calls are dropped. Returns true when it existed. */
    function forget(key: string): boolean;
    /** Counters snapshot for `key` (diagnostics/tests; never creates state). */
    function exclusiveStats(key: string): ExclusiveStats | null;
    /**
     * Run `fn` on the UI thread (main) via UI.getContext().runOnUiThread;
     * falls back to a direct call when unavailable (the fallback is logged).
     * Exceptions are isolated + logged under logTag (default "UiCore").
     * Returns true when posted, false when executed directly / invalid.
     *
     * WARNING: every posted callback competes with rendering and touch on the
     * main thread. Heavy work (full GUI rebuilds, sorting, native text
     * measurement, forceRefresh storms) MUST stay on its dedicated thread
     * (the engine client-dispatch API) — moving it here causes visible frame
     * drops (measured: 30-47 FPS idle, down to ~2 FPS while scrolling).
     * Use safeRun only for light, targeted UI mutations.
     */
    function safeRun(fn: () => void, logTag?: string): boolean;
    /**
     * LevelLeft cleanup: drops queued exclusive calls, clears memo caches
     * (textWidth/measureContent/display) and resets the thread-id provider
     * (re-set it on the next LevelLoaded). Idempotent; returns dropped calls.
     */
    function dispose(): number;
}
