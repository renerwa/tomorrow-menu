import type { NextRequest } from "next/server";
import { z } from "zod";
import { getAiConfig } from "@/ai/config";
import { requestRecipeSuggestions } from "@/ai/recipeSuggestion";
import { todayInTimeZone } from "@/domain/date";
import {
  countRateLimit,
  getDishes,
  getFamily,
  getIngredients,
  recordRateLimit
} from "@/server/repository";
import { handleRouteError, jsonOk } from "@/server/http";
import { assertCsrf, enforceWriteRateLimit, requestIpHash } from "@/server/security";
import { ApiError } from "@/server/errors";

const bodySchema = z.object({ dishIds: z.array(z.string()).min(1).max(20) });

export async function POST(request: NextRequest) {
  try {
    assertCsrf(request);
    await enforceWriteRateLimit(request);
    const config = getAiConfig();
    if (!config.configured) {
      throw new ApiError({
        status: 503,
        code: "AI_NOT_CONFIGURED",
        message: "AI 尚未在服务端配置，暂时不能批量生成食材草稿。",
        action: "configure_server"
      });
    }
    const { dishIds } = bodySchema.parse(await request.json());
    const [family, allDishes, ingredients] = await Promise.all([getFamily(), getDishes(), getIngredients()]);
    const dishMap = new Map(allDishes.map((dish) => [dish.id, dish]));
    const selected = dishIds.map((id) => dishMap.get(id));
    if (selected.some((dish) => !dish)) {
      throw new ApiError({ status: 404, code: "DISH_NOT_FOUND", message: "部分菜品不存在。" });
    }
    if (selected.some((dish) => dish?.dataStatus !== "draft")) {
      throw new ApiError({ status: 400, code: "ONLY_DRAFT_DISHES", message: "批量补全只处理待完善菜品。" });
    }
    const today = todayInTimeZone(family.timezone);
    const ipHash = requestIpHash(request);
    const globalCalls = await countRateLimit(today, "ai-recipe");
    const ipCalls = await countRateLimit(today, "ai-recipe", ipHash);
    if (globalCalls >= config.maxDailyCalls || ipCalls >= config.maxCallsPerIpPerDay) {
      throw new ApiError({
        status: 429,
        code: "AI_RATE_LIMITED",
        message: "今日 AI 食材草稿次数已达上限，请明天再试。",
        action: "retry_later"
      });
    }
    await recordRateLimit(today, "ai-recipe", ipHash);
    const suggestions = await requestRecipeSuggestions(
      selected.filter((dish): dish is NonNullable<typeof dish> => Boolean(dish)),
      ingredients
    );
    const existingByNormalized = new Map(ingredients.map((ingredient) => [ingredient.normalizedName, ingredient]));
    return jsonOk({
      suggestions: suggestions.map((suggestion) => ({
        dishId: suggestion.dishId,
        ingredients: suggestion.ingredients.map((item) => {
          const existing = existingByNormalized.get(item.name.normalize("NFKC").replace(/\s+/g, ""));
          return { ...item, id: existing?.id ?? null };
        })
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
