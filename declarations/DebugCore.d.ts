/// <reference path="core-engine.d.ts" />

/**
 * DebugCore — structured logging, channels, ring buffer, counters, profiling.
 * Load with: IMPORT("DebugCore") → global `DebugCore`.
 *
 * Config-gated prefixed Logger.Log channels plus a ring buffer, counters and
 * a profiler.
 */
declare namespace DebugCore {
    interface Channel {
        log(msg: string): void;
        warn(msg: string): void;
        error(msg: string): void;
        trace(msg: string): void;
    }
    interface RingBuffer {
        push(line: string): void;
        getLast(n?: number): string[];
        clear(): void;
        size(): number;
        getWrappedCount(): number;
    }
    interface Counter {
        inc(n?: number): number;
        dec(n?: number): number;
        get(): number;
        reset(): void;
    }

    /** Enable all channels; pass a function for dynamic gating (e.g. () => Config.dev). */
    function setEnabled(value: boolean | (() => boolean)): void;
    function isEnabled(): boolean;
    /** Prefixed [TAG] channel, gated by setEnabled. */
    function channel(tag: string): Channel;
    /** In-memory ring buffer of the last N lines; opts.onFlush for crash-safe persistence. */
    function ring(capacity: number, opts?: { onFlush?(lines: string[]): void }): RingBuffer;
    /** Route channel logs into a ring buffer. */
    function setRing(ring: RingBuffer): void;
    function counter(name: string): Counter;
    function getCounters(): { [name: string]: { value: number; total: number; lastReset: number } };
    /** Measure fn() duration, log it (gated) and keep a rolling aggregate. */
    function profile<T>(name: string, fn: () => T): T;
    function getProfiles(): { [name: string]: { count: number; sum: number; max: number } };
    /** Reset one named profile aggregate, or all when name is omitted. */
    function resetProfiles(name?: string): void;
    /** Reset every counter's current value in place (total/lastReset preserved). */
    function resetCounters(): void;
    /**
     * Report an unexpected error: always logs (bypassing the enabled gate),
     * feeds the ring buffer and optionally opens the engine formatted dialog.
     */
    function report(error: any, opts?: { tag?: string; title?: string; dialog?: boolean }): string;
    /** Engine DialogHelper formatted dialog; returns false when unavailable. */
    function showReport(message: string, title?: string): boolean;
}
