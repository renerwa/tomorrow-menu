import { describe, expect, it } from "vitest";
import { MenuUnavailableError, buildLocalRecommendation } from "@/domain/recommendation";
import { buildMealStats } from "@/domain/stats";
import { makeDish, makeSettings } from "./fixtures";

const pork = makeDish({ id: "pork", name: "回锅肉", protein: "pork", flavor: "rich" });
const beef = makeDish({ id: "beef", name: "番茄牛腩", protein: "beef", flavor: "normal" });
const chicken = makeDish({ id: "chicken", name: "辣子鸡", protein: "chicken", spiceLevel: 2, flavor: "rich" });
const veg = makeDish({ id: "veg", name: "蒜蓉生菜", role: "veg", protein: "none", flavor: "light" });
const soup = makeDish({ id: "soup", name: "番茄蛋汤", role: "soup", protein: "egg", flavor: "light" });
const richVeg = makeDish({ id: "rich-veg", name: "油焖茄子", role: "veg", protein: "none", flavor: "rich" });

function statsFor(candidates = [pork, beef, chicken, veg, soup]) {
  return buildMealStats({
    recentPlans: [],
    futurePlans: [],
    candidates,
    recipes: [],
    ingredients: []
  });
}

describe("local recommendation fallback", () => {
  it("always returns two meats with different proteins and a third dish", () => {
    const candidates = [pork, beef, chicken, veg, soup];
    const result = buildLocalRecommendation({
      candidates,
      settings: makeSettings(),
      stats: statsFor(candidates),
      repeatIds: new Set(),
      repeatIds3Days: new Set(),
      random: () => 0
    });

    expect(result.dishes).toHaveLength(3);
    expect(result.dishes.filter((dish) => dish.role === "meat")).toHaveLength(2);
    expect(result.dishes.filter((dish) => dish.role === "veg" || dish.role === "soup")).toHaveLength(1);
    const meats = result.dishes.filter((dish) => dish.role === "meat");
    expect(meats[0].protein).not.toBe(meats[1].protein);
    expect(result.dishes.some((dish) => dish.flavor === "light")).toBe(true);
    expect(result.dishes.filter((dish) => dish.spiceLevel > 0).length).toBeLessThanOrEqual(1);
  });

  it("prefers the configured third-dish role but falls back to the other role", () => {
    const preferred = buildLocalRecommendation({
      candidates: [pork, beef, veg, soup],
      settings: makeSettings({ thirdDishDefault: "veg" }),
      stats: statsFor([pork, beef, veg, soup]),
      repeatIds: new Set(),
      repeatIds3Days: new Set(),
      random: () => 0
    });
    expect(preferred.dishes[2].role).toBe("veg");

    const fallback = buildLocalRecommendation({
      candidates: [pork, beef, soup],
      settings: makeSettings({ thirdDishDefault: "veg" }),
      stats: statsFor([pork, beef, soup]),
      repeatIds: new Set(),
      repeatIds3Days: new Set(),
      random: () => 0
    });
    expect(fallback.dishes[2].role).toBe("soup");
  });

  it("shortens the repeat window before giving up", () => {
    const candidates = [pork, beef, veg];
    const result = buildLocalRecommendation({
      candidates,
      settings: makeSettings({ repeatDays: 7 }),
      stats: statsFor(candidates),
      repeatIds: new Set(candidates.map((dish) => dish.id)),
      repeatIds3Days: new Set(),
      random: () => 0
    });
    expect(result.historyWindowUsed).toBe(3);
    expect(result.relaxed).toBe(true);
    expect(result.summary).toContain("放宽重复窗口");
  });

  it("does not relax protein, spice or light-dish rules", () => {
    const candidates = [
      makeDish({ id: "pork-spicy", name: "辣肉", protein: "pork", spiceLevel: 1, flavor: "rich" }),
      makeDish({ id: "beef-spicy", name: "辣牛", protein: "beef", spiceLevel: 1, flavor: "rich" }),
      richVeg
    ];
    expect(() =>
      buildLocalRecommendation({
        candidates,
        settings: makeSettings({ maxSpicyDishes: 0 }),
        stats: statsFor(candidates),
        repeatIds: new Set(),
        repeatIds3Days: new Set(),
        random: () => 0
      })
    ).toThrow(MenuUnavailableError);
  });
});
