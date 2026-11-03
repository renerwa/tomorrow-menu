import { describe, expect, it } from "vitest";
import { MENU_PROMPT_VERSION, MENU_SYSTEM_PROMPT, buildUserPrompt } from "@/ai/menuDecision";
import { aiMenuSchema, extractJsonObject } from "@/ai/schemas";
import { buildMealStats } from "@/domain/stats";
import { makeSettings } from "./fixtures";

const valid = {
  dishes: [
    { dishId: "d001", reason: "补充猪肉" },
    { dishId: "d086", reason: "换成鱼" },
    { dishId: "d110", reason: "补一道清淡素菜" }
  ],
  summary: "荤菜以猪肉为主，蔬菜和口味有变化。",
  diversity: { protein: "猪肉为主，搭配鱼", vegetable: "藕丁", flavor: "清淡" },
  confidence: 0.8,
  extraField: "会被 Zod 忽略"
};

const soup = { dishId: "d120", reason: "额外配一道汤" };

describe("AI response schemas", () => {
  it("accepts valid JSON and strips unknown fields", () => {
    const parsed = aiMenuSchema.parse(valid);
    expect(parsed.dishes).toHaveLength(3);
    expect("extraField" in parsed).toBe(false);
  });

  it("accepts four dishes and rejects two or five", () => {
    expect(aiMenuSchema.parse({ ...valid, dishes: [...valid.dishes, soup] }).dishes).toHaveLength(4);
    expect(() => aiMenuSchema.parse({ ...valid, dishes: valid.dishes.slice(0, 2) })).toThrow();
    expect(() => aiMenuSchema.parse({
      ...valid,
      dishes: [...valid.dishes, soup, { dishId: "d121", reason: "多余" }]
    })).toThrow();
  });

  it("extracts JSON from a fenced response", () => {
    expect(extractJsonObject(`说明\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toMatchObject({
      summary: valid.summary
    });
  });

  it("documents soup, generated-count, avoid-list and non-spicy child rules in the prompt", () => {
    expect(MENU_PROMPT_VERSION).toBe("2026-11-03-v6");
    expect(MENU_SYSTEM_PROMPT).toContain("3 道或 4 道");
    expect(MENU_SYSTEM_PROMPT).toContain("汤是独立菜品，不能替代素菜");
    expect(MENU_SYSTEM_PROMPT).toContain("手工换菜、加菜和减菜");
    expect(MENU_SYSTEM_PROMPT).toContain("不受 2 荤 1 素或菜品数量的限制");
    expect(MENU_SYSTEM_PROMPT).toContain("avoidDishes");
    expect(MENU_SYSTEM_PROMPT).toContain("孩子只要求不辣");
    expect(MENU_SYSTEM_PROMPT).not.toContain("至少有一道 flavor 为 light");
    expect(MENU_SYSTEM_PROMPT).not.toContain("主蛋白质必须不同");
  });

  it("passes the avoid list separately from recently eaten meals", () => {
    const settings = makeSettings();
    const stats = buildMealStats({
      recentPlans: [],
      futurePlans: [],
      candidates: [],
      recipes: [],
      ingredients: []
    });
    const prompt = JSON.parse(buildUserPrompt({
      targetDate: "2026-11-03",
      familyProfile: { adults: 3, children: 1, childAge: 8, spiceTolerance: "微辣" },
      settings,
      recentMeals: [],
      futureMealsInWindow: [],
      avoidDishes: [
        { id: "d069", name: "可乐鸡翅", date: "2026-11-02", status: "draft" }
      ],
      stats,
      candidates: []
    })) as { avoidDishes: Array<{ id: string; status: string }> };
    expect(prompt.avoidDishes).toEqual([
      { id: "d069", name: "可乐鸡翅", date: "2026-11-02", status: "draft" }
    ]);
  });
});
