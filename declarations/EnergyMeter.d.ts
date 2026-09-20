/// <reference path="core-engine.d.ts" />

/**
 * EnergyMeter — usage aggregation, budgets, UI scaling over EnergyNet.
 * Load with: IMPORT("EnergyMeter") → global `EnergyMeter`.
 * Thin accounting layer for usage, budget and scale; EnergyNet remains the
 * network. The usage registry is cleared automatically on LevelLeft.
 *
 * Numeric contract: non-finite (NaN/±Infinity), non-number and negative
 * inputs collapse to 0; capacity ≤ 0 or non-finite is treated as 1; measure()
 * re-validates the total (non-finite → 0); budget() clamps energy to capacity.
 */
declare namespace EnergyMeter {
    interface NodeCost { blockId?: number | string; count?: number; usage?: number; extras?: number; }
    interface MeasureResult { usage: number; perNode: { blockId?: number | string; usage: number }[]; }
    interface BudgetResult { ok: boolean; ratio: number; scaled: number; }

    /** Register a per-tick usage for a block id (invalid values → 0). */
    function registerUsage(blockId: number | string, perTick: number): void;
    /** Remove a registered usage; returns true when the key existed. */
    function unregisterUsage(blockId: number | string): boolean;
    function getUsage(blockId: number | string): number;
    function getAllUsages(): { [blockId: string]: number };
    /** Clear the whole registry (also runs automatically on LevelLeft). */
    function clearUsages(): void;
    /**
     * Aggregate usage for a node set (count multiplier + extras). Every
     * contribution and the total are sanitized.
     */
    function measure(nodes: NodeCost[]): MeasureResult;
    /** Budget check + 0..1 scale; energy is clamped to [0, capacity]. */
    function budget(energy: number, usage: number, capacity: number): BudgetResult;
}
