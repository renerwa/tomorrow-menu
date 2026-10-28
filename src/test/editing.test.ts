import { describe, expect, it } from "vitest";
import { pickRandomReplacement } from "@/domain/editing";

const dishes = [
  { id: "pork", name: "回锅肉" },
  { id: "beef", name: "番茄牛腩" },
  { id: "veg", name: "蒜蓉生菜" },
  { id: "soup", name: "番茄蛋汤" }
];

describe("random replacement", () => {
  it("never returns the current dish or another dish already on the menu", () => {
    const picked = pickRandomReplacement(dishes, ["pork", "beef", "veg"], "pork", () => 0);
    expect(picked?.id).toBe("soup");
  });

  it("can return any remaining role", () => {
    const picked = pickRandomReplacement(dishes, ["pork"], "pork", () => 0.99);
    expect(picked?.id).toBe("soup");
  });

  it("returns null when no replacement is available", () => {
    expect(pickRandomReplacement(dishes.slice(0, 1), ["pork"], "pork")).toBeNull();
  });
});
