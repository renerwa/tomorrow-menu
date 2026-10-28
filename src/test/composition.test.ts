import { describe, expect, it } from "vitest";
import { getComposition, sortDishesByRole } from "@/domain/composition";
import { selectionWarnings, validateSelection } from "@/domain/validation";
import { makeDish, makeSettings } from "./fixtures";

const pork = makeDish({ id: "pork", name: "回锅肉", protein: "pork", flavor: "rich" });
const beef = makeDish({ id: "beef", name: "番茄牛腩", protein: "beef", flavor: "normal" });
const chicken = makeDish({ id: "chicken", name: "白切鸡", protein: "chicken", flavor: "light" });
const fish = makeDish({ id: "fish", name: "清蒸鱼", protein: "fish", flavor: "light" });
const veg = makeDish({ id: "veg", name: "蒜蓉生菜", role: "veg", protein: "none", flavor: "light" });
const soup = makeDish({ id: "soup", name: "番茄蛋汤", role: "soup", protein: "egg", flavor: "light" });

describe("meal composition", () => {
  it("labels 2 meat + 1 veg and 2 meat + 1 veg + 1 soup as valid", () => {
    expect(getComposition([pork, beef, veg])).toMatchObject({
      total: 3,
      meat: 2,
      veg: 1,
      soup: 0,
      valid: true,
      label: "2 荤 1 素 · 共 3 道"
    });
    expect(getComposition([pork, beef, veg, soup])).toMatchObject({
      total: 4,
      meat: 2,
      veg: 1,
      soup: 1,
      valid: true,
      label: "2 荤 1 素 1 汤 · 共 4 道"
    });
  });

  it("does not count soup as a vegetable", () => {
    expect(getComposition([pork, beef, soup])).toMatchObject({
      total: 3,
      meat: 2,
      veg: 0,
      soup: 1,
      valid: false,
      label: "共 3 道 · 2 荤 0 素 1 汤"
    });
  });

  it("describes arbitrary manual counts without saying they are invalid", () => {
    expect(getComposition([pork])).toMatchObject({ valid: false, label: "共 1 道 · 1 荤 0 素 0 汤" });
    expect(getComposition([pork, beef, veg, soup, chicken])).toMatchObject({
      valid: false,
      label: "共 5 道 · 3 荤 1 素 1 汤"
    });
  });

  it("sorts meat first, then vegetables and soup", () => {
    const sorted = sortDishesByRole([soup, veg, beef, pork]);
    expect(sorted.map((dish) => dish.role)).toEqual(["meat", "meat", "veg", "soup"]);
    expect(sorted.map((dish) => dish.id)).toEqual(["beef", "pork", "veg", "soup"]);
  });
});

describe("selection validation", () => {
  const context = {
    candidates: [pork, beef, chicken, fish, veg, soup],
    repeatDishIds: new Set<string>(),
    settings: makeSettings()
  };

  it("accepts generated menus with three or four dishes", () => {
    expect(validateSelection([pork, beef, veg], context)).toEqual([]);
    expect(validateSelection([pork, beef, veg, soup], context)).toEqual([]);
  });

  it("requires a real vegetable and rejects a soup-only third dish", () => {
    const issues = validateSelection([pork, beef, soup], context);
    expect(issues.join("\n")).toContain("汤不能替代素菜");
    expect(issues.join("\n")).toContain("当前为 0 道");
  });

  it("allows manual menus with one, two, four or five dishes regardless of roles", () => {
    for (const dishes of [
      [pork],
      [pork, beef],
      [pork, beef, veg, soup],
      [pork, beef, veg, soup, chicken]
    ]) {
      expect(validateSelection(dishes, context, { mode: "manual" })).toEqual([]);
    }
    expect(validateSelection([soup, veg], context, { mode: "manual" })).toEqual([]);
  });

  it("still rejects empty, duplicate and unavailable dishes in manual mode", () => {
    const draft = makeDish({ id: "draft", name: "草稿菜", dataStatus: "draft" });
    const issues = validateSelection([pork, pork, draft], context, { mode: "manual" });
    expect(issues.join("\n")).toContain("同一道菜不能在一桌中出现两次");
    expect(issues.join("\n")).toContain("不在当前可推荐菜库中");
    expect(issues.join("\n")).toContain("尚未完善");
    expect(validateSelection([], context, { mode: "manual" })).toContain("菜单至少需要保留一道菜。");
  });

  it("checks generated protein variety, spice limit and one light dish", () => {
    const pork2 = makeDish({ id: "pork2", name: "红烧肉", protein: "pork", spiceLevel: 1, flavor: "normal" });
    const richVeg = makeDish({ id: "rich-veg", name: "油焖茄子", role: "veg", protein: "none", spiceLevel: 1, flavor: "rich" });
    const issues = validateSelection([pork, pork2, richVeg], {
      candidates: [pork, pork2, richVeg],
      repeatDishIds: new Set(["pork2"]),
      settings: makeSettings({ maxSpicyDishes: 1 })
    });
    expect(issues.join("\n")).toContain("主蛋白质必须不同");
    expect(issues.join("\n")).toContain("辣菜有 2 道");
    expect(issues.join("\n")).toContain("至少需要一道清淡菜");
  });

  it("turns repeat, spice, light, protein and vegetable issues into manual warnings", () => {
    const pork2 = makeDish({ id: "pork2", name: "红烧肉", protein: "pork", spiceLevel: 1, flavor: "rich" });
    const richSoup = makeDish({ id: "soup2", name: "辣汤", role: "soup", protein: "egg", spiceLevel: 1, flavor: "rich" });
    const warnings = selectionWarnings([pork, pork2, richSoup], {
      candidates: [pork, pork2, richSoup],
      repeatDishIds: new Set(["pork2"]),
      settings: makeSettings({ maxSpicyDishes: 0 })
    });
    expect(warnings.join("\n")).toContain("重复窗口内已经出现过");
    expect(warnings.join("\n")).toContain("辣菜有 2 道");
    expect(warnings.join("\n")).toContain("没有清淡菜");
    expect(warnings.join("\n")).toContain("相同主蛋白质");
    expect(warnings.join("\n")).toContain("汤菜不替代素菜");
  });
});
