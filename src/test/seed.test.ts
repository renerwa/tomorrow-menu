import { describe, expect, it } from "vitest";
import { seedDishes, seedIngredients, seedRecipes } from "@/data/seed";
import { readyRecipeNames } from "@/data/recipes";

describe("seed menu library", () => {
  it("contains 180 unique dishes with the agreed role split", () => {
    expect(seedDishes).toHaveLength(180);
    expect(new Set(seedDishes.map((dish) => dish.id)).size).toBe(180);
    expect(new Set(seedDishes.map((dish) => dish.normalizedName)).size).toBe(180);

    const counts = seedDishes.reduce<Record<string, number>>((result, dish) => {
      result[dish.role] = (result[dish.role] ?? 0) + 1;
      return result;
    }, {});
    expect(counts).toMatchObject({ meat: 98, veg: 47, soup: 22, other: 13 });
  });

  it("has at least 38 ready dishes in the required role split", () => {
    const ready = seedDishes.filter((dish) => dish.dataStatus === "ready");
    expect(seedRecipes).toHaveLength(38);
    expect(ready.filter((dish) => dish.role === "meat")).toHaveLength(20);
    expect(ready.filter((dish) => dish.role === "veg")).toHaveLength(12);
    expect(ready.filter((dish) => dish.role === "soup")).toHaveLength(6);
  });

  it("keeps ingredient ids and normalized names unique", () => {
    expect(new Set(seedIngredients.map((ingredient) => ingredient.id)).size).toBe(seedIngredients.length);
    expect(new Set(seedIngredients.map((ingredient) => ingredient.normalizedName)).size).toBe(seedIngredients.length);
  });

  it("gives every ready auto-plannable dish a complete recipe", () => {
    const ingredientIds = new Set(seedIngredients.map((ingredient) => ingredient.id));
    const recipeMap = new Map(seedRecipes.map((recipe) => [recipe.dishId, recipe.ingredientIds]));

    for (const dish of seedDishes.filter((item) => item.dataStatus === "ready" && item.autoPlannable)) {
      const recipe = recipeMap.get(dish.id);
      expect(recipe, dish.name).toBeDefined();
      expect(recipe?.length, dish.name).toBeGreaterThan(0);
      expect(recipe?.every((id) => ingredientIds.has(id)), dish.name).toBe(true);
      expect(readyRecipeNames[dish.name], dish.name).toBeDefined();
    }
  });

  it("uses valid proteins for meat and keeps vegetarian dishes meat-free", () => {
    for (const dish of seedDishes) {
      if (dish.role === "meat") {
        expect(dish.protein, dish.name).not.toBe("none");
        expect(dish.protein, dish.name).not.toBe("other");
      }
      if (dish.role === "veg") expect(dish.protein, dish.name).toBe("none");
      if (dish.role === "other") expect(dish.autoPlannable, dish.name).toBe(false);
    }
  });
});
