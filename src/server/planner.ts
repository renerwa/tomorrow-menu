import { randomUUID } from "node:crypto";
import { addDays, daysBetween, isPastDate, todayInTimeZone } from "@/domain/date";
import { getEligibleDishes, toRecipeMap } from "@/domain/eligibility";
import { MenuUnavailableError, buildLocalRecommendation } from "@/domain/recommendation";
import { buildMealStats, toAiCandidates, toRecentMeals } from "@/domain/stats";
import { getComposition, compositionWarnings } from "@/domain/composition";
import { validateSelection } from "@/domain/validation";
import type {
  Dish,
  Ingredient,
  MealStats,
  PlanResponse,
  Recipe,
  Settings
} from "@/domain/types";
import { getAiConfig } from "@/ai/config";
import { AiServiceError } from "@/ai/errors";
import { requestAiMenu, MENU_PROMPT_VERSION } from "@/ai/menuDecision";
import {
  countRateLimit,
  getFamily,
  getIngredients,
  getPlanView,
  getPlansBetween,
  getRecipes,
  getSettings,
  getDishes,
  recordAiDecision,
  recordRateLimit,
  savePlan,
  type PlanWithDishes
} from "./repository";
import { requestIpHash } from "./security";
import type { NextRequest } from "next/server";
import { ApiError } from "./errors";

interface PlanningContext {
  family: Awaited<ReturnType<typeof getFamily>>;
  settings: Settings;
  dishes: Dish[];
  recipes: Recipe[];
  ingredients: Ingredient[];
  candidates: Dish[];
  recentPlans: PlanWithDishes[];
  futurePlans: PlanWithDishes[];
  repeatPlans: PlanWithDishes[];
  repeatPlans3: PlanWithDishes[];
  stats: MealStats;
  today: string;
}

async function loadPlanningContext(targetDate: string): Promise<PlanningContext> {
  const [family, settings, dishes, recipes, ingredients] = await Promise.all([
    getFamily(),
    getSettings(),
    getDishes(),
    getRecipes(),
    getIngredients()
  ]);
  const recipeMap = toRecipeMap(recipes);
  const candidates = getEligibleDishes(dishes, recipeMap, ingredients, settings);
  const historyDays = Math.max(7, settings.repeatDays);
  const repeatWindow = Math.max(7, settings.repeatDays);
  const today = todayInTimeZone(family.timezone);
  if (isPastDate(targetDate, today)) {
    throw new ApiError({
      status: 403,
      code: "PAST_DATE_READ_ONLY",
      message: "过去日期只读，不能修改菜单。",
      action: "open_history"
    });
  }

  const [recentPlans, futurePlans, repeatPlans, repeatPlans3] = await Promise.all([
    getPlansBetween(addDays(targetDate, -historyDays), addDays(targetDate, -1), "confirmed"),
    getPlansBetween(addDays(targetDate, 1), addDays(targetDate, repeatWindow), "confirmed"),
    getPlansBetween(addDays(targetDate, -repeatWindow), addDays(targetDate, repeatWindow), "confirmed"),
    getPlansBetween(addDays(targetDate, -3), addDays(targetDate, 3), "confirmed")
  ]);

  const stats = buildMealStats({
    recentPlans: recentPlans.map((plan) => ({ targetDate: plan.plan.targetDate, dishes: plan.dishes })),
    futurePlans: futurePlans.map((plan) => ({ targetDate: plan.plan.targetDate, dishes: plan.dishes })),
    candidates,
    recipes,
    ingredients
  });

  return {
    family,
    settings,
    dishes,
    recipes,
    ingredients,
    candidates,
    recentPlans,
    futurePlans,
    repeatPlans,
    repeatPlans3,
    stats,
    today
  };
}

function repeatDishIds(plans: PlanWithDishes[], targetDate: string): Set<string> {
  return new Set(
    plans
      .filter((plan) => plan.plan.targetDate !== targetDate)
      .flatMap((plan) => plan.dishes.map((dish) => dish.id))
  );
}

function recentMealPayload(plans: PlanWithDishes[]) {
  return toRecentMeals(plans.map((plan) => ({ targetDate: plan.plan.targetDate, dishes: plan.dishes })));
}

async function buildResponse(targetDate: string, context?: PlanningContext): Promise<PlanResponse> {
  const ctx = context ?? await loadPlanningContext(targetDate);
  const plan = await getPlanView(targetDate);
  const composition = getComposition(plan?.dishes ?? []);
  const warnings = plan ? compositionWarnings(plan.dishes) : [];
  if (plan && composition.valid) {
    warnings.push(
      ...validateSelection(plan.dishes, {
        candidates: ctx.candidates,
        repeatDishIds: repeatDishIds(ctx.repeatPlans, targetDate),
        settings: ctx.settings
      })
    );
  }
  if (plan && plan.historyWindowUsed < ctx.settings.repeatDays) {
    warnings.push(`近期可选菜不足，本次重复窗口放宽为 ${plan.historyWindowUsed === 0 ? "不限制" : `${plan.historyWindowUsed} 天`}。`);
  }
  return {
    plan,
    composition,
    recentMeals: recentMealPayload(ctx.recentPlans.slice(-7)),
    stats: ctx.stats,
    warnings: [...new Set(warnings)]
  };
}

export async function getPlanResponse(date: string): Promise<PlanResponse> {
  return buildResponse(date);
}

export async function getConfirmationIssues(date: string): Promise<{ issues: string[]; planExists: boolean }> {
  const context = await loadPlanningContext(date);
  const plan = await getPlanView(date);
  if (!plan) return { issues: ["还没有菜单，先让 AI 安排一桌。"], planExists: false };
  const issues = validateSelection(plan.dishes, {
    candidates: context.candidates,
    repeatDishIds: repeatDishIds(context.repeatPlans, date),
    settings: context.settings
  });
  const recipeMap = toRecipeMap(context.recipes);
  for (const dish of plan.dishes) {
    const recipe = recipeMap[dish.id];
    if (!recipe || recipe.length === 0) issues.push(`「${dish.name}」缺少食材表，补全后才能确认。`);
  }
  return { issues: [...new Set(issues)], planExists: true };
}

async function localFallback(input: {
  targetDate: string;
  context: PlanningContext;
  notice: string;
  model: string;
  latencyMs?: number;
  aiSnapshot?: unknown;
}): Promise<PlanResponse> {
  const { context, targetDate } = input;
  try {
    const local = buildLocalRecommendation({
      candidates: context.candidates,
      settings: context.settings,
      stats: context.stats,
      repeatIds: repeatDishIds(context.repeatPlans, targetDate),
      repeatIds3Days: repeatDishIds(context.repeatPlans3, targetDate)
    });
    const reasons = Object.fromEntries(local.dishes.map((dish) => [dish.id, local.reasons[dish.id] ?? "符合家庭规则。"]));
    const outputSnapshot = {
      dishes: local.dishes.map((dish) => ({ dishId: dish.id, reason: reasons[dish.id] })),
      summary: local.summary,
      diversity: local.diversity,
      confidence: null,
      notice: input.notice
    };
    const decisionId = await recordAiDecision({
      targetDate,
      model: input.model,
      promptVersion: MENU_PROMPT_VERSION,
      inputSnapshot: input.aiSnapshot ?? {
        stats: context.stats,
        candidateCount: context.candidates.length,
        settings: context.settings
      },
      outputSnapshot,
      validationResult: "fallback",
      fallbackUsed: true,
      latencyMs: input.latencyMs ?? 0
    });
    await savePlan({
      targetDate,
      status: "draft",
      source: "local",
      dishes: local.dishes.map((dish) => ({ dishId: dish.id, role: dish.role })),
      aiDecisionId: decisionId,
      historyWindowUsed: local.historyWindowUsed,
      manualOverride: false
    });
    return buildResponse(targetDate, context);
  } catch (error) {
    if (error instanceof MenuUnavailableError) {
      throw new ApiError({
        status: 422,
        code: "MENU_UNAVAILABLE",
        message: error.message,
        action: "adjust_library",
        details: error.details
      });
    }
    throw error;
  }
}

export async function generatePlan(date: string, request: NextRequest): Promise<PlanResponse> {
  const context = await loadPlanningContext(date);
  const config = getAiConfig();
  if (!config.configured) {
    return localFallback({
      targetDate: date,
      context,
      notice: "AI 未配置，已用本地规则生成一桌合法晚餐。",
      model: "local-rules"
    });
  }

  const ipHash = requestIpHash(request);
  const globalCalls = await countRateLimit(context.today, "ai-generate");
  const ipCalls = await countRateLimit(context.today, "ai-generate", ipHash);
  if (globalCalls >= config.maxDailyCalls) {
    return localFallback({
      targetDate: date,
      context,
      notice: "今日 AI 生成次数已达全局上限，已用本地规则生成。",
      model: "local-rules"
    });
  }
  if (ipCalls >= config.maxCallsPerIpPerDay) {
    return localFallback({
      targetDate: date,
      context,
      notice: "当前设备的今日 AI 次数已达上限，已用本地规则生成。",
      model: "local-rules"
    });
  }

  await recordRateLimit(context.today, "ai-generate", ipHash);
  const startedAt = Date.now();
  try {
    const aiResult = await requestAiMenu({
      targetDate: date,
      familyProfile: context.family.profile,
      settings: context.settings,
      recentMeals: recentMealPayload(context.recentPlans),
      futureMealsInWindow: recentMealPayload(context.futurePlans),
      stats: context.stats,
      candidates: toAiCandidates(context.candidates, context.recipes, context.ingredients),
      candidateDishes: context.candidates,
      repeatDishIds: repeatDishIds(context.repeatPlans, date)
    });
    const decisionId = await recordAiDecision({
      targetDate: date,
      model: aiResult.model,
      promptVersion: MENU_PROMPT_VERSION,
      inputSnapshot: aiResult.inputSnapshot,
      outputSnapshot: { ...aiResult.output, notice: null },
      validationResult: aiResult.validationResult,
      fallbackUsed: false,
      latencyMs: aiResult.latencyMs,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens
    });
    await savePlan({
      targetDate: date,
      status: "draft",
      source: "ai",
      dishes: aiResult.dishes.map((dish) => ({ dishId: dish.id, role: dish.role })),
      aiDecisionId: decisionId,
      historyWindowUsed: context.settings.repeatDays,
      manualOverride: false
    });
    return buildResponse(date, context);
  } catch (error) {
    const aiError = error instanceof AiServiceError ? error : null;
    return localFallback({
      targetDate: date,
      context,
      notice: aiError?.message ?? "AI 暂时不可用，已用本地规则生成。",
      model: aiError ? config.model : "local-rules",
      latencyMs: Date.now() - startedAt,
      aiSnapshot: { errorCode: aiError?.code ?? "AI_UNKNOWN", candidateCount: context.candidates.length }
    });
  }
}

export function assertPlanDateEditable(date: string, timezone: string): void {
  const today = todayInTimeZone(timezone);
  if (isPastDate(date, today)) {
    throw new ApiError({
      status: 403,
      code: "PAST_DATE_READ_ONLY",
      message: "过去日期只读，不能修改菜单。",
      action: "open_history"
    });
  }
}

export function ensurePlanWindowDescription(date: string, historyWindow: number, today: string): string {
  const diff = daysBetween(today, date);
  return diff === 0 ? "今天" : diff === 1 ? "明天" : `${historyWindow} 天窗口`;
}
