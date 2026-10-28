import { z } from "zod";
import { getDb } from "./db";
import { FAMILY_ID } from "./repository";

export const BACKUP_SCHEMA_VERSION = 1;

export const backupSchema = z.object({
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  family: z
    .object({
      name: z.string().min(1).max(40),
      timezone: z.string().min(1),
      profile: z.object({
        adults: z.number().int(),
        children: z.number().int(),
        childAge: z.number().int().nullable(),
        spiceTolerance: z.string()
      })
    })
    .optional(),
  settings: z
    .object({
      pantryIngredientIds: z.array(z.string()),
      blockedIngredientIds: z.array(z.string()),
      disabledDishIds: z.array(z.string()),
      repeatDays: z.number().int(),
      maxSpicyDishes: z.number().int(),
      thirdDishDefault: z.enum(["veg", "soup"]),
      schemaVersion: z.number().int()
    })
    .optional(),
  customDishes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        normalizedName: z.string(),
        role: z.enum(["meat", "veg", "soup", "other"]),
        protein: z.string(),
        spiceLevel: z.number().int().min(0).max(2),
        flavor: z.enum(["light", "normal", "rich"]),
        sourceGroup: z.string(),
        dataStatus: z.enum(["ready", "draft"]),
        autoPlannable: z.boolean(),
        isCustom: z.boolean(),
        deletedAt: z.string().nullable().optional()
      })
    )
    .default([]),
  customRecipes: z
    .array(z.object({ dishId: z.string(), familyId: z.string().nullable().optional(), ingredientIds: z.array(z.string()) }))
    .default([]),
  customIngredients: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        normalizedName: z.string(),
        category: z.enum(["meat", "vegetable", "soy", "seasoning", "staple", "other"]),
        defaultPantry: z.boolean(),
        isCustom: z.boolean()
      })
    )
    .default([]),
  plans: z
    .array(
      z.object({
        targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        status: z.enum(["draft", "confirmed"]),
        source: z.enum(["ai", "local", "manual"]),
        historyWindowUsed: z.number().int(),
        manualOverride: z.boolean(),
        dishes: z.array(z.object({ id: z.string(), name: z.string().optional(), role: z.enum(["meat", "veg", "soup", "other"]) }))
      })
    )
    .default([])
});

export type BackupData = z.infer<typeof backupSchema>;

export async function importBackup(backup: BackupData): Promise<void> {
  const db = await getDb();
  const existingDishRows = (
    await db.query<{ id: string; role: string; is_custom: boolean }>(
      "SELECT id, role, is_custom FROM dishes WHERE family_id IS NULL OR family_id = $1",
      [FAMILY_ID]
    )
  ).rows;
  const builtInDishIds = new Set(existingDishRows.filter((row) => !row.is_custom).map((row) => row.id));
  const dishRoles = new Map(existingDishRows.map((row) => [row.id, row.role]));
  const allDishIds = new Set(existingDishRows.filter((row) => !row.is_custom).map((row) => row.id));
  const customDishIds = new Set<string>();
  for (const dish of backup.customDishes) {
    if (builtInDishIds.has(dish.id)) throw new Error(`备份中的自定义菜 ${dish.id} 与内置菜冲突`);
    if (customDishIds.has(dish.id)) throw new Error(`备份中的自定义菜 ${dish.id} 重复`);
    customDishIds.add(dish.id);
    allDishIds.add(dish.id);
    dishRoles.set(dish.id, dish.role);
  }

  const existingIngredientRows = (
    await db.query<{ id: string; normalized_name: string; is_custom: boolean }>(
      "SELECT id, normalized_name, is_custom FROM ingredients"
    )
  ).rows;
  const builtInIngredientIds = new Set(
    existingIngredientRows.filter((row) => !row.is_custom).map((row) => row.id)
  );
  const ingredientIds = new Set(builtInIngredientIds);
  const ingredientNames = new Set(
    existingIngredientRows.filter((row) => !row.is_custom).map((row) => row.normalized_name)
  );
  const customIngredientIds = new Set<string>();
  for (const ingredient of backup.customIngredients) {
    if (builtInIngredientIds.has(ingredient.id)) {
      throw new Error(`备份中的自定义食材 ${ingredient.id} 与内置食材冲突`);
    }
    if (customIngredientIds.has(ingredient.id)) {
      throw new Error(`备份中的自定义食材 ${ingredient.id} 重复`);
    }
    if (ingredientNames.has(ingredient.normalizedName)) {
      throw new Error(`备份中的食材名称 ${ingredient.name} 与现有食材重复`);
    }
    customIngredientIds.add(ingredient.id);
    ingredientIds.add(ingredient.id);
    ingredientNames.add(ingredient.normalizedName);
  }

  for (const recipe of backup.customRecipes) {
    if (!allDishIds.has(recipe.dishId)) throw new Error(`备份菜谱引用了不存在的菜品 ${recipe.dishId}`);
    const missingIngredient = recipe.ingredientIds.find((id) => !ingredientIds.has(id));
    if (missingIngredient) throw new Error(`备份菜谱引用了不存在的食材 ${missingIngredient}`);
  }

  if (backup.settings) {
    const missingIngredient = [...backup.settings.pantryIngredientIds, ...backup.settings.blockedIngredientIds]
      .find((id) => !ingredientIds.has(id));
    if (missingIngredient) throw new Error(`备份设置引用了不存在的食材 ${missingIngredient}`);
    const missingDish = backup.settings.disabledDishIds.find((id) => !allDishIds.has(id));
    if (missingDish) throw new Error(`备份设置引用了不存在的菜品 ${missingDish}`);
  }

  const planDates = new Set<string>();
  for (const plan of backup.plans) {
    if (planDates.has(plan.targetDate)) throw new Error(`备份菜单日期 ${plan.targetDate} 重复`);
    planDates.add(plan.targetDate);
    if (plan.dishes.length > 3) throw new Error(`备份菜单 ${plan.targetDate} 超过 3 道菜`);
    const dishIdsInPlan = new Set<string>();
    for (const dish of plan.dishes) {
      if (!allDishIds.has(dish.id)) throw new Error(`备份菜单引用了不存在的菜品 ${dish.id}`);
      if (dishIdsInPlan.has(dish.id)) throw new Error(`备份菜单 ${plan.targetDate} 包含重复菜品`);
      dishIdsInPlan.add(dish.id);
      if (dishRoles.get(dish.id) !== dish.role) {
        throw new Error(`备份菜单 ${plan.targetDate} 的菜品角色与菜库不一致`);
      }
    }
  }

  await db.transaction(async (query) => {
    if (backup.family) {
      await query(
        "UPDATE families SET name = $2, timezone = $3, profile = $4::jsonb WHERE id = $1",
        [FAMILY_ID, backup.family.name, backup.family.timezone, JSON.stringify(backup.family.profile)]
      );
    }
    if (backup.settings) {
      await query(
        `UPDATE settings SET pantry_ingredient_ids = $2::jsonb, blocked_ingredient_ids = $3::jsonb,
           disabled_dish_ids = $4::jsonb, repeat_days = $5, max_spicy_dishes = $6,
           third_dish_default = $7, schema_version = $8, updated_at = NOW()
         WHERE family_id = $1`,
        [
          FAMILY_ID,
          JSON.stringify(backup.settings.pantryIngredientIds),
          JSON.stringify(backup.settings.blockedIngredientIds),
          JSON.stringify(backup.settings.disabledDishIds),
          backup.settings.repeatDays,
          backup.settings.maxSpicyDishes,
          backup.settings.thirdDishDefault,
          backup.settings.schemaVersion
        ]
      );
    } else {
      await query("UPDATE settings SET pantry_ingredient_ids = pantry_ingredient_ids WHERE family_id = $1", [FAMILY_ID]);
    }
    await query("DELETE FROM meal_plans WHERE family_id = $1", [FAMILY_ID]);
    await query("DELETE FROM recipes WHERE family_id = $1", [FAMILY_ID]);
    await query("DELETE FROM dishes WHERE family_id = $1 AND is_custom = true", [FAMILY_ID]);
    await query("DELETE FROM ingredients WHERE is_custom = true");

    for (const ingredient of backup.customIngredients) {
      await query(
        `INSERT INTO ingredients(id, name, normalized_name, category, default_pantry, is_custom)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
           category = EXCLUDED.category, default_pantry = EXCLUDED.default_pantry`,
        [ingredient.id, ingredient.name, ingredient.normalizedName, ingredient.category, ingredient.defaultPantry]
      );
    }
    for (const dish of backup.customDishes) {
      await query(
        `INSERT INTO dishes(id, family_id, name, normalized_name, role, protein, spice_level, flavor, source_group,
           data_status, auto_plannable, is_custom, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, normalized_name = EXCLUDED.normalized_name,
           role = EXCLUDED.role, protein = EXCLUDED.protein, spice_level = EXCLUDED.spice_level,
           flavor = EXCLUDED.flavor, data_status = EXCLUDED.data_status, auto_plannable = EXCLUDED.auto_plannable,
           family_id = EXCLUDED.family_id, deleted_at = EXCLUDED.deleted_at, updated_at = NOW()`,
        [
          dish.id,
          FAMILY_ID,
          dish.name,
          dish.normalizedName,
          dish.role,
          dish.protein,
          dish.spiceLevel,
          dish.flavor,
          dish.sourceGroup,
          dish.dataStatus,
          dish.autoPlannable,
          dish.deletedAt ?? null
        ]
      );
    }
    for (const recipe of backup.customRecipes) {
      await query(
        `INSERT INTO recipes(dish_id, family_id, ingredient_ids, updated_at)
         VALUES ($1, $2, $3::jsonb, NOW())
         ON CONFLICT (dish_id) DO UPDATE SET family_id = EXCLUDED.family_id,
           ingredient_ids = EXCLUDED.ingredient_ids, updated_at = NOW()`,
        [recipe.dishId, FAMILY_ID, JSON.stringify(recipe.ingredientIds)]
      );
    }
    for (const plan of backup.plans) {
      const planId = `import-${plan.targetDate}`;
      await query(
        `INSERT INTO meal_plans(id, family_id, target_date, status, source, history_window_used, manual_override)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [planId, FAMILY_ID, plan.targetDate, plan.status, plan.source, plan.historyWindowUsed, plan.manualOverride]
      );
      for (let index = 0; index < plan.dishes.length; index += 1) {
        const dish = plan.dishes[index];
        await query(
          "INSERT INTO meal_plan_dishes(id, meal_plan_id, dish_id, role, sort_order) VALUES ($1, $2, $3, $4, $5)",
          [`${planId}-${index}`, planId, dish.id, dish.role, index]
        );
      }
    }
  });
}
