import type { Composition, Dish, DishRole } from "./types";

const ROLE_ORDER: Record<DishRole, number> = { meat: 0, veg: 1, soup: 2, other: 3 };

export function sortDishesByRole<T extends { role: DishRole; sortOrder?: number }>(dishes: T[]): T[] {
  return [...dishes].sort((a, b) => {
    const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return roleDiff || (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
}

export function getComposition(dishes: Array<Pick<Dish, "role">>): Composition {
  const total = dishes.length;
  const meat = dishes.filter((dish) => dish.role === "meat").length;
  const veg = dishes.filter((dish) => dish.role === "veg").length;
  const soup = dishes.filter((dish) => dish.role === "soup").length;
  const other = dishes.filter((dish) => dish.role === "other").length;
  const valid = meat === 2 && veg === 1 && soup <= 1 && other === 0 && (total === 3 || total === 4);

  let label = `共 ${total} 道 · ${meat} 荤 ${veg} 素 ${soup} 汤`;
  if (total === 0) label = "还没有选菜";
  else if (valid) label = soup === 1 ? "2 荤 1 素 1 汤 · 共 4 道" : "2 荤 1 素 · 共 3 道";

  return { total, meat, veg, soup, other, valid, label };
}

export function compositionWarnings(
  dishes: Array<Pick<Dish, "role">>,
  mode: "generated" | "manual" = "generated"
): string[] {
  if (mode === "manual") return [];
  const composition = getComposition(dishes);
  if (composition.valid) return [];
  return [
    `当前 ${composition.total} 道：${composition.meat} 荤、${composition.veg} 素、${composition.soup} 汤。自动推荐需要 2 荤、1 道素菜，并可按设置额外加 1 道汤；汤不能替代素菜。`
  ];
}
