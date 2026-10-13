// Server-side disk index: UUID <-> numericId. The item keeps only the UUID
// ($rs.disk in the extra); the numeric id stays a passive mirror in item.data.
// Records are derived from the disk array; nothing here persists on its own.
var DiskRegistry = {
	byUuid: {},
	byNumeric: {},
	nextNumericId: 1,

	reset: function () {
		this.byUuid = {};
		this.byNumeric = {};
		this.nextNumericId = 1;
	},

	uuidOf: function (item) {
		var extra = item && item.extra;
		if (!extra) return "";
		try {
			if (typeof extra.getString == 'function') {
				return extra.getString('$rs.disk') || extra.getString('rsDiskUuid') || "";
			}
			if (extra.rsDiskUuid) return String(extra.rsDiskUuid);
		} catch (e) {}
		return "";
	},

	stamp: function (item, uuid) {
		if (!item) return false;
		if (!item.extra) return false;
		try {
			if (typeof item.extra.putString == 'function') {
				item.extra.putString('$rs.disk', uuid);
				return true;
			}
			item.extra.rsDiskUuid = uuid;
			return true;
		} catch (e) {
			return false;
		}
	},

	allocateUuid: function () {
		var rnd = Math.floor(Math.random() * 0x100000000).toString(16);
		var time = Date.now().toString(16);
		return "rsd-" + time + "-" + rnd;
	},

	allocateNumericId: function () {
		return this.nextNumericId++;
	},

	// Binds an anchor pair. UUID wins on conflict; reports it instead of hiding it.
	bind: function (uuid, numericId) {
		if (!uuid || !numericId) return { ok: false, reason: "missing-anchor" };
		var byUuid = this.byUuid[uuid];
		var byNumeric = this.byNumeric[numericId];
		if (byUuid && byUuid.numericId !== numericId) {
			return { ok: false, reason: "uuid-conflict", uuid: uuid, numericId: numericId, existing: byUuid.numericId };
		}
		if (byNumeric && byNumeric.uuid !== uuid) {
			return { ok: false, reason: "numeric-conflict", uuid: uuid, numericId: numericId, existing: byNumeric.uuid };
		}
		if (!byUuid) {
			var record = { uuid: uuid, numericId: numericId };
			this.byUuid[uuid] = record;
			this.byNumeric[numericId] = record;
		}
		return { ok: true, uuid: uuid, numericId: numericId };
	},

	// Rebuild the index from the live disk array (array position = numericId).
	rebuild: function (diskData) {
		this.byUuid = {};
		this.byNumeric = {};
		var maxNumeric = 0;
		for (var i = 0; i < (diskData || []).length; i++) {
			if (!diskData[i]) continue;
			if (i > maxNumeric) maxNumeric = i;
			if (diskData[i].uuid) this.bind(diskData[i].uuid, i);
		}
		this.nextNumericId = maxNumeric + 1;
		return this.nextNumericId;
	},

	// Anchor repair for a disk item met in a drive. Only anchor fields are
	// touched; missing pairs are created, conflicts prefer the UUID.
	repairAnchors: function (item) {
		var uuid = this.uuidOf(item);
		var numericId = item && item.data ? item.data : 0;
		if (uuid && numericId) {
			var bound = this.bind(uuid, numericId);
			if (!bound.ok) {
				var record = this.byUuid[uuid];
				if (record) {
					item.data = record.numericId;
					return { action: "conflict", uuid: uuid, numericId: record.numericId, reported: bound };
				}
				/* UUID not known and the numeric is owned by another disk: move this one to a
				 * fresh numeric instead of leaving both disks aliased. */
				var reassigned = this.allocateNumericId();
				this.bind(uuid, reassigned);
				item.data = reassigned;
				return { action: "reassigned", uuid: uuid, numericId: reassigned, reported: bound };
			}
			return { action: "bound", uuid: uuid, numericId: numericId };
		}
		if (!uuid && numericId) {
			/* The numeric mirror may already have an owner from a previous migration: reuse its
			 * UUID instead of minting a second identity for the same disk. */
			var owner = this.byNumeric[numericId];
			if (owner) {
				if (!item.extra) { try { item.extra = new ItemExtraData(); } catch (e) {} }
				if (this.stamp(item, owner.uuid)) return { action: "adopted", uuid: owner.uuid, numericId: numericId };
				return { action: "legacy", numericId: numericId };
			}
			var fresh = this.allocateUuid();
			if (!item.extra) { try { item.extra = new ItemExtraData(); } catch (e) {} }
			if (!this.stamp(item, fresh)) return { action: "legacy", numericId: numericId };
			this.bind(fresh, numericId);
			return { action: "stamped", uuid: fresh, numericId: numericId };
		}
		if (uuid && !numericId) {
			var known = this.byUuid[uuid];
			if (known) {
				item.data = known.numericId;
				return { action: "recovered", uuid: uuid, numericId: known.numericId };
			}
			var allocated = this.allocateNumericId();
			this.bind(uuid, allocated);
			item.data = allocated;
			return { action: "allocated", uuid: uuid, numericId: allocated };
		}
		var fresh = this.allocateUuid();
		if (!this.stamp(item, fresh)) return { action: "legacy", numericId: 0 };
		var allocated = this.allocateNumericId();
		this.bind(fresh, allocated);
		item.data = allocated;
		return { action: "created", uuid: fresh, numericId: allocated };
	},

	numericIdOf: function (item) {
		var uuid = this.uuidOf(item);
		if (uuid) {
			var record = this.byUuid[uuid];
			if (record) return record.numericId;
		}
		return item && item.data ? item.data : 0;
	},

	toJSON: function () {
		var records = [];
		for (var numericId in this.byNumeric) {
			records.push({ uuid: this.byNumeric[numericId].uuid, numericId: Number(numericId) });
		}
		return { nextNumericId: this.nextNumericId, records: records };
	},

	fromJSON: function (data) {
		this.reset();
		if (!data || !data.records) return 0;
		var maxNumeric = 0;
		for (var i = 0; i < data.records.length; i++) {
			var record = data.records[i];
			if (!record) continue;
			if (record.numericId > maxNumeric) maxNumeric = record.numericId;
			this.bind(record.uuid, record.numericId);
		}
		if (data.nextNumericId > this.nextNumericId) this.nextNumericId = data.nextNumericId;
		if (this.nextNumericId <= maxNumeric) this.nextNumericId = maxNumeric + 1;
		return this.nextNumericId;
	}
};
