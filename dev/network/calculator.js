var CraftingCalculator = {

	calculate: function(item, quantity, info, config) {
		config = config || {};
		var timeout = config.timeout || Config.craftingCalculationTimeout || 5000;
		var startTime = Date.now();

		if (item.data === -1 && info.craftsIDS[item.id]) {
			item = copyItem(item);
			item.data = info.craftsIDS[item.id][0];
		}
		var itemUid = item.id + '_' + item.data;
		Logger.Log('[CALC] Request: ' + Item.getName(item.id, item.data) + ' x' + quantity + ' uid=' + itemUid, 'RS_DEBUG');
		if (!info.crafts[itemUid]) {
			return { craftable: false, errorType: "NO_PATTERN" };
		}

		var storageCopy = {};
		for (var i = 0; i < info.items.length; i++) {
			storageCopy[info.items_map[i]] = info.items[i].count;
		}
		Logger.Log('[CALC] Snapshot: ' + info.items.length + ' types storage=' + info.storage + ' stored=' + info.stored + ' copyKeys=' + Object.keys(storageCopy).length, 'RS_DEBUG');

		var visited = {};
		var plan = {
			nodes: [],
			toReserve: {},
			toCraft: {},
			toTake: {},
			missing: {}
		};

		var rootPatterns = info.crafts[itemUid];
		var baseCount = rootPatterns[0] && rootPatterns[0].result && rootPatterns[0].result[0]
			? rootPatterns[0].result[0].count : 1;
		var multiplier = quantity > baseCount ? Math.ceil(quantity / baseCount) : undefined;
		Logger.Log('[CALC] Pattern: ' + itemUid + ' variants=' + rootPatterns.length + ' baseCount=' + baseCount + ' multiplier=' + (multiplier || 1), 'RS_DEBUG');

		var error = null;
		try {
			this._calculateInternal(
				itemUid, multiplier, storageCopy, info, visited, startTime, timeout, plan
			);
		} catch (e) {
			return {
				craftable: false,
				errorType: e.errorType || "TOO_COMPLEX",
				errorPattern: e.errorPattern || null,
				plan: plan
			};
		}

		var hasMissing = false;
		for (var k in plan.missing) { hasMissing = true; break; }

		if (hasMissing) {
			return {
				craftable: false,
				errorType: "MISSING",
				plan: plan,
				results: [],
				ingridients: [],
				crafts: []
			};
		}

		var fullCrafts = this._buildFullCrafts(item, itemUid, quantity, baseCount, multiplier, info, plan);

		fullCrafts.craftable = true;
		fullCrafts.toReserveItems = plan.toReserve;
		fullCrafts.plan = plan;
		Logger.Log('[CALC] Result: craftable=true nodes=' + plan.nodes.length + ' toReserve=' + Object.keys(plan.toReserve).length + ' toCraft=' + Object.keys(plan.toCraft).length + ' missing=' + Object.keys(plan.missing).length, 'RS_DEBUG');

		return fullCrafts;
	},

	_calculateInternal: function(patternUid, multiplier, storageCopy, info, visited, startTime, timeout, plan) {
		if (Date.now() - startTime > timeout) {
			throw { errorType: "TOO_COMPLEX" };
		}

		if (visited[patternUid]) {
			throw { errorType: "RECURSIVE", errorPattern: patternUid };
		}
		visited[patternUid] = true;

		var patterns = info.crafts[patternUid];
		if (!patterns || patterns.length === 0) return;

		var pattern = patterns[0];
		var m = multiplier || 1;

		var node = {
			patternUid: patternUid,
			isProcessing: pattern.isProcessed || false,
			containerCoords: pattern.coordsId,
			quantity: m,
			requirements: []
		};

		for (var ii = 0; ii < pattern.ingridients.length; ii++) {
			var ingr = pattern.ingridients[ii];
			if (!ingr || !ingr.id) continue;

			var ingUid = getItemUid(ingr);
			var needed = ingr.count * m;
			Logger.Log('[CALC] Ingredient: ' + ingUid + ' needed=' + needed + ' inStorage=' + (storageCopy[ingUid] || 0) + ' pattern=' + patternUid + ' depth=' + Object.keys(visited).length, 'RS_DEBUG');

			var fromStorage = storageCopy[ingUid] || 0;
			if (fromStorage > 0) {
				var take = Math.min(needed, fromStorage);
				storageCopy[ingUid] -= take;
				plan.toReserve[ingUid] = (plan.toReserve[ingUid] || 0) + take;
				plan.toTake[ingUid] = (plan.toTake[ingUid] || 0) + take;
				needed -= take;
			}

			while (needed > 0) {
				if (info.crafts[ingUid]) {
					var subPattern = info.crafts[ingUid][0];
					var subBase = subPattern.result && subPattern.result[0] ? subPattern.result[0].count : 1;
					var subQty = Math.ceil(needed / subBase);
					var subMultiplier = subQty > subBase ? Math.ceil(subQty / subBase) : undefined;

					this._calculateInternal(
						ingUid, subMultiplier, storageCopy, info, visited, startTime, timeout, plan
					);

					plan.toCraft[ingUid] = (plan.toCraft[ingUid] || 0) + subQty * subBase;

					var produced = storageCopy[ingUid] || 0;
					if (produced > 0) {
						var take2 = Math.min(needed, produced);
						storageCopy[ingUid] -= take2;
						needed -= take2;
					}

					if (needed <= 0) {
						node.requirements.push({ uid: ingUid, count: ingr.count * m, altUids: [] });
						break;
					}
				}

				var altUids = this._getAlternativeUids(ingr, info);
				var foundAlt = false;
				for (var ai = 0; ai < altUids.length; ai++) {
					var altCount = storageCopy[altUids[ai]] || 0;
					if (altCount > 0) {
						var take3 = Math.min(needed, altCount);
						storageCopy[altUids[ai]] -= take3;
						plan.toReserve[altUids[ai]] = (plan.toReserve[altUids[ai]] || 0) + take3;
						plan.toTake[altUids[ai]] = (plan.toTake[altUids[ai]] || 0) + take3;
						needed -= take3;
						foundAlt = true;
						node.requirements.push({ uid: altUids[ai], count: take3, altUids: altUids });
					}
					if (needed <= 0) break;
				}

				if (!foundAlt && needed > 0) {
					if (altUids.length > 0) {
						plan.missing[altUids[0]] = (plan.missing[altUids[0]] || 0) + needed;
					} else {
						plan.missing[ingUid] = (plan.missing[ingUid] || 0) + needed;
					}
					needed = 0;
				}
			}
		}

		for (var ri = 0; ri < pattern.result.length; ri++) {
			var result = pattern.result[ri];
			var resultUid = result.id + '_' + result.data;
			var produced = result.count * m;
			storageCopy[resultUid] = (storageCopy[resultUid] || 0) + produced;
		}

		plan.nodes.push(node);
		delete visited[patternUid];
	},

	_getAlternativeUids: function(ingr, info) {
		var uids = [];
		var datas = info.just_items_map[ingr.id];
		if (!datas || datas.length <= 1) return uids;
		for (var di = 0; di < datas.length; di++) {
			if (datas[di] !== ingr.data) {
				uids.push(ingr.id + '_' + datas[di]);
			}
		}
		return uids;
	},

	_buildFullCrafts: function(item, itemUid, quantity, baseCount, multiplier, info, plan) {
		var m = multiplier || 1;
		var pattern = info.crafts[itemUid][0];

		var allIngridients = [];
		var toTakeMap = {};
		for (var uid in plan.toTake) {
			var parts = uid.split('_');
			allIngridients.push({ id: parseInt(parts[0]), data: parseInt(parts[1]), count: plan.toTake[uid] });
		}

		var results = [];
		for (var ri = 0; ri < pattern.result.length; ri++) {
			var r = pattern.result[ri];
			if (r.id == item.id && (r.data == item.data || r.data == -1)) {
				results.push({ id: r.id, data: r.data, count: quantity, extra: null });
			}
		}
		if (results.length === 0 && pattern.result[0]) {
			results.push({ id: pattern.result[0].id, data: pattern.result[0].data, count: quantity, extra: null });
		}

		var crafts = [];
		for (var ni = 0; ni < plan.nodes.length; ni++) {
			var node = plan.nodes[ni];
			var nodePattern = info.crafts[node.patternUid][0];
			var oneCountIngridients = [];
			var combinedMap = {};
			for (var ii = 0; ii < nodePattern.ingridients.length; ii++) {
				var ingr = nodePattern.ingridients[ii];
				if (!ingr || !ingr.id) continue;
				oneCountIngridients.push(copyItem(ingr));
				var uid = getItemUid(ingr);
				if (combinedMap[uid]) {
					combinedMap[uid].count += ingr.count;
				} else {
					combinedMap[uid] = copyItem(ingr);
				}
			}
			var completedIngridients = [];
			for (var uid in combinedMap) {
				var c = combinedMap[uid];
				c.count *= node.quantity;
				completedIngridients.push(c);
			}
			var resultItem = nodePattern.result[0] ? copyItem(nodePattern.result[0]) : { id: 0, data: 0, count: 0 };
			resultItem.count *= node.quantity;

			crafts.push({
				craftable: true,
				result: resultItem,
				count: node.quantity,
				allIngridients: oneCountIngridients,
				oneCountIngridients: oneCountIngridients,
				completedIngridients: completedIngridients,
				craft: nodePattern,
				needCrafts: [],
				isRoot: (node.patternUid === itemUid)
			});
		}

		return {
			craftable: true,
			withoutMachine: false,
			results: results,
			ingridients: allIngridients,
			crafts: crafts,
			currentCrafts: [],
			providedCrafts: [],
			completedCrafts: [],
			withoutMachineChecked: {},
			taked: {},
			toReserveItems: plan.toReserve,
			plan: plan
		};
	}
};
