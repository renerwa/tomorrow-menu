import type { Dish, DishWithRecipe, Ingredient, Recipe, Settings } from "./types";

export type RecipeMap = Record<string, string[]>;

export function toRecipeMap(recipes: Recipe[]): RecipeMap {
  return Object.fromEntries(recipes.map((recipe) => [recipe.dishId, recipe.ingredientIds]));
}

export function isRecipeComplete(
  dishId: string,
  recipes: RecipeMap,
  ingredientIds: Set<string>
): boolean {
  const ids = recipes[dishId] ?? [];
  return ids.length > 0 && ids.every((id) => ingredientIds.has(id));
}

export function dishHasBlockedIngredient(
  dishId: string,
  recipes: RecipeMap,
  blockedIngredientIds: Set<string>
): boolean {
  return (recipes[dishId] ?? []).some((id) => blockedIngredientIds.has(id));
}

export function isDishEligible(
  dish: Dish,
  recipes: RecipeMap,
  ingredientIds: Set<string>,
  settings: Settings
): boolean {
  if (dish.role === "other" || !dish.autoPlannable || dish.dataStatus !== "ready") return false;
  if (settings.disabledDishIds.includes(dish.id)) return false;
  if (!isRecipeComplete(dish.id, recipes, ingredientIds)) return false;
  if (dishHasBlockedIngredient(dish.id, recipes, new Set(settings.blockedIngredientIds))) return false;
  return true;
}

export function getEligibleDishes(
  dishes: Dish[],
  recipes: RecipeMap,
  ingredients: Ingredient[],
  settings: Settings
): Dish[] {
  const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  return dishes.filter((dish) => isDishEligible(dish, recipes, ingredientIds, settings));
}

export function decorateDishes(
  dishes: Dish[],
  recipes: RecipeMap,
  ingredients: Ingredient[],
  settings: Settings
): DishWithRecipe[] {
  const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
  const blocked = new Set(settings.blockedIngredientIds);
  return dishes.map((dish) => {
    const recipe = recipes[dish.id] ?? [];
    const recipeComplete = isRecipeComplete(dish.id, recipes, ingredientIds);
    const blockedByIngredient = dishHasBlockedIngredient(dish.id, recipes, blocked);
    const disabled = settings.disabledDishIds.includes(dish.id);
    return {
      ...dish,
      ingredientCount: recipe.length,
      recipeComplete,
      blocked: blockedByIngredient,
      disabled,
      autoEligible:
        dish.role !== "other" &&
        dish.autoPlannable &&
        dish.dataStatus === "ready" &&
        recipeComplete &&
        !blockedByIngredient &&
        !disabled
    };
  });
}
