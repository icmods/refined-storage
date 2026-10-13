IDRegistry.genBlockID("RS_cable");
Block.createBlock("RS_cable", [
	{
		name: "Cable",
		texture: [
            ['cable', 0]
        ],
		inCreative: true
	}
], {
	renderlayer: 1
})
RS_blocks.push(BlockID['RS_cable']);
EnergyUse[BlockID['RS_cable']] = Config.energy_uses.cable;

(function () {
	var width = 1/4;

	RSgroup.add(BlockID.RS_cable, -1);

	var _wireBoxes = CoreKit.Blocks.wireBoxes(width);
	var boxes = _wireBoxes.wires;

	var Dmodel = new ICRender.CollisionShape();
	var render = new ICRender.Model();
	for (var i in boxes) {
		var wire = boxes[i].box;
		var side = boxes[i].side;
		render.addEntry(new BlockRenderer.Model(wire[0], wire[1], wire[2], wire[3], wire[4], wire[5], BlockID.RS_cable, 0)).setCondition(new ICRender.BLOCK(side[0], side[1], side[2], RSgroup, false));
		var entry = Dmodel.addEntry();
		entry.addBox(wire[0], wire[1], wire[2], wire[3], wire[4], wire[5]);
		entry.setCondition(new ICRender.BLOCK(side[0], side[1], side[2], RSgroup, false));
	}
	var cbox = _wireBoxes.center;
	render.addEntry(new BlockRenderer.Model(cbox[0], cbox[1], cbox[2], cbox[3], cbox[4], cbox[5], BlockID.RS_cable, 0));
	var entry = Dmodel.addEntry();
	entry.addBox(cbox[0], cbox[1], cbox[2], cbox[3], cbox[4], cbox[5]);
	BlockRenderer.setCustomCollisionShape(BlockID.RS_cable, -1, Dmodel);
	BlockRenderer.setCustomRaycastShape(BlockID.RS_cable, -1, Dmodel);
	BlockRenderer.setStaticICRender(BlockID.RS_cable, -1, render);
})();

(function(){
	var width = 1/4;

	var boxes = [
		[0.5 + width / 2, 0.5 - width / 2, 0.5 - width / 2, 1, 0.5 + width / 2, 0.5 + width / 2],
		[0, 0.5 - width / 2, 0.5 - width / 2, 0.5 - width / 2, 0.5 + width / 2, 0.5 + width / 2],
		[0.5 - width / 2, 0.5 - width / 2, 0.5 - width / 2, 0.5 + width / 2, 0.5 + width / 2, 0.5 + width / 2]
	]
	var render = new ICRender.Model();
	for(var i in boxes){
		render.addEntry(new BlockRenderer.Model(boxes[i][0], boxes[i][1], boxes[i][2], boxes[i][3], boxes[i][4], boxes[i][5], BlockID.RS_cable, 0));
	}
	ItemModel.getFor(BlockID.RS_cable, 0).setModel(render);
})();