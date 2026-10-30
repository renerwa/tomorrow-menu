import type {
  Dish,
  Ingredient,
  MealPlanStatus,
  Recipe,
  Settings,
  ShoppingGroup,
  ShoppingItem,
  ShoppingList
} from "./types";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./labels";
import { formatChineseDate } from "./date";

export class ShoppingListError extends Error {
  code = "SHOPPING_LIST_INVALID";
  issues: string[];

  constructor(issues: string[]) {
    super(issues.join("；"));
    this.issues = issues;
  }
}

export function buildShoppingList(input: {
  targetDate: string;
  planStatus: MealPlanStatus;
  dishes: Dish[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  settings: Settings;
}): ShoppingList {
  if (input.planStatus !== "confirmed") {
    throw new ShoppingListError(["菜单尚未确认，确认后才会生成正式采购清单。"]);
  }

  const ingredientMap = new Map(input.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const recipeMap = new Map(input.recipes.map((recipe) => [recipe.dishId, recipe.ingredientIds]));
  const issues: string[] = [];
  const collectedIds: string[] = [];
  const dishNamesByIngredient = new Map<string, string[]>();

  for (const dish of input.dishes) {
    const recipe = recipeMap.get(dish.id);
    if (!recipe || recipe.length === 0) {
      issues.push(`「${dish.name}」缺少食材表`);
      continue;
    }
    for (const ingredientId of recipe) {
      if (!ingredientMap.has(ingredientId)) {
        issues.push(`「${dish.name}」引用了不存在的食材 ${ingredientId}`);
      }
      collectedIds.push(ingredientId);
      const dishNames = dishNamesByIngredient.get(ingredientId) ?? [];
      if (!dishNames.includes(dish.name)) {
        dishNames.push(dish.name);
        dishNamesByIngredient.set(ingredientId, dishNames);
      }
    }
  }
  if (issues.length > 0) throw new ShoppingListError(issues);

  const pantry = new Set(input.settings.pantryIngredientIds);
  const uniqueIds = [...new Set(collectedIds)];
  const allIngredients = uniqueIds
    .map((id) => ingredientMap.get(id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
  const excluded = allIngredients
    .filter((ingredient) => pantry.has(ingredient.id))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const toBuy = allIngredients.filter((ingredient) => !pantry.has(ingredient.id));

  const groups: ShoppingGroup[] = CATEGORY_ORDER.flatMap((category) => {
    const items: ShoppingItem[] = toBuy
      .filter((ingredient) => ingredient.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
      .map((ingredient) => ({
        ...ingredient,
        dishNames: dishNamesByIngredient.get(ingredient.id) ?? []
      }));
    return items.length > 0 ? [{ category, label: CATEGORY_LABELS[category], items }] : [];
  });

  const dishNames = input.dishes.map((dish) => dish.name).join("、");
  const buyNames = toBuy
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"))
    .map((ingredient) => {
      const dishNames = dishNamesByIngredient.get(ingredient.id) ?? [];
      return `${ingredient.name}（用于：${dishNames.join("、")}）`;
    })
    .join("\n");
  const copyText = `${formatChineseDate(input.targetDate)}晚餐：${dishNames}\n\n需要买：\n${buyNames || "无需采购"}`;

  return {
    targetDate: input.targetDate,
    dishes: input.dishes.map((dish) => ({ id: dish.id, name: dish.name, role: dish.role })),
    groups,
    excluded,
    copyText
  };
}
