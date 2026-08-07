package org.innercore.icmods.refined_storage;

import org.innercore.icstd.inventory.ItemInstance;
import org.innercore.icstd.modules.ItemModule;
import org.mozilla.javascript.ScriptableObject;

import com.zhekasmirnov.apparatus.api.container.ItemContainer;
import com.zhekasmirnov.innercore.api.NativeItemInstanceExtra;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipe;
import com.zhekasmirnov.innercore.api.mod.ui.container.AbstractSlot;

public class IcstdCompat extends LegacyCompat {
	@SuppressWarnings("unused")
	private final int versionCode;

	public IcstdCompat(int versionCode) {
		this.versionCode = versionCode;
	}

	public int getItemId(Object item) {
		if (item == null)
			return 0;
		if (item instanceof ItemInstance)
			return ((ItemInstance) item).id;
		if (item instanceof AbstractSlot)
			return ((AbstractSlot) item).getId();
		if (item instanceof ScriptableObject) {
			Object result = ((ScriptableObject) item).get("id", (ScriptableObject) item);
			if (result instanceof Number) return ((Number) result).intValue();
		}
		return -1;
	}

	public int getItemData(Object item) {
		if (item == null)
			return 0;
		if (item instanceof ItemInstance)
			return ((ItemInstance) item).data;
		if (item instanceof AbstractSlot)
			return ((AbstractSlot) item).getData();
		if (item instanceof ScriptableObject) {
			Object result = ((ScriptableObject) item).get("data", (ScriptableObject) item);
			if (result instanceof Number) return ((Number) result).intValue();
		}
		return 0;
	}

	public int getItemCount(Object item) {
		if (item == null)
			return 0;
		if (item instanceof ItemInstance)
			return ((ItemInstance) item).count;
		if (item instanceof AbstractSlot)
			return ((AbstractSlot) item).getCount();
		if (item instanceof ScriptableObject) {
			Object result = ((ScriptableObject) item).get("count", (ScriptableObject) item);
			if (result instanceof Number) return ((Number) result).intValue();
		}
		return 0;
	}

	public long getItemExtra(Object item) {
		if (item == null)
			return 0;
		if (item instanceof ItemInstance)
			return ((ItemInstance) item).getExtraPtr();
		if (item instanceof AbstractSlot) {
			NativeItemInstanceExtra extra = (NativeItemInstanceExtra) ((AbstractSlot) item).getExtra();
			return extra != null ? extra.getValue() : 0;
		}
		return 0;
	}

	public String getItemName(Object item) {
		if (item == null)
			return null;
		if (item instanceof ItemInstance)
			return ((ItemInstance) item).getItemName();
		if (item instanceof AbstractSlot) {
			AbstractSlot slot = (AbstractSlot) item;
			NativeItemInstanceExtra extra = (NativeItemInstanceExtra) slot.getExtra();
			return ItemModule.getName(slot.getId(), Math.max(0, slot.getData()), extra != null ? extra.getValue() : 0);
		}
		return "Unknown";
	}

	public Object getRecipeResult(Object recipe) {
		if (recipe instanceof WorkbenchRecipe)
			return ((WorkbenchRecipe) recipe).getResult();
		return null;
	}

	public Object getItemContainerSlot(Object container, String slot) {
		if (container instanceof ItemContainer)
			return ((ItemContainer) container).getSlot(slot);
		return null;
	}
}
