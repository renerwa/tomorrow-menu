import type { NextRequest } from "next/server";
import { z } from "zod";
import { decorateDishes, toRecipeMap } from "@/domain/eligibility";
import {
  createCustomDish,
  createIngredient,
  getDishCounts,
  getDishes,
  getIngredients,
  getRecipes,
  getSettings,
  writeAudit
} from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

export async function GET(request: NextRequest) {
  try {
    const [dishes, recipes, ingredients, settings, counts] = await Promise.all([
      getDishes(),
      getRecipes(),
      getIngredients(),
      getSettings(),
      getDishCounts()
    ]);
    const search = request.nextUrl.searchParams.get("search")?.trim().toLocaleLowerCase("zh-CN") || "";
    const role = request.nextUrl.searchParams.get("role");
    const status = request.nextUrl.searchParams.get("status");
    const view = request.nextUrl.searchParams.get("view");
    let decorated = decorateDishes(dishes, toRecipeMap(recipes), ingredients, settings);
    if (search) decorated = decorated.filter((dish) => dish.name.toLocaleLowerCase("zh-CN").includes(search));
    if (role && role !== "all") decorated = decorated.filter((dish) => dish.role === role);
    if (status && status !== "all") decorated = decorated.filter((dish) => dish.dataStatus === status);
    if (view === "auto") decorated = decorated.filter((dish) => dish.autoEligible);
    if (view === "disabled") decorated = decorated.filter((dish) => dish.disabled);
    if (view === "blocked") decorated = decorated.filter((dish) => dish.blocked);
    return jsonOk({ dishes: decorated, counts });
  } catch (error) {
    return handleRouteError(error);
  }
}

const createDishSchema = z.object({
  name: z.string().trim().min(1, "请填写菜名").max(40),
  role: z.enum(["meat", "veg", "soup", "other"]),
  protein: z.enum(["pork", "beef", "chicken", "duck", "lamb", "rabbit", "fish", "shrimp", "frog", "squid", "crab", "crayfish", "egg", "other", "none"]),
  spiceLevel: z.number().int().min(0).max(2),
  flavor: z.enum(["light", "normal", "rich"]),
  autoPlannable: z.boolean().optional(),
  ingredients: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().trim().min(1).max(40),
        category: z.enum(["meat", "vegetable", "soy", "seasoning", "staple", "other"]),
        defaultPantry: z.boolean().optional()
      })
    )
    .max(20)
    .default([])
});

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const parsed = createDishSchema.parse(await request.json());
    if (parsed.role === "meat" && (parsed.protein === "none" || parsed.protein === "other")) {
      throw new ApiError({ status: 400, code: "MEAT_PROTEIN_REQUIRED", message: "荤菜需要选择明确的主蛋白质。" });
    }
    if ((parsed.role === "veg" || parsed.role === "other") && parsed.protein !== "none") {
      throw new ApiError({ status: 400, code: "INVALID_DISH_PROTEIN", message: "素菜和非推荐池菜品的主蛋白质应为无。" });
    }
    const existingIngredients = await getIngredients();
    const existingIngredientIds = new Set(existingIngredients.map((ingredient) => ingredient.id));
    const missingIds = parsed.ingredients
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id) && !existingIngredientIds.has(id as string));
    if (missingIds.length > 0) {
      throw new ApiError({
        status: 400,
        code: "INGREDIENT_NOT_FOUND",
        message: "所选食材不存在，请刷新食材库后重试。",
        details: { ingredientIds: [...new Set(missingIds)] }
      });
    }
    const ingredientIds: string[] = [];
    for (const item of parsed.ingredients) {
      if (item.id) ingredientIds.push(item.id);
      else {
        const ingredient = await createIngredient({
          name: item.name,
          category: item.category,
          defaultPantry: item.defaultPantry
        });
        ingredientIds.push(ingredient.id);
      }
    }
    const dish = await createCustomDish({
      name: parsed.name,
      role: parsed.role,
      protein: parsed.protein,
      spiceLevel: parsed.spiceLevel as 0 | 1 | 2,
      flavor: parsed.flavor,
      ingredientIds: [...new Set(ingredientIds)],
      autoPlannable: parsed.autoPlannable
    });
    await writeAudit("dish.create", dish.id, { name: dish.name });
    return jsonOk({ dish }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
