import path from "node:path";

export interface Database {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  transaction<T>(callback: (query: Database["query"]) => Promise<T>): Promise<T>;
}

type GlobalWithDb = typeof globalThis & {
  __mingriDbPromise?: Promise<Database>;
};

const globalWithDb = globalThis as GlobalWithDb;

function normalizeResult<T>(result: { rows?: unknown[]; rowCount?: number | null; affectedRows?: number }) {
  return {
    rows: (result.rows ?? []) as T[],
    rowCount: result.rowCount ?? result.affectedRows ?? 0
  };
}

async function createDatabase(): Promise<Database> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString });
    const query: Database["query"] = async (sql, params = []) => {
      const result = await pool.query(sql, params);
      return normalizeResult(result);
    };
    return {
      query,
      async transaction(callback) {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await callback(async (sql, params = []) => {
            const queryResult = await client.query(sql, params);
            return normalizeResult(queryResult);
          });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
    };
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_PATH || path.join(process.cwd(), ".data", "pglite");
  const fs = await import("node:fs/promises");
  await fs.mkdir(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  const query: Database["query"] = async (sql, params = []) => {
    const result = await pglite.query(sql, params);
    return normalizeResult(result);
  };
  return {
    query,
    async transaction(callback) {
      await query("BEGIN");
      try {
        const result = await callback(query);
        await query("COMMIT");
        return result;
      } catch (error) {
        await query("ROLLBACK");
        throw error;
      }
    }
  };
}

export function getDb(): Promise<Database> {
  if (!globalWithDb.__mingriDbPromise) {
    globalWithDb.__mingriDbPromise = createDatabase()
      .then(async (db) => {
        await migrate(db);
        await seed(db);
        return db;
      })
      .catch((error) => {
        globalWithDb.__mingriDbPromise = undefined;
        throw error;
      });
  }
  return globalWithDb.__mingriDbPromise;
}

async function migrate(db: Database): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS families (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      timezone TEXT NOT NULL,
      profile JSONB NOT NULL DEFAULT '{"adults":3,"children":1,"childAge":8,"spiceTolerance":"微辣"}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id TEXT PRIMARY KEY,
      family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      role TEXT NOT NULL,
      protein TEXT NOT NULL,
      spice_level INTEGER NOT NULL DEFAULT 0,
      flavor TEXT NOT NULL DEFAULT 'normal',
      source_group TEXT NOT NULL DEFAULT '自定义',
      data_status TEXT NOT NULL DEFAULT 'draft',
      auto_plannable BOOLEAN NOT NULL DEFAULT TRUE,
      is_custom BOOLEAN NOT NULL DEFAULT FALSE,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS dishes_role_idx ON dishes(role);
    CREATE INDEX IF NOT EXISTS dishes_status_idx ON dishes(data_status);

    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      default_pantry BOOLEAN NOT NULL DEFAULT FALSE,
      is_custom BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS recipes (
      dish_id TEXT PRIMARY KEY REFERENCES dishes(id) ON DELETE CASCADE,
      family_id TEXT REFERENCES families(id) ON DELETE CASCADE,
      ingredient_ids JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      family_id TEXT PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
      pantry_ingredient_ids JSONB NOT NULL DEFAULT '[]',
      blocked_ingredient_ids JSONB NOT NULL DEFAULT '[]',
      disabled_dish_ids JSONB NOT NULL DEFAULT '[]',
      repeat_days INTEGER NOT NULL DEFAULT 7,
      max_spicy_dishes INTEGER NOT NULL DEFAULT 1,
      third_dish_default TEXT NOT NULL DEFAULT 'veg',
      schema_version INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ai_decisions (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      target_date DATE NOT NULL,
      model TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      input_snapshot JSONB,
      output_snapshot JSONB,
      validation_result TEXT NOT NULL,
      fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER,
      output_tokens INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS ai_decisions_date_idx ON ai_decisions(family_id, target_date);

    CREATE TABLE IF NOT EXISTS meal_plans (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
      target_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      source TEXT NOT NULL DEFAULT 'ai',
      ai_decision_id TEXT REFERENCES ai_decisions(id) ON DELETE SET NULL,
      history_window_used INTEGER NOT NULL DEFAULT 7,
      manual_override BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(family_id, target_date)
    );
    CREATE INDEX IF NOT EXISTS meal_plans_history_idx ON meal_plans(family_id, target_date, status);

    CREATE TABLE IF NOT EXISTS meal_plan_dishes (
      id TEXT PRIMARY KEY,
      meal_plan_id TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
      dish_id TEXT NOT NULL REFERENCES dishes(id),
      role TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      UNIQUE(meal_plan_id, sort_order)
    );
    CREATE INDEX IF NOT EXISTS meal_plan_dishes_plan_idx ON meal_plan_dishes(meal_plan_id);

    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id TEXT PRIMARY KEY,
      day DATE NOT NULL,
      ip_hash TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rate_limit_day_idx ON rate_limit_events(day, kind);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      family_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  for (const statement of ddl.split(";").map((part) => part.trim()).filter(Boolean)) {
    await db.query(statement);
  }
  await db.query("ALTER TABLE dishes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ");
  await db.query(
    "INSERT INTO schema_migrations(version) VALUES (1) ON CONFLICT (version) DO NOTHING"
  );
  await db.query(
    "INSERT INTO schema_migrations(version) VALUES (2) ON CONFLICT (version) DO NOTHING"
  );
}

async function seed(db: Database): Promise<void> {
  const { seedDishes, seedIngredients, seedRecipes, seedDefaultPantryIds, demoHistoryNames, dishIdByName } =
    await import("@/data/seed");
  const { addDays, todayInTimeZone } = await import("@/domain/date");

  const familyId = process.env.FAMILY_ID || "family_chen";
  const familyName = process.env.FAMILY_NAME || "陈家餐桌";
  const timezone = process.env.FAMILY_TIMEZONE || "Asia/Shanghai";
  const profile = {
    adults: 3,
    children: 1,
    childAge: 8,
    spiceTolerance: "微辣"
  };

  await db.query(
    `INSERT INTO families(id, name, timezone, profile)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [familyId, familyName, timezone, JSON.stringify(profile)]
  );

  const ingredientRows = seedIngredients.map((ingredient) => [
    ingredient.id,
    ingredient.name,
    ingredient.normalizedName,
    ingredient.category,
    ingredient.defaultPantry,
    ingredient.isCustom
  ]);
  if (ingredientRows.length > 0) {
    const placeholders = ingredientRows.map((_, index) => {
      const offset = index * 6;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
    });
    await db.query(
      `INSERT INTO ingredients(id, name, normalized_name, category, default_pantry, is_custom)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (id) DO NOTHING`,
      ingredientRows.flat()
    );
  }

  const dishRows = seedDishes.map((dish) => [
    dish.id,
    null,
    dish.name,
    dish.normalizedName,
    dish.role,
    dish.protein,
    dish.spiceLevel,
    dish.flavor,
    dish.sourceGroup,
    dish.dataStatus,
    dish.autoPlannable,
    dish.isCustom
  ]);
  if (dishRows.length > 0) {
    const placeholders = dishRows.map((_, index) => {
      const offset = index * 12;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`;
    });
    await db.query(
      `INSERT INTO dishes(id, family_id, name, normalized_name, role, protein, spice_level, flavor, source_group, data_status, auto_plannable, is_custom)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (id) DO UPDATE SET
         data_status = EXCLUDED.data_status,
         auto_plannable = EXCLUDED.auto_plannable,
         updated_at = NOW()
       WHERE dishes.family_id IS NULL`,
      dishRows.flat()
    );
  }

  const recipeRows = seedRecipes.map((recipe) => [
    recipe.dishId,
    null,
    JSON.stringify(recipe.ingredientIds)
  ]);
  if (recipeRows.length > 0) {
    const placeholders = recipeRows.map((_, index) => {
      const offset = index * 3;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb)`;
    });
    await db.query(
      `INSERT INTO recipes(dish_id, family_id, ingredient_ids)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (dish_id) DO UPDATE SET
         ingredient_ids = EXCLUDED.ingredient_ids,
         updated_at = NOW()
       WHERE recipes.family_id IS NULL`,
      recipeRows.flat()
    );
  }

  await db.query(
    `INSERT INTO settings(family_id, pantry_ingredient_ids, blocked_ingredient_ids, disabled_dish_ids, repeat_days, max_spicy_dishes, third_dish_default, schema_version)
     VALUES ($1, $2::jsonb, '[]'::jsonb, '[]'::jsonb, 7, 1, 'veg', 1)
     ON CONFLICT (family_id) DO NOTHING`,
    [familyId, JSON.stringify(seedDefaultPantryIds)]
  );

  const planCount = await db.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM meal_plans WHERE family_id = $1",
    [familyId]
  );
  if (Number(planCount.rows[0]?.count ?? 0) > 0 || process.env.SEED_DEMO_HISTORY === "false") return;

  const today = todayInTimeZone(timezone);
  await db.transaction(async (query) => {
    for (let index = 0; index < demoHistoryNames.length; index += 1) {
      const targetDate = addDays(today, index - demoHistoryNames.length);
      const planId = `demo-${targetDate}`;
      await query(
        `INSERT INTO meal_plans(id, family_id, target_date, status, source, history_window_used, manual_override)
         VALUES ($1, $2, $3, 'confirmed', 'ai', 7, false)
         ON CONFLICT (family_id, target_date) DO NOTHING`,
        [planId, familyId, targetDate]
      );
      const names = demoHistoryNames[index];
      for (let order = 0; order < names.length; order += 1) {
        const dishId = dishIdByName(names[order]);
        const dish = seedDishes.find((item) => item.id === dishId);
        if (!dish) continue;
        await query(
          `INSERT INTO meal_plan_dishes(id, meal_plan_id, dish_id, role, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (meal_plan_id, sort_order) DO NOTHING`,
          [`${planId}-${order}`, planId, dishId, dish.role, order]
        );
      }
    }
  });
}
