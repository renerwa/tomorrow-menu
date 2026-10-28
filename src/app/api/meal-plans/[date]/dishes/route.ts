import type { NextRequest } from "next/server";
import { z } from "zod";
import { getComposition, sortDishesByRole } from "@/domain/composition";
import { getEligibleDishes, toRecipeMap } from "@/domain/eligibility";
import {
  getDishes,
  getFamily,
  getIngredients,
  getPlanView,
  getRecipes,
  getSettings,
  savePlan
} from "@/server/repository";
import { assertPlanDateEditable, getPlanResponse } from "@/server/planner";
import { handleRouteError, jsonOk, requireDate } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit } from "@/server/security";
import { ApiError } from "@/server/errors";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("replace"), dishId: z.string(), replacementDishId: z.string() }),
  z.object({ action: z.literal("remove"), dishId: z.string() }),
  z.object({ action: z.literal("add"), role: z.enum(["meat", "veg", "soup"]), dishId: z.string() })
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const date = requireDate((await params).date);
    const family = await getFamily();
    assertPlanDateEditable(date, family.timezone);
    const parsed = bodySchema.parse(await request.json());
    const [plan, settings, dishes, recipes, ingredients] = await Promise.all([
      getPlanView(date),
      getSettings(),
      getDishes(),
      getRecipes(),
      getIngredients()
    ]);
    if (!plan) throw new ApiError({ status: 404, code: "PLAN_NOT_FOUND", message: "这天还没有菜单。" });
    const candidates = getEligibleDishes(dishes, toRecipeMap(recipes), ingredients, settings);
    const candidateMap = new Map(candidates.map((dish) => [dish.id, dish]));
    let next = plan.dishes.map((dish) => ({ dishId: dish.id, role: dish.role }));

    if (parsed.action === "remove") {
      if (!next.some((dish) => dish.dishId === parsed.dishId)) {
        throw new ApiError({ status: 404, code: "DISH_NOT_IN_PLAN", message: "菜单中没有这道菜。" });
      }
      next = next.filter((dish) => dish.dishId !== parsed.dishId);
    }

    if (parsed.action === "replace") {
      const current = next.find((dish) => dish.dishId === parsed.dishId);
      if (!current) throw new ApiError({ status: 404, code: "DISH_NOT_IN_PLAN", message: "菜单中没有这道菜。" });
      if (next.some((dish) => dish.dishId === parsed.replacementDishId)) {
        throw new ApiError({ status: 409, code: "DUPLICATE_DISH", message: "这道菜已经在菜单里了。" });
      }
      const replacement = candidateMap.get(parsed.replacementDishId);
      if (!replacement) {
        throw new ApiError({ status: 422, code: "DISH_NOT_ELIGIBLE", message: "这道菜暂不可推荐，请先补全食材或解除忌口。" });
      }
      const thirdRole = current.role === "veg" || current.role === "soup";
      if (thirdRole ? replacement.role !== "veg" && replacement.role !== "soup" : replacement.role !== current.role) {
        throw new ApiError({
          status: 400,
          code: "ROLE_MISMATCH",
          message: thirdRole ? "第三道只能在素菜和汤之间替换。" : "换菜需要保持原来的菜单角色。"
        });
      }
      next = next.map((dish) => (dish.dishId === parsed.dishId ? { dishId: replacement.id, role: replacement.role } : dish));
    }

    if (parsed.action === "add") {
      if (next.length >= 3) {
        throw new ApiError({ status: 409, code: "PLAN_FULL", message: "整桌已有 3 道，请先移除一道再添加。" });
      }
      if (next.some((dish) => dish.dishId === parsed.dishId)) {
        throw new ApiError({ status: 409, code: "DUPLICATE_DISH", message: "这道菜已经在菜单里了。" });
      }
      const addition = candidateMap.get(parsed.dishId);
      if (!addition || addition.role !== parsed.role) {
        throw new ApiError({ status: 422, code: "DISH_NOT_ELIGIBLE", message: "所选菜品与角色不匹配或暂不可推荐。" });
      }
      next.push({ dishId: addition.id, role: addition.role });
    }

    next = sortDishesByRole(next);
    const composition = getComposition(next.map((dish) => ({ role: dish.role })));
    await savePlan({
      targetDate: date,
      status: plan.status,
      source: "manual",
      dishes: next,
      historyWindowUsed: plan.historyWindowUsed,
      manualOverride: !composition.valid
    });
    return jsonOk(await getPlanResponse(date));
  } catch (error) {
    return handleRouteError(error);
  }
}
