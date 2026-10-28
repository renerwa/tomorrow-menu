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
      details.veg + details.soup < 1 ? "1 道素菜或汤" : null
    ].filter(Boolean);
    super(`可用菜品不足，还缺 ${missing.join("、") || "符合规则的组合"}。请检查菜库、忌口或辣度设置。`);
    this.details = details;
  }
}

interface Combination {
  meat: [Dish, Dish];
  third: Dish;
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
    if (dish.role === "meat") {
      const count = stats.proteinCounts[dish.protein] ?? 0;
      score += Math.max(0, 5 - count) * 2;
    }
    if (dish.flavor === "light") score += 3;
    if (dish.flavor === "rich") score -= 0.8;
    if (dish.spiceLevel > 0) score -= 0.8;
    for (const ingredient of stats.ingredientCounts ? [] : []) void ingredient;
  }
  return Math.max(0.2, score);
}

function buildCombinations(
  candidates: Dish[],
  repeatIds: Set<string>,
  settings: Settings,
  stats: MealStats,
  thirdPreference: ThirdDishDefault
): Combination[] {
  const available = candidates.filter((dish) => !repeatIds.has(dish.id));
  const meat = available.filter((dish) => dish.role === "meat");
  const preferredThird = available.filter((dish) => dish.role === thirdPreference);
  const alternateThird = available.filter(
    (dish) => dish.role === (thirdPreference === "veg" ? "soup" : "veg")
  );
  const allThird = [...preferredThird, ...alternateThird];
  const combos: Combination[] = [];

  const addCombos = (thirdPool: Dish[]) => {
    for (let i = 0; i < meat.length; i += 1) {
      for (let j = i + 1; j < meat.length; j += 1) {
        const first = meat[i];
        const second = meat[j];
        if (first.protein === second.protein) continue;
        if (first.protein === "none" || first.protein === "other") continue;
        if (second.protein === "none" || second.protein === "other") continue;
        for (const third of thirdPool) {
          if (third.id === first.id || third.id === second.id) continue;
          const dishes = [first, second, third];
          if (dishes.filter((dish) => dish.spiceLevel > 0).length > settings.maxSpicyDishes) continue;
          if (!dishes.some((dish) => dish.flavor === "light")) continue;
          const score = compositionScore(dishes, stats);
          combos.push({ meat: [first, second], third, score });
        }
      }
    }
  };

  addCombos(preferredThird);
  if (combos.length === 0 && alternateThird.length > 0) addCombos(alternateThird);
  if (combos.length === 0 && allThird.length > 0) addCombos([...new Set(allThird)]);
  return combos;
}

function reasonForMeat(dish: Dish, stats: MealStats): string {
  const count = stats.proteinCounts[dish.protein] ?? 0;
  if (count === 0) return `最近 7 天还没吃${PROTEIN_LABELS[dish.protein]}，这次补上${dish.name}。`;
  if (count >= 3) return `最近 7 天${PROTEIN_LABELS[dish.protein]}出现 ${count} 次，换一道${dish.name}做蛋白质轮换。`;
  return `用${dish.name}补一份${PROTEIN_LABELS[dish.protein]}，和另一道荤菜错开。`;
}

export function buildLocalRecommendation(input: {
  candidates: Dish[];
  settings: Settings;
  stats: MealStats;
  repeatIds: Set<string>;
  repeatIds3Days: Set<string>;
  random?: () => number;
}): LocalRecommendation {
  const random = input.random ?? Math.random;
  const attempts: Array<{ window: number; ids: Set<string> }> = [
    { window: input.settings.repeatDays, ids: input.repeatIds }
  ];
  if (input.settings.repeatDays > 3) attempts.push({ window: 3, ids: input.repeatIds3Days });
  if (input.settings.repeatDays > 0) attempts.push({ window: 0, ids: new Set() });

  for (const attempt of attempts) {
    const combos = buildCombinations(
      input.candidates,
      attempt.ids,
      input.settings,
      input.stats,
      input.settings.thirdDishDefault
    );
    if (combos.length > 0) {
      const chosen = weightedPick(combos, random);
      const dishes = [...chosen.meat, chosen.third];
      const reasons: Record<string, string> = {};
      reasons[chosen.meat[0].id] = reasonForMeat(chosen.meat[0], input.stats);
      reasons[chosen.meat[1].id] = reasonForMeat(chosen.meat[1], input.stats);
      reasons[chosen.third.id] =
        chosen.third.role === "soup"
          ? `第三道选${chosen.third.name}，汤占这一道的位置，不再额外加菜。`
          : `第三道选${chosen.third.name}，补一份蔬菜、平衡口味。`;
      const proteins = `${PROTEIN_LABELS[chosen.meat[0].protein]}和${PROTEIN_LABELS[chosen.meat[1].protein]}`;
      const relaxed = attempt.window < input.settings.repeatDays;
      return {
        dishes,
        historyWindowUsed: attempt.window,
        relaxed,
        summary: `这桌用了${proteins}，第三道配${chosen.third.name}，两道荤菜蛋白质错开${relaxed ? "；近期可选菜不足，已适度放宽重复窗口" : "。"}`,
        reasons,
        diversity: {
          protein: `${PROTEIN_LABELS[chosen.meat[0].protein]}与${PROTEIN_LABELS[chosen.meat[1].protein]}错开。`,
          vegetable: chosen.third.role === "soup" ? "第三道以汤补位。" : "第三道补充蔬菜。",
          flavor: dishes.some((dish) => dish.flavor === "light") ? "至少一道清淡菜，整体不过重。" : "口味适中。"
        }
      };
    }
  }

  throw new MenuUnavailableError(input.candidates);
}
