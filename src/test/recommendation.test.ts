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

function recommend(candidates: typeof pork[], settings = makeSettings(), repeatIds = new Set<string>()) {
  return buildLocalRecommendation({
    candidates,
    settings,
    stats: statsFor(candidates),
    repeatIds,
    repeatIds3Days: new Set(),
    random: () => 0
  });
}

describe("local recommendation fallback", () => {
  it("returns two meats and a real vegetable by default", () => {
    const candidates = [pork, beef, chicken, veg, soup];
    const result = recommend(candidates);

    expect(result.dishes).toHaveLength(3);
    expect(result.dishes.filter((dish) => dish.role === "meat")).toHaveLength(2);
    expect(result.dishes.filter((dish) => dish.role === "veg")).toHaveLength(1);
    expect(result.dishes.filter((dish) => dish.role === "soup")).toHaveLength(0);
    expect(result.dishes.filter((dish) => dish.spiceLevel > 0).length).toBeLessThanOrEqual(1);
  });

  it("allows two pork dishes when that fits the household preference", () => {
    const pork2 = makeDish({ id: "pork2", name: "红烧肉", protein: "pork", flavor: "normal" });
    const result = recommend([pork, pork2, veg]);
    const meats = result.dishes.filter((dish) => dish.role === "meat");

    expect(meats).toHaveLength(2);
    expect(meats.map((dish) => dish.protein)).toEqual(["pork", "pork"]);
    expect(result.summary).toContain("不强行错开蛋白质");
    expect(result.diversity.protein).toContain("不强制蛋白质轮换");
  });

  it("adds soup as a fourth dish without replacing the vegetable", () => {
    const result = recommend(
      [pork, beef, veg, soup],
      makeSettings({ thirdDishDefault: "soup" })
    );
    expect(result.dishes).toHaveLength(4);
    expect(result.dishes.filter((dish) => dish.role === "meat")).toHaveLength(2);
    expect(result.dishes.filter((dish) => dish.role === "veg")).toHaveLength(1);
    expect(result.dishes.filter((dish) => dish.role === "soup")).toHaveLength(1);
    expect(result.summary).toContain("另配");
    expect(result.diversity.vegetable).toContain("不替代素菜");
  });

  it("keeps the three-dish vegetable menu when no soup is available", () => {
    const result = recommend([pork, beef, veg], makeSettings({ thirdDishDefault: "soup" }));
    expect(result.dishes).toHaveLength(3);
    expect(result.dishes.map((dish) => dish.role)).toEqual(["meat", "meat", "veg"]);
  });

  it("does not require a light dish when every dish is non-spicy", () => {
    const result = recommend([pork, beef, richVeg]);
    expect(result.dishes).toHaveLength(3);
    expect(result.dishes.some((dish) => dish.flavor === "light")).toBe(false);
  });

  it("does not let soup fill the vegetable requirement", () => {
    expect(() => recommend([pork, beef, soup], makeSettings({ thirdDishDefault: "soup" }))).toThrow(MenuUnavailableError);
  });

  it("shortens the repeat window before giving up", () => {
    const candidates = [pork, beef, veg];
    const result = recommend(candidates, makeSettings({ repeatDays: 7 }), new Set(candidates.map((dish) => dish.id)));
    expect(result.historyWindowUsed).toBe(3);
    expect(result.relaxed).toBe(true);
    expect(result.summary).toContain("放宽重复窗口");
  });

  it("does not relax the spice limit", () => {
    const candidates = [
      makeDish({ id: "pork-spicy", name: "辣肉", protein: "pork", spiceLevel: 1, flavor: "rich" }),
      makeDish({ id: "beef-spicy", name: "辣牛", protein: "beef", spiceLevel: 1, flavor: "rich" }),
      richVeg
    ];
    expect(() => recommend(candidates, makeSettings({ maxSpicyDishes: 0 }))).toThrow(MenuUnavailableError);
  });

  it("keeps the current date's previous dishes excluded even after relaxing the repeat window", () => {
    const pork2 = makeDish({ id: "pork2", name: "红烧肉", protein: "pork", flavor: "normal" });
    const result = buildLocalRecommendation({
      candidates: [pork, beef, pork2, veg],
      settings: makeSettings({ repeatDays: 7 }),
      stats: statsFor([pork, beef, pork2, veg]),
      repeatIds: new Set(["pork", "beef", "veg"]),
      repeatIds3Days: new Set<string>(),
      mustExcludeIds: new Set(["pork"]),
      random: () => 0
    });
    expect(result.dishes.map((dish) => dish.id)).not.toContain("pork");
  });
});
