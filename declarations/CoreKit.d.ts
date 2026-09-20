/// <reference path="core-engine.d.ts" />

/**
 * CoreKit — base utilities, item identity, engine feature detection.
 * Load with: IMPORT("CoreKit") → global `CoreKit`.
 */
declare namespace CoreKit {
    namespace util {
        /** Clamp a number; returns `min` when `value` is not a valid number. */
        function clamp(value: number, min: number, max: number): number;
        /** Format large numbers: 1234 → "1.2K", 2000000 → "2M", 1500000000 → "1.5B". */
        function cutNumber(num: number, forGrid?: boolean): number | string;
        /** Thousands separator: 1234567 → "1,234,567". */
        function numberWithCommas(num: number): string;
        /** Unique identifier: "prefix_timestamp_counter_random". */
        function uid(prefix?: string): string;
        /**
         * Deep clone: arrays + plain objects, with cycle guard. Objects exposing
         * `.clone()` use it when available; otherwise arrays/plain objects are
         * copied recursively (objects without enumerable keys become {}).
         * Functions and primitives are returned as-is.
         */
        function deepClone<T>(value: T): T;
        /** Shallow-fill missing keys of `obj` from `src`. Returns obj. */
        function fillDefaults<T>(obj: T, src: any): T;
        /** MD5 hex digest of a byte array/string (engine only); null without Java. */
        function md5(bytes: any): string | null;
    }

    namespace locale {
        /**
         * Translation.translate + printf-style formatting (%s/%d). Falls back to
         * a plain placeholder replacement when the Java APIs are unavailable.
         */
        function translate(str: string, args?: any | any[]): string;
        /** European numeral-verb form (count % 10 = 1, except 11). */
        function isNumeralVerb(count: number): boolean;
        /** European numeral-many form (count % 10 = 0 or >= 5, except the teens). */
        function isNumeralMany(count: number): boolean;
        /**
         * Pick the form by count (zero / verb / many / little) and translate it,
         * formatting with `args` (default `[count]`).
         */
        function translateCounter(count: number, whenZero: string, whenVerb: string, whenLittle: string, whenMany: string, args?: any | any[]): string;
        /**
         * Case-insensitive search normalization: null/undefined → "", otherwise
         * String(value).toLowerCase(). No trim() — parity with the Java search.
         */
        function normalizeSearch(value: any): string;
    }

    namespace net {
        /** Decode a Base64 string to a Java string (engine only); null without Java. */
        function base64Decode(encoded: string): string | null;
        /** GitHub contents API client over the blocking `sendHttp`; null on failure. */
        function github(user: string, repo: string, opts?: { ref?: string }): {
            getJson(path: string): any;
            getFile(path: string): string | null;
            /** Raw Base64 for image registration (e.g. UiCore.registerTexture). */
            getImageBase64(path: string): string | null;
        };
    }

    namespace coords {
        /** The 6 direction vectors. */
        const sides: [number, number, number][];
        /** "x,y,z" (y optional). */
        function cts(coords: { x: number; y?: number; z: number }): string;
        /** Inverse of cts → {x[, y], z}; null when the format is invalid. */
        function parseCts(str: string): { x: number; y?: number; z: number } | null;
        function compare(a: { x: number; y?: number; z: number }, b: { x: number; y?: number; z: number }): boolean;
        /**
         * Dimension-safe key "<dim>:<x[,y],z>" (null/undefined dim → 0).
         * Accepts a coords object, explicit x,y,z or a prebuilt "x,y,z" string.
         * cts() itself stays dimension-free.
         */
        function key(dim: number | string | null | undefined, coords: { x: number; y?: number; z: number }): string;
        function key(dim: number | string | null | undefined, x: number, y: number, z: number): string;
        function key(dim: number | string | null | undefined, coordsId: string): string;
    }

    namespace Items {
        /**
         * Canonical key of an ItemExtraData, unifying the known conventions:
         * getValue FIRST and AUTHORITATIVE when present (a falsy getValue →
         * ""). When getValue is absent, asJson is TERMINAL: raw non-empty JSON
         * (no field stripping) is the key, falsy/throwing asJson → "".
         * Without asJson: isEmpty(), then getAllCustomData, `.json`, String,
         * JSON.stringify. Returns "" for an empty extra.
         */
        function extraKey(extra: ItemExtraData | any): string;
        /** Canonical item UID "id_data[_extraKey]". */
        function uidOf(item: ItemInstance): string;
        /**
         * Structured identity (computed once, no string re-splitting):
         * uid, extraKey and the original extra BY REFERENCE (read-only for the
         * caller). Use uidOf() when only the string key is needed.
         */
        function uidInfo(item: ItemInstance): { uid: string; extraKey: string; extra: ItemExtraData | null };
        /**
         * Extra key for MATCHING when merging: like extraKey for asJson extras,
         * but STRIPS empty data/name fields (mutates the JSON object). Returns
         * "" for falsy extras.
         */
        function fullExtraToString(extra: ItemExtraData | any): string;
        function isExtraEmpty(extra: ItemExtraData | any): boolean;
        /**
         * Unified item match: same id, data with `-1` wildcard (opts.wildcardData),
         * extra compared via extraKey (opts.matchExtra), or via
         * fullExtraToString when opts.stripEmptyExtra (empty data/name fields
         * don't prevent a match).
         */
        function match(a: ItemInstance, b: ItemInstance, opts?: {
            wildcardData?: boolean;
            matchExtra?: boolean;
            stripEmptyExtra?: boolean;
        }): boolean;
        /** Stack-mergeable items: exact id+data (no wildcard) + identical extra. */
        function mergeable(a: ItemInstance, b: ItemInstance): boolean;
    }

    namespace Inventory {
        /** Result of a scan. */
        interface ScanResult extends ItemInstance {
            slot: number;
        }
        /**
         * Scan a player inventory (0..35, reversible direction).
         * Signature 1: scan(player, id, data, extra, list, reverse)
         * Signature 2: scan(player, id, data, list, reverse)
         *   — a boolean `extra` means "any extra" (list/reverse shift).
         * Signature 3: scan(player, matcher(item, slotIndex), list, reverse)
         */
        function scan(player: Player | PlayerActor, id: number, data: number, extra: any, list: boolean, reverse: boolean): ScanResult | ScanResult[] | null;
        function scan(player: Player | PlayerActor, id: number, data: number, list: boolean, reverse: boolean): ScanResult | ScanResult[] | null;
        function scan(player: Player | PlayerActor, matcher: (item: ItemInstance, slot: number) => boolean, list?: boolean, reverse?: boolean): ScanResult | ScanResult[] | null;
    }

    namespace Engine {
        /** packVersionCode of the active pack (0 = UNDETERMINED). Read lazily from the manifest. */
        function packVersion(): number;
        /** Feature detection with cache: the test runs only once. */
        function hasFeature(name: string, testFn: () => boolean): boolean;
        /**
         * Safe isChunkLoadedAt on any BlockSource wrapper.
         * Fallback chain: BlockSource.isChunkLoadedAt → World.isChunkLoadedAt → isChunkLoaded(x>>4, z>>4) → true.
         */
        function safeIsChunkLoadedAt(blockSource: BlockSource, x: number, y: number, z: number): boolean;
    }

    namespace Blocks {
        /**
         * 6-way facing meta from a delta (Bedrock face convention:
         * 0=SOUTH, 1=NORTH, 2=EAST, 3=WEST, 4=down, 5=up). 0..5.
         */
        function facingMetaFromDelta(dx: number, dy: number, dz: number): number;
        /** Convenience: delta from coords + player position, then the facing meta. */
        function facingMetaFromPlayer(coords: { x: number; y: number; z: number }, playerPos: { x: number; y: number; z: number }): number;
        /**
         * Wire/cable boxes: 6 directional quarter-width boxes + the center box,
         * all in block units (0..1).
         */
        function wireBoxes(width?: number): { wires: { side: number[]; box: number[] }[]; center: number[] };
    }
}
