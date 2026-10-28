import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  createIngredient,
  getDishById,
  getIngredients,
  getRecipeForDish,
  getSettings,
  saveRecipe,
  updateDish,
  writeAudit
} from "@/server/repository";
import { FAMILY_ID } from "@/server/repository";
import { decorateDishes } from "@/domain/eligibility";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, assertSameOrigin, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const dish = await getDishById(id);
    if (!dish) throw new ApiError({ status: 404, code: "DISH_NOT_FOUND", message: "没有找到这道菜。" });
    const [recipe, ingredients, settings] = await Promise.all([getRecipeForDish(id), getIngredients(), getSettings()]);
    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    const decoratedDish = decorateDishes(
      [dish],
      recipe ? { [recipe.dishId]: recipe.ingredientIds } : {},
      ingredients,
      settings
    )[0];
    return jsonOk({
      dish: decoratedDish,
      recipe,
      ingredients: (recipe?.ingredientIds ?? [])
        .map((ingredientId) => ingredientMap.get(ingredientId))
        .filter(Boolean)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

const recipeSchema = z.object({
  ingredientIds: z.array(z.string()).max(20).optional(),
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
    .optional(),
  markReady: z.boolean().default(true)
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const { id } = await params;
    const dish = await getDishById(id);
    if (!dish) throw new ApiError({ status: 404, code: "DISH_NOT_FOUND", message: "没有找到这道菜。" });
    const parsed = recipeSchema.parse(await request.json());
    const suppliedIds = parsed.ingredientIds ?? [];
    const existingIngredients = await getIngredients();
    const existingIngredientIds = new Set(existingIngredients.map((ingredient) => ingredient.id));
    const requestedIds = [
      ...suppliedIds,
      ...(parsed.ingredients ?? []).flatMap((item) => (item.id ? [item.id] : []))
    ];
    const missingIds = requestedIds.filter((ingredientId) => !existingIngredientIds.has(ingredientId));
    if (missingIds.length > 0) {
      throw new ApiError({
        status: 400,
        code: "INGREDIENT_NOT_FOUND",
        message: "食材表中包含不存在的食材，请刷新后重试。",
        details: { ingredientIds: [...new Set(missingIds)] }
      });
    }
    const ingredientIds = [...new Set(suppliedIds)];
    for (const item of parsed.ingredients ?? []) {
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
    const uniqueIds = [...new Set(ingredientIds)];
    if (uniqueIds.length === 0) {
      throw new ApiError({ status: 400, code: "RECIPE_EMPTY", message: "至少保留一项食材，才能完成菜谱。" });
    }
    const recipe = await saveRecipe(id, uniqueIds, FAMILY_ID);
    if (parsed.markReady) {
      await updateDish(id, { dataStatus: "ready", autoPlannable: dish.role !== "other" });
    }
    await writeAudit("recipe.update", id, { ingredientCount: uniqueIds.length });
    return jsonOk({ recipe, dish: await getDishById(id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
