/// <reference path="core-engine.d.ts" />

/**
 * MpCore — multiplayer toolkit: per-player state, screens, request guards.
 * Load with: IMPORT("MpCore") → global `MpCore`.
 *
 * Per-client open/close listeners (no cross-player contamination), targeted
 * refreshes (broadcast only when client is null), per-source throttling.
 */
declare namespace MpCore {
    interface ConnectivityOpts {
        /** Called after a client is tracked on open; `owner` is the live tile instance. */
        onOpen?(container: any, client: NetworkClient, owner: any): void;
        /** Per-client cleanup on close; receives the player uid (client/container/owner appended). */
        onClose?(playerUid: number, container: any, client: NetworkClient, owner: any): void;
    }
    interface RequestGuard {
        isThrottled(sourceKey: string | number): boolean;
        mark(sourceKey: string | number): void;
    }

    /**
     * Attach the connected-clients map + open/close listeners to a tile
     * (call once in init()). Returns the clients map (uid → NetworkClient).
     */
    function connectivity(tile: any, options?: ConnectivityOpts): { [uid: number]: NetworkClient };
    /** Clear all tracked clients for a tile (LevelLeft / teardown; listeners stay attached). */
    function reset(tile: any): void;
    /** Drop one tracked client (onDisconnectionPlayer cleanup). Returns true when removed. */
    function disconnect(tile: any, playerUid: number): boolean;
    function getClient(tile: any, playerUid: number): NetworkClient | null;
    /**
     * True when the client is a registered VIEWER of the tile (open listener).
     * Unlike container.getNetworkEntity().getClients().contains(client), which
     * also contains nearby players (distance policy).
     */
    function isWatching(tile: any, client: NetworkClient): boolean;
    /**
     * Install getScreenByName on a TileEntity prototype (REQUIRED by openFor —
     * without it the engine throws "View not attached to window manager").
     * screens = { name: window, ... } or function(name) → window.
     */
    function attachScreens(prototype: any, screens: { [name: string]: any } | ((name: string) => any)): void;
    /** Open a screen for a client + send the initial "openGui" payload. */
    function openFor(tile: any, client: NetworkClient, screenName: string, payload?: any): boolean;
    /** Targeted refresh (client given) or broadcast (client null). */
    function refresh(tile: any, client: NetworkClient | null, eventName: string, payload?: any): boolean;
    /** Lazy per-player map stored in tile.data[key]. */
    function perPlayer(tile: any, key: string): { [uid: number]: any };
    /** Per-source request throttle with pruning (60 ticks default). */
    function requestGuard(tile: any, throttleTicks?: number): RequestGuard;
    /** Validate a request server-side; kicks the client when invalid. */
    function validate(client: NetworkClient, fn: () => boolean): boolean;
    /**
     * Wrap a containerEvent handler with a uid guard + late registration
     * fallback. tile MUST be the tile instance (not the prototype) —
     * instances are detected via their container; prototypes are never
     * mutated. options.requireOpen: the client must be a registered viewer
     * (no late registration); options.onReject(uid, tile) on rejection.
     */
    function guardHandler(tile: any, handler: (eventData: any, client: NetworkClient, playerUid: number) => void, options?: { requireOpen?: boolean; onReject?(playerUid: number, tile: any): void }): (eventData: any, client: NetworkClient) => void;
    /** True when the tile instance exists, has data and was not marked removed. */
    function isTileAlive(tile: any): boolean;
    /**
     * Run `fn(tile)` on a live tile instance with error isolation.
     * options.requireNetworkEntity skips server-side detached tiles; options.allowRemoved
     * allows removed tiles (default false). Returns true when fn ran.
     */
    function safeTileCall(tile: any, fn: (tile: any) => void, options?: { requireNetworkEntity?: boolean; allowRemoved?: boolean; label?: string; logTag?: string }): boolean;
}
