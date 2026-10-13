LIBRARY({
    name: "CraftTreeExecutor",
    version: 2,
    shared: true,
    api: "CoreEngine",
    dependencies: ["CoreKit:2"]
});

IMPORT("CoreKit:2");

var CraftTreeExecutor = {};

/*
 * ============================================================================
 * CraftTreeExecutor — task model + scheduler
 * ============================================================================
 * The host supplies the plan (e.g. from the separate CraftTreePlanner library) and
 * the execution callbacks; the library owns the task model (buffer reservation,
 * expected outputs, FIFO matching), the tick scheduler, completion/cancellation
 * and the lifecycle events.
 *
 * Plan model (host-supplied): nodes / toReserve / toCraft / toTake / missing.
 * Task model: buffer reservation, expected outputs per uid, FIFO oldest-task-wins
 * via pendingOutputs.
 * Scheduler cadence: task.ticks % interval, retry throttle, fail timeout, suspend
 * on unloaded chunks, plan-then-commit.
 *
 * Time base: caller-provided ticks (never the engine thread clock).
 *
 * Host interfaces:
 *   createTask(fullCrafts, host, requestedItem, requestedCount)
 *     fullCrafts = { results, crafts, plan: { nodes:[{patternUid, isProcessing,
 *                   containerCoords, quantity, requirements:[{uid,count,altUids}]}],
 *                   toReserve, toCraft, toTake, missing } }
 *     host = { extract(uid,count)→remainder, insert(item,count)→remainder,
 *              registerExpectedOutput(uid,task), unregisterExpectedOutput(uid,task) }
 *   processTick(task, ctx)
 *     ctx = { ticks, parallel, getPattern(uid), getContainers(uid), getContainer(coordsId),
 *             getInterval(container), getBudget(container), isChunkLoaded(coordsId),
 *             executeNode?(task,node,entry,ctx)→{failed}, execute?(task,node,container,pattern,plan),
 *             canTake(uid,count), take(uid,count), insert(item,count), markIncomplete,
 *             onProgress, onTaskComplete, onTaskCancelled, onTaskRemoved }
 * ============================================================================
 */

var _CP_RETRY_THROTTLE = 2;
var _CP_FAIL_TIMEOUT = 600;

function _cpUid(id, data) {
    return id + "_" + data;
}

function _cpUidOf(item) {
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items) return CoreKit.Items.uidOf(item);
    return _cpUid(item.id, item.data);
}

function _cpSplitUid(uid) {
    if (typeof CoreKit != "undefined" && CoreKit && CoreKit.Items && CoreKit.Items.parseUid) {
        return CoreKit.Items.parseUid(uid);
    }
    var parts = uid.split("_");
    return { id: parseInt(parts[0], 10), data: parseInt(parts[1], 10) };
}

/* ------------------------------------------------------------------ task --- */

var _CP_taskIdCounter = 0;

CraftTreeExecutor.createTask = function (fullCrafts, host, requestedItem, requestedCount, options) {
    options = options || {};
    if (!fullCrafts) return null;
    var plan = fullCrafts.plan;
    if (!plan) return null;

    var totalSteps = 0;
    var nodes = [];
    for (var ni = 0; ni < plan.nodes.length; ni++) {
        var pn = plan.nodes[ni];
        totalSteps += pn.quantity;
        nodes.push({
            patternUid: pn.patternUid,
            isProcessing: pn.isProcessing || false,
            containerCoords: pn.containerCoords,
            quantity: pn.quantity,
            remaining: pn.quantity,
            done: false,
            received: 0,
            expectedByUid: null,
            receivedByUid: {},
            requirements: (pn.requirements || []).map(function (r) {
                return { uid: r.uid, count: r.count, provided: 0, altUids: r.altUids || [] };
            })
        });
    }

    var task = {
        // options.id lets the host own task identity; when
        // absent, the library generates a collision-resistant local id.
        id: options.id || ("ct_" + Date.now() + "_" + (++_CP_taskIdCounter) + "_" + Math.floor(Math.random() * 1000000)),
        _host: host || {},
        requestedUid: _cpUidOf(requestedItem),
        requestedCount: requestedCount || (fullCrafts.results[0] ? fullCrafts.results[0].count : 0),
        totalSteps: totalSteps,
        currentStep: 0,
        ticks: 0,
        // Host-owned clock value (unix ms); optional.
        startTime: (options.startTime != null ? options.startTime : undefined),
        cancelled: false,
        completingFlush: false,
        nodes: nodes,
        buffer: {},
        toReserve: {},
        pendingOutputs: {},
        results: fullCrafts.results,
        crafts: fullCrafts.crafts
    };
    for (var uid in plan.toReserve) task.toReserve[uid] = plan.toReserve[uid];

    task.reserveItems = function () {
        for (var uidR in this.toReserve) {
            var count = this.toReserve[uidR];
            if (count <= 0) continue;
            var remainder = this._host.extract ? this._host.extract(uidR, count) : count;
            var reserved = count - remainder;
            if (reserved > 0) this.buffer[uidR] = (this.buffer[uidR] || 0) + reserved;
            if (remainder === 0) delete this.toReserve[uidR];
            else this.toReserve[uidR] = remainder;
        }
        return Object.keys(this.toReserve).length === 0;
    };

    task.flushBuffer = function () {
        for (var uidF in this.buffer) {
            var count = this.buffer[uidF];
            if (count <= 0) { delete this.buffer[uidF]; continue; }
            var parts = _cpSplitUid(uidF);
            var extra = (this._host && typeof this._host.resolveExtra == "function")
                ? this._host.resolveExtra(uidF) : null;
            var remainder = this._host.insert
                ? this._host.insert({ id: parts.id, data: parts.data, count: count, extra: extra }, count)
                : 0;
            if (remainder <= 0) delete this.buffer[uidF];
            else this.buffer[uidF] = remainder;
        }
        return Object.keys(this.buffer).length === 0;
    };

    task.getProgress = function () {
        if (this.totalSteps === 0) return 0;
        return Math.floor(this.currentStep * 100 / this.totalSteps);
    };

    task.consumeFromBuffer = function (uid, count) {
        var available = this.buffer[uid] || 0;
        var take = Math.min(count, available);
        if (take > 0) {
            this.buffer[uid] -= take;
            if (this.buffer[uid] <= 0) delete this.buffer[uid];
        }
        return take;
    };

    task.addToBuffer = function (uid, count) {
        if (count <= 0) return;
        this.buffer[uid] = (this.buffer[uid] || 0) + count;
    };

    task.cacheExpectedOutputs = function (node, pattern) {
        var expected = {};
        for (var ri = 0; ri < pattern.result.length; ri++) {
            var res = pattern.result[ri];
            var uid = _cpUidOf(res);
            expected[uid] = (expected[uid] || 0) + node.quantity * (res.count || 1);
        }
        node.expectedByUid = expected;
        this.registerExpectedOutputs(node);
    };

    task.registerExpectedOutputs = function (node) {
        if (!node || node.__registered || !node.expectedByUid) return;
        node.__registered = true;
        var idx = this.nodes.indexOf(node);
        if (idx == -1) return;
        for (var uidE in node.expectedByUid) {
            if (!this.pendingOutputs[uidE]) this.pendingOutputs[uidE] = [];
            if (this.pendingOutputs[uidE].indexOf(idx) == -1) this.pendingOutputs[uidE].push(idx);
            if (this._host.registerExpectedOutput) this._host.registerExpectedOutput(uidE, this);
        }
    };

    task.unregisterExpectedOutputs = function (node) {
        if (!node || !node.__registered) return;
        node.__registered = false;
        var idx = this.nodes.indexOf(node);
        for (var uidU in node.expectedByUid) {
            var list = this.pendingOutputs[uidU];
            if (!list) continue;
            var li = list.indexOf(idx);
            if (li != -1) list.splice(li, 1);
            if (list.length === 0) {
                delete this.pendingOutputs[uidU];
                if (this._host.unregisterExpectedOutput) this._host.unregisterExpectedOutput(uidU, this);
            }
        }
    };

    task.outputsSatisfied = function (node) {
        if (!node.expectedByUid || node.remaining > 0) return false;
        for (var uidS in node.expectedByUid) {
            if ((node.receivedByUid[uidS] || 0) < node.expectedByUid[uidS]) return false;
        }
        return true;
    };

    task.onOutputArrived = function (uid, count) {
        if (!this.nodes || count <= 0) return 0;
        var consumed = 0;
        var list = this.pendingOutputs[uid];
        if (!list || list.length === 0) return 0;
        for (var li = 0; li < list.length && count > 0; li++) {
            var node = this.nodes[list[li]];
            if (!node || node.done || !node.expectedByUid) continue;
            var expected = node.expectedByUid[uid];
            if (!expected) continue;
            var received = node.receivedByUid[uid] || 0;
            if (received >= expected) continue;
            var take = Math.min(count, expected - received);
            node.receivedByUid[uid] = received + take;
            node.received = (node.received || 0) + take;
            count -= take;
            consumed += take;
            if (this.outputsSatisfied(node)) {
                node.done = true;
                this.unregisterExpectedOutputs(node);
                li--;
            }
        }
        return consumed;
    };

    return task;
};

/* ------------------------------------------------------------- serialize --- */

CraftTreeExecutor.serialize = function (task) {
    var out = {
        id: task.id,
        requestedUid: task.requestedUid,
        requestedCount: task.requestedCount,
        totalSteps: task.totalSteps,
        currentStep: task.currentStep || 0,
        ticks: task.ticks || 0,
        cancelled: task.cancelled === true,
        completingFlush: task.completingFlush === true,
        nodes: (task.nodes || []).map(function (n) {
            return {
                patternUid: n.patternUid,
                isProcessing: n.isProcessing || false,
                containerCoords: n.containerCoords,
                quantity: n.quantity,
                remaining: n.remaining,
                done: n.done,
                received: n.received || 0,
                expectedByUid: n.expectedByUid || null,
                receivedByUid: n.receivedByUid || {},
                requirements: n.requirements || []
            };
        }),
        buffer: task.buffer || {},
        toReserve: task.toReserve || {},
        results: task.results || [],
        crafts: (task.crafts || []).map(function (c) {
            return {
                craftable: c.craftable,
                result: c.result,
                count: c.count,
                allIngridients: c.allIngridients || [],
                oneCountIngridients: c.oneCountIngridients || [],
                completedIngridients: c.completedIngridients || [],
                isRoot: c.isRoot || false,
                craft: c.craft ? {
                    coordsId: c.craft.coordsId,
                    isProcessed: c.craft.isProcessed,
                    result: c.craft.result,
                    ingridients: c.craft.ingridients
                } : null
            };
        })
    };
    // Host clock passthrough. flatSteps/needCrafts are host-only fields.
    if (task.startTime != null) out.startTime = task.startTime;
    return out;
};

CraftTreeExecutor.restore = function (data, host) {
    var requestedItem = data.results && data.results[0]
        ? { id: data.results[0].id, data: data.results[0].data, extra: null }
        : { id: 0, data: 0, extra: null };
    var fakeFullCrafts = {
        results: data.results,
        crafts: data.crafts,
        plan: { nodes: data.nodes, toReserve: data.toReserve, toCraft: {}, toTake: {}, missing: {} }
    };
    var task = CraftTreeExecutor.createTask(fakeFullCrafts, host, requestedItem, data.requestedCount);
    task.id = data.id;
    task.totalSteps = data.totalSteps;
    task.currentStep = data.currentStep || 0;
    task.ticks = data.ticks || 0;
    if (data.startTime != null) task.startTime = data.startTime;
    task.buffer = data.buffer || {};
    task.toReserve = data.toReserve || {};
    task.cancelled = data.cancelled === true;
    task.completingFlush = data.completingFlush === true;
    if (task.cancelled) task.completingFlush = true;
    for (var ni = 0; ni < task.nodes.length; ni++) {
        if (data.nodes[ni]) {
            task.nodes[ni].remaining = data.nodes[ni].remaining;
            task.nodes[ni].done = data.nodes[ni].done;
            task.nodes[ni].received = data.nodes[ni].received || 0;
            task.nodes[ni].expectedByUid = data.nodes[ni].expectedByUid || null;
            task.nodes[ni].receivedByUid = data.nodes[ni].receivedByUid || {};
            if (data.nodes[ni].requirements) {
                for (var ri = 0; ri < data.nodes[ni].requirements.length; ri++) {
                    if (task.nodes[ni].requirements && task.nodes[ni].requirements[ri]) {
                        task.nodes[ni].requirements[ri].provided = data.nodes[ni].requirements[ri].provided || 0;
                    }
                }
            }
        }
        if (task.nodes[ni].expectedByUid && !task.nodes[ni].done) task.registerExpectedOutputs(task.nodes[ni]);
    }
    return task;
};

/* --------------------------------------------------------------- scheduler - */

/**
 * processTick(task, ctx) — scheduler core:
 * ctx: {
 *   ticks,                          // controller-owned tick counter
 *   getContainer(coordsId) → container | null,
 *   getInterval(container) → ticks  // max(1, speed)
 *   getBudget(container) → max crafts this tick,
 *   isChunkLoaded(coordsId) → bool,
 *   canTake(uid, count) → bool,     // storage check WITHOUT mutation
 *   take(uid, count) → remainder,   // storage commit
 *   insert(item, count) → remainder // optional; refund target on execute failure
 *        (when absent, refunds go to the task buffer)
 *   execute(task, node, container, pattern) → { failed: bool }
 * }
 * Returns the number of crafts executed.
 */
CraftTreeExecutor.scheduler = {
    /**
     * Default per-container craft budget from the interval: interval 1 → 5,
     * 10 → 1. The host can override per container via ctx.getBudget(container).
     * The budget is per node/entry by default (Java parity). A host that wants a
     * shared counter across entries can provide ctx.getBudgetKey(entry) → string.
     */
    getContainerBudget: function (interval) {
        return Math.max(1, Math.min(5, 1 + Math.floor((10 - Math.max(1, interval)) / 2)));
    },

    processTick: function (task, ctx) {
        if (task.completing) return 0;
        if (task.cancelled) {
            // Finalize a cancelled task once its buffer is flushed. Hooks are host-owned.
            if (task.completingFlush) {
                if (task._host && typeof task._host.insert == "function"
                    && task.flushBuffer && task.flushBuffer()) {
                    task.completingFlush = false;
                    task.completing = true;
                    CraftTreeExecutor.scheduler._releaseTask(task, ctx);
                    if (ctx.onTaskRemoved) ctx.onTaskRemoved(task);
                }
            } else {
                task.completing = true;
                CraftTreeExecutor.scheduler._releaseTask(task, ctx);
                if (ctx.onTaskRemoved) ctx.onTaskRemoved(task);
            }
            return 0;
        }
        task.ticks++;
        var executed = 0;
        var budgetUsed = null;
        var parallel = ctx.parallel !== false; // default parallel; ctx.parallel=false → serial
        for (var ni = 0; ni < task.nodes.length; ni++) {
            var node = task.nodes[ni];
            if (node.done) continue;
            if (node.remaining <= 0) {
                // Craft dispatched but machine outputs never arrived: bound the wait.
                if (!node.isProcessing) continue;
                if (node._outputsSince == null) node._outputsSince = ctx.ticks;
                else if (ctx.ticks - node._outputsSince >= _CP_FAIL_TIMEOUT * 5) {
                    CraftTreeExecutor.scheduler._cancel(task, ctx, "outputs");
                    return executed;
                }
                continue;
            }
            if (node._suspendSince != null && ctx.ticks - node._suspendSince >= _CP_FAIL_TIMEOUT * 5) {
                CraftTreeExecutor.scheduler._cancel(task, ctx, "suspend");
                return executed;
            }
            if (node._lastTry != null && ctx.ticks - node._lastTry < _CP_RETRY_THROTTLE) continue;

            // Pattern + containers together: a missing pattern OR no container
            // starts the missingSince countdown.
            var pattern = ctx.getPattern ? ctx.getPattern(node.patternUid) : null;
            var entries = ctx.getContainers ? ctx.getContainers(node.patternUid) : null;
            if (!entries) {
                var single = ctx.getContainer(node.containerCoords);
                entries = single ? [{ coordsId: node.containerCoords, container: single }] : [];
            }
            if (!pattern || entries.length === 0) {
                node._lastTry = ctx.ticks;
                if (node.missingSince == null) node.missingSince = ctx.ticks;
                else if (ctx.ticks - node.missingSince >= _CP_FAIL_TIMEOUT) {
                    CraftTreeExecutor.scheduler._cancel(task, ctx, "missing");
                    return executed;
                }
                continue;
            }
            node.missingSince = null;
            if (ctx.executeNode) {
                // --- host execution: ALL containers, budget burst per container.
                // The host performs allocation + commit + machine + node bookkeeping.
                var anyLoadedH = false, sawUnloadedH = false, anySuccess = false, needsThrottleH = false;
                for (var hi = 0; hi < entries.length; hi++) {
                    var hEntry = entries[hi];
                    if (!hEntry) continue;
                    if (!ctx.isChunkLoaded(hEntry.coordsId)) { sawUnloadedH = true; continue; }
                    if (!hEntry.container) continue;
                    anyLoadedH = true;
                    var hInterval = ctx.getInterval ? ctx.getInterval(hEntry.container) : 1;
                    if (task.ticks % hInterval !== 0) continue;
                    var hBudget = ctx.getBudget ? ctx.getBudget(hEntry.container)
                        : CraftTreeExecutor.scheduler.getContainerBudget(hInterval);
                    var hKey = ctx.getBudgetKey ? ctx.getBudgetKey(hEntry) : null;
                    if (hKey != null && !budgetUsed) budgetUsed = {};
                    for (var bi = hKey != null ? (budgetUsed[hKey] || 0) : 0; bi < hBudget; bi++) {
                        if (task.cancelled || node.done || node.remaining <= 0) break;
                        var hRes;
                        try {
                            hRes = ctx.executeNode(task, node, hEntry, ctx);
                        } catch (eEx) {
                            if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log("executeNode failed: " + eEx, "CraftTreeExecutor");
                            hRes = { failed: true };
                        }
                        if (!hRes || hRes.failed) { needsThrottleH = true; break; }
                        anySuccess = true;
                        executed++;
                        if (hKey != null) budgetUsed[hKey] = bi + 1;
                    }
                }
                if (anyLoadedH) node._suspendSince = null;
                else if (sawUnloadedH) {
                    if (node._suspendSince == null) node._suspendSince = ctx.ticks;
                    if (ctx.markIncomplete) ctx.markIncomplete();
                }
                if (!anySuccess && needsThrottleH) node._lastTry = ctx.ticks;
                if (!parallel) break; // serial: one node attempt per tick
            } else {
                var anyLoaded = false;
                var executedNode = false;
                var needsThrottle = false;
                for (var ci = 0; ci < entries.length && !executedNode; ci++) {
                    var entry = entries[ci];
                    if (!entry || !entry.container || !ctx.isChunkLoaded(entry.coordsId)) continue;
                    anyLoaded = true;
                    var interval = ctx.getInterval ? ctx.getInterval(entry.container) : 1;
                    if (task.ticks % interval !== 0) continue;
                    var budget = ctx.getBudget ? ctx.getBudget(entry.container)
                        : CraftTreeExecutor.scheduler.getContainerBudget(interval);
                    var cKey = ctx.getBudgetKey ? ctx.getBudgetKey(entry) : null;
                    var usedBudget = cKey != null ? (budgetUsed ? (budgetUsed[cKey] || 0) : 0) : 0;
                    if (usedBudget >= budget) continue;

                    var plan = CraftTreeExecutor.scheduler._planIngredients(task, node, pattern, ctx);
                    if (!plan.ok) { needsThrottle = true; continue; }

                    for (var pi = 0; pi < plan.take.length; pi++) {
                        var t = plan.take[pi];
                        if (t.fromBuffer > 0) task.consumeFromBuffer(t.uid, t.fromBuffer);
                        if (t.fromStorage > 0) {
                            ctx.take(t.uid, t.fromStorage);
                            // toReserve is consumed by the commit
                            if (task.toReserve && task.toReserve[t.uid]) {
                                task.toReserve[t.uid] -= t.fromStorage;
                                if (task.toReserve[t.uid] <= 0) delete task.toReserve[t.uid];
                            }
                        }
                    }
                    // Processed nodes must cache their expected outputs BEFORE execution so
                    // outputsSatisfied(node) can gate completion.
                    if (pattern.isProcessed && !node.expectedByUid && task.cacheExpectedOutputs) task.cacheExpectedOutputs(node, pattern);
                    var result;
                    try {
                        result = ctx.execute(task, node, entry.container, pattern, plan);
                    } catch (eEx2) {
                        if (typeof Logger != "undefined" && Logger && Logger.Log) Logger.Log("execute failed: " + eEx2, "CraftTreeExecutor");
                        result = { failed: true };
                    }
                    if (result && result.failed) {
                        for (var ri2 = 0; ri2 < plan.take.length; ri2++) {
                            var r = plan.take[ri2];
                            var backToBuffer = r.fromBuffer;
                            if (r.fromStorage > 0) {
                                if (ctx.insert) {
                                    var rparts = _cpSplitUid(r.uid);
                                    // Optional: recover the real extra for the refunded uid
                                    // (host-owned; same hook used by flushBuffer).
                                    var refundExtra = (task._host && typeof task._host.resolveExtra === "function")
                                        ? task._host.resolveExtra(r.uid) : null;
                                    backToBuffer += ctx.insert({ id: rparts.id, data: rparts.data, count: r.fromStorage, extra: refundExtra }, r.fromStorage);
                                } else {
                                    backToBuffer += r.fromStorage;
                                }
                            }
                            if (backToBuffer > 0) task.addToBuffer(r.uid, backToBuffer);
                        }
                        needsThrottle = true;
                        continue;
                    }
                    node.remaining--;
                    task.currentStep++;
                    executed++;
                    executedNode = true;
                    if (cKey != null) { if (!budgetUsed) budgetUsed = {}; budgetUsed[cKey] = usedBudget + 1; }
                    // Processed nodes complete only after their outputs arrived.
                    if (node.remaining <= 0 && (!pattern.isProcessed || task.outputsSatisfied(node))) {
                        node.done = true;
                        if (pattern.isProcessed && task.unregisterExpectedOutputs) task.unregisterExpectedOutputs(node);
                    }
                }
                if (!anyLoaded) {
                    if (node._suspendSince == null) node._suspendSince = ctx.ticks;
                    if (ctx.markIncomplete) ctx.markIncomplete();
                } else {
                    node._suspendSince = null;
                }
                if (!executedNode && needsThrottle) node._lastTry = ctx.ticks;
                if (!parallel && executedNode) break; // serial: at most one craft per tick
            }
        }
        // Completion lifecycle: all nodes done → flush buffer → release → notify.
        // Completion runs BEFORE the dirty notify (host removes the task on the hook).
        var allDone = true;
        for (var nd = 0; nd < task.nodes.length; nd++) {
            if (!task.nodes[nd].done) { allDone = false; break; }
        }
        if (allDone) CraftTreeExecutor.scheduler._completeTask(task, ctx);
        if (executed > 0) {
            if (ctx.onProgress) ctx.onProgress(task, executed);
            if (ctx.onMonitorDirty) ctx.onMonitorDirty(task);
            if (ctx.refreshOpenedGrids) ctx.refreshOpenedGrids();
        }
        return executed;
    },

    /**
     * Release a finished/cancelled task: drop reservations, unregister expected
     * outputs, notify monitor. The host owns the task lists (it removes the task
     * when onTaskComplete/onTaskRemoved fires).
     */
    _releaseTask: function (task, ctx) {
        if (ctx.removeScheduledCount) ctx.removeScheduledCount(task);
        if (ctx.unregisterTaskExpectedOutputs) ctx.unregisterTaskExpectedOutputs(task);
        if (ctx.onMonitorDirty) ctx.onMonitorDirty(task);
        if (ctx.refreshOpenedGrids) ctx.refreshOpenedGrids();
    },

    /**
     * Completion lifecycle: flush the buffer (retry next tick on failure via
     * completingFlush), mark completing, release, then fire onTaskComplete.
     * Returns false when the flush must be retried.
     */
    _completeTask: function (task, ctx) {
        if (task.flushBuffer && !task.flushBuffer(ctx)) {
            task.completingFlush = true;
            return false;
        }
        task.completingFlush = false;
        task.completing = true;
        CraftTreeExecutor.scheduler._releaseTask(task, ctx);
        if (ctx.onTaskComplete) ctx.onTaskComplete(task);
        return true;
    },

    /**
     * Mark a task cancelled (timeout/suspend/missing) and notify the host; the
     * actual flush + release happens on the next tick in the cancelled branch
     * of processTick.
     */
    _cancel: function (task, ctx, reason) {
        task.cancelled = true;
        task.completingFlush = true;
        if (ctx.onTaskCancelled) ctx.onTaskCancelled(task, reason);
        return task;
    },

    _planIngredients: function (task, node, pattern, ctx) {
        var neededMap = {};
        for (var ii = 0; ii < pattern.ingridients.length; ii++) {
            var ingr = pattern.ingridients[ii];
            if (!ingr || !ingr.id) continue;
            var uid = _cpUidOf(ingr);
            neededMap[uid] = (neededMap[uid] || 0) + (ingr.count || 1);
        }
        var altMap = {};
        for (var ri = 0; ri < node.requirements.length; ri++) {
            var rq = node.requirements[ri];
            var list = (rq.altUids && rq.altUids.length) ? rq.altUids : null;
            altMap[rq.uid] = list;
            if (list) {
                for (var ai = 0; ai < list.length; ai++) altMap[list[ai]] = list;
            }
        }
        var take = [];
        for (var uidN in neededMap) {
            var still = neededMap[uidN];
            var candidates = [uidN];
            var alts = altMap[uidN];
            if (alts) {
                for (var ai2 = 0; ai2 < alts.length; ai2++) {
                    if (alts[ai2] !== uidN) candidates.push(alts[ai2]);
                }
            }
            for (var ci = 0; ci < candidates.length && still > 0; ci++) {
                var cuid = candidates[ci];
                var fromBuffer = Math.min(still, task.buffer[cuid] || 0);
                if (fromBuffer > 0) {
                    still -= fromBuffer;
                    take.push({ uid: cuid, fromBuffer: fromBuffer, fromStorage: 0 });
                }
                if (still <= 0) break;
                var available = 0;
                if (typeof ctx.canTake == "function") {
                    available = ctx.canTake(cuid, still) ? still : 0;
                } else if (typeof ctx.getStored == "function") {
                    var stored = ctx.getStored(cuid);
                    if (stored > 0) available = Math.min(still, stored);
                }
                if (available > 0) {
                    still -= available;
                    take.push({ uid: cuid, fromBuffer: 0, fromStorage: available });
                }
            }
            if (still > 0) return { ok: false, take: take };
        }
        return { ok: true, take: take };
    }
};

/* ----------------------------------------------------- pattern containers -- */

/**
 * PatternContainer registry + contract: the PRODUCER side of autocrafting —
 * tiles exposing pattern containers register here; task/scheduler (and the
 * host's plan builder) are the consumer. Network filtering stays in the host via scan()'s filterFn — the
 * registry itself is network-agnostic.
 */
CraftTreeExecutor.PatternContainers = {
    entries: {},
    coordsIndex: {},

    reset: function () {
        this.entries = {};
        this.coordsIndex = {};
    },

    _coordsKey: function (dimension, coordsId) {
        if (typeof CoreKit != "undefined" && CoreKit && CoreKit.coords && CoreKit.coords.key) {
            return CoreKit.coords.key(dimension, coordsId);
        }
        return dimension + ':' + coordsId;
    },

    /**
     * Register a pattern container for a tile (contract: container.getPatterns()
     * → array of raw patterns). Returns false when the container does not
     * implement getPatterns.
     */
    register: function (tile, container) {
        if (!tile || !container || typeof container.getPatterns !== 'function') return false;
        var dimension = tile.dimension !== undefined ? tile.dimension : null;
        var coordsId = CoreKit.coords.cts(tile);
        var key = this._coordsKey(dimension, coordsId);
        this.entries[key] = {
            containerId: container.containerId || 'unknown',
            coordsId: coordsId,
            coords: { x: tile.x, y: tile.y, z: tile.z },
            dimension: dimension,
            container: container
        };
        this.coordsIndex[this._coordsKey(dimension, coordsId)] = key;
        return true;
    },

    unregister: function (tile) {
        if (!tile) return false;
        var dimension = tile.dimension !== undefined ? tile.dimension : null;
        var coordsId = CoreKit.coords.cts(tile);
        var key = this._coordsKey(dimension, coordsId);
        if (this.entries[key]) {
            delete this.entries[key];
            if (this.coordsIndex[key] === key) delete this.coordsIndex[key];
            return true;
        }
        return false;
    },

    /** Container of a tile, or null. */
    get: function (tile) {
        if (!tile) return null;
        var dimension = tile.dimension !== undefined ? tile.dimension : null;
        var entry = this.entries[this._coordsKey(dimension, CoreKit.coords.cts(tile))];
        return entry ? entry.container : null;
    },

    /** Container by coords + dimension, or null. */
    getByCoords: function (coords, dimension) {
        if (!coords) return null;
        var key = this.coordsIndex[this._coordsKey(dimension !== undefined ? dimension : null, CoreKit.coords.cts(coords))];
        var entry = key ? this.entries[key] : null;
        return entry ? entry.container : null;
    },

    /**
     * Live scan: iterates the registry, skips other dimensions and unloaded
     * chunks, collects dead tiles for cleanup, and passes surviving tiles through
     * filterFn(tile, entry) → boolean (the host filters by its own network
     * identity). Returns [{ container, containerId, coordsId, coords, tile }].
     */
    scan: function (blockSource, dimension, filterFn) {
        var out = [];
        var deadKeys = [];
        for (var key in this.entries) {
            var entry = this.entries[key];
            if (!entry) continue;
            if (dimension !== undefined && dimension !== null && entry.dimension !== dimension) continue;
            if (blockSource && CoreKit.Engine.safeIsChunkLoadedAt(blockSource, entry.coords.x, entry.coords.y, entry.coords.z) === false) continue;
            var tile = World.getTileEntity(entry.coords.x, entry.coords.y, entry.coords.z, blockSource);
            if (!tile || !tile.data) {
                deadKeys.push(key);
                continue;
            }
            if (typeof filterFn == "function" && !filterFn(tile, entry)) continue;
            out.push({ container: entry.container, containerId: entry.containerId, coordsId: entry.coordsId, coords: entry.coords, tile: tile });
        }
        for (var dk = 0; dk < deadKeys.length; dk++) {
            var deadEntry = this.entries[deadKeys[dk]];
            if (deadEntry) {
                var deadCoords = this._coordsKey(deadEntry.dimension, deadEntry.coords.x + ',' + deadEntry.coords.y + ',' + deadEntry.coords.z);
                if (this.coordsIndex[deadCoords] === deadKeys[dk]) delete this.coordsIndex[deadCoords];
            }
            delete this.entries[deadKeys[dk]];
        }
        return out;
    },

    /**
     * Normalize a raw pattern into the CraftTreeExecutor pattern shape
     * { id, isProcessed, oredictEnabled, ingridients: [{id,data,count}],
     *   result: [{id,data,count}] }.
     * Returns null for invalid patterns (no valid result items).
     */
    validatePattern: function (pattern) {
        if (!pattern || typeof pattern !== 'object') return null;
        var rawOut = pattern.result;
        if (!Array.isArray(rawOut) && rawOut && typeof rawOut === 'object') {
            var mapped = [];
            for (var mUid in rawOut) mapped.push(rawOut[mUid]);
            rawOut = mapped;
        }
        if (!Array.isArray(rawOut)) return null;
        var result = [];
        for (var ri = 0; ri < rawOut.length; ri++) {
            var r = rawOut[ri];
            if (!r || r.id == 0) continue;
            result.push({ id: r.id, data: r.data || 0, count: r.count || 1 });
        }
        if (result.length === 0) return null;
        var rawIn = pattern.ingridients;
        if (!Array.isArray(rawIn)) rawIn = [];
        var ingridients = [];
        for (var ii = 0; ii < rawIn.length; ii++) {
            var ing = rawIn[ii];
            if (!ing || ing.id == 0) continue;
            ingridients.push({ id: ing.id, data: ing.data || 0, count: ing.count || 1 });
        }
        return {
            id: pattern.patternId || pattern.id || ('p_' + result[0].id + '_' + result[0].data),
            isProcessed: !!pattern.isProcessed,
            oredictEnabled: !!pattern.oredictEnabled,
            ingridients: ingridients,
            result: result
        };
    }
};

EXPORT("CraftTreeExecutor", CraftTreeExecutor);
