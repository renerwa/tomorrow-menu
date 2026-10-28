import { getDishes, getFamily, getIngredients, getPlansBetween, getRecipes, getSettings } from "@/server/repository";
import { BACKUP_SCHEMA_VERSION } from "@/server/backup";
import { handleRouteError } from "@/server/http";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const [family, settings, dishes, recipes, ingredients, plans] = await Promise.all([
      getFamily(),
      getSettings(),
      getDishes({ includeDeleted: true }),
      getRecipes(),
      getIngredients(),
      getPlansBetween("1900-01-01", "2999-12-31")
    ]);
    const referencedDishIds = new Set(plans.flatMap(({ dishes: planDishes }) => planDishes.map((dish) => dish.id)));
    const customDishes = dishes.filter(
      (dish) => dish.isCustom && (!dish.deletedAt || referencedDishIds.has(dish.id))
    );
    const exportedDishIds = new Set([
      ...dishes.filter((dish) => !dish.isCustom).map((dish) => dish.id),
      ...customDishes.map((dish) => dish.id)
    ]);
    const backup = {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      family: { name: family.name, timezone: family.timezone, profile: family.profile },
      settings: {
        pantryIngredientIds: settings.pantryIngredientIds,
        blockedIngredientIds: settings.blockedIngredientIds,
        disabledDishIds: settings.disabledDishIds,
        repeatDays: settings.repeatDays,
        maxSpicyDishes: settings.maxSpicyDishes,
        thirdDishDefault: settings.thirdDishDefault,
        schemaVersion: settings.schemaVersion
      },
      customDishes,
      customRecipes: recipes.filter((recipe) => recipe.familyId !== null && exportedDishIds.has(recipe.dishId)),
      customIngredients: ingredients.filter((ingredient) => ingredient.isCustom),
      plans: plans.map(({ plan, dishes: planDishes }) => ({
        targetDate: plan.targetDate,
        status: plan.status,
        source: plan.source,
        historyWindowUsed: plan.historyWindowUsed,
        manualOverride: plan.manualOverride,
        dishes: planDishes.map((dish) => ({ id: dish.id, name: dish.name, role: dish.role }))
      }))
    };
    const response = NextResponse.json(backup, { headers: { "Cache-Control": "no-store" } });
    response.headers.set("Content-Disposition", `attachment; filename="mingri-menu-${new Date().toISOString().slice(0, 10)}.json"`);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
