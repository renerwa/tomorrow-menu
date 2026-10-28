import { describe, expect, it } from "vitest";
import { aiMenuSchema, extractJsonObject } from "@/ai/schemas";

const valid = {
  dishes: [
    { dishId: "d001", reason: "补充猪肉" },
    { dishId: "d086", reason: "换成鱼" },
    { dishId: "d110", reason: "补一道清淡菜" }
  ],
  summary: "蛋白质和蔬菜都错开了。",
  diversity: { protein: "猪与鱼", vegetable: "藕丁", flavor: "清淡" },
  confidence: 0.8,
  extraField: "会被 Zod 忽略"
};

describe("AI response schemas", () => {
  it("accepts valid JSON and strips unknown fields", () => {
    const parsed = aiMenuSchema.parse(valid);
    expect(parsed.dishes).toHaveLength(3);
    expect("extraField" in parsed).toBe(false);
  });

  it("rejects four dishes or fewer than three", () => {
    expect(() => aiMenuSchema.parse({ ...valid, dishes: [...valid.dishes, valid.dishes[0]] })).toThrow();
    expect(() => aiMenuSchema.parse({ ...valid, dishes: valid.dishes.slice(0, 2) })).toThrow();
  });

  it("extracts JSON from a fenced response", () => {
    expect(extractJsonObject(`说明\n\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)).toMatchObject({
      summary: valid.summary
    });
  });
});
