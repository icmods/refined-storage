package org.innercore.icmods.refined_storage;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;

import org.mozilla.javascript.ScriptableObject;

import com.zhekasmirnov.apparatus.adapter.innercore.PackInfo;
import com.zhekasmirnov.innercore.api.mod.ScriptableObjectHelper;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.RecipeEntry;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipe;
import com.zhekasmirnov.innercore.api.mod.recipes.workbench.WorkbenchRecipeRegistry;

public class RefinedStorage {
    private final IcstdCompat impl;

    public RefinedStorage() {
        impl = new IcstdCompat(PackInfo.getPackVersionCode());
    }

    public Object[] sortCrafts(List<?> items, String textSearch, ScriptableObject originalOnlyItemsMap,
            ScriptableObject items2, List<?> bonusItems, ScriptableObject isDarkenMap) {
        HashSet<WorkbenchRecipe> hashSet = new HashSet<WorkbenchRecipe>();
        for (int i = 0; i < items.size(); i++) {
            Object item = ScriptableObjectHelper.getProperty(items2, String.valueOf(items.get(i)), null);
            WorkbenchRecipeRegistry.addRecipesThatContainItem(impl.getItemId(item), impl.getItemData(item), hashSet);
        }
        for (int k = 0; k < bonusItems.size(); k++) {
            ScriptableObject item = (ScriptableObject) bonusItems.get(k);
            WorkbenchRecipeRegistry.addRecipesThatContainItem(impl.getItemId(item), impl.getItemData(item), hashSet);
        }
        ArrayList<WorkbenchRecipe> newArray = new ArrayList<WorkbenchRecipe>();
        ArrayList<WorkbenchRecipe> posArray = new ArrayList<WorkbenchRecipe>();
        Iterator<WorkbenchRecipe> it = hashSet.iterator();
        while (it.hasNext()) {
            WorkbenchRecipe jRecipe = it.next();
            if (textSearch != null) {
                Object result = impl.getRecipeResult(jRecipe);
                String name = impl.getItemName(result);
                if (!name.toLowerCase().contains(textSearch.toLowerCase()))
                    continue;
            }
            boolean isDarken = isDarkenSlot(jRecipe, originalOnlyItemsMap);
            isDarkenMap.put("e" + jRecipe.getRecipeUid(), isDarkenMap, Boolean.valueOf(isDarken));
            if (isDarken) {
                newArray.add(jRecipe);
            } else {
                posArray.add(jRecipe);
            }
        }
        posArray.addAll(newArray);
        return posArray.toArray();
    }

    private boolean isDarkenSlot(WorkbenchRecipe javaRecipe, ScriptableObject originalOnlyItemsMap) {
        Iterator<RecipeEntry> values = javaRecipe.getEntryCollection().iterator();
        while (values.hasNext()) {
            RecipeEntry item = values.next();
            if (item == null || item.id == 0)
                continue;
            List<?> items = (List<?>) originalOnlyItemsMap.get((item != null ? item.id : 0));
            if (items == null || (item.data != -1 && !items.contains(item.data))) {
                return true;
            }
        }
        return false;
    }

    public Object[] sortItems(int sortType, boolean isReverse, String textSearch, Object container,
            List<Object> array) {
        Object[] newArray;
        if (textSearch != null) {
            ArrayList<Object> newArray2 = new ArrayList<>();
            for (int i = 0; i < array.size(); i++) {
                Object slot = impl.getItemContainerSlot(container, array.get(i).toString());
                String name = impl.getItemName(slot);
                if (name.toLowerCase().contains(textSearch.toLowerCase()))
                    newArray2.add(array.get(i));
            }
            newArray = newArray2.toArray();
        } else {
            newArray = array.toArray();
        }
        Comparator<Object> comparator = new Comparator<Object>() {
            public int compare(Object a, Object b) {
                return 0;
            }
        };
        if (isReverse) {
            if (sortType == 2) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        return impl.getItemId(
                            impl.getItemContainerSlot(container, b.toString())
                        ) - impl.getItemId(
                            impl.getItemContainerSlot(container, a.toString())
                        );
                    }
                };
            } else if (sortType == 0) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        Object slot1 = impl.getItemContainerSlot(container, a.toString());
                        Object slot2 = impl.getItemContainerSlot(container, b.toString());
                        int count1 = impl.getItemCount(slot1);
                        int count2 = impl.getItemCount(slot2);
                        return (count1 == 0 || count2 == 0) ? count2 - count1 : count1 - count2;
                    }
                };
            } else if (sortType == 1) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        Object slot1 = impl.getItemContainerSlot(container, a.toString());
                        Object slot2 = impl.getItemContainerSlot(container, b.toString());
                        int id1 = impl.getItemId(slot1);
                        int id2 = impl.getItemId(slot2);
                        if (id1 == 0 || id2 == 0) return id2 - id1;
                        String name1 = impl.getItemName(slot1);
                        String name2 = impl.getItemName(slot2);
                        return name2.compareToIgnoreCase(name1);
                    }
                };
            }
        } else {
            if (sortType == 2) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        Object slot1 = impl.getItemContainerSlot(container, a.toString());
                        Object slot2 = impl.getItemContainerSlot(container, b.toString());
                        int id1 = impl.getItemId(slot1);
                        int id2 = impl.getItemId(slot2);
                        return (id1 == 0 || id2 == 0) ? id2 - id1 : id1 - id2;
                    }
                };
            } else if (sortType == 0) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        return impl.getItemCount(
                            impl.getItemContainerSlot(container, b.toString())
                        ) - impl.getItemCount(
                            impl.getItemContainerSlot(container, a.toString())
                        );
                    }
                };
            } else if (sortType == 1) {
                comparator = new Comparator<Object>() {
                    public int compare(Object a, Object b) {
                        Object slot1 = impl.getItemContainerSlot(container, a.toString());
                        Object slot2 = impl.getItemContainerSlot(container, b.toString());
                        int id1 = impl.getItemId(slot1);
                        int id2 = impl.getItemId(slot2);
                        if (id1 == 0 || id2 == 0) return id2 - id1;
                        String name1 = impl.getItemName(slot1);
                        String name2 = impl.getItemName(slot2);
                        return name1.compareToIgnoreCase(name2);
                    }
                };
            }
        }
        Arrays.sort(newArray, comparator);
        return newArray;
    }
}
