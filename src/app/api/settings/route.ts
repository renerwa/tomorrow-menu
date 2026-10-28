import type { NextRequest } from "next/server";
import { z } from "zod";
import { aiStatus } from "@/ai/config";
import {
  getDishCounts,
  getDishes,
  getFamily,
  getIngredients,
  getSettings,
  updateFamilyProfile,
  updateSettings,
  writeAudit
} from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

export async function GET(request: NextRequest) {
  try {
    const [family, settings, counts] = await Promise.all([getFamily(), getSettings(), getDishCounts()]);
    void request;
    return jsonOk({ family, settings, counts, ai: aiStatus() });
  } catch (error) {
    return handleRouteError(error);
  }
}

const profileSchema = z.object({
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20),
  childAge: z.number().int().min(0).max(18).nullable(),
  spiceTolerance: z.string().trim().min(1).max(20)
});

const patchSchema = z.object({
  family: z
    .object({
      name: z.string().trim().min(1).max(40).optional(),
      profile: profileSchema.optional()
    })
    .optional(),
  pantryIngredientIds: z.array(z.string()).optional(),
  blockedIngredientIds: z.array(z.string()).optional(),
  disabledDishIds: z.array(z.string()).optional(),
  repeatDays: z.number().int().min(1).max(30).optional(),
  maxSpicyDishes: z.number().int().min(0).max(2).optional(),
  thirdDishDefault: z.enum(["veg", "soup"]).optional()
});

export async function PATCH(request: NextRequest) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const parsed = patchSchema.parse(await request.json());
    const [ingredients, dishes] = await Promise.all([getIngredients(), getDishes()]);
    const ingredientIds = new Set(ingredients.map((ingredient) => ingredient.id));
    for (const key of ["pantryIngredientIds", "blockedIngredientIds"] as const) {
      if (parsed[key]?.some((id) => !ingredientIds.has(id))) {
        throw new ApiError({ status: 400, code: "INGREDIENT_NOT_FOUND", message: "设置中包含不存在的食材。" });
      }
    }
    const dishIds = new Set(dishes.map((dish) => dish.id));
    if (parsed.disabledDishIds?.some((id) => !dishIds.has(id))) {
      throw new ApiError({ status: 400, code: "DISH_NOT_FOUND", message: "设置中包含不存在的菜品。" });
    }
    const settings = await updateSettings({
      pantryIngredientIds: parsed.pantryIngredientIds,
      blockedIngredientIds: parsed.blockedIngredientIds,
      disabledDishIds: parsed.disabledDishIds,
      repeatDays: parsed.repeatDays,
      maxSpicyDishes: parsed.maxSpicyDishes as 0 | 1 | 2 | undefined,
      thirdDishDefault: parsed.thirdDishDefault
    });
    const family = await updateFamilyProfile({
      name: parsed.family?.name,
      profile: parsed.family?.profile
    });
    await writeAudit("settings.update", family.id, {
      repeatDays: settings.repeatDays,
      maxSpicyDishes: settings.maxSpicyDishes
    });
    return jsonOk({ family, settings, counts: await getDishCounts(), ai: aiStatus() });
  } catch (error) {
    return handleRouteError(error);
  }
}
