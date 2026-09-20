/// <reference path="core-engine.d.ts" />

/**
 * CompatCore — cross-mod discovery + shared energy types.
 * Load with: IMPORT("CompatCore") → global `CompatCore`.
 *
 * Storage-only concerns live in `StorageCore`/`Adapters`; engine version
 * checks live in `CoreKit.Engine.packVersion()`. This library keeps only the
 * generic discovery/energy members.
 */
declare namespace CompatCore {
    interface WhenAvailableOpts {
        /** Default true — dedup only applies together with hostId. */
        once?: boolean;
        /**
         * Caller identity for the dedup key. Pass the mod's __name__ FROM THE
         * MOD FILE — a shared library cannot read it (shared libraries are
         * evaluated once per pack, so their __name__ is the library's own).
         */
        hostId?: string;
        /** Timeout in ticks; requires TickScheduler (feature-detected, optional). */
        timeout?: number;
        /** Called once when the timeout fires (the API callback is ignored after it). */
        onTimeout?(apiName: string): void;
    }
    interface WhenAvailableHandle {
        /**
         * Ignore the late callback and cancel the timeout. The engine cannot
         * unregister callbacks, so this only silences this wrapper. Returns
         * false when already cancelled.
         */
        cancel(): boolean;
        /** True until resolved, cancelled, or timed out. */
        isActive(): boolean;
        /** True after the API callback ran. */
        isResolved(): boolean;
    }
    /**
     * Run a callback when a cross-mod API is available (ModAPI.addAPICallback
     * — the only load-order-safe access path). Returns a handle, or null when
     * ModAPI is unavailable or the hostId+apiName pair was already registered.
     * Callback errors are logged (Logger) and never propagate.
     */
    function whenAvailable(apiName: string, callback: (api: any) => void, opts?: WhenAvailableOpts): WhenAvailableHandle | null;
    /** Get-or-create a shared energy type by name; null without EnergyNet. */
    function energyType(name: string, value: number): { name: string; value: number } | null;
    /**
     * Read-only lookup of a registered energy type; null when absent or
     * without EnergyNet. Use before energyType(): assure is get-or-create and
     * silently keeps an existing type's value.
     */
    function peekEnergyType(name: string): { name: string; value: number } | null;
}
