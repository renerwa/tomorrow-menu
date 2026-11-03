import type { Dish, MealStats, Settings, ThirdDishDefault } from "./types";
import { PROTEIN_LABELS } from "./labels";

export class MenuUnavailableError extends Error {
  code = "MENU_UNAVAILABLE";
  details: { meat: number; veg: number; soup: number };

  constructor(candidates: Dish[]) {
    const details = {
      meat: candidates.filter((dish) => dish.role === "meat").length,
      veg: candidates.filter((dish) => dish.role === "veg").length,
      soup: candidates.filter((dish) => dish.role === "soup").length
    };
    const missing = [
      details.meat < 2 ? "至少 2 道荤菜" : null,
      details.veg < 1 ? "至少 1 道素菜（汤不替代素菜）" : null
    ].filter(Boolean);
    super(`可用菜品不足，还缺 ${missing.join("、") || "符合规则的组合"}。请检查菜库、忌口或辣度设置。`);
    this.details = details;
  }
}

interface Combination {
  meat: [Dish, Dish];
  veg: Dish;
  soup: Dish | null;
  score: number;
}

export interface LocalRecommendation {
  dishes: Dish[];
  historyWindowUsed: number;
  relaxed: boolean;
  summary: string;
  reasons: Record<string, string>;
  diversity: { protein: string; vegetable: string; flavor: string };
}

function weightedPick(combinations: Combination[], random: () => number): Combination {
  const total = combinations.reduce((sum, combo) => sum + combo.score, 0);
  let cursor = random() * total;
  for (const combo of combinations) {
    cursor -= combo.score;
    if (cursor <= 0) return combo;
  }
  return combinations[combinations.length - 1];
}

function compositionScore(dishes: Dish[], stats: MealStats): number {
  let score = 10;
  for (const dish of dishes) {
    if (dish.protein !== "none" && dish.protein !== "other") {
      const count = stats.proteinCounts[dish.protein] ?? 0;
      score += Math.max(0, 5 - count) * 1.5;
    }
    score += dish.spiceLevel === 0 ? 0.5 : -1.2;
    if (dish.flavor === "rich") score -= 0.4;
  }
  return Math.max(0.2, score);
}

function isValidCombination(dishes: Dish[], settings: Settings): boolean {
  return dishes.filter((dish) => dish.spiceLevel > 0).length <= settings.maxSpicyDishes;
}

function buildCombinations(
  candidates: Dish[],
  repeatIds: Set<string>,
  settings: Settings,
  stats: MealStats,
  addSoup: boolean
): Combination[] {
  const available = candidates.filter((dish) => !repeatIds.has(dish.id));
  const meat = available.filter((dish) => dish.role === "meat");
  const vegetables = available.filter((dish) => dish.role === "veg");
  const soups = available.filter((dish) => dish.role === "soup");
  const baseCombos: Combination[] = [];

  for (let i = 0; i < meat.length; i += 1) {
    for (let j = i + 1; j < meat.length; j += 1) {
      const first = meat[i];
      const second = meat[j];
      if (first.protein === "none" || first.protein === "other") continue;
      if (second.protein === "none" || second.protein === "other") continue;
      for (const vegetable of vegetables) {
        const dishes = [first, second, vegetable];
        if (dishes.filter((dish) => dish.spiceLevel > 0).length > settings.maxSpicyDishes) continue;
        baseCombos.push({
          meat: [first, second],
          veg: vegetable,
          soup: null,
          score: compositionScore(dishes, stats)
        });
      }
    }
  }

  if (!addSoup || soups.length === 0) {
    return baseCombos.filter((combo) => isValidCombination([...combo.meat, combo.veg], settings));
  }

  const soupCombos: Combination[] = [];
  for (const base of baseCombos) {
    for (const soup of soups) {
      const dishes = [...base.meat, base.veg, soup];
      if (!isValidCombination(dishes, settings)) continue;
      soupCombos.push({ ...base, soup, score: compositionScore(dishes, stats) });
    }
  }
  return soupCombos.length > 0
    ? soupCombos
    : baseCombos.filter((combo) => isValidCombination([...combo.meat, combo.veg], settings));
}

function reasonForMeat(dish: Dish, pairedDish: Dish, stats: MealStats): string {
  const proteinLabel = PROTEIN_LABELS[dish.protein];
  const count = stats.proteinCounts[dish.protein] ?? 0;
  if (dish.spiceLevel === 0) return `优先选不辣的${dish.name}，作为孩子也容易接受的荤菜。`;
  if (count === 0) return `最近 7 天还没吃${proteinLabel}，这次补上${dish.name}。`;
  if (count >= 3 && dish.protein !== "pork") {
    return `最近 7 天${proteinLabel}出现 ${count} 次，这次用${dish.name}换换口味。`;
  }
  if (dish.protein === pairedDish.protein) {
    return `${proteinLabel}是家里的常备肉类，${dish.name}与${pairedDish.name}搭配，不强行错开蛋白质。`;
  }
  return `用${dish.name}提供${proteinLabel}，与${pairedDish.name}搭配平衡口味。`;
}

export function buildLocalRecommendation(input: {
  candidates: Dish[];
  settings: Settings;
  stats: MealStats;
  repeatIds: Set<string>;
  repeatIds3Days: Set<string>;
  mustExcludeIds?: Set<string>;
  random?: () => number;
}): LocalRecommendation {
  const random = input.random ?? Math.random;
  const addSoup = input.settings.thirdDishDefault === "soup";
  const mustExcludeIds = input.mustExcludeIds ?? new Set<string>();
  const attempts: Array<{ window: number; ids: Set<string> }> = [
    { window: input.settings.repeatDays, ids: new Set([...input.repeatIds, ...mustExcludeIds]) }
  ];
  if (input.settings.repeatDays > 3) {
    attempts.push({ window: 3, ids: new Set([...input.repeatIds3Days, ...mustExcludeIds]) });
  }
  if (input.settings.repeatDays > 0) attempts.push({ window: 0, ids: new Set(mustExcludeIds) });

  for (const attempt of attempts) {
    const combos = buildCombinations(
      input.candidates,
      attempt.ids,
      input.settings,
      input.stats,
      addSoup
    );
    if (combos.length > 0) {
      const chosen = weightedPick(combos, random);
      const dishes = [...chosen.meat, chosen.veg, ...(chosen.soup ? [chosen.soup] : [])];
      const reasons: Record<string, string> = {};
      reasons[chosen.meat[0].id] = reasonForMeat(chosen.meat[0], chosen.meat[1], input.stats);
      reasons[chosen.meat[1].id] = reasonForMeat(chosen.meat[1], chosen.meat[0], input.stats);
      reasons[chosen.veg.id] = `配${chosen.veg.name}，保证这桌有一道真正的素菜。`;
      if (chosen.soup) {
        reasons[chosen.soup.id] = `再配${chosen.soup.name}；汤是额外一道，不替代素菜。`;
      }
      const proteins = `${PROTEIN_LABELS[chosen.meat[0].protein]}和${PROTEIN_LABELS[chosen.meat[1].protein]}`;
      const sameProtein = chosen.meat[0].protein === chosen.meat[1].protein;
      const relaxed = attempt.window < input.settings.repeatDays;
      return {
        dishes,
        historyWindowUsed: attempt.window,
        relaxed,
        summary: `这桌用了${proteins}，素菜是${chosen.veg.name}${chosen.soup ? `，另配${chosen.soup.name}` : ""}。${sameProtein ? "两道荤菜不强行错开蛋白质" : "荤菜搭配有所变化"}${relaxed ? "；近期可选菜不足，已适度放宽重复窗口" : ""}。`,
        reasons,
        diversity: {
          protein: sameProtein
            ? `两道荤菜均为${PROTEIN_LABELS[chosen.meat[0].protein]}，不强制蛋白质轮换。`
            : `${PROTEIN_LABELS[chosen.meat[0].protein]}与${PROTEIN_LABELS[chosen.meat[1].protein]}搭配，兼顾营养与口味变化。`,
          vegetable: `${chosen.veg.name}提供蔬菜${chosen.soup ? `；${chosen.soup.name}是额外的汤菜，不替代素菜。` : "。"}`,
          flavor: `${dishes.filter((dish) => dish.spiceLevel > 0).length} 道辣菜，辣度符合设置。`
        }
      };
    }
  }

  throw new MenuUnavailableError(input.candidates);
}
