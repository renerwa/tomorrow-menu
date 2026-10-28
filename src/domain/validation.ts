import type { Dish, Settings } from "./types";
import { PROTEIN_LABELS } from "./labels";

export interface SelectionValidationContext {
  candidates: Dish[];
  repeatDishIds: Set<string>;
  settings: Settings;
}

export function validateSelection(
  dishes: Dish[],
  context: SelectionValidationContext
): string[] {
  const issues: string[] = [];
  const candidateIds = new Set(context.candidates.map((dish) => dish.id));
  const ids = dishes.map((dish) => dish.id);

  if (dishes.length !== 3) issues.push(`菜单必须恰好 3 道，当前为 ${dishes.length} 道。`);
  if (new Set(ids).size !== ids.length) issues.push("同一道菜不能在一桌中出现两次。");
  for (const dish of dishes) {
    if (!candidateIds.has(dish.id)) issues.push(`菜品「${dish.name}」不在当前可推荐菜库中。`);
    if (context.repeatDishIds.has(dish.id)) issues.push(`菜品「${dish.name}」在重复窗口内已经出现过。`);
    if (dish.dataStatus !== "ready") issues.push(`菜品「${dish.name}」尚未完善。`);
    if (!dish.autoPlannable || dish.role === "other") issues.push(`菜品「${dish.name}」不能自动推荐。`);
  }

  const meat = dishes.filter((dish) => dish.role === "meat");
  const veg = dishes.filter((dish) => dish.role === "veg");
  const soup = dishes.filter((dish) => dish.role === "soup");
  if (meat.length !== 2) issues.push(`需要恰好 2 道荤菜，当前为 ${meat.length} 道。`);
  if (veg.length + soup.length !== 1 || (veg.length === 1 && soup.length === 1)) {
    issues.push("第三道必须且只能是 1 道素菜或 1 道汤。");
  }
  if (dishes.some((dish) => dish.role === "other")) issues.push("非推荐池菜品不能进入晚餐组合。");
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
