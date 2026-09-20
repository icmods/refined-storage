/// <reference path="core-engine.d.ts" />

/**
 * RecipeIndex — recipe discovery, inverse index, dedup, annotation, search.
 * Load with: IMPORT("RecipeIndex") → global `RecipeIndex`.
 * Engine access (recipe objects) is injected via opts — the same index serves
 * vanilla workbench recipes, custom recipe systems, and tests.
 */
declare namespace RecipeIndex {
    interface RecipeEntry { id: number; data: number; /** <= 0 is treated as 1 in consumption/signature. */ count?: number; }
    interface Recipe {
        getRecipeUid?(): string;
        getResult?(): { id: number; data: number; count?: number };
        getSortedEntries?(): RecipeEntry[];
        getCallback?(): Function | null;
    }
    interface AccessorOpts {
        getUid?(recipe: Recipe): string;
        getResult?(recipe: Recipe): { id: number; data: number; count?: number };
        getEntries?(recipe: Recipe): RecipeEntry[];
    }
    interface BuildOpts extends AccessorOpts {
        recipes: Recipe[];
    }
    interface Annotated { recipe: Recipe; result: { id: number; data: number; count?: number }; craftable: boolean; }
    interface Index {
        recipesByUid: { [uid: string]: Recipe };
        inverseIndex: { [key: string]: string[] };
        /**
         * Deduplicated list (key: result.id_data + ingredientSignature).
         * The FIRST occurrence wins; invalid results (non-finite id, id <= 0)
         * never enter.
         */
        deduped: Recipe[];
        byUid(uid: string): Recipe | null;
        /** data >= 0 → exact key; otherwise the id-level list (wildcard matching). */
        byIngredient(id: number, data?: number): string[];
        /** Candidate recipes usable with an available map (accessor failures are isolated). */
        findCandidates(available: { [key: string]: number }): Recipe[];
        /**
         * Craftability annotation with data -1 wildcard consumption. Exact entries
         * are allocated BEFORE wildcards (map-order independent); craftable-first,
         * stable. Accessor failures are isolated (item marked not craftable).
         */
        annotate(available: { [key: string]: number }): Annotated[];
        /** Name search over the deduped list; getName cached in nameCache (accessor failures are isolated). */
        search(keyword: string | null, getName: (id: number, data: number) => string, nameCache?: { [key: string]: string }): Recipe[];
        size(): number;
    }

    /** Load all engine workbench recipes; yields to the engine while loading. */
    function loadWorkbenchRecipes(): Recipe[] | null;
    /**
     * Ingredient lookup, no .dex required:
     * 1. native engine lookup via WRAP_JAVA
     *    (WorkbenchRecipeRegistry.addRecipesThatContainItem), feature-detected
     *    once;
     * 2. fallback to the documented JS API
     *    Recipes.getWorkbenchRecipesByIngredient.
     * data defaults to -1 (wildcard). Results are memoized (fresh copies) —
     * opts.cache: false disables it, opts.refresh: true bypasses it.
     * Never throws.
     */
    function loadRecipesByIngredient(id: number, data?: number, opts?: { cache?: boolean; refresh?: boolean }): Recipe[];
    /**
     * Clear the ingredient lookup cache. Call after runtime recipe
     * registration (e.g. addShaped inside PostLoaded).
     */
    function clearIngredientCache(): void;
    /**
     * Candidate discovery: builds the index from ONLY the recipes containing
     * the given ingredients (no full workbench scan), then dedups them by uid
     * and builds the index (annotation stays on-demand via index.annotate).
     */
    function buildFromIngredients(ingredients: { id: number; data?: number }[], opts?: AccessorOpts): Index;
    function build(opts: BuildOpts): Index;

    interface SortAccessors {
        getId?(key: any): number;
        getCount?(key: any): number;
        getName?(key: any): string;
        /** Text-filter membership test (default: getId(key) !== 0). */
        hasItem?(key: any): boolean;
    }
    interface SortSpec {
        /** 0 = count, 1 = name, 2 = id (numeric sort-type codes). */
        by: "count" | "name" | "id" | 0 | 1 | 2;
        reverse?: boolean;
        /** Case-insensitive substring match on getName; null/absent keeps all keys. */
        textSearch?: string | null;
    }
    /**
     * Sort opaque keys by accessor fields with an optional text filter.
     * Returns a fresh array.
     */
    function sortKeys(keys: any[], accessors: SortAccessors, spec: SortSpec): any[];

    interface PartitionResult<T> { first: T[]; second: T[]; ordered: T[]; }
    /**
     * Stable two-group partition: items where isFirstGroup(item) is true come
     * first, the rest after (relative order preserved). Useful for ordering
     * non-darkened before darkened items, with an optional filter and a
     * per-item classification sink.
     */
    function partition<T>(items: T[], isFirstGroup: (item: T) => boolean, opts?: {
        filter?(item: T): boolean;
        onClassify?(item: T, isFirstGroup: boolean): void;
    }): PartitionResult<T>;

    interface SimulateOpts {
        /** Cache object (default: the library's own cache, cleared via clearCraftSimulationCache). */
        cache?: { [uid: string]: boolean };
        /** Logger (default Logger.Log with tag "RecipeIndex"). */
        log?(msg: string): void;
        getUid?(recipe: Recipe): string;
        getEntries?(recipe: Recipe): RecipeEntry[];
        getCallback?(recipe: Recipe): Function | null;
        getResult?(recipe: Recipe): { id: number; data: number; count?: number };
        /** Scratch container constructor (default: engine ItemContainer). */
        ItemContainer?: new () => any;
        /** WorkbenchFieldAPI constructor (default: WRAP_JAVA lookup). */
        WorkbenchFieldAPI?: new (container: any) => any;
        /** Globals scanned for `Player.*` references (default: engine Player). */
        playerGlobals?: any;
    }
    /**
     * Simulate a workbench recipe without a player. Fills a scratch
     * workbench-field container, rejects callbacks referencing `Player.*`,
     * runs the callback, caches the result per recipe uid. Returns true when
     * the callback ran without throwing.
     */
    function simulateWorkbench(recipe: Recipe, opts?: SimulateOpts): boolean;
    /** Clear the simulation cache (call after runtime recipe registration). */
    function clearCraftSimulationCache(): void;
}
