import { describe, expect, it } from "vitest";
import { ShoppingListError, buildShoppingList } from "@/domain/shoppingList";
import { makeDish, makeIngredient, makeRecipe, makeSettings } from "./fixtures";

const pork = makeIngredient({ id: "pork", name: "猪里脊", category: "meat" });
const beef = makeIngredient({ id: "beef", name: "牛腩", category: "meat" });
const tomato = makeIngredient({ id: "tomato", name: "番茄", category: "vegetable" });
const scallion = makeIngredient({ id: "scallion", name: "葱", category: "vegetable" });
const tofu = makeIngredient({ id: "tofu", name: "嫩豆腐", category: "soy" });
const salt = makeIngredient({ id: "salt", name: "盐", category: "seasoning", defaultPantry: true });
const rice = makeIngredient({ id: "rice", name: "米", category: "staple" });
const cola = makeIngredient({ id: "cola", name: "可乐", category: "other" });
const ingredients = [pork, beef, tomato, scallion, tofu, salt, rice, cola];

const meatA = makeDish({ id: "meat-a", name: "番茄猪柳", protein: "pork" });
const meatB = makeDish({ id: "meat-b", name: "清炖牛腩", protein: "beef" });
const veg = makeDish({ id: "veg", name: "葱花豆腐", role: "veg", protein: "none" });
const soup = makeDish({ id: "soup", name: "番茄蛋汤", role: "soup", protein: "egg" });

const recipes = [
  makeRecipe("meat-a", ["pork", "tomato", "salt"]),
  makeRecipe("meat-b", ["beef", "tomato", "rice"]),
  makeRecipe("veg", ["tofu", "scallion", "cola"]),
  makeRecipe("soup", ["tomato", "scallion", "salt"])
];

describe("shopping list", () => {
  it("deduplicates by ingredient id, sorts categories and excludes pantry items", () => {
    const list = buildShoppingList({
      targetDate: "2026-10-29",
      planStatus: "confirmed",
      dishes: [meatA, meatB, veg],
      recipes,
      ingredients,
      settings: makeSettings({ pantryIngredientIds: ["salt"] })
    });

    expect(list.groups.map((group) => group.category)).toEqual(["meat", "vegetable", "soy", "staple", "other"]);
    expect(list.groups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "beef",
      "pork",
      "scallion",
      "tomato",
      "tofu",
      "rice",
      "cola"
    ]);
    expect(list.excluded.map((item) => item.id)).toEqual(["salt"]);
    expect(list.copyText).toContain("10月29日晚餐：番茄猪柳、清炖牛腩、葱花豆腐");
    expect(list.copyText).toContain("需要买：");
    expect(list.copyText).not.toContain("盐");
  });

  it("replaces the third dish ingredients instead of accumulating them", () => {
    const base = {
      targetDate: "2026-10-29",
      planStatus: "confirmed" as const,
      recipes,
      ingredients,
      settings: makeSettings()
    };
    const withVeg = buildShoppingList({ ...base, dishes: [meatA, meatB, veg] });
    const withSoup = buildShoppingList({ ...base, dishes: [meatA, meatB, soup] });

    expect(withVeg.groups.flatMap((group) => group.items.map((item) => item.id))).toContain("tofu");
    expect(withSoup.groups.flatMap((group) => group.items.map((item) => item.id))).not.toContain("tofu");
    expect(withSoup.groups.flatMap((group) => group.items.map((item) => item.id))).not.toContain("cola");
  });

  it("shows no purchase needed when everything is pantry", () => {
    const list = buildShoppingList({
      targetDate: "2026-10-29",
      planStatus: "confirmed",
      dishes: [meatA, meatB, soup],
      recipes,
      ingredients,
      settings: makeSettings({
        pantryIngredientIds: ["pork", "beef", "tomato", "scallion", "salt", "rice"]
      })
    });
    expect(list.groups).toEqual([]);
    expect(list.copyText).toContain("无需采购");
  });

  it("refuses drafts and reports missing recipes or ingredient ids", () => {
    const base = {
      targetDate: "2026-10-29",
      dishes: [meatA, meatB, veg],
      recipes,
      ingredients,
      settings: makeSettings()
    };
    expect(() => buildShoppingList({ ...base, planStatus: "draft" })).toThrow(ShoppingListError);
    expect(() =>
      buildShoppingList({ ...base, planStatus: "confirmed", recipes: recipes.slice(0, 2) })
    ).toThrow(/缺少食材表/);
    expect(() =>
      buildShoppingList({
        ...base,
        planStatus: "confirmed",
        recipes: [...recipes.slice(0, 2), makeRecipe("veg", ["missing-id"])]
      })
    ).toThrow(/不存在的食材/);
  });
});
