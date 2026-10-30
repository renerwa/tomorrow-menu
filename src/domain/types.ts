export type DishRole = "meat" | "veg" | "soup" | "other";

export type Protein =
  | "pork"
  | "beef"
  | "chicken"
  | "duck"
  | "lamb"
  | "rabbit"
  | "fish"
  | "shrimp"
  | "frog"
  | "squid"
  | "crab"
  | "crayfish"
  | "egg"
  | "other"
  | "none";

export type SpiceLevel = 0 | 1 | 2;
export type Flavor = "light" | "normal" | "rich";
export type IngredientCategory = "meat" | "vegetable" | "soy" | "seasoning" | "staple" | "other";
export type DishDataStatus = "ready" | "draft";
export type MealPlanStatus = "draft" | "confirmed";
export type MealPlanSource = "ai" | "local" | "manual";
export type ThirdDishDefault = "veg" | "soup";
export type ValidationResult = "valid" | "invalid" | "repaired" | "fallback";

export interface FamilyProfile {
  adults: number;
  children: number;
  childAge: number | null;
  spiceTolerance: string;
}

export interface Family {
  id: string;
  name: string;
  timezone: string;
  profile: FamilyProfile;
  createdAt: string;
}

export interface Dish {
  id: string;
  familyId: string | null;
  name: string;
  normalizedName: string;
  role: DishRole;
  protein: Protein;
  spiceLevel: SpiceLevel;
  flavor: Flavor;
  sourceGroup: string;
  dataStatus: DishDataStatus;
  autoPlannable: boolean;
  isCustom: boolean;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Ingredient {
  id: string;
  name: string;
  normalizedName: string;
  category: IngredientCategory;
  defaultPantry: boolean;
  isCustom: boolean;
}

export interface Recipe {
  dishId: string;
  familyId: string | null;
  ingredientIds: string[];
  updatedAt: string;
}

export interface Settings {
  familyId: string;
  pantryIngredientIds: string[];
  blockedIngredientIds: string[];
  disabledDishIds: string[];
  repeatDays: number;
  maxSpicyDishes: 0 | 1 | 2;
  thirdDishDefault: ThirdDishDefault;
  schemaVersion: number;
}

export interface MealPlan {
  id: string;
  familyId: string;
  targetDate: string;
  status: MealPlanStatus;
  source: MealPlanSource;
  aiDecisionId: string | null;
  historyWindowUsed: number;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlanDish {
  id: string;
  mealPlanId: string;
  dishId: string;
  role: DishRole;
  sortOrder: number;
}

export interface Composition {
  total: number;
  meat: number;
  veg: number;
  soup: number;
  other: number;
  valid: boolean;
  label: string;
}

export type SourceLabel = "ai" | "local" | "manual";

export interface DishWithRecipe extends Dish {
  ingredientCount: number;
  recipeComplete: boolean;
  blocked: boolean;
  disabled: boolean;
  autoEligible: boolean;
}

export interface AiDiversity {
  protein: string;
  vegetable: string;
  flavor: string;
}

export interface AiRationale {
  summary: string;
  diversity: AiDiversity;
  confidence: number | null;
  validationResult: ValidationResult;
  fallbackUsed: boolean;
  notice: string | null;
  model: string;
  reasons: Record<string, string>;
  createdAt: string | null;
}

export interface RecentMeal {
  date: string;
  dishes: Array<Pick<Dish, "id" | "name" | "role" | "protein">>;
}

export interface MealStats {
  proteinCounts: Record<string, number>;
  flavorCounts: Record<Flavor, number>;
  spicyCount: number;
  leafyCount: number;
  dishIds: string[];
  ingredientCounts: Record<string, number>;
  futureDishIds: string[];
  candidateCounts: {
    meat: number;
    veg: number;
    soup: number;
    proteins: Record<string, number>;
  };
}

export interface PlanDish extends Dish {
  sortOrder: number;
  reason: string | null;
}

export interface PlanView {
  id: string;
  targetDate: string;
  status: MealPlanStatus;
  source: MealPlanSource;
  historyWindowUsed: number;
  manualOverride: boolean;
  createdAt: string;
  updatedAt: string;
  dishes: PlanDish[];
  ai: AiRationale | null;
}

export interface PlanResponse {
  plan: PlanView | null;
  composition: Composition;
  recentMeals: RecentMeal[];
  stats: MealStats;
  warnings: string[];
}

export interface AiCandidate {
  id: string;
  name: string;
  role: DishRole;
  protein: Protein;
  spiceLevel: SpiceLevel;
  flavor: Flavor;
  ingredients: string[];
}

export interface ShoppingGroup {
  category: IngredientCategory;
  label: string;
  items: ShoppingItem[];
}

export interface ShoppingItem extends Ingredient {
  dishNames: string[];
}

export interface ShoppingList {
  targetDate: string;
  dishes: Array<Pick<Dish, "id" | "name" | "role">>;
  groups: ShoppingGroup[];
  excluded: Ingredient[];
  copyText: string;
}

export interface DishCountSummary {
  total: number;
  ready: number;
  draft: number;
  autoPlannable: number;
  meat: number;
  veg: number;
  soup: number;
  other: number;
}
