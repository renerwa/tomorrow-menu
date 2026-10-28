import { describe, expect, it } from "vitest";
import { MENU_PROMPT_VERSION, MENU_SYSTEM_PROMPT } from "@/ai/menuDecision";
import { aiMenuSchema, extractJsonObject } from "@/ai/schemas";

const valid = {
  dishes: [
    { dishId: "d001", reason: "补充猪肉" },
    { dishId: "d086", reason: "换成鱼" },
    { dishId: "d110", reason: "补一道清淡素菜" }
  ],
  summary: "蛋白质和蔬菜都错开了。",
  diversity: { protein: "猪与鱼", vegetable: "藕丁", flavor: "清淡" },
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

  it("documents soup, generated-count and manual-edit rules in the prompt", () => {
    expect(MENU_PROMPT_VERSION).toBe("2026-10-29-v3");
    expect(MENU_SYSTEM_PROMPT).toContain("3 道或 4 道");
    expect(MENU_SYSTEM_PROMPT).toContain("汤是独立菜品，不能替代素菜");
    expect(MENU_SYSTEM_PROMPT).toContain("手工换菜、加菜和减菜");
    expect(MENU_SYSTEM_PROMPT).toContain("不受 2 荤 1 素或菜品数量的限制");
  });
});
