import type { Dish, Ingredient, Recipe, Settings } from "@/domain/types";

export function makeDish(overrides: Partial<Dish> = {}): Dish {
  const name = overrides.name ?? "测试菜";
  return {
    id: overrides.id ?? `test-${name}`,
    familyId: null,
    name,
    normalizedName: name,
    role: "meat",
    protein: "pork",
    spiceLevel: 0,
    flavor: "normal",
    sourceGroup: "测试",
    dataStatus: "ready",
    autoPlannable: true,
    isCustom: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

export function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  const name = overrides.name ?? "测试食材";
  return {
    id: overrides.id ?? `ing-${name}`,
    name,
    normalizedName: name,
    category: "vegetable",
    defaultPantry: false,
    isCustom: false,
    ...overrides
  };
}

export function makeRecipe(dishId: string, ingredientIds: string[]): Recipe {
  return {
    dishId,
    familyId: null,
    ingredientIds,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    familyId: "family_test",
    pantryIngredientIds: [],
    blockedIngredientIds: [],
    disabledDishIds: [],
    repeatDays: 7,
    maxSpicyDishes: 1,
    thirdDishDefault: "veg",
    schemaVersion: 1,
    ...overrides
  };
}
