package org.innercore.icmods.refined_storage;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;

import org.innercore.icstd.inventory.ItemContainer;
import org.innercore.icstd.inventory.ItemContainerSlot;
import org.innercore.icstd.inventory.ItemInstance;
import org.innercore.icstd.modules.ItemModule;
import org.mozilla.javascript.ScriptableObject;

import com.zhekasmirnov.horizon.runtime.logger.Logger;
import com.zhekasmirnov.innercore.api.mod.ScriptableObjectHelper;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.RecipeEntry;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipe;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipeRegistry;

public class RefinedStorage {
    public static boolean isCompatRequired = false;
    public static boolean isRecipeCompatRequired = true;

    static {
        try {
            WorkbenchRecipeRegistry.class.getMethod("addRecipesThatContainItem", int.class, int.class, Collection.class);
            isRecipeCompatRequired = false;
            ItemInstance.class.getField("id");
            ItemContainer.class.getMethod("getSlot", String.class);
            ItemModule.class.getMethod("getName", int.class, int.class, long.class);
        } catch (LinkageError | ReflectiveOperationException | RuntimeException ex) {
            Logger.info("RefinedStorage", "Faster grid sorting is not supported! Cause: " + ex);
            Logger.warning("Compat will be used instead to maintain availability.");
            isCompatRequired = true;
        }
    }

    public static Object[] sortCrafts(List<?> items, String textSearch, ScriptableObject originalOnlyItemsMap,
            ScriptableObject slots, List<?> inventoryItems, ScriptableObject isDarkenMap) {
        HashSet<WorkbenchRecipe> recipes = new HashSet<>();
        for (int i = 0; i < items.size(); i++) {
            ItemContainerSlot slot = (ItemContainerSlot) ScriptableObjectHelper.getJavaProperty(slots,
                    String.valueOf(items.get(i)), ItemContainerSlot.class, null);
            WorkbenchRecipeRegistry.addRecipesThatContainItem(slot.id, slot.data, recipes);
        }
        for (int k = 0; k < inventoryItems.size(); k++) {
            ScriptableObject item = (ScriptableObject) inventoryItems.get(k);
            WorkbenchRecipeRegistry.addRecipesThatContainItem(ScriptableObjectHelper.getIntProperty(item, "id", 0),
                    ScriptableObjectHelper.getIntProperty(item, "data", 0), recipes);
        }

        ArrayList<WorkbenchRecipe> darkenRecipes = new ArrayList<WorkbenchRecipe>();
        ArrayList<WorkbenchRecipe> sortedRecipes = new ArrayList<WorkbenchRecipe>();
        Iterator<WorkbenchRecipe> it = recipes.iterator();
        while (it.hasNext()) {
            WorkbenchRecipe recipe = it.next();
            if (textSearch != null) {
                ItemInstance result = recipe.getResult();
                String name = ItemModule.getName(result.id, result.data != -1 ? result.data : 0);
                if (name.toLowerCase().indexOf(textSearch.toLowerCase()) == -1)
                    continue;
            }

            boolean isDarken = isDarkenSlot(recipe, originalOnlyItemsMap);
            isDarkenMap.put("e" + recipe.getRecipeUid(), isDarkenMap, Boolean.valueOf(isDarken));
            if (isDarken) {
                darkenRecipes.add(recipe);
            } else {
                sortedRecipes.add(recipe);
            }
        }
        sortedRecipes.addAll(darkenRecipes);
        return sortedRecipes.toArray();
    }

    private static boolean isDarkenSlot(Object recipeObj, ScriptableObject originalOnlyItemsMap) {
        Iterator<RecipeEntry> entries = ((WorkbenchRecipe) recipeObj).getEntryCollection().iterator();
        while (entries.hasNext()) {
            RecipeEntry entry = entries.next();
            if (entry == null || entry.id == 0)
                continue;
            List<?> items = (List<?>) originalOnlyItemsMap.get((entry != null ? entry.id : 0));
            if (items == null || (entry.data != -1 && !items.contains(entry.data))) {
                return true;
            }
        }
        return false;
    }

    public static Object[] sortItems(int sortType, boolean isReverse, String textSearch, Object containerObj, List<?> items) {
        ItemContainer container = (ItemContainer) ScriptableObjectHelper.unwrap(containerObj);

        Object[] sortedItems;
        if (textSearch != null) {
            ArrayList<Object> filteredItems = new ArrayList<>();
            for (int i = 0; i < items.size(); i++) {
                ItemContainerSlot slot = container.getSlot(items.get(i).toString());
                String name = ItemModule.getName(slot.id, slot.data, slot.extra != null ? slot.extra.getValue() : 0);
                if (name.toLowerCase().indexOf(textSearch.toLowerCase()) != -1)
                    filteredItems.add(items.get(i));
            }
            sortedItems = filteredItems.toArray();
        } else {
            sortedItems = items.toArray();
        }

        Comparator<Object> comparator = null;
        if (isReverse) {
            if (sortType == 2) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        return container.getSlot(b.toString()).id - container.getSlot(a.toString()).id;
                    }
                };
            } else if (sortType == 0) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        ItemContainerSlot slot1 = container.getSlot(a.toString());
                        ItemContainerSlot slot2 = container.getSlot(b.toString());
                        return (slot1.count == 0 || slot2.count == 0)
                                ? slot2.count - slot1.count
                                : slot1.count - slot2.count;
                    }
                };
            } else if (sortType == 1) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        ItemContainerSlot slot1 = container.getSlot(a.toString());
                        ItemContainerSlot slot2 = container.getSlot(b.toString());
                        if (slot1.id == 0 || slot2.id == 0)
                            return slot2.id - slot1.id;
                        String name1 = ItemModule.getName(slot1.id, slot1.data, slot1.extra != null ? slot1.extra.getValue() : 0);
                        String name2 = ItemModule.getName(slot2.id, slot2.data, slot2.extra != null ? slot2.extra.getValue() : 0);
                        return name2.compareToIgnoreCase(name1);
                    }
                };
            }
        } else {
            if (sortType == 2) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        ItemContainerSlot slot1 = container.getSlot(a.toString());
                        ItemContainerSlot slot2 = container.getSlot(b.toString());
                        return (slot1.id == 0 || slot2.id == 0)
                                ? slot2.id - slot1.id
                                : slot1.id - slot2.id;
                    }
                };
            } else if (sortType == 0) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        return container.getSlot(b.toString()).count - container.getSlot(a.toString()).count;
                    }
                };
            } else if (sortType == 1) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        ItemContainerSlot slot1 = container.getSlot(a.toString());
                        ItemContainerSlot slot2 = container.getSlot(b.toString());
                        if (slot1.id == 0 || slot2.id == 0)
                            return slot2.id - slot1.id;
                        String name1 = ItemModule.getName(slot1.id, slot1.data, slot1.extra != null ? slot1.extra.getValue() : 0);
                        String name2 = ItemModule.getName(slot2.id, slot2.data, slot2.extra != null ? slot2.extra.getValue() : 0);
                        return name1.compareToIgnoreCase(name2);
                    }
                };
            }
        }
        if (comparator != null) {
            Arrays.sort(sortedItems, comparator);
        }
        return sortedItems;
    }
}
