import type { NextRequest } from "next/server";
import { buildShoppingList, ShoppingListError } from "@/domain/shoppingList";
import { getIngredients, getPlanView, getRecipes, getSettings } from "@/server/repository";
import { handleRouteError, jsonOk, requireDate } from "@/server/http";
import { ApiError } from "@/server/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    const date = requireDate((await params).date);
    const [plan, recipes, ingredients, settings] = await Promise.all([
      getPlanView(date),
      getRecipes(),
      getIngredients(),
      getSettings()
    ]);
    if (!plan) throw new ApiError({ status: 404, code: "PLAN_NOT_FOUND", message: "这天还没有菜单。" });
    if (plan.status !== "confirmed") {
      throw new ApiError({
        status: 409,
        code: "PLAN_NOT_CONFIRMED",
        message: "菜单尚未确认，确认后才会生成正式采购清单。",
        action: "confirm_plan"
      });
    }
    try {
      return jsonOk(
        buildShoppingList({
          targetDate: date,
          planStatus: plan.status,
          dishes: plan.dishes,
          recipes,
          ingredients,
          settings
        })
      );
    } catch (error) {
      if (error instanceof ShoppingListError) {
        throw new ApiError({ status: 422, code: error.code, message: error.message, action: "fix_recipe", details: error.issues });
      }
      throw error;
    }
  } catch (error) {
    return handleRouteError(error);
  }
}
