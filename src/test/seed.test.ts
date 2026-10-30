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

  it("has a complete ingredient list for all 180 dishes", () => {
    const ready = seedDishes.filter((dish) => dish.dataStatus === "ready");
    expect(seedRecipes).toHaveLength(180);
    expect(ready).toHaveLength(180);
    expect(ready.filter((dish) => dish.role === "meat")).toHaveLength(98);
    expect(ready.filter((dish) => dish.role === "veg")).toHaveLength(47);
    expect(ready.filter((dish) => dish.role === "soup")).toHaveLength(22);
    expect(ready.filter((dish) => dish.role === "other")).toHaveLength(13);
  });

  it("keeps ingredient ids and normalized names unique", () => {
    expect(new Set(seedIngredients.map((ingredient) => ingredient.id)).size).toBe(seedIngredients.length);
    expect(new Set(seedIngredients.map((ingredient) => ingredient.normalizedName)).size).toBe(seedIngredients.length);
  });

  it("gives every dish a complete recipe", () => {
    const ingredientIds = new Set(seedIngredients.map((ingredient) => ingredient.id));
    const recipeMap = new Map(seedRecipes.map((recipe) => [recipe.dishId, recipe.ingredientIds]));

    for (const dish of seedDishes) {
      const recipe = recipeMap.get(dish.id);
      expect(recipe, dish.name).toBeDefined();
      expect(recipe?.length, dish.name).toBeGreaterThan(0);
      expect(recipe?.every((id) => ingredientIds.has(id)), dish.name).toBe(true);
      expect(readyRecipeNames[dish.name], dish.name).toBeDefined();
    }
  });

  it("uses valid proteins for meat and keeps vegetarian dishes meat-free", () => {
    const ingredientById = new Map(seedIngredients.map((ingredient) => [ingredient.id, ingredient]));
    const recipeByDishId = new Map(seedRecipes.map((recipe) => [recipe.dishId, recipe]));

    for (const dish of seedDishes) {
      if (dish.role === "meat") {
        expect(dish.protein, dish.name).not.toBe("none");
        expect(dish.protein, dish.name).not.toBe("other");
      }
      if (dish.role === "veg") {
        expect(dish.protein, dish.name).toBe("none");
        const recipe = recipeByDishId.get(dish.id);
        expect(recipe, dish.name).toBeDefined();
        expect(
          recipe?.ingredientIds.some((id) => ingredientById.get(id)?.category === "meat"),
          dish.name
        ).toBe(false);
      }
      if (dish.role === "other") expect(dish.autoPlannable, dish.name).toBe(false);
    }
  });
});
