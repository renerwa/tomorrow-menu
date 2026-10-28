import { randomUUID } from "node:crypto";
import { getDb } from "./db";
import type {
  AiRationale,
  Dish,
  DishCountSummary,
  DishRole,
  Family,
  Flavor,
  Ingredient,
  MealPlan,
  MealPlanDish,
  MealPlanSource,
  MealPlanStatus,
  PlanDish,
  PlanView,
  Recipe,
  Settings,
  SpiceLevel,
  ValidationResult
} from "@/domain/types";
import { sortDishesByRole } from "@/domain/composition";

export const FAMILY_ID = process.env.FAMILY_ID || "family_chen";

type Row = Record<string, unknown>;

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function asDateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value ?? "").slice(0, 10);
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function mapDish(row: Row): Dish {
  return {
    id: String(row.id),
    familyId: row.family_id ? String(row.family_id) : null,
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    role: row.role as DishRole,
    protein: row.protein as Dish["protein"],
    spiceLevel: Number(row.spice_level) as SpiceLevel,
    flavor: row.flavor as Flavor,
    sourceGroup: String(row.source_group),
    dataStatus: row.data_status as Dish["dataStatus"],
    autoPlannable: Boolean(row.auto_plannable),
    isCustom: Boolean(row.is_custom),
    deletedAt: row.deleted_at ? asIso(row.deleted_at) : null,
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

function mapIngredient(row: Row): Ingredient {
  return {
    id: String(row.id),
    name: String(row.name),
    normalizedName: String(row.normalized_name),
    category: row.category as Ingredient["category"],
    defaultPantry: Boolean(row.default_pantry),
    isCustom: Boolean(row.is_custom)
  };
}

function mapRecipe(row: Row): Recipe {
  return {
    dishId: String(row.dish_id),
    familyId: row.family_id ? String(row.family_id) : null,
    ingredientIds: asJson<string[]>(row.ingredient_ids, []),
    updatedAt: asIso(row.updated_at)
  };
}

function mapSettings(row: Row): Settings {
  return {
    familyId: String(row.family_id),
    pantryIngredientIds: asJson<string[]>(row.pantry_ingredient_ids, []),
    blockedIngredientIds: asJson<string[]>(row.blocked_ingredient_ids, []),
    disabledDishIds: asJson<string[]>(row.disabled_dish_ids, []),
    repeatDays: Number(row.repeat_days),
    maxSpicyDishes: Number(row.max_spicy_dishes) as Settings["maxSpicyDishes"],
    thirdDishDefault: row.third_dish_default as Settings["thirdDishDefault"],
    schemaVersion: Number(row.schema_version)
  };
}

function mapMealPlan(row: Row): MealPlan {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    targetDate: asDateOnly(row.target_date),
    status: row.status as MealPlanStatus,
    source: row.source as MealPlanSource,
    aiDecisionId: row.ai_decision_id ? String(row.ai_decision_id) : null,
    historyWindowUsed: Number(row.history_window_used),
    manualOverride: Boolean(row.manual_override),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at)
  };
}

export async function getFamily(): Promise<Family> {
  const db = await getDb();
  const result = await db.query<Row>("SELECT * FROM families WHERE id = $1", [FAMILY_ID]);
  const row = result.rows[0];
  if (!row) throw new Error("Family not initialized");
  return {
    id: String(row.id),
    name: String(row.name),
    timezone: String(row.timezone),
    profile: asJson(row.profile, {
      adults: 3,
      children: 1,
      childAge: 8,
      spiceTolerance: "微辣"
    }),
    createdAt: asIso(row.created_at)
  };
}

export async function updateFamilyProfile(input: {
  name?: string;
  timezone?: string;
  profile?: Family["profile"];
}): Promise<Family> {
  const db = await getDb();
  const current = await getFamily();
  await db.query(
    `UPDATE families
     SET name = $2, timezone = $3, profile = $4::jsonb
     WHERE id = $1`,
    [
      FAMILY_ID,
      input.name ?? current.name,
      input.timezone ?? current.timezone,
      JSON.stringify(input.profile ?? current.profile)
    ]
  );
  return getFamily();
}

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const result = await db.query<Row>("SELECT * FROM settings WHERE family_id = $1", [FAMILY_ID]);
  const row = result.rows[0];
  if (!row) throw new Error("Settings not initialized");
  return mapSettings(row);
}

export async function updateSettings(patch: Partial<Omit<Settings, "familyId">>): Promise<Settings> {
  const db = await getDb();
  const current = await getSettings();
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Partial<Omit<Settings, "familyId">>;
  const next = { ...current, ...definedPatch };
  await db.query(
    `UPDATE settings
     SET pantry_ingredient_ids = $2::jsonb,
         blocked_ingredient_ids = $3::jsonb,
         disabled_dish_ids = $4::jsonb,
         repeat_days = $5,
         max_spicy_dishes = $6,
         third_dish_default = $7,
         schema_version = $8,
         updated_at = NOW()
     WHERE family_id = $1`,
    [
      FAMILY_ID,
      JSON.stringify(next.pantryIngredientIds),
      JSON.stringify(next.blockedIngredientIds),
      JSON.stringify(next.disabledDishIds),
      next.repeatDays,
      next.maxSpicyDishes,
      next.thirdDishDefault,
      next.schemaVersion
    ]
  );
  return getSettings();
}

export async function getDishes(options: { includeDeleted?: boolean } = {}): Promise<Dish[]> {
  const db = await getDb();
  const deletedClause = options.includeDeleted ? "" : "AND deleted_at IS NULL";
  const result = await db.query<Row>(
    `SELECT * FROM dishes
     WHERE (family_id IS NULL OR family_id = $1) ${deletedClause}
     ORDER BY CASE role WHEN 'meat' THEN 0 WHEN 'veg' THEN 1 WHEN 'soup' THEN 2 ELSE 3 END, id`,
    [FAMILY_ID]
  );
  return result.rows.map(mapDish);
}

export async function getDishById(id: string, options: { includeDeleted?: boolean } = {}): Promise<Dish | null> {
  const db = await getDb();
  const deletedClause = options.includeDeleted ? "" : "AND deleted_at IS NULL";
  const result = await db.query<Row>(
    `SELECT * FROM dishes WHERE id = $1 AND (family_id IS NULL OR family_id = $2) ${deletedClause}`,
    [id, FAMILY_ID]
  );
  return result.rows[0] ? mapDish(result.rows[0]) : null;
}

export async function getIngredients(): Promise<Ingredient[]> {
  const db = await getDb();
  const result = await db.query<Row>("SELECT * FROM ingredients ORDER BY category, name");
  return result.rows.map(mapIngredient);
}

export async function getRecipes(dishId?: string): Promise<Recipe[]> {
  const db = await getDb();
  const result = dishId
    ? await db.query<Row>("SELECT * FROM recipes WHERE dish_id = $1", [dishId])
    : await db.query<Row>("SELECT * FROM recipes WHERE family_id IS NULL OR family_id = $1", [FAMILY_ID]);
  return result.rows.map(mapRecipe);
}

export async function getRecipeForDish(dishId: string): Promise<Recipe | null> {
  const db = await getDb();
  const result = await db.query<Row>("SELECT * FROM recipes WHERE dish_id = $1", [dishId]);
  return result.rows[0] ? mapRecipe(result.rows[0]) : null;
}

export async function saveRecipe(dishId: string, ingredientIds: string[], familyId: string | null): Promise<Recipe> {
  const db = await getDb();
  await db.query(
    `INSERT INTO recipes(dish_id, family_id, ingredient_ids, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (dish_id) DO UPDATE SET family_id = EXCLUDED.family_id, ingredient_ids = EXCLUDED.ingredient_ids, updated_at = NOW()`,
    [dishId, familyId, JSON.stringify(ingredientIds)]
  );
  const recipe = await getRecipeForDish(dishId);
  if (!recipe) throw new Error("Recipe save failed");
  return recipe;
}

export async function createIngredient(input: {
  name: string;
  category: Ingredient["category"];
  defaultPantry?: boolean;
}): Promise<Ingredient> {
  const db = await getDb();
  const normalizedName = input.name.normalize("NFKC").replace(/\s+/g, "");
  const existing = await db.query<Row>("SELECT * FROM ingredients WHERE normalized_name = $1", [normalizedName]);
  if (existing.rows[0]) return mapIngredient(existing.rows[0]);
  const id = `ci-${randomUUID()}`;
  await db.query(
    `INSERT INTO ingredients(id, name, normalized_name, category, default_pantry, is_custom)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, input.name.trim(), normalizedName, input.category, input.defaultPantry ?? false]
  );
  return { id, name: input.name.trim(), normalizedName, category: input.category, defaultPantry: input.defaultPantry ?? false, isCustom: true };
}

export async function setDishDisabled(dishId: string, disabled: boolean): Promise<Settings> {
  const settings = await getSettings();
  const ids = new Set(settings.disabledDishIds);
  if (disabled) ids.add(dishId);
  else ids.delete(dishId);
  return updateSettings({ disabledDishIds: [...ids] });
}

export async function createCustomDish(input: {
  name: string;
  role: DishRole;
  protein: Dish["protein"];
  spiceLevel: SpiceLevel;
  flavor: Flavor;
  ingredientIds: string[];
  autoPlannable?: boolean;
}): Promise<Dish> {
  const db = await getDb();
  const id = `cd-${randomUUID()}`;
  const dataStatus = input.ingredientIds.length > 0 ? "ready" : "draft";
  await db.transaction(async (query) => {
    await query(
      `INSERT INTO dishes(id, family_id, name, normalized_name, role, protein, spice_level, flavor, source_group, data_status, auto_plannable, is_custom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '自定义菜', $9, $10, true)`,
      [
        id,
        FAMILY_ID,
        input.name.trim(),
        input.name.normalize("NFKC").replace(/\s+/g, ""),
        input.role,
        input.protein,
        input.spiceLevel,
        input.flavor,
        dataStatus,
        input.autoPlannable ?? input.role !== "other"
      ]
    );
    if (input.ingredientIds.length > 0) {
      await query(
        "INSERT INTO recipes(dish_id, family_id, ingredient_ids) VALUES ($1, $2, $3::jsonb)",
        [id, FAMILY_ID, JSON.stringify(input.ingredientIds)]
      );
    }
  });
  const dish = await getDishById(id);
  if (!dish) throw new Error("Custom dish create failed");
  return dish;
}

export async function updateDish(
  id: string,
  patch: Partial<Pick<Dish, "name" | "role" | "protein" | "spiceLevel" | "flavor" | "dataStatus" | "autoPlannable">>
): Promise<Dish> {
  const db = await getDb();
  const current = await getDishById(id);
  if (!current) throw new Error("Dish not found");
  await db.query(
    `UPDATE dishes
     SET name = $2, normalized_name = $3, role = $4, protein = $5, spice_level = $6,
         flavor = $7, data_status = $8, auto_plannable = $9, updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      patch.name ?? current.name,
      (patch.name ?? current.name).normalize("NFKC").replace(/\s+/g, ""),
      patch.role ?? current.role,
      patch.protein ?? current.protein,
      patch.spiceLevel ?? current.spiceLevel,
      patch.flavor ?? current.flavor,
      patch.dataStatus ?? current.dataStatus,
      patch.autoPlannable ?? current.autoPlannable
    ]
  );
  const updated = await getDishById(id);
  if (!updated) throw new Error("Dish update failed");
  return updated;
}

export async function deleteCustomDish(id: string): Promise<void> {
  const db = await getDb();
  const dish = await getDishById(id);
  if (!dish) throw new Error("Dish not found");
  if (!dish.isCustom || dish.familyId !== FAMILY_ID) throw new Error("内置菜不可删除，只能停用");
  const settings = await getSettings();
  const disabledDishIds = settings.disabledDishIds.filter((dishId) => dishId !== id);
  await db.transaction(async (query) => {
    await query(
      `UPDATE dishes
       SET deleted_at = NOW(), auto_plannable = false, updated_at = NOW()
       WHERE id = $1 AND family_id = $2 AND deleted_at IS NULL`,
      [id, FAMILY_ID]
    );
    await query(
      "UPDATE settings SET disabled_dish_ids = $2::jsonb, updated_at = NOW() WHERE family_id = $1",
      [FAMILY_ID, JSON.stringify(disabledDishIds)]
    );
  });
}

export async function getDishCounts(): Promise<DishCountSummary> {
  const { decorateDishes, toRecipeMap } = await import("@/domain/eligibility");
  const [dishes, recipes, ingredients, settings] = await Promise.all([
    getDishes(),
    getRecipes(),
    getIngredients(),
    getSettings()
  ]);
  const decorated = decorateDishes(dishes, toRecipeMap(recipes), ingredients, settings);
  return {
    total: dishes.length,
    ready: dishes.filter((dish) => dish.dataStatus === "ready").length,
    draft: dishes.filter((dish) => dish.dataStatus === "draft").length,
    autoPlannable: decorated.filter((dish) => dish.autoEligible).length,
    meat: dishes.filter((dish) => dish.role === "meat").length,
    veg: dishes.filter((dish) => dish.role === "veg").length,
    soup: dishes.filter((dish) => dish.role === "soup").length,
    other: dishes.filter((dish) => dish.role === "other").length
  };
}

export async function getMealPlanByDate(date: string): Promise<MealPlan | null> {
  const db = await getDb();
  const result = await db.query<Row>(
    `SELECT id, family_id, target_date::text AS target_date, status, source, ai_decision_id,
            history_window_used, manual_override, created_at, updated_at
     FROM meal_plans
     WHERE family_id = $1 AND target_date = $2`,
    [FAMILY_ID, date]
  );
  return result.rows[0] ? mapMealPlan(result.rows[0]) : null;
}

async function getPlanDishRows(planIds: string[]): Promise<Array<{ planId: string; dish: Dish; sortOrder: number }>> {
  if (planIds.length === 0) return [];
  const db = await getDb();
  const placeholders = planIds.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query<Row>(
    `SELECT mpd.meal_plan_id, mpd.sort_order, d.*
     FROM meal_plan_dishes mpd
     JOIN dishes d ON d.id = mpd.dish_id
     WHERE mpd.meal_plan_id IN (${placeholders})
     ORDER BY mpd.meal_plan_id, mpd.sort_order`,
    planIds
  );
  return result.rows.map((row) => ({
    planId: String(row.meal_plan_id),
    dish: mapDish(row),
    sortOrder: Number(row.sort_order)
  }));
}

export interface PlanWithDishes {
  plan: MealPlan;
  dishes: Dish[];
}

export async function getPlansBetween(from: string, to: string, status?: MealPlanStatus): Promise<PlanWithDishes[]> {
  const db = await getDb();
  const params: unknown[] = [FAMILY_ID, from, to];
  const statusClause = status ? "AND status = $4" : "";
  if (status) params.push(status);
  const plansResult = await db.query<Row>(
    `SELECT id, family_id, target_date::text AS target_date, status, source, ai_decision_id,
            history_window_used, manual_override, created_at, updated_at
     FROM meal_plans
     WHERE family_id = $1 AND target_date BETWEEN $2 AND $3 ${statusClause}
     ORDER BY target_date`,
    params
  );
  const plans = plansResult.rows.map(mapMealPlan);
  const dishRows = await getPlanDishRows(plans.map((plan) => plan.id));
  return plans.map((plan) => ({
    plan,
    dishes: dishRows
      .filter((item) => item.planId === plan.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.dish)
  }));
}

export async function getHistory(limit = 60): Promise<PlanWithDishes[]> {
  const db = await getDb();
  const plansResult = await db.query<Row>(
    `SELECT id, family_id, target_date::text AS target_date, status, source, ai_decision_id,
            history_window_used, manual_override, created_at, updated_at
     FROM meal_plans
     WHERE family_id = $1 AND status = 'confirmed'
     ORDER BY target_date DESC
     LIMIT $2`,
    [FAMILY_ID, limit]
  );
  const plans = plansResult.rows.map(mapMealPlan);
  const dishRows = await getPlanDishRows(plans.map((plan) => plan.id));
  return plans.map((plan) => ({
    plan,
    dishes: dishRows.filter((item) => item.planId === plan.id).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.dish)
  }));
}

export async function getPlanView(date: string): Promise<PlanView | null> {
  const plan = await getMealPlanByDate(date);
  if (!plan) return null;
  const dishRows = await getPlanDishRows([plan.id]);
  let ai: AiRationale | null = null;
  if (plan.aiDecisionId) {
    const db = await getDb();
    const decisionResult = await db.query<Row>("SELECT * FROM ai_decisions WHERE id = $1", [plan.aiDecisionId]);
    const decision = decisionResult.rows[0];
    if (decision) {
      const output = asJson<Record<string, unknown>>(decision.output_snapshot, {});
      const outputDishes = Array.isArray(output.dishes) ? (output.dishes as Array<{ dishId: string; reason: string }>) : [];
      const reasons = Object.fromEntries(outputDishes.map((dish) => [dish.dishId, dish.reason]));
      ai = {
        summary: String(output.summary ?? "已按家庭规则生成一桌晚餐。"),
        diversity: asJson(output.diversity, { protein: "", vegetable: "", flavor: "" }),
        confidence: typeof output.confidence === "number" ? output.confidence : null,
        validationResult: decision.validation_result as ValidationResult,
        fallbackUsed: Boolean(decision.fallback_used),
        notice: typeof output.notice === "string" ? output.notice : null,
        model: String(decision.model),
        reasons,
        createdAt: asIso(decision.created_at)
      };
    }
  }
  return {
    id: plan.id,
    targetDate: plan.targetDate,
    status: plan.status,
    source: plan.source,
    historyWindowUsed: plan.historyWindowUsed,
    manualOverride: plan.manualOverride,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    dishes: sortDishesByRole(
      dishRows.map(({ dish, sortOrder }) => ({
        ...dish,
        sortOrder,
        reason: ai?.reasons[dish.id] ?? null
      }))
    ).map((dish, index) => ({ ...dish, sortOrder: index })),
    ai
  };
}

export async function savePlan(input: {
  targetDate: string;
  status?: MealPlanStatus;
  source: MealPlanSource;
  dishes: Array<{ dishId: string; role: DishRole }>;
  aiDecisionId?: string | null;
  historyWindowUsed: number;
  manualOverride?: boolean;
  preserveExistingId?: boolean;
}): Promise<MealPlan> {
  const db = await getDb();
  const existing = await getMealPlanByDate(input.targetDate);
  const id = existing?.id ?? randomUUID();
  await db.transaction(async (query) => {
    if (existing) {
      await query(
        `UPDATE meal_plans
         SET status = $2, source = $3, ai_decision_id = $4, history_window_used = $5,
             manual_override = $6, updated_at = NOW()
         WHERE id = $1`,
        [
          id,
          input.status ?? existing.status,
          input.source,
          input.aiDecisionId === undefined ? existing.aiDecisionId : input.aiDecisionId,
          input.historyWindowUsed,
          input.manualOverride ?? existing.manualOverride
        ]
      );
    } else {
      await query(
        `INSERT INTO meal_plans(id, family_id, target_date, status, source, ai_decision_id, history_window_used, manual_override)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          FAMILY_ID,
          input.targetDate,
          input.status ?? "draft",
          input.source,
          input.aiDecisionId ?? null,
          input.historyWindowUsed,
          input.manualOverride ?? false
        ]
      );
    }
    await query("DELETE FROM meal_plan_dishes WHERE meal_plan_id = $1", [id]);
    for (let index = 0; index < input.dishes.length; index += 1) {
      await query(
        `INSERT INTO meal_plan_dishes(id, meal_plan_id, dish_id, role, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), id, input.dishes[index].dishId, input.dishes[index].role, index]
      );
    }
  });
  const plan = await getMealPlanByDate(input.targetDate);
  if (!plan) throw new Error("Plan save failed");
  return plan;
}

export async function confirmPlan(date: string, manualOverride: boolean): Promise<void> {
  const db = await getDb();
  await db.query(
    `UPDATE meal_plans
     SET status = 'confirmed', manual_override = $2, updated_at = NOW()
     WHERE family_id = $1 AND target_date = $3`,
    [FAMILY_ID, manualOverride, date]
  );
}

export async function deletePlan(date: string): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM meal_plans WHERE family_id = $1 AND target_date = $2", [FAMILY_ID, date]);
}

export async function recordAiDecision(input: {
  targetDate: string;
  model: string;
  promptVersion: string;
  inputSnapshot: unknown;
  outputSnapshot: unknown;
  validationResult: ValidationResult;
  fallbackUsed: boolean;
  latencyMs: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): Promise<string> {
  const db = await getDb();
  const id = randomUUID();
  await db.query(
    `INSERT INTO ai_decisions(id, family_id, target_date, model, prompt_version, input_snapshot, output_snapshot,
       validation_result, fallback_used, latency_ms, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)`,
    [
      id,
      FAMILY_ID,
      input.targetDate,
      input.model,
      input.promptVersion,
      JSON.stringify(input.inputSnapshot),
      JSON.stringify(input.outputSnapshot),
      input.validationResult,
      input.fallbackUsed,
      input.latencyMs,
      input.inputTokens ?? null,
      input.outputTokens ?? null
    ]
  );
  return id;
}

export async function countRateLimit(day: string, kind: string, ipHash?: string): Promise<number> {
  const db = await getDb();
  const params: unknown[] = [day, kind];
  const ipClause = ipHash ? "AND ip_hash = $3" : "";
  if (ipHash) params.push(ipHash);
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM rate_limit_events WHERE day = $1 AND kind = $2 ${ipClause}`,
    params
  );
  return Number(result.rows[0]?.count ?? 0);
}

export async function recordRateLimit(day: string, kind: string, ipHash: string): Promise<void> {
  const db = await getDb();
  await db.query(
    "INSERT INTO rate_limit_events(id, day, ip_hash, kind) VALUES ($1, $2, $3, $4)",
    [randomUUID(), day, ipHash, kind]
  );
}

export async function writeAudit(action: string, target: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const db = await getDb();
  await db.query(
    "INSERT INTO audit_logs(id, family_id, action, target, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)",
    [randomUUID(), FAMILY_ID, action, target, JSON.stringify(metadata)]
  );
}
