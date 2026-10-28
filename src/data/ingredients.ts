import type { Ingredient, IngredientCategory } from "@/domain/types";

interface IngredientInput {
  name: string;
  category: IngredientCategory;
  defaultPantry?: boolean;
}

const inputs: IngredientInput[] = [
  { name: "五花肉", category: "meat" },
  { name: "猪里脊", category: "meat" },
  { name: "猪肉末", category: "meat" },
  { name: "排骨", category: "meat" },
  { name: "牛里脊", category: "meat" },
  { name: "牛腩", category: "meat" },
  { name: "鸡胸肉", category: "meat" },
  { name: "鸡腿肉", category: "meat" },
  { name: "鸡翅", category: "meat" },
  { name: "鸡蛋", category: "meat" },
  { name: "小黄鱼", category: "meat" },
  { name: "黑鱼", category: "meat" },
  { name: "草鱼", category: "meat" },
  { name: "虾仁", category: "meat" },
  { name: "皮蛋", category: "meat" },
  { name: "肥牛卷", category: "meat" },
  { name: "鲫鱼", category: "meat" },
  { name: "青椒", category: "vegetable" },
  { name: "尖椒", category: "vegetable" },
  { name: "仔姜", category: "vegetable" },
  { name: "姜", category: "vegetable" },
  { name: "蒜", category: "vegetable" },
  { name: "葱", category: "vegetable" },
  { name: "青蒜", category: "vegetable" },
  { name: "芹菜", category: "vegetable" },
  { name: "土豆", category: "vegetable" },
  { name: "番茄", category: "vegetable" },
  { name: "包菜", category: "vegetable" },
  { name: "生菜", category: "vegetable" },
  { name: "空心菜", category: "vegetable" },
  { name: "茼蒿", category: "vegetable" },
  { name: "四季豆", category: "vegetable" },
  { name: "茄子", category: "vegetable" },
  { name: "山药", category: "vegetable" },
  { name: "黄瓜", category: "vegetable" },
  { name: "西蓝花", category: "vegetable" },
  { name: "莲藕", category: "vegetable" },
  { name: "胡萝卜", category: "vegetable" },
  { name: "冬瓜", category: "vegetable" },
  { name: "玉米", category: "vegetable" },
  { name: "紫菜", category: "vegetable" },
  { name: "酸菜", category: "vegetable" },
  { name: "韭菜", category: "vegetable" },
  { name: "豆芽", category: "vegetable" },
  { name: "花菜", category: "vegetable" },
  { name: "金针菇", category: "vegetable" },
  { name: "木耳", category: "vegetable" },
  { name: "嫩豆腐", category: "soy" },
  { name: "老豆腐", category: "soy" },
  { name: "豆皮", category: "soy" },
  { name: "千页豆腐", category: "soy" },
  { name: "豆干", category: "soy" },
  { name: "盐", category: "seasoning", defaultPantry: true },
  { name: "食用油", category: "seasoning", defaultPantry: true },
  { name: "生抽", category: "seasoning", defaultPantry: true },
  { name: "老抽", category: "seasoning", defaultPantry: true },
  { name: "醋", category: "seasoning", defaultPantry: true },
  { name: "料酒", category: "seasoning", defaultPantry: true },
  { name: "豆瓣酱", category: "seasoning", defaultPantry: true },
  { name: "花椒", category: "seasoning", defaultPantry: true },
  { name: "干辣椒", category: "seasoning", defaultPantry: true },
  { name: "白糖", category: "seasoning", defaultPantry: true },
  { name: "淀粉", category: "seasoning", defaultPantry: true },
  { name: "蚝油", category: "seasoning" },
  { name: "泡椒", category: "seasoning" },
  { name: "豆豉", category: "seasoning" },
  { name: "五香粉", category: "seasoning" },
  { name: "白胡椒粉", category: "seasoning" },
  { name: "香油", category: "seasoning" },
  { name: "可乐", category: "other" },
  { name: "花生米", category: "other" },
  { name: "粉丝", category: "staple" },
  { name: "米", category: "staple" },
  { name: "面条", category: "staple" }
];

export const ingredients: Ingredient[] = inputs.map((input, index) => ({
  id: `i${String(index + 1).padStart(3, "0")}`,
  name: input.name,
  normalizedName: input.name.normalize("NFKC").replace(/\s+/g, ""),
  category: input.category,
  defaultPantry: input.defaultPantry ?? false,
  isCustom: false
}));

export const ingredientByName = new Map(ingredients.map((ingredient) => [ingredient.name, ingredient]));

export const defaultPantryIngredientIds = ingredients
  .filter((ingredient) => ingredient.defaultPantry)
  .map((ingredient) => ingredient.id);

export function requireIngredient(name: string): Ingredient {
  const ingredient = ingredientByName.get(name);
  if (!ingredient) throw new Error(`Unknown seed ingredient: ${name}`);
  return ingredient;
}
