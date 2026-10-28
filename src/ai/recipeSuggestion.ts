import type { Dish, Ingredient } from "@/domain/types";
import { aiRecipeSchema, extractJsonObject } from "./schemas";
import { callChatCompletions } from "./client";
import { AiServiceError } from "./errors";

const SYSTEM_PROMPT = `你是家庭菜谱食材整理助手。只根据菜名、角色和主蛋白质，给出家庭常用叫法的采购食材，不使用品牌名或营销名。
每道菜最多 20 个食材。食材名称要能直接用于买菜；分类只能是 meat、vegetable、soy、seasoning、staple、other。
盐、食用油、生抽、老抽、醋、料酒、豆瓣酱、花椒、干辣椒、白糖、淀粉通常可作为常备调料 defaultPantry=true。
必须输出严格 JSON：{"suggestions":[{"dishId":"...","ingredients":[{"name":"...","category":"vegetable","defaultPantry":false}]}]}。`;

export async function requestRecipeSuggestions(
  dishes: Dish[],
  existingIngredients: Ingredient[]
): Promise<Array<{ dishId: string; ingredients: Array<{ name: string; category: string; defaultPantry: boolean }> }>> {
  const payload = {
    dishes: dishes.map((dish) => ({
      dishId: dish.id,
      name: dish.name,
      role: dish.role,
      protein: dish.protein,
      flavor: dish.flavor,
      spiceLevel: dish.spiceLevel
    })),
    existingIngredientNames: existingIngredients.map((ingredient) => ingredient.name),
    schema: {
      suggestions: [
        {
          dishId: "string",
          ingredients: [{ name: "string", category: "meat|vegetable|soy|seasoning|staple|other", defaultPantry: "boolean" }]
        }
      ]
    }
  };
  const result = await callChatCompletions([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload) }
  ]);
  try {
    const parsed = aiRecipeSchema.parse(extractJsonObject(result.content));
    const validIds = new Set(dishes.map((dish) => dish.id));
    return parsed.suggestions.filter((suggestion) => validIds.has(suggestion.dishId));
  } catch {
    throw new AiServiceError({
      code: "AI_INVALID_RECIPE_OUTPUT",
      message: "AI 返回的食材草稿结构无效，请稍后重试。",
      status: 422
    });
  }
}
