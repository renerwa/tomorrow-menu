import type {
  AiCandidate,
  Dish,
  Flavor,
  Ingredient,
  MealStats,
  Recipe,
  RecentMeal
} from "./types";
import { toRecipeMap } from "./eligibility";
import { PROTEIN_LABELS } from "./labels";

const LEAFY_NAMES = [
  "生菜",
  "空心菜",
  "茼蒿",
  "苋菜",
  "小白菜",
  "青菜",
  "菠菜",
  "菜心",
  "凤尾",
  "瓢儿菜",
  "豌豆尖",
  "豌豆颠",
  "韭菜",
  "芹菜",
  "油菜"
];

export interface RecentPlanInput {
  targetDate: string;
  dishes: Dish[];
}

export function buildMealStats(input: {
  recentPlans: RecentPlanInput[];
  futurePlans: RecentPlanInput[];
  candidates: Dish[];
  recipes: Recipe[];
  ingredients: Ingredient[];
}): MealStats {
  const proteinCounts: Record<string, number> = {};
  for (const protein of Object.keys(PROTEIN_LABELS)) proteinCounts[protein] = 0;
  const flavorCounts: Record<Flavor, number> = { light: 0, normal: 0, rich: 0 };
  const ingredientCounts: Record<string, number> = {};
  const dishIds: string[] = [];
  const futureDishIds: string[] = [];
  let spicyCount = 0;
  let leafyCount = 0;

  const recipeMap = toRecipeMap(input.recipes);
  const ingredientMap = new Map(input.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const recentDishList = input.recentPlans.flatMap((plan) => plan.dishes);

  for (const dish of recentDishList) {
    proteinCounts[dish.protein] = (proteinCounts[dish.protein] ?? 0) + 1;
    flavorCounts[dish.flavor] += 1;
    if (dish.spiceLevel > 0) spicyCount += 1;
    dishIds.push(dish.id);

    const recipeIngredientNames = (recipeMap[dish.id] ?? [])
      .map((id) => ingredientMap.get(id)?.name)
      .filter((name): name is string => Boolean(name));
    const isLeafy = recipeIngredientNames.some((name) => LEAFY_NAMES.some((leaf) => name.includes(leaf)));
    if (isLeafy && dish.role !== "meat") leafyCount += 1;
    for (const id of recipeMap[dish.id] ?? []) {
      const name = ingredientMap.get(id)?.name;
      if (name) ingredientCounts[name] = (ingredientCounts[name] ?? 0) + 1;
    }
  }

  for (const plan of input.futurePlans) {
    for (const dish of plan.dishes) futureDishIds.push(dish.id);
  }

  const proteins: Record<string, number> = {};
  for (const dish of input.candidates) {
    proteins[dish.protein] = (proteins[dish.protein] ?? 0) + 1;
  }

  return {
    proteinCounts,
    flavorCounts,
    spicyCount,
    leafyCount,
    dishIds: [...new Set(dishIds)],
    ingredientCounts,
    futureDishIds: [...new Set(futureDishIds)],
    candidateCounts: {
      meat: input.candidates.filter((dish) => dish.role === "meat").length,
      veg: input.candidates.filter((dish) => dish.role === "veg").length,
      soup: input.candidates.filter((dish) => dish.role === "soup").length,
      proteins
    }
  };
}

export function toRecentMeals(plans: RecentPlanInput[]): RecentMeal[] {
  return plans.map((plan) => ({
    date: plan.targetDate,
    dishes: plan.dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      role: dish.role,
      protein: dish.protein
    }))
  }));
}

export function toAiCandidates(candidates: Dish[], recipes: Recipe[], ingredients: Ingredient[]): AiCandidate[] {
  const recipeMap = toRecipeMap(recipes);
  const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  return candidates.map((dish) => ({
    id: dish.id,
    name: dish.name,
    role: dish.role,
    protein: dish.protein,
    spiceLevel: dish.spiceLevel,
    flavor: dish.flavor,
    ingredients: (recipeMap[dish.id] ?? [])
      .map((id) => ingredientMap.get(id)?.name)
      .filter((name): name is string => Boolean(name))
      .slice(0, 8)
  }));
}
