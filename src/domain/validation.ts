import type { Dish, Settings } from "./types";
import { PROTEIN_LABELS } from "./labels";

export interface SelectionValidationContext {
  candidates: Dish[];
  repeatDishIds: Set<string>;
  settings: Settings;
}

export type SelectionMode = "generated" | "manual";

export function validateSelection(
  dishes: Dish[],
  context: SelectionValidationContext,
  options: { mode?: SelectionMode } = {}
): string[] {
  const mode = options.mode ?? "generated";
  const issues: string[] = [];
  const candidateIds = new Set(context.candidates.map((dish) => dish.id));
  const ids = dishes.map((dish) => dish.id);

  if (dishes.length === 0) issues.push("菜单至少需要保留一道菜。");
  if (new Set(ids).size !== ids.length) issues.push("同一道菜不能在一桌中出现两次。");
  for (const dish of dishes) {
    if (!candidateIds.has(dish.id)) issues.push(`菜品「${dish.name}」不在当前可推荐菜库中。`);
    if (dish.dataStatus !== "ready") issues.push(`菜品「${dish.name}」尚未完善。`);
    if (!dish.autoPlannable || dish.role === "other") issues.push(`菜品「${dish.name}」不能自动推荐。`);
  }

  if (mode === "manual") return [...new Set(issues)];

  const meat = dishes.filter((dish) => dish.role === "meat");
  const veg = dishes.filter((dish) => dish.role === "veg");
  const soup = dishes.filter((dish) => dish.role === "soup");
  if (dishes.length !== 3 && dishes.length !== 4) {
    issues.push(`自动推荐需要 3 道（2 荤 1 素）或 4 道（2 荤 1 素 1 汤），当前为 ${dishes.length} 道。`);
  }
  if (meat.length !== 2) issues.push(`自动推荐需要恰好 2 道荤菜，当前为 ${meat.length} 道。`);
  if (veg.length !== 1) issues.push(`自动推荐需要恰好 1 道素菜，当前为 ${veg.length} 道；汤不能替代素菜。`);
  if (soup.length > 1) issues.push(`自动推荐最多配 1 道汤，当前为 ${soup.length} 道。`);
  if (dishes.some((dish) => dish.role === "other")) issues.push("非推荐池菜品不能进入自动晚餐组合。");
  if (meat.length === 2) {
    if (meat[0].protein === meat[1].protein) {
      issues.push(`两道荤菜的主蛋白质必须不同，当前都是${PROTEIN_LABELS[meat[0].protein]}。`);
    }
    if (meat.some((dish) => dish.protein === "none" || dish.protein === "other")) {
      issues.push("荤菜必须有明确的主蛋白质。");
    }
  }
  const spicy = dishes.filter((dish) => dish.spiceLevel > 0).length;
  if (spicy > context.settings.maxSpicyDishes) {
    issues.push(`辣菜有 ${spicy} 道，超过上限 ${context.settings.maxSpicyDishes} 道。`);
  }
  if (!dishes.some((dish) => dish.flavor === "light")) issues.push("整桌至少需要一道清淡菜。");

  return [...new Set(issues)];
}

export function selectionWarnings(dishes: Dish[], context: SelectionValidationContext): string[] {
  const warnings: string[] = [];
  const meat = dishes.filter((dish) => dish.role === "meat");
  const veg = dishes.filter((dish) => dish.role === "veg");
  const spicy = dishes.filter((dish) => dish.spiceLevel > 0).length;

  for (const dish of dishes) {
    if (context.repeatDishIds.has(dish.id)) warnings.push(`菜品「${dish.name}」在重复窗口内已经出现过。`);
  }
  if (spicy > context.settings.maxSpicyDishes) {
    warnings.push(`辣菜有 ${spicy} 道，超过上限 ${context.settings.maxSpicyDishes} 道。`);
  }
  if (!dishes.some((dish) => dish.flavor === "light")) warnings.push("整桌没有清淡菜，口味可能偏重。");
  if (meat.length >= 2 && new Set(meat.map((dish) => dish.protein)).size < meat.length) {
    warnings.push("这桌有多道荤菜使用相同主蛋白质。");
  }
  if (veg.length === 0) warnings.push("这桌没有素菜；汤菜不替代素菜。");

  return [...new Set(warnings)];
}
