import { describe, expect, it } from "vitest";
import { getComposition, sortDishesByRole } from "@/domain/composition";
import { validateSelection } from "@/domain/validation";
import { makeDish, makeSettings } from "./fixtures";

const pork = makeDish({ id: "pork", name: "回锅肉", protein: "pork", flavor: "rich" });
const beef = makeDish({ id: "beef", name: "番茄牛腩", protein: "beef", flavor: "normal" });
const veg = makeDish({ id: "veg", name: "蒜蓉生菜", role: "veg", protein: "none", flavor: "light" });
const soup = makeDish({ id: "soup", name: "番茄蛋汤", role: "soup", protein: "egg", flavor: "light" });

describe("three-dish composition", () => {
  it("labels 2 meat + 1 veg and 2 meat + 1 soup", () => {
    expect(getComposition([pork, beef, veg])).toMatchObject({
      total: 3,
      meat: 2,
      veg: 1,
      soup: 0,
      valid: true,
      label: "2 荤 1 素 · 共 3 道"
    });
    expect(getComposition([pork, beef, soup])).toMatchObject({
      total: 3,
      meat: 2,
      veg: 0,
      soup: 1,
      valid: true,
      label: "2 荤 1 汤 · 共 3 道"
    });
  });

  it("rejects 2 meat + 1 veg + 1 soup and incomplete menus", () => {
    expect(getComposition([pork, beef, veg, soup])).toMatchObject({ total: 4, valid: false });
    expect(getComposition([pork, veg])).toMatchObject({ total: 2, valid: false, label: "还差 1 道" });
  });

  it("sorts meat first and the third dish last", () => {
    const sorted = sortDishesByRole([soup, veg, beef, pork]);
    expect(sorted.map((dish) => dish.role)).toEqual(["meat", "meat", "veg", "soup"]);
    expect(sorted.map((dish) => dish.id)).toEqual(["beef", "pork", "veg", "soup"]);
  });

  it("accepts a legal menu", () => {
    const issues = validateSelection([pork, beef, soup], {
      candidates: [pork, beef, veg, soup],
      repeatDishIds: new Set(),
      settings: makeSettings()
    });
    expect(issues).toEqual([]);
  });

  it("checks protein variety, spice limit and one light dish", () => {
    const pork2 = makeDish({ id: "pork2", name: "红烧肉", protein: "pork", spiceLevel: 1, flavor: "normal" });
    const richSoup = makeDish({ id: "soup2", name: "辣汤", role: "soup", protein: "egg", spiceLevel: 1, flavor: "rich" });
    const issues = validateSelection([pork, pork2, richSoup], {
      candidates: [pork, pork2, richSoup],
      repeatDishIds: new Set(["pork2"]),
      settings: makeSettings({ maxSpicyDishes: 1 })
    });
    expect(issues.join("\n")).toContain("主蛋白质必须不同");
    expect(issues.join("\n")).toContain("辣菜有 2 道");
    expect(issues.join("\n")).toContain("至少需要一道清淡菜");
    expect(issues.join("\n")).toContain("重复窗口内已经出现过");
  });

  it("rejects draft, disabled and blocked dishes outside the candidate pool", () => {
    const draft = makeDish({ id: "draft", name: "草稿菜", dataStatus: "draft" });
    const issues = validateSelection([pork, draft, soup], {
      candidates: [pork, beef, soup],
      repeatDishIds: new Set(),
      settings: makeSettings()
    });
    expect(issues.join("\n")).toContain("不在当前可推荐菜库中");
    expect(issues.join("\n")).toContain("尚未完善");
  });
});
