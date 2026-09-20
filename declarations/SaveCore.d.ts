/// <reference path="core-engine.d.ts" />

/**
 * SaveCore — versioned persistence with migration and validation.
 * Load with: IMPORT("SaveCore") → global `SaveCore`.
 *
 * Save format: { version: number, data: object }.
 * migrations[N] upgrades from version N-1 to N (ascending order in read);
 * validate() runs before adoption, failure → fresh defaults + warning.
 */
declare namespace SaveCore {
    interface ScopeOpts<T> {
        /** Current data version (default 1). */
        version?: number;
        /** migrations[N]: (data) → data, applied in ascending order on load. */
        migrations?: { [version: number]: (data: T) => T };
        /** false → fresh defaults + warning. */
        validate?(data: T): boolean;
        defaults?(): T;
        /**
         * Adapter for pre-envelope saves: when the stored object is not
         * { version, data }, the WHOLE raw object is passed here and its return
         * value is adopted as the data (version 0 → migrations run). Without it
         * such saves silently load as defaults.
         */
        legacy?(raw: any): T;
        /**
         * Save hook: derive/convert the persisted shape (e.g. 'Infinity' for
         * disk storage, live task state). A throwing hook falls back to the raw
         * data instead of wiping the scope.
         */
        serialize?(data: T): any;
        /**
         * Read-side inverse of serialize(): runs on EVERY accepted read
         * (envelope included — unlike legacy), after migrations and before
         * validate. Use it to invert a save-time conversion ('Infinity' →
         * number) or re-normalize keys. A throwing hook → fresh defaults.
         */
        deserialize?(data: T): T;
        /** Called on LevelLeft, before data is reset. */
        onLevelLeft?(store: Store<T>): void;
    }
    interface Store<T> {
        name: string;
        version: number;
        /** Live data object (null after LevelLeft). */
        data: T | null;
    }

    function scope<T>(name: string, opts: ScopeOpts<T>): Store<T>;
    function getScope(name: string): Store<any> | null;
    /** LevelLeft cleanup for every registered scope. */
    function resetAll(): void;
}
