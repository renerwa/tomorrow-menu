import menuData from "./menu-library.json";
import { ingredients, defaultPantryIngredientIds, ingredientByName } from "./ingredients";
import { readyRecipeNames, readyRecipeIngredientIds } from "./recipes";
import type { Dish, Recipe } from "@/domain/types";

export interface SeedDish {
  id: string;
  name: string;
  normalizedName: string;
  role: Dish["role"];
  protein: Dish["protein"];
  spiceLevel: Dish["spiceLevel"];
  flavor: Dish["flavor"];
  sourceGroup: string;
  dataStatus: Dish["dataStatus"];
  autoPlannable: boolean;
  isCustom: boolean;
}

export const seedDishes = menuData.dishes as SeedDish[];
export const seedIngredients = ingredients;
export const seedDefaultPantryIds = defaultPantryIngredientIds;

export const seedRecipes: Array<Omit<Recipe, "updatedAt">> = seedDishes
  .filter((dish) => readyRecipeIngredientIds[dish.name])
  .map((dish) => ({
    dishId: dish.id,
    familyId: null,
    ingredientIds: readyRecipeIngredientIds[dish.name]
  }));

if (seedRecipes.length !== 38) {
  throw new Error(`Expected 38 complete seed recipes, got ${seedRecipes.length}`);
}

for (const recipe of seedRecipes) {
  if (recipe.ingredientIds.length === 0) throw new Error(`Recipe for ${recipe.dishId} is empty`);
  if (!recipe.ingredientIds.every((id) => seedIngredients.some((ingredient) => ingredient.id === id))) {
    throw new Error(`Recipe for ${recipe.dishId} references a missing ingredient`);
  }
}

export const seedRecipeDishNames = Object.keys(readyRecipeNames);

export const demoHistoryNames: string[][] = [
  ["回锅肉", "番茄炒蛋", "蒜蓉生菜"],
  ["宫保鸡丁", "青椒肉丝", "清炒茼蒿"],
  ["红烧肉", "可乐鸡翅", "紫菜蛋汤"],
  ["水煮肉片", "番茄炒蛋", "冬瓜玉米汤"],
  ["仔姜牛肉", "宫保鸡丁", "清炒山药片"],
  ["红烧小黄鱼", "小炒黄牛肉", "蒜蓉生菜"]
];

export function dishIdByName(name: string): string {
  const dish = seedDishes.find((candidate) => candidate.name === name);
  if (!dish) throw new Error(`Unknown seed dish: ${name}`);
  return dish.id;
}

export function ingredientIdByName(name: string): string {
  const ingredient = ingredientByName.get(name);
  if (!ingredient) throw new Error(`Unknown seed ingredient: ${name}`);
  return ingredient.id;
}
