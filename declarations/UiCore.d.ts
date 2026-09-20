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
        /** container.sendChanges() only when something changed. */
        flush(): boolean;
        /** GUI opened: forget caches so the next flush resends everything. */
        invalidate(): void;
    }

    /** Pure pagination math. */
    function pagination(elements: any, config: PaginationConfig): PaginationHelpers;
    /** Swipe page-flip touch handler (7px/15px thresholds; variant layout|anchor). */
    function attachSwipe(opts: SwipeOpts): (element: any, event: any) => void;
    /** Slider-frame touch handler (DOWN → moving; CLICK → jump/snap). */
    function attachSlider(opts: SliderOpts): (element: any, event: any) => void;
    /** Search box descriptors { frame, text }, with an optional clear button. */
    function searchBox(x: number, y: number, width: number, opts: SearchOpts): { frame: any; text: any };
    /** Virtual slot pool, parked at (-1000,-1000). */
    function createSlotPool(opts: { base: any; maxCount?: number }): SlotPool;
    /** Descriptor darken per predicate. */
    function applyDarken(elements: any, names: string[], predicate: (name: string) => boolean): number;
    const DeltaBinder: { wrap(container: any): DeltaBinder };
    /** Strip §-codes + truncate. */
    function cutItemName(name: string | null, maxLen?: number): string;
    /** Text width for a font size (cached; engine Font; estimate fallback). */
    function textWidth(text: string, size?: number): number;
    /** Bounds of elements + drawing (cached by structural signature): scrollX/scrollY/minX/minY/width/height. */
    function measureContent(content: any): { scrollX: number; scrollY: number; minX: number; minY: number; width: number; height: number };
    /** Scale descriptors in place (text font, frames, sizes, x/y). Returns content. */
    function scaleContent(content: any, scale: number): any;
    /** Offset descriptors in place. Returns content. */
    function offsetContent(content: any, x: number, y: number): any;
    /**
     * Fit into maxWidth/maxHeight (minus padding): measure, shrink by at most
     * maxScale (default 1), then center the bbox on opts.center {x,y}.
     */
    function fitContent(content: any, opts?: {
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
    function tabs(opts: {
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
     * Tap outside `bounds` → onClose(); returns a touch handler (DOWN/CLICK
     * inside → false; outside → onClose() + true).
     */
    function outsideClose(bounds: { xStart: number; xEnd: number; yStart: number; yEnd: number }, onClose: () => void): (element: any, event: any) => boolean;
    /** Current display: width (max metric), height (min metric), density. Cached; force=true recomputes. */
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
     * APIs. opts: { title, positiveLabel, negativeLabel, onResult(ok) }.
     */
    function confirm(message: string, opts?: { title?: string; positiveLabel?: string; negativeLabel?: string; onResult?(ok: boolean): void }): boolean;
    /** Native alert dialog (single button); returns true when scheduled. */
    function alert(message: string, opts?: { title?: string; positiveLabel?: string; onClose?(): void }): boolean;
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
    /**
     * Run `fn` on the UI thread (main) via UI.getContext().runOnUiThread;
     * falls back to a direct call when unavailable. Exceptions are isolated
     * and logged under logTag (default "UiCore"). Returns true when posted to
     * the UI thread, false when executed directly / invalid input.
     *
     * WARNING: every posted callback competes with rendering and touch on the
     * main thread. Heavy work (full GUI rebuilds, sorting, native text
     * measurement, forceRefresh storms) MUST stay on its dedicated thread
     * (the engine client-dispatch API) — moving it here causes visible frame
     * drops (measured: 30-47 FPS idle, down to ~2 FPS while scrolling).
     * Use safeRun only for light, targeted UI mutations.
     */
    function safeRun(fn: () => void, logTag?: string): boolean;
}
