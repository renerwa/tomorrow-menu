import { describe, expect, it } from "vitest";
import { filterPickerDishes, pickRandomReplacement } from "@/domain/editing";

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

describe("picker search", () => {
  const pickerDishes = [
    { id: "pork", name: "回锅肉", normalizedName: "回锅肉", role: "meat" },
    { id: "chicken", name: "宫保鸡丁", normalizedName: "宫保鸡丁", role: "meat" },
    { id: "veg", name: "西蓝花", normalizedName: "西蓝花", role: "veg" },
    { id: "soup", name: "海带鸡汤", normalizedName: "海带鸡汤", role: "soup" }
  ];

  it("browses by role when the query is empty", () => {
    expect(filterPickerDishes(pickerDishes, { query: "", role: "veg", menuDishIds: [] })).toEqual([
      pickerDishes[2]
    ]);
  });

  it("searches across roles as soon as there is a query", () => {
    expect(
      filterPickerDishes(pickerDishes, { query: "鸡", role: "veg", menuDishIds: [] }).map((dish) => dish.id)
    ).toEqual(["chicken", "soup"]);
  });

  it("excludes dishes already on the menu", () => {
    expect(
      filterPickerDishes(pickerDishes, { query: "鸡", role: "veg", menuDishIds: ["chicken"] }).map((dish) => dish.id)
    ).toEqual(["soup"]);
  });

  it("ignores spaces and full-width differences in the query", () => {
    expect(
      filterPickerDishes(pickerDishes, { query: " 宫 保 ", role: "veg", menuDishIds: [] }).map((dish) => dish.id)
    ).toEqual(["chicken"]);
  });
});
