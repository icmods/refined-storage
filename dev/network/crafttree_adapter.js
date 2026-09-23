// Maps the RS world view onto the host-neutral CraftTreePlanner.

/* Identity keys are pure (id,data) -> "id:data:" strings; memoize them so planning
 * never recomputes the same key (cookies: deterministic, no invalidation needed). */
var _ceKeyCache = Object.create(null);

function _ceKey(id, data) {
	var k = id + ":" + data;
	var v = _ceKeyCache[k];
	if (v === undefined) v = _ceKeyCache[k] = CoreKit.Items.uidOf({ id: id, data: data, extra: null });
	return v;
}

var _ceParseCache = Object.create(null);

/* parseUid results are read-only in this file; memoize by uid string. */
function _ceParseUid(uid) {
	uid = String(uid);
	var v = _ceParseCache[uid];
	if (v === undefined) v = _ceParseCache[uid] = CoreKit.Items.parseUid(uid);
	return v;
}

/* Optional: clear the identity memo (tests/benchmarks; keys are deterministic). */
function _ceResetIdentityCache() {
	_ceKeyCache = Object.create(null);
	_ceParseCache = Object.create(null);
}

function _ceAdapterOutputs(pattern) {
	var outs = [];
	for (var i = 0; i < pattern.result.length; i++) {
		var r = pattern.result[i];
		outs.push({ key: r.uid || _ceKey(r.id, r.data), amount: r.count || 1 });
	}
	return outs;
}

function _ceAdapterAltUids(world, ingr) {
	var uids = [];
	var datas = world.altDatas && world.altDatas[ingr.id];
	if (!datas || !datas.length) return uids;
	if (ingr.data == -1) {
		for (var i = 0; i < datas.length; i++) uids.push(_ceKey(ingr.id, datas[i]));
		return uids;
	}
	if (datas.length <= 1) return uids;
	for (var j = 0; j < datas.length; j++) {
		if (datas[j] !== ingr.data) uids.push(_ceKey(ingr.id, datas[j]));
	}
	return uids;
}

function _ceAdapterCandidates(world, ingr) {
	// Remap a wildcard ingredient (data == -1) to its first concrete craftable data.
	var craftUid = ingr.uid || _ceKey(ingr.id, ingr.data);
	if (!world.crafts[craftUid] && ingr.data == -1 && world.craftsIDS[ingr.id]) {
		for (var i = 0; i < world.craftsIDS[ingr.id].length; i++) {
			var cand = _ceKey(ingr.id, world.craftsIDS[ingr.id][i]);
			if (world.crafts[cand]) { craftUid = cand; break; }
		}
	}
	var candidates = [{ key: craftUid, amount: ingr.count || 1, autocraftable: true }];
	var alts = _ceAdapterAltUids(world, ingr);
	for (var a = 0; a < alts.length; a++) {
		if (alts[a] === craftUid) continue; // wildcard primary may reappear in altDatas
		candidates.push({ key: alts[a], amount: ingr.count, autocraftable: false });
	}
	return candidates;
}

function _ceAdapterPickedPattern(world, uid) {
	var patterns = world.crafts[uid];
	if (!patterns || !patterns.length) return null;
	var parsed = _ceParseUid(uid);
	var wantId = parsed.id;
	var wantData = parsed.data;
	for (var pi = 0; pi < patterns.length; pi++) {
		var res = patterns[pi].result || [];
		for (var ri = 0; ri < res.length; ri++) {
			if (res[ri].id == wantId && res[ri].data == wantData) return patterns[pi];
		}
	}
	return patterns[0];
}

function _ceAdapterRecipe(world, uid) {
	var patterns = world.crafts[uid];
	if (!patterns || !patterns.length) return null;
	var pattern = _ceAdapterPickedPattern(world, uid);
	var inputs = [];
	var ingrs = pattern.ingridients || [];
	for (var i = 0; i < ingrs.length; i++) {
		var ingr = ingrs[i];
		if (!ingr || !ingr.id) continue;
		/* Reusable workbench tools are resolved by the executor on any damage; they
		 * are not planned/reserved per craft (a single tool covers many crafts). */
		if (pattern.toolIds && pattern.toolIds[ingr.id]) continue;
		inputs.push({ candidates: _ceAdapterCandidates(world, ingr) });
	}
	return {
		id: uid,
		isProcessing: !!pattern.isProcessed,
		hostRef: pattern,
		outputs: _ceAdapterOutputs(pattern),
		inputs: inputs
	};
}

function _ceAdapterAltUidsFor(world, uid) {
	var parsed = _ceParseUid(uid);
	var id = parsed.id;
	var data = parsed.data;
	var out = [];
	var datas = world.altDatas && world.altDatas[id];
	if (!datas) return out;
	for (var i = 0; i < datas.length; i++) {
		if (datas[i] !== data) out.push(_ceKey(id, datas[i]));
	}
	return out;
}

// Requirements from the ENGINE plan: the uids actually consumed by this node
// (primary or substitute), not the static pattern's full primary+alternatives list.
function _ceAdapterRequirementsFromPlan(world, node) {
	var reqs = [];
	if (!node || !node.inputs || !node.inputs.length) return reqs;
	var byUid = {};
	var order = [];
	for (var i = 0; i < node.inputs.length; i++) {
		var inp = node.inputs[i];
		if (!inp || !inp.key) continue;
		if (byUid[inp.key] === undefined) { byUid[inp.key] = inp.amount; order.push(inp.key); }
		else byUid[inp.key] += inp.amount;
	}
	for (var u = 0; u < order.length; u++) {
		reqs.push({ uid: order[u], count: byUid[order[u]], altUids: _ceAdapterAltUidsFor(world, order[u]) });
	}
	return reqs;
}

function _ceAdapterCopyItem(item) {
	return { id: item.id, data: item.data, count: item.count || 1, extra: null };
}

/* Encoded damage of a tool in the pattern (fallback for the missing-tool row). */
function _ceAdapterToolEncodedData(crafts, id) {
	for (var i = 0; i < crafts.length; i++) {
		var p = crafts[i].craft;
		if (!p || !p.ingridients) continue;
		for (var k = 0; k < p.ingridients.length; k++) {
			var ing = p.ingridients[k];
			if (ing && String(ing.id) === String(id)) return ing.data > -1 ? ing.data : 0;
		}
	}
	return 0;
}

// PlanResult -> RS fullCrafts (the shape consumed by CraftingTask / CraftTreeExecutor.createTask).
function buildCraftTreePlannerResult(world, item, quantity, pr) {
	var plan = {
		nodes: [],
		toReserve: {},
		toCraft: {},
		toTake: {},
		missing: {}
	};
	var u;
	for (u in pr.toTake) if (Object.prototype.hasOwnProperty.call(pr.toTake, u) && pr.toTake[u] > 0) plan.toTake[u] = pr.toTake[u];
	for (u in pr.toTake) if (Object.prototype.hasOwnProperty.call(pr.toTake, u) && pr.toTake[u] > 0) plan.toReserve[u] = pr.toTake[u];
	for (u in pr.toCraft) if (Object.prototype.hasOwnProperty.call(pr.toCraft, u)) plan.toCraft[u] = pr.toCraft[u];
	for (u in pr.missing) if (Object.prototype.hasOwnProperty.call(pr.missing, u)) plan.missing[u] = pr.missing[u];

	var allIngridients = [];
	for (var tu in plan.toTake) {
		var tp = _ceParseUid(tu);
		allIngridients.push({ id: tp.id, data: tp.data, count: plan.toTake[tu] });
	}

	var rootUid = _ceKey(item.id, item.data);
	var rootPattern = _ceAdapterPickedPattern(world, rootUid);
	var results = [];
	if (rootPattern) {
		for (var ri = 0; ri < rootPattern.result.length; ri++) {
			var r = rootPattern.result[ri];
			if (r.id == item.id && (r.data == item.data || r.data == -1)) {
				results.push({ id: r.id, data: r.data == -1 ? item.data : r.data, count: quantity, extra: null });
			}
		}
		if (results.length === 0 && rootPattern.result[0]) {
			results.push({ id: rootPattern.result[0].id, data: rootPattern.result[0].data, count: quantity, extra: null });
		}
	}

	var crafts = [];
	var nodesValid = true;
	// Java parity (NodeList = one node per pattern): merge repeated visits of the
	// same pattern into ONE plan node with the summed quantity. Execution treats
	// quantity as remaining crafts, so this only reduces bookkeeping/scan work.
	var mergedByKey = {};
	var nodeOrder = [];
	for (var ni = 0; ni < pr.nodes.length; ni++) {
		var node = pr.nodes[ni];
		var nodePattern = node.hostRef || _ceAdapterPickedPattern(world, node.recipeId);
		if (!nodePattern || !(node.quantity > 0)) nodesValid = false;
		var patternUid = nodePattern ? rsPatternKey(nodePattern, node.recipeId) : node.recipeId;
		var merged = nodePattern ? mergedByKey[patternUid] : null;
		if (merged) {
			// requirements are PER-CRAFT templates (the executor scales by remaining);
			// same pattern → identical template, so keep the first.
			merged.quantity += node.quantity;
		} else {
			merged = {
				patternUid: patternUid,
				isProcessing: node.isProcessing,
				containerCoords: nodePattern ? nodePattern.coordsId : null,
				quantity: node.quantity,
				requirements: _ceAdapterRequirementsFromPlan(world, node)
			};
			nodeOrder.push(merged);
			if (nodePattern) mergedByKey[patternUid] = merged;
		}

		var oneCount = [];
		var combined = {};
		var ingrs = nodePattern ? (nodePattern.ingridients || []) : [];
		for (var ii = 0; ii < ingrs.length; ii++) {
			var ingr = ingrs[ii];
			if (!ingr || !ingr.id) continue;
			oneCount.push(_ceAdapterCopyItem(ingr));
			var iu = ingr.uid || _ceKey(ingr.id, ingr.data);
			if (combined[iu]) combined[iu].count += ingr.count;
			else combined[iu] = _ceAdapterCopyItem(ingr);
		}
		var completed = [];
		for (var cu in combined) {
			if (Object.prototype.hasOwnProperty.call(combined, cu)) {
				var c = combined[cu];
				c.count *= node.quantity;
				completed.push(c);
			}
		}
		var resultItem = nodePattern && nodePattern.result[0]
			? { id: nodePattern.result[0].id, data: nodePattern.result[0].data, count: nodePattern.result[0].count * node.quantity, extra: null }
			: { id: 0, data: 0, count: 0, extra: null };

		crafts.push({
			craftable: true,
			result: resultItem,
			count: node.quantity,
			allIngridients: oneCount,
			oneCountIngridients: oneCount,
			completedIngridients: completed,
			craft: nodePattern,
			isRoot: node.recipeId === rootUid
		});
	}
	for (var oi = 0; oi < nodeOrder.length; oi++) {
		var mergedNode = nodeOrder[oi];
		plan.nodes.push({
			patternUid: mergedNode.patternUid,
			isProcessing: mergedNode.isProcessing,
			containerCoords: mergedNode.containerCoords,
			quantity: mergedNode.quantity,
			requirements: mergedNode.requirements
		});
	}

	// Final validation: a plan is craftable only when the engine succeeded AND the
	// produced plan actually covers the request (missing empty, results matching,
	// positive quantities, every node with a pattern).
	var valid = !!pr.ok;
	var invalidReason = null;
	if (valid) {
		for (var mv in pr.missing) {
			if (Object.prototype.hasOwnProperty.call(pr.missing, mv)) { valid = false; invalidReason = "MISSING"; break; }
		}
	}
	if (valid && !results.length) { valid = false; invalidReason = "INVALID_PLAN"; }
	if (valid && results.length && (results[0].id != item.id || (item.data != -1 && results[0].data != item.data))) {
		valid = false; invalidReason = "INVALID_PLAN";
	}
	if (valid && !nodesValid) { valid = false; invalidReason = "INVALID_PLAN"; }
	/* Workbench tools are reusable: show them in the preview/plan once per tool id
	 * (not per craft) and require a single any-damage variant. The executor resolves
	 * the concrete damage, wears it and returns it (it may break at max damage). */
	var toolDemand = {};
	for (var cv = 0; cv < crafts.length; cv++) {
		var cpat = crafts[cv].craft;
		if (!cpat || !cpat.toolIds) continue;
		for (var tid2 in cpat.toolIds) toolDemand[tid2] = true;
	}
	for (var tid3 in toolDemand) {
		var tds = world.altDatas ? world.altDatas[tid3] : null;
		if (tds && tds.length) {
			var toolUid = _ceKey(parseInt(tid3, 10), tds[0]);
			plan.toTake[toolUid] = (plan.toTake[toolUid] || 0) + 1;
			plan.toReserve[toolUid] = (plan.toReserve[toolUid] || 0) + 1;
		} else {
			var missingUid = _ceKey(parseInt(tid3, 10), _ceAdapterToolEncodedData(crafts, tid3));
			plan.missing[missingUid] = (plan.missing[missingUid] || 0) + 1;
			valid = false; invalidReason = "MISSING";
		}
	}
	if (valid) {
		for (var rv in plan.toReserve) {
			if (Object.prototype.hasOwnProperty.call(plan.toReserve, rv) && !(plan.toReserve[rv] > 0)) {
				valid = false; invalidReason = "INVALID_PLAN"; break;
			}
		}
	}

	var fullCrafts = {
		craftable: valid,
		withoutMachine: false,
		results: results,
		ingridients: allIngridients,
		crafts: crafts,
		toReserveItems: plan.toReserve,
		plan: plan
	};

	if (!valid) {
		// Map the engine vocabulary onto the RS one: no recipe -> NO_PATTERN,
		// deadline exhaustion -> TOO_COMPLEX (RS never used a separate TIMEOUT).
		fullCrafts.errorType = pr.errorType === "NO_RECIPE" ? "NO_PATTERN"
			: (pr.errorType === "TIMEOUT" ? "TOO_COMPLEX" : (pr.errorType || invalidReason || "INVALID_PLAN"));
		if (typeof Config != 'undefined' && Config.dev && typeof Logger != 'undefined' && Logger) {
			try {
				Logger.Log('[CE] invalid plan type=' + (pr.errorType || 'none') + ' reason=' + invalidReason
					+ ' item=' + item.id + '_' + item.data
					+ ' root=' + rootUid + (rootPattern ? ' found' : ' missing')
					+ ' results0=' + (results.length ? results[0].id + '_' + results[0].data + 'x' + results[0].count : 'none')
					+ ' nodes=' + pr.nodes.length + ' planNodes=' + plan.nodes.length
					+ ' toReserve=' + JSON.stringify(plan.toReserve)
					+ ' missing=' + JSON.stringify(pr.missing), 'RefinedStorageDebug');
			} catch (e) {}
		}
		if (pr.errorRecipe) fullCrafts.errorPattern = pr.errorRecipe;
	}
	return fullCrafts;
}

function buildCraftTreePlannerCtx(world, timeout) {
	var initial = [];
	for (var uid in world.storage) {
		if (Object.prototype.hasOwnProperty.call(world.storage, uid)) {
			initial.push({ key: uid, amount: world.storage[uid] });
		}
	}
	return {
		recipesFor: function (key) {
			var r = _ceAdapterRecipe(world, key);
			return r ? [r] : [];
		},
		inventory: CraftTreePlanner.createInventory({
			initial: initial,
			keyString: function (key) { return key; }
		}),
		identityOf: function (recipe) { return recipe.id; },
		keyString: function (key) { return key; },
		limits: timeout ? { deadline: Date.now() + timeout } : null
	};
}
