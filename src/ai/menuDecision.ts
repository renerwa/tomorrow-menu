import { aiMenuSchema, extractJsonObject } from "./schemas";
import { callChatCompletions } from "./client";
import { AiServiceError } from "./errors";
import type { AiCandidate, Dish, FamilyProfile, MealStats, RecentMeal, Settings } from "@/domain/types";
import { validateSelection } from "@/domain/validation";

export const MENU_PROMPT_VERSION = "2026-10-28-v2.1";

const SYSTEM_PROMPT = `你是家庭晚餐搭配助手。你只能从给定 candidateDishes 中选择 dishId，不能编造菜名、ID 或食材。
一桌固定 3 道：2 道荤菜 + 1 道素菜或汤。汤算作 3 道菜中的一道，不能额外增加第 4 道。第三道只能二选一，不能同时出现素菜和汤。
两道荤菜的主蛋白质必须不同。辣菜数量不能超过 settings.maxSpicyDishes，汤也计入。整桌至少有一道 flavor 为 light 的清淡菜。
不能选择重复窗口内已出现的菜，不能选择用户忌口或停用的菜，不能选择 dataStatus 不为 ready 的菜。
优先做蛋白质轮换，增加蔬菜多样性，避免连续重口，并照顾孩子接受度。不要输出医疗诊断、热量数值或治疗建议。
必须只输出 JSON，结构为：
{"dishes":[{"dishId":"...","reason":"..."},{"dishId":"...","reason":"..."},{"dishId":"...","reason":"..."}],"summary":"...","diversity":{"protein":"...","vegetable":"...","flavor":"..."},"confidence":0.8}
reason 用简体中文，重点解释为什么选这道、如何错开蛋白质/蔬菜/口味。`;

interface RequestInput {
  targetDate: string;
  familyProfile: FamilyProfile;
  settings: Settings;
  recentMeals: RecentMeal[];
  futureMealsInWindow: RecentMeal[];
  stats: MealStats;
  candidates: AiCandidate[];
}

export interface AiMenuResult {
  dishes: Dish[];
  output: {
    dishes: Array<{ dishId: string; reason: string }>;
    summary: string;
    diversity: { protein: string; vegetable: string; flavor: string };
    confidence: number | null;
  };
  validationResult: "valid" | "repaired";
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  inputSnapshot: unknown;
  model: string;
}

function outputSchemaText(): string {
  return '{"dishes":[{"dishId":"string","reason":"string"} x3],"summary":"string","diversity":{"protein":"string","vegetable":"string","flavor":"string"},"confidence":0-1}';
}

function buildUserPrompt(input: RequestInput): string {
  return JSON.stringify({
    targetDate: input.targetDate,
    familyProfile: input.familyProfile,
    settings: input.settings,
    recentMeals: input.recentMeals,
    futureMealsInWindow: input.futureMealsInWindow,
    stats: input.stats,
    candidateDishes: input.candidates,
    outputSchema: outputSchemaText()
  });
}

function validateOutput(
  output: ReturnType<typeof aiMenuSchema.parse>,
  candidateDishes: Dish[],
  repeatDishIds: Set<string>,
  settings: Settings
): { dishes: Dish[]; issues: string[] } {
  const dishMap = new Map(candidateDishes.map((dish) => [dish.id, dish]));
  const dishes = output.dishes
    .map((item) => dishMap.get(item.dishId))
    .filter((dish): dish is Dish => Boolean(dish));
  const issues: string[] = [];
  if (dishes.length !== output.dishes.length) issues.push("输出中包含菜库之外的 dishId。");
  issues.push(...validateSelection(dishes, { candidates: candidateDishes, repeatDishIds, settings }));
  return { dishes, issues: [...new Set(issues)] };
}

export async function requestAiMenu(input: RequestInput & {
  candidateDishes: Dish[];
  repeatDishIds: Set<string>;
}): Promise<AiMenuResult> {
  const config = await import("./config").then((module) => module.getAiConfig());
  const userPrompt = buildUserPrompt(input);
  const inputSnapshot = {
    targetDate: input.targetDate,
    familyProfile: input.familyProfile,
    settings: input.settings,
    recentMeals: input.recentMeals,
    futureMealsInWindow: input.futureMealsInWindow,
    stats: input.stats,
    candidateCount: input.candidates.length,
    outputSchema: outputSchemaText()
  };
  const first = await callChatCompletions([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt }
  ]);

  let parsed: ReturnType<typeof aiMenuSchema.parse>;
  let firstValidationIssue = "";
  try {
    parsed = aiMenuSchema.parse(extractJsonObject(first.content));
    const validated = validateOutput(parsed, input.candidateDishes, input.repeatDishIds, input.settings);
    if (validated.issues.length === 0) {
      return {
        dishes: validated.dishes,
        output: parsed,
        validationResult: "valid",
        latencyMs: first.latencyMs,
        inputTokens: first.inputTokens,
        outputTokens: first.outputTokens,
        inputSnapshot,
        model: config.model
      };
    }
    firstValidationIssue = validated.issues.join("；");
  } catch (error) {
    firstValidationIssue = error instanceof Error ? error.message : "AI 输出结构不符合要求";
  }

  const repair = await callChatCompletions([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
    { role: "assistant", content: first.content },
    {
      role: "user",
      content: `上面的结果未通过服务端校验：${firstValidationIssue}。请只修正这些问题，重新输出严格 JSON，仍然只能从 candidateDishes 中选 3 个 dishId。`
    }
  ]);

  try {
    const repaired = aiMenuSchema.parse(extractJsonObject(repair.content));
    const validated = validateOutput(repaired, input.candidateDishes, input.repeatDishIds, input.settings);
    if (validated.issues.length > 0) {
      throw new AiServiceError({
        code: "AI_INVALID_OUTPUT",
        message: "AI 修复后仍不符合餐桌规则，已切换到本地推荐。",
        status: 422,
        rawOutput: repair.content
      });
    }
    return {
      dishes: validated.dishes,
      output: repaired,
      validationResult: "repaired",
      latencyMs: first.latencyMs + repair.latencyMs,
      inputTokens: (first.inputTokens ?? 0) + (repair.inputTokens ?? 0),
      outputTokens: (first.outputTokens ?? 0) + (repair.outputTokens ?? 0),
      inputSnapshot,
      model: config.model
    };
  } catch (error) {
    if (error instanceof AiServiceError) throw error;
    throw new AiServiceError({
      code: "AI_INVALID_OUTPUT",
      message: "AI 返回的结构无效，已切换到本地推荐。",
      status: 422,
      rawOutput: repair.content
    });
  }
}
