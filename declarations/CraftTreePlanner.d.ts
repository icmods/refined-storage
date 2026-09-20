/// <reference path="core-engine.d.ts" />

/**
 * CraftTreePlanner — host-neutral crafting planner.
 * Load with: IMPORT("CraftTreePlanner") → global `CraftTreePlanner`.
 * Resources are opaque keys and all host policy is injected, so the same engine
 * serves any crafting mod; nothing here knows item/fluid/pattern specifics.
 */
declare namespace CraftTreePlanner {
    /** Opaque resource identity. Host-provided; the engine never inspects it. */
    type ResourceKey = any;

    interface Stack {
        key: ResourceKey;
        amount: number;
    }

    /** One interchangeable option inside a recipe input slot. */
    interface Candidate {
        key: ResourceKey;
        /** Amount needed for a single craft. */
        amount: number;
        /** false marks a substitute the host must not recurse into (default true). */
        autocraftable?: boolean;
        hostRef?: any;
    }

    interface Slot {
        candidates: Candidate[];
    }

    /** Plain recipe descriptor supplied by the host. */
    interface Recipe {
        id: string;
        isProcessing?: boolean;
        hostRef?: any;
        outputs: Stack[];
        inputs: Slot[];
    }

    /**
     * Host policy. Callbacks run synchronously during the traversal; keep them
     * pure and deterministic if you rely on deterministic plans. `accept*` acts
     * as a filter (it can eliminate solutions); `compare*` only orders.
     */
    interface Policy {
        compareCandidates?(a: Candidate, b: Candidate): number;
        acceptCandidate?(candidate: Candidate): boolean;
        compareRecipes?(a: Recipe, b: Recipe): number;
        acceptRecipe?(recipe: Recipe): boolean;
    }

    /**
     * OPT-IN limits, DISABLED by default. A falsy value (0/null/undefined) means
     * "disabled"; only strictly positive numbers enable a limit. Semantics:
     *   - maxSteps counts recipe resolutions (recursion calls); the call that would
     *     exceed it throws TOO_COMPLEX before doing work;
     *   - maxDepth counts recursion depth (root = 1); the recipe at maxDepth+1 throws;
     *   - maxNodes counts COMPLETED nodes; the cap is checked BEFORE a node is pushed,
     *     so the returned artifact never exceeds it;
     *   - deadline is checked at recursion entry, once per slot before candidates and
     *     before the root recipe is picked; callbacks inside one candidate may still
     *     run past it. Aborts with TIMEOUT.
     */
    interface Limits {
        /** Absolute deadline in `now()` units. */
        deadline?: number;
        maxNodes?: number;
        maxSteps?: number;
        maxDepth?: number;
    }

    interface CycleGuard {
        contains(id: string): boolean;
        push(id: string): void;
        pop(id: string): void;
        depth(): number;
    }

    /**
     * Simulated inventory. The engine only calls amount/insert/extract and
     * realExtracted; reserve()/available() are unused by the engine (reservation
     * is host policy — RS: CraftTreeExecutor). Pass a fresh inventory per plan unless
     * cumulative consumption is intended.
     */
    interface Inventory {
        amount(key: ResourceKey): number;
        initialAmount(key: ResourceKey): number;
        /** Portion of `amount`'s consumption that came from the initial snapshot. */
        realExtracted(key: ResourceKey): number;
        reservedFor(key: ResourceKey): number;
        available(key: ResourceKey): number;
        insert(key: ResourceKey, amount: number): number;
        extract(key: ResourceKey, amount: number): number;
        reserve(key: ResourceKey, amount: number): void;
        entries(): { uid: string; key: ResourceKey; amount: number }[];
    }

    interface InventoryOpts {
        initial?: Stack[] | { [keyString: string]: number };
        keyString?(key: ResourceKey): string;
    }

    interface Context {
        recipesFor(key: ResourceKey): Recipe[];
        inventory?: Inventory;
        keyString?(key: ResourceKey): string;
        identityOf?(recipe: Recipe): string;
        policy?: Policy;
        limits?: Limits;
        now?(): number;
        cycleGuard?: CycleGuard;
    }

    interface PlanNode {
        recipeId: string;
        quantity: number;
        isProcessing: boolean;
        hostRef: any;
        inputs: { key: ResourceKey; amount: number; fromInventory: boolean; autocrafted: boolean }[];
        outputs: Stack[];
    }

    interface PlanResult {
        ok: boolean;
        errorType: string | null;
        errorRecipe: string | null;
        /** Which limit aborted the plan ("maxSteps" | "maxDepth" | "maxNodes" | "deadline"). */
        errorLimit: string | null;
        nodes: PlanNode[];
        missing: { [keyString: string]: number };
        /** Real storage consumption (initial snapshot only). */
        extraction: { [keyString: string]: number };
        toTake: { [keyString: string]: number };
        /** Amounts produced by crafting. */
        toCraft: { [keyString: string]: number };
        stats: { steps: number; nodes: number; depth: number; start: number; elapsed?: number };
    }

    interface AggregatedNode {
        recipeId: string;
        quantity: number;
        isProcessing: boolean;
        hostRef: any;
        count: number;
        inputs: PlanNode["inputs"];
        outputs: Stack[];
    }

    const ERRORS: {
        NO_RECIPE: string;
        MISSING: string;
        RECURSIVE: string;
        TOO_COMPLEX: string;
        TIMEOUT: string;
        INVALID: string;
    };

    const defaultPolicy: Required<Policy>;

    function stack(key: ResourceKey, amount: number): Stack;
    function createInventory(opts?: InventoryOpts): Inventory;
    function createCycleGuard(): CycleGuard;
    function plan(request: { key: ResourceKey; amount: number }, ctx: Context): PlanResult;
    function aggregate(nodes: PlanNode[], nodeKey?: (node: PlanNode) => string): AggregatedNode[];
}
