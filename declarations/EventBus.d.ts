/// <reference path="core-engine.d.ts" />

/**
 * EventBus — event emitter with error isolation, scopes, namespaces and
 * capability-limited handles.
 * Load with: IMPORT("EventBus") → global `EventBus`.
 *
 * Guaranteed semantics:
 *   - an exception in one listener does NOT stop the emission (isolation);
 *   - listeners registered DURING an emission do not run in the current emission (snapshot);
 *   - clearScope(scope)/clear() remove registrations (teardown without ConcurrentModification);
 *   - a reentrancy depth guard (default 32) drops runaway recursion with a log;
 *   - the shared bus is reached through EventBus.getGlobal() (listen/emit only);
 *     destructive operations live on EventBus.admin();
 *   - EventBus.ns(name) returns a namespaced handle: events are prefixed
 *     ("rs:taskAdded"), listeners are owned, clearOwn() only touches the namespace.
 */
declare namespace EventBus {
    interface SubscriptionOpts {
        /** Owner label; used by clearOwner and namespace ownership. */
        owner?: string;
        /** Removed automatically on LevelLeft (shared bus only). */
        ephemeral?: boolean;
    }

    interface TraceInfo {
        event: string;
        listeners: number;
        executed: number;
        depth: number;
    }

    interface Bus {
        /** Register a listener; returns a stable subscription id (or -1 when fn is not a function). */
        on(event: string, fn: (data?: any) => void, scope?: any, opts?: SubscriptionOpts): number;
        /** Run once, then unregister. */
        once(event: string, fn: (data?: any) => void, scope?: any, opts?: SubscriptionOpts): (data?: any) => void;
        /** Unregister by callback (accepts the once wrapper); removes every match. */
        off(event: string, fn: (data?: any) => void): void;
        /** Unregister one subscription by id. */
        offId(event: string, id: number): boolean;
        /** Emit to all listeners; returns the number of executed listeners. */
        emit(event: string, data?: any): number;
        /** Emit only to listeners registered with the given scope; scope null = all. */
        emitScoped(event: string, scope: any, data?: any): number;
        /** Remove every registration of a scope (teardown). ADMIN on the shared bus. */
        clearScope(scope: any): void;
        /** Remove every listener owned by an owner label. */
        clearOwner(owner: string): number;
        /** Remove listeners of one event (or all of them when event == null). ADMIN on the shared bus. */
        clear(event?: string): void;
        listenerCount(event: string): number;
        /** Observability hook (off by default); returns an unsubscribe function. */
        onTrace(fn: (info: TraceInfo) => void): (() => void) | false;
    }

    interface GlobalHandle {
        on(event: string, fn: (data?: any) => void, scope?: any): number;
        once(event: string, fn: (data?: any) => void, scope?: any): (data?: any) => void;
        off(event: string, fn: (data?: any) => void): void;
        offId(event: string, id: number): boolean;
        emit(event: string, data?: any): number;
        emitScoped(event: string, scope: any, data?: any): number;
        listenerCount(event: string): number;
        onTrace(fn: (info: TraceInfo) => void): (() => void) | false;
    }

    interface NamespaceHandle {
        name: string;
        on(event: string, fn: (data?: any) => void, opts?: SubscriptionOpts): number;
        once(event: string, fn: (data?: any) => void, opts?: SubscriptionOpts): (data?: any) => void;
        off(event: string, fn: (data?: any) => void): void;
        offId(event: string, id: number): boolean;
        /** Optional dev-only payload contract: emit drops + logs when it returns falsy. */
        define(event: string, validate?: (data: any) => boolean): void;
        emit(event: string, data?: any): number;
        emitScoped(event: string, scope: any, data?: any): number;
        listenerCount(event: string): number;
        /** Remove every listener registered through this namespace. */
        clearOwn(): number;
    }

    interface Admin {
        clear(event?: string): void;
        clearAll(): void;
        clearScope(scope: any): void;
        clearOwner(owner: string): number;
        listEvents(): { event: string; count: number }[];
        setMaxDepth(n: number): number;
        trace(fn: (info: TraceInfo) => void): (() => void) | false;
    }

    /** Create an isolated bus (full surface — internal systems only). */
    function create(): Bus;
    /** Restricted shared-bus handle: listen + emit only. */
    function getGlobal(): GlobalHandle;
    /** Namespaced handle over the shared bus (least privilege for consumers). */
    function ns(name: string): NamespaceHandle;
    /** Administrative surface for the shared bus (host/tests only). */
    function admin(): Admin;
    /** @deprecated use getGlobal()/ns() */
    const global: GlobalHandle;
}
