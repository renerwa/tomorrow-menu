import type { DishRole, Flavor, IngredientCategory, Protein } from "./types";

export const PROTEIN_LABELS: Record<Protein, string> = {
  pork: "猪肉",
  beef: "牛肉",
  chicken: "鸡肉",
  duck: "鸭肉",
  lamb: "羊肉",
  rabbit: "兔肉",
  fish: "鱼",
  shrimp: "虾",
  frog: "牛蛙",
  squid: "鱿鱼",
  crab: "蟹",
  crayfish: "小龙虾",
  egg: "蛋",
  other: "其他",
  none: "素"
};

export const ROLE_LABELS: Record<DishRole, string> = {
  meat: "荤菜",
  veg: "素菜",
  soup: "汤",
  other: "非推荐"
};

export const FLAVOR_LABELS: Record<Flavor, string> = {
  light: "清淡",
  normal: "适中",
  rich: "重口"
};

export const SPICE_LABELS = ["不辣", "微辣", "辣"] as const;

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  meat: "肉禽蛋",
  vegetable: "蔬菜",
  soy: "豆制品",
  seasoning: "调料",
  staple: "主食",
  other: "其他"
};

export const CATEGORY_ORDER: IngredientCategory[] = [
  "meat",
  "vegetable",
  "soy",
  "seasoning",
  "staple",
  "other"
];

export function roleLabel(role: DishRole): string {
  return ROLE_LABELS[role];
}

export function proteinLabel(protein: Protein): string {
  return PROTEIN_LABELS[protein];
}
